import { createHash } from "node:crypto";
import {
  CIFailedJobAnalysisResultSchema,
  CILogEvidenceResultSchema,
  CIRemediationPlanResultSchema,
  CIWorkflowStatusResultSchema,
  type CICategory,
  type CIJob,
  type CIProviderClass,
} from "../domain/ci-schemas.js";
import {
  CIFailureAnalysisInputSchema,
  CIFailureAnalysisResultSchema,
  SCMChangeEvidenceInputSchema,
  SCMChangeEvidenceResultSchema,
  SCMChangeSchema,
  TelemetryCorrelationInputSchema,
  TelemetryCorrelationResultSchema,
  TelemetrySignalSchema,
  type CIFailureAnalysisInput,
  type CIFailureAnalysisResult,
  ForensicsContextBudgetSchema,
  type ForensicsContextBudget,
  type ForensicsContextBudgetUsage,
  type ForensicsFreshness,
  type ForensicsProvenance,
} from "../domain/forensics-schemas.js";
import type {
  CIProvider,
  ForensicsProviderSet,
  SCMChangeEvidenceProvider,
  TelemetryCorrelationProvider,
  CIReadProvider,
} from "../providers/ci-provider.js";
import { redactText } from "./redaction.js";
import { classifyFailure } from "../domain/ci-schemas.js";
import { z } from "zod";

export type { ForensicsProviderSet, SCMChangeEvidenceProvider, TelemetryCorrelationProvider } from "../providers/ci-provider.js";

export interface AssembleFailureAnalysisOptions {
  readonly provider: CIReadProvider | CIProvider;
  readonly evidence?: ForensicsProviderSet;
  readonly input: z.input<typeof CIFailureAnalysisInputSchema>;
  readonly clock?: () => Date;
}

