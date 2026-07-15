import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  assembleFailureAnalysis,
  buildAgentNotificationPayload,
  type ForensicsProviderSet,
} from "../src/ci/forensics.js";
import type { CIProvider } from "../src/providers/ci-provider.js";
import type { CIWorkflowRun } from "../src/domain/ci-schemas.js";

const NOW = new Date("2026-07-15T00:00:00.000Z");
const SHA = "a".repeat(40);

function run(conclusion: CIWorkflowRun["conclusion"] = "failure"): CIWorkflowRun {
  return {
    id: "101",
    repository: "owner/repo",
    workflow: "ci.yml",
    status: "completed",
    conclusion,
    runAttempt: 1,
    event: "push",
    ref: "main",
    sha: SHA,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function ciProvider(): CIProvider {
  return {
    getWorkflowStatus: vi.fn().mockResolvedValue({
      schemaVersion: "1.0",
      observedAt: NOW.toISOString(),
      providerClass: "github-actions",
      freshness: "fresh",
      truncated: false,
      redactionsApplied: false,
      warnings: [],
      data: { run: run() },
    }),
    getFailedJobAnalysis: vi.fn().mockResolvedValue({
      schemaVersion: "1.0",
      observedAt: NOW.toISOString(),
      providerClass: "github-actions",
      freshness: "fresh",
      truncated: false,
      redactionsApplied: true,
      warnings: [],
      data: {
        run: run(),
        failedJobs: [{
          id: "job-1",
          name: "unit tests",
          status: "completed",
          conclusion: "failure",
          category: "test",
          failedSteps: ["vitest"],
        }],
        categorySummary: { build: 0, test: 1, lint: 0, dependency: 0, deployment: 0, "infrastructure-connectivity": 0, permission: 0, unknown: 0 },
      },
    }),
    getLogEvidence: vi.fn().mockResolvedValue({
      schemaVersion: "1.0",
      observedAt: NOW.toISOString(),
      providerClass: "github-actions",
      freshness: "fresh",
      truncated: false,
      redactionsApplied: true,
      warnings: [],
      data: {
        runId: "101",
        jobId: "job-1",
        jobName: "unit tests",
        available: true,
        lines: [{ sequence: 1, text: "npm test failed token=super-secret" }],
        sha256: createHash("sha256").update("redacted").digest("hex"),
      },
    }),
    getRemediationPlan: vi.fn().mockResolvedValue({
      schemaVersion: "1.0",
      observedAt: NOW.toISOString(),
      providerClass: "github-actions",
      freshness: "fresh",
      truncated: false,
      redactionsApplied: false,
      warnings: [],
      data: {
        runId: "101",
        dryRun: true,
        actions: [{ category: "test", title: "test remediation review", steps: ["Inspect the failing test"], runbook: "docs/ci-cd-runbook.md#test" }],
      },
    }),
    rerunFailedWorkflow: vi.fn(),
  };
}

const evidence: ForensicsProviderSet = {
  scm: {
    getChangeEvidence: vi.fn().mockResolvedValue({
      schemaVersion: "1.0",
      observedAt: NOW.toISOString(),
      providerClass: "github",
      freshness: "fresh",
      truncated: false,
      redactionsApplied: false,
      warnings: [],
      data: {
        available: true,
        changes: [{
          path: "src/check.ts",
          changeType: "modified",
          additions: 3,
          deletions: 1,
          hunks: [{ header: "@@ -1 +1 @@", lines: ["+expect(value).toBe(true)"] }],
        }],
      },
    }),
  },
  telemetry: {
    getTelemetryCorrelation: vi.fn().mockResolvedValue({
      schemaVersion: "1.0",
      observedAt: NOW.toISOString(),
      providerClass: "prometheus",
      freshness: "fresh",
      truncated: true,
      redactionsApplied: false,
      warnings: [],
      data: {
        available: true,
        signals: [{ id: "error-rate", kind: "metric", state: "degraded", summary: "Error rate elevated", observedAt: NOW.toISOString() }],
      },
    }),
  },
};

describe("provider-neutral CI forensics", () => {
  it("assembles facts, deterministic classifications, correlations, locations, and dry-run suggestions", async () => {
    const result = await assembleFailureAnalysis({
      provider: ciProvider(),
      evidence,
      input: { repo: "owner/repo", workflow: "ci.yml", runId: "101", maxLogLines: 10 },
      clock: () => NOW,
    });

    expect(result.data.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "test", confidence: 1 }),
    ]));
    expect(result.data.observedFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "ci", subject: "workflow.conclusion", value: "failure" }),
    ]));
    expect(result.data.correlations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "telemetry", kind: "ci-telemetry" }),
    ]));
    expect(result.data.likelyLocations).toEqual([
      expect.objectContaining({ path: "src/check.ts", confidence: expect.any(Number) }),
    ]);
    expect(result.data.suggestions).toEqual([
      expect.objectContaining({ dryRun: true, runbook: "docs/ci-cd-runbook.md#test" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(result.truncated).toBe(true);
    expect(result.data.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "scm", provider: "github", truncated: false }),
      expect.objectContaining({ source: "telemetry", provider: "prometheus", truncated: true }),
    ]));
  });

  it("keeps unavailable optional evidence explicit and does not guess correlations", async () => {
    const unavailable: ForensicsProviderSet = {
      scm: { getChangeEvidence: vi.fn().mockRejectedValue(new Error("SCM credential secret")) },
      telemetry: { getTelemetryCorrelation: vi.fn().mockRejectedValue(new Error("telemetry secret")) },
    };
    const result = await assembleFailureAnalysis({
      provider: ciProvider(),
      evidence: unavailable,
      input: { repo: "owner/repo", workflow: "ci.yml", runId: "101" },
      clock: () => NOW,
    });

    expect(result.data.correlations).toEqual([]);
    expect(result.data.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "scm", unavailable: true }),
      expect.objectContaining({ source: "telemetry", unavailable: true }),
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scm-unavailable" }),
      expect.objectContaining({ code: "telemetry-unavailable" }),
    ]));
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("builds one bounded deduplication-ready agent notification payload", async () => {
    const analysis = await assembleFailureAnalysis({
      provider: ciProvider(),
      evidence,
      input: { repo: "owner/repo", workflow: "ci.yml", runId: "101" },
      clock: () => NOW,
    });
    const payload = buildAgentNotificationPayload({
      analysis,
      eventId: "owner/repo:ci.yml:101:1",
      source: "webhook",
      maxBytes: 2_000,
    });

    expect(payload.dedupeKey).toBe("owner/repo:ci.yml:101:1");
    expect(payload.type).toBe("ci.failure.analysis");
    expect(payload.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBeLessThanOrEqual(2_000);
    expect(payload.analysis).toHaveProperty("data.observedFacts");
    expect(JSON.stringify(payload)).not.toContain("super-secret");
  });
});
