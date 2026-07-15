import {
  BITBUCKET_DATA_CENTER_CAPABILITIES,
  BITBUCKET_DATA_CENTER_PROVIDER_IDENTITY,
  BITBUCKET_DATA_CENTER_UNSUPPORTED_BEHAVIOR,
  BitbucketDataCenterAdapterContractSchema,
  type BitbucketDataCenterAdapterContract,
} from "../../src/domain/bitbucket-data-center-contract.js";

/** Placeholder-only contract fixture. It contains a path, never a credential. */
export const BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE: BitbucketDataCenterAdapterContract = BitbucketDataCenterAdapterContractSchema.parse({
  contractVersion: "1.0",
  identity: BITBUCKET_DATA_CENTER_PROVIDER_IDENTITY,
  connection: {
    endpoint: { origin: "https://bitbucket.example", path: "/bitbucket" },
    auth: { method: "bearer", token_file: "/run/secrets/bitbucket-data-center-token" },
  },
  capabilities: BITBUCKET_DATA_CENTER_CAPABILITIES,
  unsupported: BITBUCKET_DATA_CENTER_UNSUPPORTED_BEHAVIOR,
});

export const BITBUCKET_DATA_CENTER_EVIDENCE_FIXTURE = {
  schemaVersion: "1.0" as const,
  observedAt: "2026-07-15T00:00:00.000Z",
  providerClass: "bitbucket-data-center" as const,
  freshness: "fresh" as const,
  truncated: true,
  truncation: {
    projects: false,
    repositories: false,
    refs: false,
    builds: false,
    commits: false,
    pullRequests: false,
    changes: true,
    hunks: true,
    lines: true,
    bytes: false,
    providerRequests: false,
    timeWindow: false,
  },
  redactionsApplied: true,
  warnings: [{ code: "change-budget", message: "Change evidence was bounded by the requested budget" }],
  provenance: {
    source: "bitbucket-data-center" as const,
    endpointPath: "/bitbucket",
    apiPath: "/rest/api/1.0" as const,
    requestCount: 6,
    resources: ["project", "repository", "ref", "commit", "pull-request", "change"] as const,
    responseIds: ["42", "build-17"],
    digest: "a".repeat(64),
  },
  data: {
    available: true as const,
    evidence: {
      repository: { projectKey: "PLN", repositorySlug: "scheduler" },
      selector: {
        repository: { projectKey: "PLN", repositorySlug: "scheduler" },
        pullRequest: "42",
      },
      ref: "feature/goal-19",
      build: {
        key: "build-17",
        number: 17,
        state: "SUCCESSFUL" as const,
        commit: "b".repeat(40),
      },
      commit: {
        id: "b".repeat(40),
        displayId: "b".repeat(12),
        message: "bounded contract fixture",
        author: "fixture",
        parents: ["a".repeat(40)],
      },
      pullRequest: {
        id: "42",
        title: "Goal 19 contract",
        state: "OPEN" as const,
        version: 3,
        from: {
          repository: { projectKey: "PLN", repositorySlug: "scheduler" },
          ref: "feature/goal-19",
          commit: "b".repeat(40),
        },
        to: {
          repository: { projectKey: "PLN", repositorySlug: "scheduler" },
          ref: "main",
          commit: "a".repeat(40),
        },
      },
      changes: [{
        path: "src/contract.ts",
        status: "modified" as const,
        additions: 4,
        deletions: 1,
        binary: false,
        patch: "@@ -1 +1 @@\n-safe\n+bounded",
        suppressedReason: "budget" as const,
      }],
      summary: { files: 1, additions: 4, deletions: 1 },
    },
  },
};