export async function assembleFailureAnalysis(options: AssembleFailureAnalysisOptions): Promise<CIFailureAnalysisResult> {
  const input = CIFailureAnalysisInputSchema.parse(options.input);
  const clock = options.clock ?? (() => new Date());
  const observedAt = clock().toISOString();
  const budget = contextBudgetFor(input, clock());
  let providerRequests = 0;
  const request = async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (providerRequests >= budget.maxProviderRequests) return undefined;
    providerRequests += 1;
    return operation();
  };
  const status = CIWorkflowStatusResultSchema.parse(await request(() => options.provider.getWorkflowStatus({ repo: input.repo, workflow: input.workflow, runId: input.runId })));
  const analysis = CIFailedJobAnalysisResultSchema.parse(await request(() => options.provider.getFailedJobAnalysis({ repo: input.repo, workflow: input.workflow, runId: input.runId })));
  const warnings: Array<{ code: string; message: string }> = [];
  const provenance: ForensicsProvenance[] = [
    provenanceFor("ci-status", status.providerClass, status, false, "available"),
    provenanceFor("ci-analysis", analysis.providerClass, analysis, false, "available"),
  ];
  let redactionsApplied = status.redactionsApplied || analysis.redactionsApplied;
  let truncated = status.truncated || analysis.truncated || analysis.data.failedJobs.length > input.maxJobs;
  const ciEvidence: CIFailureAnalysisResult["data"]["ciEvidence"] = [];
  let remediationActions: Array<{ category: string; title: string; steps: readonly string[]; runbook: string }> = [];
  if (providerRequests < budget.maxProviderRequests) {
    try {
      const remediationValue = await request(() => options.provider.getRemediationPlan({ repo: input.repo, workflow: input.workflow, runId: input.runId }));
      const remediation = CIRemediationPlanResultSchema.parse(remediationValue);
      remediationActions = [...remediation.data.actions];
      provenance.push(provenanceFor("ci-remediation", remediation.providerClass, remediation, false, "available"));
      warnings.push(...safeWarnings(remediation.warnings));
      redactionsApplied ||= remediation.redactionsApplied;
      truncated ||= remediation.truncated;
    } catch (error) {
      warnings.push({ code: "ci-remediation-unavailable", message: "Remediation plan unavailable" });
      provenance.push(unavailableProvenance("ci-remediation", "ci", observedAt, reasonForError(error)));
    }
  } else {
    truncated = true;
    warnings.push({ code: "context-budget-provider-requests", message: "Provider request budget reached before remediation evidence" });
    provenance.push(unavailableProvenance("ci-remediation", "ci", observedAt, "provider-request-budget"));
  }

  let usedLines = 0;
  const jobs = analysis.data.failedJobs.slice(0, input.maxJobs).sort(jobOrder);
  for (const job of jobs) {
    const evidenceRef = `ci-log-${safeLogical(job.id, "job")}`;
    if (providerRequests >= budget.maxProviderRequests || usedLines >= budget.maxLines) {
      truncated = true;
      provenance.push(unavailableProvenance(evidenceRef, "ci", observedAt, usedLines >= budget.maxLines ? "line-budget" : "provider-request-budget"));
      continue;
    }
    try {
      const logValue = await request(() => options.provider.getLogEvidence({
        repo: input.repo,
        workflow: input.workflow,
        runId: input.runId,
        jobId: job.id,
        maxLines: Math.min(input.maxLogLines, budget.maxLines - usedLines),
      }));
      const log = CILogEvidenceResultSchema.parse(logValue);
      const sanitizedLines = log.data.lines.slice(0, Math.min(input.maxLogLines, budget.maxLines - usedLines)).map((line) => ({
        sequence: line.sequence,
        text: sanitizeEvidenceText(line.text, 512),
      }));
      const changed = sanitizedLines.some((line, lineIndex) => line.text !== log.data.lines[lineIndex]?.text);
      ciEvidence.push({
        jobId: job.id,
        category: job.category,
        available: log.data.available,
        lineCount: sanitizedLines.length,
        sha256: createHash("sha256").update(sanitizedLines.map((line) => line.text).join("\n"), "utf8").digest("hex"),
        evidenceRef,
      });
      usedLines += sanitizedLines.length;
      provenance.push(provenanceFor(evidenceRef, log.providerClass, log, false, "available"));
      warnings.push(...safeWarnings(log.warnings));
      redactionsApplied ||= log.redactionsApplied || changed;
      truncated ||= log.truncated || log.data.lines.length > sanitizedLines.length;
    } catch (error) {
      warnings.push({ code: "ci-log-unavailable", message: "CI log evidence unavailable" });
      provenance.push(unavailableProvenance(evidenceRef, "ci", observedAt, reasonForError(error)));
    }
  }

  const scm = providerRequests < budget.maxProviderRequests
    ? await collectSCM(options.evidence?.scm, input, status.data.run.sha, observedAt, Math.min(input.maxChanges, budget.maxFiles), input.maxHunkLines, budget.maxHunks, budget.maxLines - usedLines, warnings, request)
    : unavailableSCM(observedAt, "provider-request-budget", warnings);
  usedLines += scm.usedLines;
  const telemetry = providerRequests < budget.maxProviderRequests
    ? await collectTelemetry(options.evidence?.telemetry, input, observedAt, input.maxSignals, budget.timeWindow, warnings, request)
    : unavailableTelemetry(observedAt, "provider-request-budget", warnings);
  provenance.push(scm.provenance, telemetry.provenance);
  redactionsApplied ||= scm.redactionsApplied || telemetry.redactionsApplied;
  truncated ||= scm.truncated || telemetry.truncated;

  let evidence = fitEvidenceBudget({ ciEvidence, scmChanges: scm.changes, telemetrySignals: telemetry.signals }, budget.maxBytes);
  if (evidence.truncated) {
    truncated = true;
    warnings.push({ code: "context-budget-bytes", message: "Evidence was compacted to the byte budget" });
  }
  const classifications = classifyJobs(jobs);
  const observedFacts = factsFor(status, analysis.data.failedJobs, evidence.scmChanges.length, evidence.telemetrySignals.length);
  const correlations = correlationsFor(evidence.scmChanges, evidence.telemetrySignals);
  const likelyLocations = locationsFor(evidence.scmChanges, (classifications[0]?.category ?? "unknown") as CICategory);
  const suggestions = suggestionsFor(remediationActions);
  const budgetUsage: ForensicsContextBudgetUsage = {
    ...budget,
    usedFiles: evidence.scmChanges.length,
    usedHunks: evidence.scmChanges.reduce((total, change) => total + change.hunks.length, 0),
    usedLines: evidence.ciEvidence.reduce((total, item) => total + item.lineCount, 0) + evidence.scmChanges.reduce((total, change) => total + change.hunks.reduce((hunks, hunk) => hunks + hunk.lines.length, 0), 0),
    usedBytes: byteLength({ ciEvidence: evidence.ciEvidence, scmChanges: evidence.scmChanges, telemetrySignals: evidence.telemetrySignals }),
    usedProviderRequests: providerRequests,
  };
  const evidenceDigest = digest({ observedFacts, ...evidence, classifications, correlations, likelyLocations, suggestions });
  const sortedProvenance = provenance.sort((left, right) => left.source.localeCompare(right.source));
  const result = {
    schemaVersion: "1.0" as const,
    observedAt,
    providerClass: safeLogical(status.providerClass, "unknown-provider") as CIProviderClass,
    freshness: status.freshness,
    truncated,
    redactionsApplied,
    warnings: warnings.slice(0, 20).map(safeWarning),
    data: {
      subject: {
        repo: input.repo,
        workflow: input.workflow,
        runId: input.runId,
        runAttempt: status.data.run.runAttempt,
        headSha: status.data.run.sha,
      },
      budget: budgetUsage,
      evidenceDigest,
      run: {
        status: status.data.run.status,
        conclusion: status.data.run.conclusion,
        ref: sanitizeEvidenceText(status.data.run.ref, 256),
        updatedAt: status.data.run.updatedAt,
      },
      observedFacts,
      ciEvidence: evidence.ciEvidence,
      scmChanges: evidence.scmChanges,
      telemetrySignals: evidence.telemetrySignals,
      classifications,
      correlations,
      likelyLocations,
      suggestions,
      provenance: sortedProvenance.slice(0, 20),
    },
  };
  return CIFailureAnalysisResultSchema.parse(result);
}

