import { createHash } from "node:crypto";
import {
  CIFailedJobAnalysisResultSchema,
  CILogEvidenceResultSchema,
  CIRemediationPlanResultSchema,
  CIWorkflowStatusResultSchema,
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
  const status = CIWorkflowStatusResultSchema.parse(await options.provider.getWorkflowStatus({ repo: input.repo, workflow: input.workflow, runId: input.runId }));
  const analysis = CIFailedJobAnalysisResultSchema.parse(await options.provider.getFailedJobAnalysis({ repo: input.repo, workflow: input.workflow, runId: input.runId }));
  const warnings: Array<{ code: string; message: string }> = [];
  const provenance: ForensicsProvenance[] = [
    provenanceFor("ci-status", status.providerClass, status, false),
    provenanceFor("ci-analysis", analysis.providerClass, analysis, false),
  ];
  let redactionsApplied = status.redactionsApplied || analysis.redactionsApplied;
  let truncated = status.truncated || analysis.truncated || analysis.data.failedJobs.length > input.maxJobs;
  const ciEvidence: CIFailureAnalysisResult["data"]["ciEvidence"] = [];
  let remediationActions: Array<{ category: string; title: string; steps: readonly string[]; runbook: string }> = [];
  try {
    const remediation = CIRemediationPlanResultSchema.parse(await options.provider.getRemediationPlan({ repo: input.repo, workflow: input.workflow, runId: input.runId }));
    remediationActions = [...remediation.data.actions];
    provenance.push(provenanceFor("ci-remediation", remediation.providerClass, remediation, false));
    warnings.push(...safeWarnings(remediation.warnings));
    redactionsApplied ||= remediation.redactionsApplied;
    truncated ||= remediation.truncated;
  } catch {
    warnings.push({ code: "ci-remediation-unavailable", message: "Remediation plan unavailable" });
    provenance.push(unavailableProvenance("ci-remediation", "ci"));
  }

  for (const [index, job] of analysis.data.failedJobs.slice(0, input.maxJobs).entries()) {
    try {
      const log = CILogEvidenceResultSchema.parse(await options.provider.getLogEvidence({
        repo: input.repo,
        workflow: input.workflow,
        runId: input.runId,
        jobId: job.id,
        maxLines: input.maxLogLines,
      }));
      const sanitizedLines = log.data.lines.slice(0, input.maxLogLines).map((line) => ({
        sequence: line.sequence,
        text: sanitizeEvidenceText(line.text, 512),
      }));
      const changed = sanitizedLines.some((line, lineIndex) => line.text !== log.data.lines[lineIndex]?.text);
      ciEvidence.push({
        jobId: job.id,
        category: job.category,
        available: log.data.available,
        lines: sanitizedLines,
        sha256: createHash("sha256").update(sanitizedLines.map((line) => line.text).join("\n"), "utf8").digest("hex"),
      });
      provenance.push(provenanceFor(`ci-log-${index + 1}`, log.providerClass, log, false));
      warnings.push(...safeWarnings(log.warnings));
      redactionsApplied ||= log.redactionsApplied || changed;
      truncated ||= log.truncated || log.data.lines.length > input.maxLogLines;
    } catch (error) {
      warnings.push({ code: "ci-log-unavailable", message: "CI log evidence unavailable" });
      provenance.push(unavailableProvenance(`ci-log-${index + 1}`, "ci"));
    }
  }

  const scm = await collectSCM(options.evidence?.scm, input, status.data.run.sha, clock(), input.maxChanges, input.maxHunkLines, warnings);
  const telemetry = await collectTelemetry(options.evidence?.telemetry, input, clock(), input.maxSignals, warnings);
  provenance.push(scm.provenance, telemetry.provenance);
  redactionsApplied ||= scm.redactionsApplied || telemetry.redactionsApplied;
  truncated ||= scm.truncated || telemetry.truncated;

  const classifications = classifyJobs(analysis.data.failedJobs.slice(0, input.maxJobs));
  const observedFacts = factsFor(status, analysis.data.failedJobs, scm.changes.length, telemetry.signals.length);
  const correlations = correlationsFor(scm.changes.length, telemetry.signals);
  const likelyLocations = locationsFor(scm.changes);
  const suggestions = suggestionsFor(remediationActions);
  const result = {
    schemaVersion: "1.0" as const,
    observedAt: clock().toISOString(),
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
      run: {
        status: status.data.run.status,
        conclusion: status.data.run.conclusion,
        ref: sanitizeEvidenceText(status.data.run.ref, 256),
        updatedAt: status.data.run.updatedAt,
      },
      observedFacts,
      ciEvidence,
      scmChanges: scm.changes,
      telemetrySignals: telemetry.signals,
      classifications,
      correlations,
      likelyLocations,
      suggestions,
      provenance: provenance.slice(0, 8),
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
      ciEvidence: [],
      scmChanges: [],
      telemetrySignals: [],
      classifications: [{ category: "unknown", confidence: 0, basis: ["Required evidence was unavailable"], evidenceRefs: [] }],
      correlations: [],
      likelyLocations: [],
      suggestions: [],
      provenance: [{ source: "ci-analysis", provider, observedAt: options.observedAt.toISOString(), freshness: "unknown", truncated: false, unavailable: true, redactionsApplied: false, warnings: [{ code, message: "Evidence source unavailable" }] }],
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

function collectSCM(provider: SCMChangeEvidenceProvider | undefined, input: CIFailureAnalysisInput, headSha: string, _observedAt: Date, maxChanges: number, maxHunkLines: number, warnings: Array<{ code: string; message: string }>) {
  if (provider === undefined) {
    warnings.push({ code: "scm-unavailable", message: "SCM change evidence unavailable" });
    return { changes: [], truncated: false, redactionsApplied: false, provenance: unavailableProvenance("scm", "unconfigured", _observedAt.toISOString()) };
  }
  return provider.getChangeEvidence(SCMChangeEvidenceInputSchema.parse({ repo: input.repo, workflow: input.workflow, runId: input.runId, headSha, maxChanges, maxHunkLines }))
    .then((value) => {
      const result = SCMChangeEvidenceResultSchema.parse(value);
      warnings.push(...safeWarnings(result.warnings));
      if (!result.data.available) {
        warnings.push({ code: "scm-unavailable", message: "SCM change evidence unavailable" });
        return { changes: [], truncated: result.truncated, redactionsApplied: result.redactionsApplied, provenance: provenanceFor("scm", result.providerClass, result, true) };
      }
      const changes = result.data.changes.slice(0, maxChanges).map((change) => SCMChangeSchema.parse({
        ...change,
        path: sanitizeEvidenceText(change.path, 512),
        hunks: change.hunks.slice(0, 20).map((hunk) => ({
          header: sanitizeEvidenceText(hunk.header, 256),
          lines: hunk.lines.slice(0, maxHunkLines).map((line) => sanitizeEvidenceText(line, 512)),
        })),
      }));
      return {
        changes,
        truncated: result.truncated || result.data.changes.length > maxChanges,
        redactionsApplied: result.redactionsApplied || JSON.stringify(changes) !== JSON.stringify(result.data.changes.slice(0, maxChanges)),
        provenance: provenanceFor("scm", result.providerClass, result, false),
      };
    })
    .catch(() => {
      warnings.push({ code: "scm-unavailable", message: "SCM change evidence unavailable" });
      return { changes: [], truncated: false, redactionsApplied: false, provenance: unavailableProvenance("scm", "scm", _observedAt.toISOString()) };
    });
}

function collectTelemetry(provider: TelemetryCorrelationProvider | undefined, input: CIFailureAnalysisInput, _observedAt: Date, maxSignals: number, warnings: Array<{ code: string; message: string }>) {
  if (provider === undefined) {
    warnings.push({ code: "telemetry-unavailable", message: "Telemetry correlation unavailable" });
    return { signals: [], truncated: false, redactionsApplied: false, provenance: unavailableProvenance("telemetry", "unconfigured", _observedAt.toISOString()) };
  }
  return provider.getTelemetryCorrelation(TelemetryCorrelationInputSchema.parse({ repo: input.repo, workflow: input.workflow, runId: input.runId, signalIds: [], maxSignals }))
    .then((value) => {
      const result = TelemetryCorrelationResultSchema.parse(value);
      warnings.push(...safeWarnings(result.warnings));
      if (!result.data.available) {
        warnings.push({ code: "telemetry-unavailable", message: "Telemetry correlation unavailable" });
        return { signals: [], truncated: result.truncated, redactionsApplied: result.redactionsApplied, provenance: provenanceFor("telemetry", result.providerClass, result, true) };
      }
      const signals = result.data.signals.slice(0, maxSignals).map((signal) => TelemetrySignalSchema.parse({
        ...signal,
        id: safeLogical(signal.id, "signal"),
        summary: sanitizeEvidenceText(signal.summary, 512),
      }));
      return { signals, truncated: result.truncated || result.data.signals.length > maxSignals, redactionsApplied: result.redactionsApplied, provenance: provenanceFor("telemetry", result.providerClass, result, false) };
    })
    .catch(() => {
      warnings.push({ code: "telemetry-unavailable", message: "Telemetry correlation unavailable" });
      return { signals: [], truncated: false, redactionsApplied: false, provenance: unavailableProvenance("telemetry", "telemetry", _observedAt.toISOString()) };
    });
}

function classifyJobs(jobs: readonly CIJob[]) {
  const byCategory = new Map<string, { basis: string[]; refs: string[] }>();
  jobs.forEach((job, index) => {
    const category = classifyFailure(job.category, job.name, ...job.failedSteps);
    const current = byCategory.get(category) ?? { basis: [], refs: [] };
    current.basis.push(sanitizeEvidenceText(job.name, 256));
    current.refs.push(`ci-job-${index + 1}`);
    byCategory.set(category, current);
  });
  if (byCategory.size === 0) return [{ category: "unknown" as const, confidence: 0, basis: ["No failed job classification was available"], evidenceRefs: [] }];
  return [...byCategory.entries()].slice(0, 10).map(([category, value]) => ({
    category,
    confidence: category === "unknown" ? 0 : 1,
    basis: value.basis.slice(0, 8),
    evidenceRefs: value.refs.slice(0, 10),
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

function correlationsFor(changeCount: number, signals: readonly z.infer<typeof TelemetrySignalSchema>[]) {
  const correlations: Array<{ source: string; kind: string; summary: string; confidence: number; evidenceRefs: string[] }> = [];
  if (changeCount > 0) correlations.push({ source: "scm", kind: "scm-ci", summary: "Bounded SCM changes are associated with the failed run", confidence: 0.65, evidenceRefs: ["scm"] });
  for (const signal of signals.filter((item) => item.state === "degraded" || item.state === "error")) {
    correlations.push({ source: "telemetry", kind: "ci-telemetry", summary: sanitizeEvidenceText(signal.summary, 512), confidence: 0.7, evidenceRefs: [`telemetry-${safeLogical(signal.id, "signal")}`] });
  }
  return correlations.slice(0, 20);
}

function locationsFor(changes: readonly z.infer<typeof SCMChangeSchema>[]) {
  const seen = new Set<string>();
  return changes.flatMap((change, index) => {
    if (seen.has(change.path)) return [];
    seen.add(change.path);
    return [{ path: change.path, confidence: Math.max(0.2, 0.8 - index * 0.05), evidenceRefs: [`scm-change-${index + 1}`] }];
  }).slice(0, 20);
}

function suggestionsFor(actions: readonly { category: string; title: string; steps: readonly string[]; runbook: string }[]) {
  return [...new Map(actions.map((action) => [action.category, {
    category: action.category,
    title: sanitizeEvidenceText(action.title, 256),
    steps: action.steps.slice(0, 8).map((step) => sanitizeEvidenceText(step, 512)),
    runbook: action.runbook,
    dryRun: true as const,
  }])).values()].slice(0, 8);
}

function provenanceFor(source: string, provider: string, value: { observedAt: string; freshness: ForensicsFreshness; truncated: boolean; redactionsApplied: boolean; warnings: readonly { code: string; message: string }[] }, unavailable: boolean): ForensicsProvenance {
  return {
    source: safeLogical(source, "evidence"),
    provider: safeLogical(provider, "unknown-provider"),
    observedAt: value.observedAt,
    freshness: value.freshness,
    truncated: value.truncated,
    unavailable,
    redactionsApplied: value.redactionsApplied,
    warnings: value.warnings.slice(0, 20).map(safeWarning),
  };
}

function unavailableProvenance(source: string, provider: string, observedAt = new Date(0).toISOString()): ForensicsProvenance {
  return { source, provider: safeLogical(provider, "unknown-provider"), observedAt, freshness: "unknown", truncated: false, unavailable: true, redactionsApplied: false, warnings: [{ code: "unavailable", message: "Evidence source unavailable" }] };
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
  return CIFailureAnalysisResultSchema.parse({
    ...analysis,
    truncated: true,
    data: {
      ...data,
      observedFacts: data.observedFacts.slice(0, minimal ? 1 : 5),
      ciEvidence: minimal ? [] : data.ciEvidence.slice(0, 2).map((entry) => ({ ...entry, lines: entry.lines.slice(0, 2) })),
      scmChanges: minimal ? [] : data.scmChanges.slice(0, 3).map((change) => ({ ...change, hunks: change.hunks.slice(0, 1).map((hunk) => ({ ...hunk, lines: hunk.lines.slice(0, 2) })) })),
      telemetrySignals: minimal ? [] : data.telemetrySignals.slice(0, 3),
      classifications: data.classifications.slice(0, minimal ? 1 : 3),
      correlations: data.correlations.slice(0, minimal ? 1 : 3),
      likelyLocations: data.likelyLocations.slice(0, minimal ? 1 : 4),
      suggestions: minimal ? [] : data.suggestions.slice(0, 1).map((suggestion) => ({ ...suggestion, steps: suggestion.steps.slice(0, 1) })),
      provenance: data.provenance.slice(0, minimal ? 1 : 5),
    },
  });
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
