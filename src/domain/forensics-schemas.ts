import { z } from "zod";
import { CICategorySchema, CIJobIdSchema, CIRepositorySchema, CIRunIdSchema, CIWorkflowSchema, CI_SCHEMA_VERSION } from "./ci-schemas.js";
import { BoundedTextSchema, LogicalIdSchema, UtcTimestampSchema } from "./tool-schemas.js";

export const FORENSICS_SCHEMA_VERSION = CI_SCHEMA_VERSION;

export const ForensicsFreshnessSchema = z.enum(["fresh", "cached", "stale", "unknown"]);
export type ForensicsFreshness = z.infer<typeof ForensicsFreshnessSchema>;

const ForensicsWarningSchema = z.object({
  code: LogicalIdSchema,
  message: BoundedTextSchema.max(512),
}).strict();

export const ForensicsProvenanceSchema = z.object({
  source: LogicalIdSchema,
  provider: LogicalIdSchema,
  observedAt: UtcTimestampSchema,
  freshness: ForensicsFreshnessSchema,
  truncated: z.boolean(),
  unavailable: z.boolean(),
  redactionsApplied: z.boolean(),
  warnings: z.array(ForensicsWarningSchema).max(20),
}).strict();
export type ForensicsProvenance = z.infer<typeof ForensicsProvenanceSchema>;

export const SCMChangeEvidenceInputSchema = z.object({
  repo: CIRepositorySchema,
  workflow: CIWorkflowSchema,
  runId: CIRunIdSchema,
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
  maxChanges: z.number().int().min(1).max(25).default(10),
  maxHunkLines: z.number().int().min(1).max(40).default(12),
}).strict();
export type SCMChangeEvidenceInput = z.infer<typeof SCMChangeEvidenceInputSchema>;

const SCMPathSchema = z.string().min(1).max(512).regex(/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/@+-]+$/);
export const SCMHunkSchema = z.object({
  header: BoundedTextSchema.max(256),
  lines: z.array(BoundedTextSchema.max(512)).max(40),
}).strict();
export const SCMChangeSchema = z.object({
  path: SCMPathSchema,
  changeType: z.enum(["added", "modified", "deleted", "renamed"]),
  additions: z.number().int().min(0).max(1_000_000),
  deletions: z.number().int().min(0).max(1_000_000),
  hunks: z.array(SCMHunkSchema).max(20),
}).strict();

const SCMChangeDataSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), changes: z.array(SCMChangeSchema).max(25) }).strict(),
  z.object({
    available: z.literal(false),
    unavailable: z.object({ code: LogicalIdSchema, message: BoundedTextSchema.max(512) }).strict(),
  }).strict(),
]);

export const SCMChangeEvidenceResultSchema = z.object({
  schemaVersion: z.literal(FORENSICS_SCHEMA_VERSION),
  observedAt: UtcTimestampSchema,
  providerClass: LogicalIdSchema,
  freshness: ForensicsFreshnessSchema,
  truncated: z.boolean(),
  redactionsApplied: z.boolean(),
  warnings: z.array(ForensicsWarningSchema).max(20),
  data: SCMChangeDataSchema,
}).strict();
export type SCMChangeEvidenceResult = z.infer<typeof SCMChangeEvidenceResultSchema>;

export const TelemetryCorrelationInputSchema = z.object({
  repo: CIRepositorySchema,
  workflow: CIWorkflowSchema,
  runId: CIRunIdSchema,
  signalIds: z.array(LogicalIdSchema).max(10).default([]),
  maxSignals: z.number().int().min(1).max(20).default(10),
}).strict();
export type TelemetryCorrelationInput = z.infer<typeof TelemetryCorrelationInputSchema>;

export const TelemetrySignalSchema = z.object({
  id: LogicalIdSchema,
  kind: z.enum(["metric", "log", "trace"]),
  state: z.enum(["normal", "degraded", "error", "unknown"]),
  summary: BoundedTextSchema.max(512),
  observedAt: UtcTimestampSchema,
}).strict();
const TelemetryCorrelationDataSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), signals: z.array(TelemetrySignalSchema).max(20) }).strict(),
  z.object({
    available: z.literal(false),
    unavailable: z.object({ code: LogicalIdSchema, message: BoundedTextSchema.max(512) }).strict(),
  }).strict(),
]);