export function makeUnavailableFailureAnalysis(options: {
  readonly run: { repository: string; workflow: string; id: string; runAttempt: number; sha: string; status: "completed"; conclusion: string | null; ref: string; updatedAt: string };
  readonly observedAt: Date;
  readonly providerClass?: string;
  readonly code?: string;
}): CIFailureAnalysisResult {
  const provider = safeLogical(options.providerClass ?? "unknown-provider", "unknown-provider");
  const code = safeLogical(options.code ?? "unavailable", "unavailable");
  return CIFailureAnalysisResultSchema.parse({
    schemaVersion: "1.0",
    observedAt: options.observedAt.toISOString(),
    providerClass: provider,
    freshness: "unknown",
    truncated: false,
    redactionsApplied: false,
    warnings: [{ code: "ci-analysis-unavailable", message: "CI failure analysis unavailable" }],
    data: {
      subject: { repo: options.run.repository, workflow: options.run.workflow, runId: options.run.id, runAttempt: options.run.runAttempt, headSha: options.run.sha },
      run: { status: options.run.status, conclusion: options.run.conclusion, ref: sanitizeEvidenceText(options.run.ref, 256), updatedAt: options.run.updatedAt },
      observedFacts: [
        { id: "ci-conclusion", source: "ci", subject: "workflow.conclusion", value: options.run.conclusion ?? "unknown", evidenceRefs: [] },
        { id: "ci-analysis-status", source: "ci", subject: "analysis.status", value: code, evidenceRefs: [] },
      ],
      budget: unavailableBudget(options.observedAt),
      evidenceDigest: digest({ code, run: options.run }),
      ciEvidence: [],
      scmChanges: [],
      telemetrySignals: [],
      classifications: [{ category: "unknown", confidence: 0, basis: ["Required evidence was unavailable"], evidenceRefs: [] }],
      correlations: [],
      likelyLocations: [],
      suggestions: [],
      provenance: [{ source: "ci-analysis", provider, observedAt: options.observedAt.toISOString(), freshness: "unknown", truncated: false, unavailable: true, redactionsApplied: false, reason: code, warnings: [{ code, message: "Evidence source unavailable" }] }],
    },
  });
}

export interface AgentNotificationPayload {
  readonly schemaVersion: "1.0";
  readonly type: "ci.failure.analysis";
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly source: "poll" | "webhook";
  readonly observedAt: string;
  readonly outcome: "failure" | "cancelled" | "timed_out" | "action_required";
  readonly truncated: boolean;
  readonly analysis: CIFailureAnalysisResult;
  readonly warnings: readonly { code: string; message: string }[];
}

export const AgentNotificationPayloadSchema = z.object({
  schemaVersion: z.literal("1.0"),
  type: z.literal("ci.failure.analysis"),
  eventId: z.string().min(1).max(256),
  dedupeKey: z.string().min(1).max(256),
  source: z.enum(["poll", "webhook"]),
  observedAt: z.string().datetime({ offset: true }),
  outcome: z.enum(["failure", "cancelled", "timed_out", "action_required"]),
  truncated: z.boolean(),
  analysis: CIFailureAnalysisResultSchema,
  warnings: z.array(z.object({ code: z.string().min(1).max(64), message: z.string().min(1).max(512) }).strict()).max(20),
}).strict();

export function buildAgentNotificationPayload(options: {
  readonly analysis: CIFailureAnalysisResult;
  readonly eventId: string;
  readonly source: "poll" | "webhook";
  readonly maxBytes: number;
}): AgentNotificationPayload {
  const analysis = CIFailureAnalysisResultSchema.parse(options.analysis);
  const outcome = notificationOutcome(analysis.data.run.conclusion);
  const base = {
    schemaVersion: "1.0" as const,
    type: "ci.failure.analysis" as const,
    eventId: options.eventId,
    dedupeKey: options.eventId,
    source: options.source,
    observedAt: analysis.observedAt,
    outcome,
    truncated: analysis.truncated,
    analysis,
    warnings: analysis.warnings,
  };
  const maxBytes = Math.max(1_024, Math.floor(options.maxBytes));
  if (byteLength(base) <= maxBytes) return AgentNotificationPayloadSchema.parse(base);

  const compacted: AgentNotificationPayload = AgentNotificationPayloadSchema.parse({
    ...base,
    truncated: true,
    analysis: compactAnalysis(analysis),
  });
  if (byteLength(compacted) <= maxBytes) return compacted;

  const minimal = AgentNotificationPayloadSchema.parse({
    ...compacted,
    analysis: compactAnalysis(compacted.analysis, true),
    warnings: compacted.warnings.slice(0, 2),
  });
  if (byteLength(minimal) > maxBytes) throw new Error("notification_payload_too_large");
  return minimal;
}

async function collectSCM(
  provider: SCMChangeEvidenceProvider | undefined,
  input: CIFailureAnalysisInput,
  headSha: string,
  observedAt: string,
  maxChanges: number,
  maxHunkLines: number,
  maxHunks: number,
  maxLines: number,
  warnings: Array<{ code: string; message: string }>,
  request: <T>(operation: () => Promise<T>) => Promise<T | undefined>,
) {
  if (provider === undefined) return unavailableSCM(observedAt, "unconfigured", warnings);
  try {
    const value = await request(() => provider.getChangeEvidence(SCMChangeEvidenceInputSchema.parse({ repo: input.repo, workflow: input.workflow, runId: input.runId, headSha, maxChanges, maxHunkLines })));
    const parsed = SCMChangeEvidenceResultSchema.safeParse(value);
    if (!parsed.success) return unavailableSCM(observedAt, "malformed-provider-response", warnings);
    const result = parsed.data;
    warnings.push(...safeWarnings(result.warnings));
    if (!result.data.available) {
      const reason = `${safeLogical(result.data.unavailable.code, "unavailable")}: ${sanitizeEvidenceText(result.data.unavailable.message, 448)}`;
      return { ...unavailableSCM(observedAt, reason, warnings), redactionsApplied: result.redactionsApplied, provenance: provenanceFor("scm", result.providerClass, result, true, reason) };
    }
    let remainingHunks = maxHunks;
    let remainingLines = Math.max(0, maxLines);
    const selected = [...result.data.changes].sort(changeOrder).slice(0, maxChanges);
    const changes = selected.map((change) => {
      const hunks = change.hunks.slice().sort(hunkOrder).slice(0, remainingHunks).map((hunk) => {
        const lines = hunk.lines.slice(0, Math.min(maxHunkLines, remainingLines)).map((line) => sanitizeEvidenceText(line, 512));
        remainingLines -= lines.length;
        remainingHunks -= 1;
        return { header: sanitizeEvidenceText(hunk.header, 256), lines };
      });
      return SCMChangeSchema.parse({
        ...change,
        path: sanitizeEvidenceText(change.path, 512),
        hunks,
      });
    }).filter((change) => change.hunks.length > 0 || selected.length <= maxChanges);
    return {
      changes,
      usedHunks: changes.reduce((total, change) => total + change.hunks.length, 0),
      usedLines: changes.reduce((total, change) => total + change.hunks.reduce((lines, hunk) => lines + hunk.lines.length, 0), 0),
      truncated: result.truncated || result.data.changes.length > maxChanges || changes.length < selected.length,
      redactionsApplied: result.redactionsApplied || changes.length < result.data.changes.length,
      provenance: provenanceFor("scm", result.providerClass, result, false, "available"),
    };
  } catch {
    return unavailableSCM(observedAt, "provider-request-failed", warnings);
  }
}