export const TelemetryCorrelationResultSchema = z.object({
  schemaVersion: z.literal(FORENSICS_SCHEMA_VERSION),
  observedAt: UtcTimestampSchema,
  providerClass: LogicalIdSchema,
  freshness: ForensicsFreshnessSchema,
  truncated: z.boolean(),
  redactionsApplied: z.boolean(),
  warnings: z.array(ForensicsWarningSchema).max(20),
  data: TelemetryCorrelationDataSchema,
}).strict();
export type TelemetryCorrelationResult = z.infer<typeof TelemetryCorrelationResultSchema>;

export const CIFailureAnalysisInputSchema = z.object({
  repo: CIRepositorySchema,
  workflow: CIWorkflowSchema,
  runId: CIRunIdSchema,
  maxJobs: z.number().int().min(1).max(10).default(3),
  maxLogLines: z.number().int().min(1).max(200).default(20),
  maxChanges: z.number().int().min(1).max(25).default(10),
  maxHunkLines: z.number().int().min(1).max(40).default(12),
  maxSignals: z.number().int().min(1).max(20).default(10),
}).strict();
export type CIFailureAnalysisInput = z.infer<typeof CIFailureAnalysisInputSchema>;

const FailureSubjectSchema = z.object({
  repo: CIRepositorySchema,
  workflow: CIWorkflowSchema,
  runId: CIRunIdSchema,
  runAttempt: z.number().int().min(1).max(100),
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();

const ObservedFactSchema = z.object({
  id: LogicalIdSchema,
  source: LogicalIdSchema,
  subject: LogicalIdSchema,
  value: z.union([BoundedTextSchema.max(512), z.number().finite(), z.boolean()]),
  evidenceRefs: z.array(LogicalIdSchema).max(10),
}).strict();

const ClassificationSchema = z.object({
  category: CICategorySchema,
  confidence: z.number().min(0).max(1),
  basis: z.array(BoundedTextSchema.max(256)).max(8),
  evidenceRefs: z.array(LogicalIdSchema).max(10),
}).strict();

const CorrelationSchema = z.object({
  source: LogicalIdSchema,
  kind: LogicalIdSchema,
  summary: BoundedTextSchema.max(512),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(LogicalIdSchema).max(10),
}).strict();

const LikelyLocationSchema = z.object({
  path: SCMPathSchema,
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(LogicalIdSchema).max(10),
}).strict();

const SuggestionSchema = z.object({
  category: CICategorySchema,
  title: BoundedTextSchema.max(256),
  steps: z.array(BoundedTextSchema.max(512)).min(1).max(8),
  runbook: z.string().regex(/^docs\/ci-cd-runbook\.md#[a-z0-9-]+$/),
  dryRun: z.literal(true),
}).strict();

const SanitizedLogEvidenceSchema = z.object({
  jobId: CIJobIdSchema,
  category: CICategorySchema,
  available: z.boolean(),
  lines: z.array(z.object({ sequence: z.number().int().min(1).max(20_000), text: BoundedTextSchema.max(512) }).strict()).max(20),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const CIFailureAnalysisResultSchema = z.object({
  schemaVersion: z.literal(FORENSICS_SCHEMA_VERSION),
  observedAt: UtcTimestampSchema,
  providerClass: LogicalIdSchema,
  freshness: ForensicsFreshnessSchema,
  truncated: z.boolean(),
  redactionsApplied: z.boolean(),
  warnings: z.array(ForensicsWarningSchema).max(20),
  data: z.object({
    subject: FailureSubjectSchema,
    run: z.object({
      status: z.enum(["queued", "in_progress", "completed"]),
      conclusion: z.string().max(64).nullable(),
      ref: BoundedTextSchema.max(256),
      updatedAt: UtcTimestampSchema,
    }).strict(),
    observedFacts: z.array(ObservedFactSchema).max(40),
    ciEvidence: z.array(SanitizedLogEvidenceSchema).max(10),
    scmChanges: z.array(SCMChangeSchema).max(25),
    telemetrySignals: z.array(TelemetrySignalSchema).max(20),
    classifications: z.array(ClassificationSchema).max(10),
    correlations: z.array(CorrelationSchema).max(20),
    likelyLocations: z.array(LikelyLocationSchema).max(20),
    suggestions: z.array(SuggestionSchema).max(8),
    provenance: z.array(ForensicsProvenanceSchema).max(8),
  }).strict(),
}).strict();
export type CIFailureAnalysisResult = z.infer<typeof CIFailureAnalysisResultSchema>;

export type CIFailureAnalysisData = CIFailureAnalysisResult["data"];
export type ForensicsWarning = z.infer<typeof ForensicsWarningSchema>;

export function makeForensicsWarning(code: string, message: string): ForensicsWarning {
  return ForensicsWarningSchema.parse({ code, message });
}