async function collectTelemetry(
  provider: TelemetryCorrelationProvider | undefined,
  input: CIFailureAnalysisInput,
  observedAt: string,
  maxSignals: number,
  timeWindow: ForensicsContextBudget["timeWindow"],
  warnings: Array<{ code: string; message: string }>,
  request: <T>(operation: () => Promise<T>) => Promise<T | undefined>,
) {
  if (provider === undefined) return unavailableTelemetry(observedAt, "unconfigured", warnings);
  try {
    const value = await request(() => provider.getTelemetryCorrelation(TelemetryCorrelationInputSchema.parse({ repo: input.repo, workflow: input.workflow, runId: input.runId, signalIds: [], maxSignals })));
    const parsed = TelemetryCorrelationResultSchema.safeParse(value);
    if (!parsed.success) return unavailableTelemetry(observedAt, "malformed-provider-response", warnings);
    const result = parsed.data;
    warnings.push(...safeWarnings(result.warnings));
    if (!result.data.available) {
      const reason = `${safeLogical(result.data.unavailable.code, "unavailable")}: ${sanitizeEvidenceText(result.data.unavailable.message, 448)}`;
      return { ...unavailableTelemetry(observedAt, reason, warnings), redactionsApplied: result.redactionsApplied, provenance: provenanceFor("telemetry", result.providerClass, result, true, reason) };
    }
    const inWindow = result.data.signals.filter((signal) => Date.parse(signal.observedAt) >= Date.parse(timeWindow.from) && Date.parse(signal.observedAt) <= Date.parse(timeWindow.to));
    const signals = inWindow.slice().sort(signalOrder).slice(0, maxSignals).map((signal) => TelemetrySignalSchema.parse({
      ...signal,
      id: safeLogical(signal.id, "signal"),
      summary: signal.kind === "log" ? "Log evidence reference available" : signal.kind === "trace" ? "Trace evidence reference available" : sanitizeEvidenceText(signal.summary, 512),
      ...(signal.reference === undefined ? {} : { reference: safeLogical(signal.reference, "reference") }),
    }));
    return { signals, truncated: result.truncated || inWindow.length > maxSignals || inWindow.length !== result.data.signals.length, redactionsApplied: result.redactionsApplied, provenance: provenanceFor("telemetry", result.providerClass, result, false, "available") };
  } catch {
    return unavailableTelemetry(observedAt, "provider-request-failed", warnings);
  }
}

function contextBudgetFor(input: CIFailureAnalysisInput, now: Date): ForensicsContextBudget {
  if (input.budget !== undefined) return ForensicsContextBudgetSchema.parse(input.budget);
  const to = now.toISOString();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
  return ForensicsContextBudgetSchema.parse({
    maxFiles: input.maxChanges,
    maxHunks: Math.min(100, input.maxChanges * 2),
    maxLines: Math.min(200, input.maxLogLines + input.maxHunkLines),
    maxBytes: 64 * 1_024,
    maxProviderRequests: 16,
    timeWindow: { from, to },
  });
}

function unavailableBudget(observedAt: Date): ForensicsContextBudgetUsage {
  const now = observedAt;
  const budget = contextBudgetFor({
    repo: "owner/repo",
    workflow: "unknown",
    runId: "unavailable",
    maxJobs: 1,
    maxLogLines: 1,
    maxChanges: 1,
    maxHunkLines: 1,
    maxSignals: 1,
  }, now);
  return { ...budget, usedFiles: 0, usedHunks: 0, usedLines: 0, usedBytes: 0, usedProviderRequests: 0 };
}

type EvidenceCollections = {
  ciEvidence: CIFailureAnalysisResult["data"]["ciEvidence"];
  scmChanges: CIFailureAnalysisResult["data"]["scmChanges"];
  telemetrySignals: CIFailureAnalysisResult["data"]["telemetrySignals"];
};

function fitEvidenceBudget(collections: EvidenceCollections, maxBytes: number): EvidenceCollections & { truncated: boolean } {
  const result: EvidenceCollections = {
    ciEvidence: [...collections.ciEvidence].sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef)),
    scmChanges: [...collections.scmChanges].sort(changeOrder),
    telemetrySignals: [...collections.telemetrySignals].sort(signalOrder),
  };
  let truncated = false;
  while (byteLength(result) > maxBytes) {
    truncated = true;
    const lastChange = result.scmChanges.at(-1);
    const lastHunk = lastChange?.hunks.at(-1);
    if (lastHunk !== undefined && lastHunk.lines.length > 0) {
      lastHunk.lines = lastHunk.lines.slice(0, -1);
      continue;
    }
    if (lastChange !== undefined && lastChange.hunks.length > 0) {
      lastChange.hunks = lastChange.hunks.slice(0, -1);
      continue;
    }
    if (lastChange !== undefined) {
      result.scmChanges.pop();
      continue;
    }
    if (result.telemetrySignals.length > 0) {
      result.telemetrySignals.pop();
      continue;
    }
    if (result.ciEvidence.length > 0) {
      result.ciEvidence.pop();
      continue;
    }
    break;
  }
  return { ...result, truncated };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function jobOrder(left: CIJob, right: CIJob): number {
  return left.id.localeCompare(right.id) || left.name.localeCompare(right.name);
}

function changeOrder(left: z.infer<typeof SCMChangeSchema>, right: z.infer<typeof SCMChangeSchema>): number {
  return left.path.localeCompare(right.path)
    || left.changeType.localeCompare(right.changeType)
    || right.additions - left.additions
    || right.deletions - left.deletions
    || right.hunks.length - left.hunks.length
    || JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function hunkOrder(left: { header: string }, right: { header: string }): number {
  return left.header.localeCompare(right.header);
}

function signalOrder(left: z.infer<typeof TelemetrySignalSchema>, right: z.infer<typeof TelemetrySignalSchema>): number {
  return signalKindRank(left.kind) - signalKindRank(right.kind)
    || left.id.localeCompare(right.id)
    || (left.reference ?? "").localeCompare(right.reference ?? "")
    || left.observedAt.localeCompare(right.observedAt)
    || left.summary.localeCompare(right.summary);
}

function signalKindRank(kind: z.infer<typeof TelemetrySignalSchema>["kind"]): number {
  return ({ metric: 0, alert: 1, log: 2, trace: 3 } as const)[kind];
}

function scmChangeRef(path: string): string {
  return `scm-change-${safeLogical(path, "path")}`;
}

function reasonForError(error: unknown): string {
  return error instanceof z.ZodError ? "malformed-provider-response" : "provider-request-failed";
}

function unavailableSCM(observedAt: string, reason: string, warnings: Array<{ code: string; message: string }>) {
  warnings.push({ code: "scm-unavailable", message: "SCM change evidence unavailable" });
  return { changes: [], usedHunks: 0, usedLines: 0, truncated: false, redactionsApplied: false, provenance: unavailableProvenance("scm", "unknown-provider", observedAt, reason) };
}

function unavailableTelemetry(observedAt: string, reason: string, warnings: Array<{ code: string; message: string }>) {
  warnings.push({ code: "telemetry-unavailable", message: "Telemetry correlation unavailable" });
  return { signals: [], truncated: false, redactionsApplied: false, provenance: unavailableProvenance("telemetry", "unknown-provider", observedAt, reason) };
}

function classifyJobs(jobs: readonly CIJob[]) {
  const byCategory = new Map<string, { basis: string[]; refs: string[] }>();
  [...jobs].sort(jobOrder).forEach((job) => {
    const category = classifyFailure(job.category, job.name, ...job.failedSteps);
    const current = byCategory.get(category) ?? { basis: [], refs: [] };
    current.basis.push(sanitizeEvidenceText(job.name, 256));
    current.refs.push(`ci-job-${safeLogical(job.id, "job")}`);
    byCategory.set(category, current);
  });
  if (byCategory.size === 0) return [{ category: "unknown" as const, confidence: 0, basis: ["No failed job classification was available"], evidenceRefs: [] }];
  return [...byCategory.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(0, 10).map(([category, value]) => ({
    category,
    confidence: category === "unknown" ? 0 : 1,
    basis: value.basis.sort((left, right) => left.localeCompare(right)).slice(0, 8),
    evidenceRefs: value.refs.sort((left, right) => left.localeCompare(right)).slice(0, 10),
  }));
}

function factsFor(status: z.infer<typeof CIWorkflowStatusResultSchema>, jobs: readonly CIJob[], scmCount: number, telemetryCount: number) {
  return [
    { id: "ci-conclusion", source: "ci", subject: "workflow.conclusion", value: status.data.run.conclusion ?? "unknown", evidenceRefs: ["ci-status"] },
    { id: "ci-status", source: "ci", subject: "workflow.status", value: status.data.run.status, evidenceRefs: ["ci-status"] },
    { id: "ci-failed-jobs", source: "ci", subject: "workflow.failed-job-count", value: jobs.length, evidenceRefs: ["ci-analysis"] },
    { id: "scm-change-count", source: "scm", subject: "changes.count", value: scmCount, evidenceRefs: scmCount === 0 ? [] : ["scm"] },
    { id: "telemetry-signal-count", source: "telemetry", subject: "signals.count", value: telemetryCount, evidenceRefs: telemetryCount === 0 ? [] : ["telemetry"] },
  ];
}

function correlationsFor(changes: readonly z.infer<typeof SCMChangeSchema>[], signals: readonly z.infer<typeof TelemetrySignalSchema>[]) {
  const correlations: Array<{ source: string; kind: string; summary: string; confidence: number; causality: "not-established"; evidenceRefs: string[] }> = [];
  for (const change of [...changes].sort(changeOrder)) {
    correlations.push({ source: "scm", kind: "changed-path", summary: `Changed path ${change.path} was observed for the failed run`, confidence: 0.65, causality: "not-established", evidenceRefs: [scmChangeRef(change.path)] });
  }
  for (const signal of [...signals].sort(signalOrder).filter((item) => item.state === "degraded" || item.state === "error")) {
    const kind = signal.kind === "metric" ? "metric" : signal.kind === "alert" ? "active-alert" : signal.kind === "log" ? "log-reference" : "trace-reference";
    const name = signal.reference ?? signal.id;
    correlations.push({ source: "telemetry", kind, summary: `${signal.kind} ${name}: ${sanitizeEvidenceText(signal.summary, 448)}`, confidence: 0.7, causality: "not-established", evidenceRefs: [`telemetry-${safeLogical(signal.id, "signal")}`] });
  }
  return correlations.slice(0, 20).map((correlation) => ({ ...correlation, causality: "not-established" as const }));
}

function locationsFor(changes: readonly z.infer<typeof SCMChangeSchema>[], category: CICategory) {
  const byPath = new Map<string, z.infer<typeof SCMChangeSchema>>();
  for (const change of changes) if (!byPath.has(change.path)) byPath.set(change.path, change);
  return [...byPath.values()].map((change) => {
    const score = Math.min(0.95, (change.changeType === "modified" ? 0.75 : 0.65) + (change.hunks.length > 0 ? 0.15 : 0) + Math.min(0.05, (change.additions + change.deletions) / 100));
    return {
      path: change.path,
      category,
      confidence: score,
      confidenceClass: score >= 0.75 ? "high" as const : score >= 0.5 ? "medium" as const : "low" as const,
      uncertainty: "Changed-path evidence does not identify the failure cause",
      evidenceRefs: [scmChangeRef(change.path)],
    };
  }).sort((left, right) => right.confidence - left.confidence || left.path.localeCompare(right.path)).slice(0, 20);
}

function suggestionsFor(actions: readonly { category: string; title: string; steps: readonly string[]; runbook: string }[]) {
  return [...new Map([...actions].sort((left, right) => left.category.localeCompare(right.category) || left.title.localeCompare(right.title)).map((action) => [action.category, {
    category: action.category,
    title: sanitizeEvidenceText(action.title, 256),
    steps: action.steps.slice(0, 8).map((step) => sanitizeEvidenceText(step, 512)),
    runbook: action.runbook,
    dryRun: true as const,
    evidenceRefs: [`classification-${safeLogical(action.category, "unknown")}`],
  }])).values()].slice(0, 8);
}

function provenanceFor(source: string, provider: string, value: { observedAt: string; freshness: ForensicsFreshness; truncated: boolean; redactionsApplied: boolean; warnings: readonly { code: string; message: string }[] }, unavailable: boolean, reason = unavailable ? "unavailable" : "available"): ForensicsProvenance {
  return {
    source: safeLogical(source, "evidence"),
    provider: safeLogical(provider, "unknown-provider"),
    observedAt: value.observedAt,
    freshness: value.freshness,
    truncated: value.truncated,
    unavailable,
    redactionsApplied: value.redactionsApplied,
    reason: sanitizeEvidenceText(reason, 512),
    warnings: value.warnings.slice(0, 20).map(safeWarning),
  };
}

function unavailableProvenance(source: string, provider: string, observedAt = new Date(0).toISOString(), reason = "unavailable"): ForensicsProvenance {
  return { source, provider: safeLogical(provider, "unknown-provider"), observedAt, freshness: "unknown", truncated: false, unavailable: true, redactionsApplied: false, reason: safeLogical(reason, "unavailable"), warnings: [{ code: "unavailable", message: "Evidence source unavailable" }] };
}

function safeWarnings(warnings: readonly { code: string; message: string }[]) {
  return warnings.map((warning) => ({ code: safeLogical(warning.code, "provider-warning"), message: sanitizeEvidenceText(warning.message, 512) }));
}

function safeWarning(warning: { code: string; message: string }) {
  return { code: safeLogical(warning.code, "provider-warning"), message: sanitizeEvidenceText(warning.message, 512) };
}

function safeLogical(value: string, fallback: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized.slice(0, 64) : fallback;
}

function sanitizeEvidenceText(value: string, maxLength: number): string {
  const withoutMarkup = value.replace(/<[^>]*>/g, "[MARKUP]");
  return redactText(withoutMarkup, maxLength).text;
}

function notificationOutcome(conclusion: string | null): AgentNotificationPayload["outcome"] {
  if (conclusion === "cancelled") return "cancelled";
  if (conclusion === "timed_out") return "timed_out";
  if (conclusion === "action_required") return "action_required";
  return "failure";
}

function compactAnalysis(analysis: CIFailureAnalysisResult, minimal = false): CIFailureAnalysisResult {
  const data = analysis.data;
  const compactedData = {
    ...data,
    observedFacts: data.observedFacts.slice(0, minimal ? 1 : 5),
    ciEvidence: minimal ? [] : data.ciEvidence.slice(0, 2),
    scmChanges: minimal ? [] : data.scmChanges.slice(0, 3).map((change) => ({ ...change, hunks: change.hunks.slice(0, 1).map((hunk) => ({ ...hunk, lines: hunk.lines.slice(0, 2) })) })),
    telemetrySignals: minimal ? [] : data.telemetrySignals.slice(0, 3),
    classifications: data.classifications.slice(0, minimal ? 1 : 3),
    correlations: minimal ? [] : data.correlations.slice(0, 3),
    likelyLocations: minimal ? [] : data.likelyLocations.slice(0, 4),
    suggestions: minimal ? [] : data.suggestions.slice(0, 1).map((suggestion) => ({ ...suggestion, steps: suggestion.steps.slice(0, 1) })),
    provenance: data.provenance.slice(0, minimal ? 1 : 5),
  };
  const { evidenceDigest: _previousDigest, ...digestData } = compactedData;
  return CIFailureAnalysisResultSchema.parse({
    ...analysis,
    truncated: true,
    data: {
      ...compactedData,
      evidenceDigest: digest(digestData),
    },
  });
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
