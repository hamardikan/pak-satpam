import { z } from "zod";

import {
  CIProviderEndpointSchema,
  ciProviderEndpointFromUrl,
  normalizeCIProviderEndpoint,
  type CIProviderEndpoint,
} from "./ci-provider-contracts.js";
import { CIProviderNativeIdSchema } from "./ci-schemas.js";
import {
  SCMCommitSchema,
  SCMFileStatusSchema,
  SCMRefSchema,
  type SCMCommit,
} from "../scm/schemas.js";

/** Contract version for a future Bitbucket Data Center adapter. */
export const BITBUCKET_DATA_CENTER_CONTRACT_VERSION = "1.0" as const;
export const BITBUCKET_DATA_CENTER_PROVIDER_CLASS = "bitbucket-data-center" as const;
export const BITBUCKET_DATA_CENTER_API_PATH = "/rest/api/1.0" as const;

export const BitbucketDataCenterProviderIdentitySchema = z
  .object({
    providerClass: z.literal(BITBUCKET_DATA_CENTER_PROVIDER_CLASS),
    kind: z.literal(BITBUCKET_DATA_CENTER_PROVIDER_CLASS),
    displayName: z.literal("Bitbucket Data Center"),
    deployment: z.literal("data-center"),
    adapterStatus: z.literal("contract-only"),
  })
  .strict();
export type BitbucketDataCenterProviderIdentity = z.infer<typeof BitbucketDataCenterProviderIdentitySchema>;

export const BITBUCKET_DATA_CENTER_PROVIDER_IDENTITY = Object.freeze(
  BitbucketDataCenterProviderIdentitySchema.parse({
    providerClass: BITBUCKET_DATA_CENTER_PROVIDER_CLASS,
    kind: BITBUCKET_DATA_CENTER_PROVIDER_CLASS,
    displayName: "Bitbucket Data Center",
    deployment: "data-center",
    adapterStatus: "contract-only",
  }),
);

const SecretFilePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .regex(/^\/[^\s]*$/, "auth file references must be absolute paths without whitespace");

export const BitbucketDataCenterAuthSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("bearer"), token_file: SecretFilePathSchema }).strict(),
  z.object({ method: z.literal("basic"), username: z.string().min(1).max(256), password_file: SecretFilePathSchema }).strict(),
]);
export type BitbucketDataCenterAuth = z.infer<typeof BitbucketDataCenterAuthSchema>;

const BaseUrlSchema = z
  .string()
  .min(1)
  .max(2_048)
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:") context.addIssue({ code: "custom", message: "Bitbucket Data Center credentials require HTTPS" });
    if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
      context.addIssue({ code: "custom", message: "base_url must not contain credentials, query, or fragment" });
    }
    const path = normalizePath(url.pathname || "/");
    if (path === BITBUCKET_DATA_CENTER_API_PATH || path.startsWith(`${BITBUCKET_DATA_CENTER_API_PATH}/`)) {
      context.addIssue({ code: "custom", message: "base_url is the server context root; omit /rest/api/1.0" });
    }
  });

/** Connection input deliberately keeps secrets in referenced 0600 files. */
export const BitbucketDataCenterConnectionSchema = z
  .object({
    base_url: BaseUrlSchema.optional(),
    endpoint: CIProviderEndpointSchema.optional(),
    auth: BitbucketDataCenterAuthSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.base_url === undefined) === (value.endpoint === undefined)) {
      context.addIssue({ code: "custom", path: ["endpoint"], message: "configure exactly one base_url or endpoint" });
    }
    if (value.endpoint !== undefined) {
      const normalized = normalizeCIProviderEndpoint(value.endpoint);
      if (new URL(normalized.origin).protocol !== "https:") {
        context.addIssue({ code: "custom", path: ["endpoint", "origin"], message: "Bitbucket Data Center credentials require HTTPS" });
      }
      if (normalized.path === BITBUCKET_DATA_CENTER_API_PATH || normalized.path.startsWith(`${BITBUCKET_DATA_CENTER_API_PATH}/`)) {
        context.addIssue({ code: "custom", path: ["endpoint", "path"], message: "endpoint.path is the server context root; omit /rest/api/1.0" });
      }
    }
  });
export type BitbucketDataCenterConnection = z.infer<typeof BitbucketDataCenterConnectionSchema>;

const ContractCapabilitiesSchema = z
  .object({
    projectRepositoryRead: z.literal(true),
    refRead: z.literal(true),
    buildRead: z.literal(true),
    commitRead: z.literal(true),
    pullRequestRead: z.literal(true),
    changeRead: z.literal(true),
    rerun: z.literal("unsupported"),
  })
  .strict();

const RuntimeCapabilitiesSchema = z
  .object({
    selectable: z.literal(false),
    tools: z.array(z.string()).max(0),
    errorCode: z.literal("unsupported"),
  })
  .strict();

export const BitbucketDataCenterCapabilitiesSchema = z
  .object({ contract: ContractCapabilitiesSchema, runtime: RuntimeCapabilitiesSchema })
  .strict();
export type BitbucketDataCenterCapabilities = z.infer<typeof BitbucketDataCenterCapabilitiesSchema>;

export const BITBUCKET_DATA_CENTER_CAPABILITIES = Object.freeze(
  BitbucketDataCenterCapabilitiesSchema.parse({
    contract: {
      projectRepositoryRead: true,
      refRead: true,
      buildRead: true,
      commitRead: true,
      pullRequestRead: true,
      changeRead: true,
      rerun: "unsupported",
    },
    runtime: { selectable: false, tools: [], errorCode: "unsupported" },
  }),
);

export const BitbucketDataCenterUnsupportedBehaviorSchema = z
  .object({
    runtimeSelection: z.literal("rejected"),
    requests: z.literal("not-attempted"),
    tools: z.array(z.string()).max(0),
    errorCode: z.literal("unsupported"),
    message: z.literal("Bitbucket Data Center has a contract only; no runtime adapter is registered."),
  })
  .strict();
export type BitbucketDataCenterUnsupportedBehavior = z.infer<typeof BitbucketDataCenterUnsupportedBehaviorSchema>;

export const BITBUCKET_DATA_CENTER_UNSUPPORTED_BEHAVIOR = Object.freeze(
  BitbucketDataCenterUnsupportedBehaviorSchema.parse({
    runtimeSelection: "rejected",
    requests: "not-attempted",
    tools: [],
    errorCode: "unsupported",
    message: "Bitbucket Data Center has a contract only; no runtime adapter is registered.",
  }),
);

export const BitbucketDataCenterProjectKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
export const BitbucketDataCenterRepositorySlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const BitbucketDataCenterRepositorySchema = z
  .object({ projectKey: BitbucketDataCenterProjectKeySchema, repositorySlug: BitbucketDataCenterRepositorySlugSchema })
  .strict();
export type BitbucketDataCenterRepository = z.infer<typeof BitbucketDataCenterRepositorySchema>;

export const BitbucketDataCenterBuildSelectorSchema = z
  .object({
    key: CIProviderNativeIdSchema.optional(),
    number: z.number().int().min(1).max(1_000_000_000).optional(),
  })
  .strict()
  .refine((value) => value.key !== undefined || value.number !== undefined, "build key or number is required");
export type BitbucketDataCenterBuildSelector = z.infer<typeof BitbucketDataCenterBuildSelectorSchema>;

const BitbucketDataCenterRevisionSchema = z
  .object({ ref: SCMRefSchema.optional(), commit: SCMCommitSchema.optional() })
  .strict()
  .refine((value) => value.ref !== undefined || value.commit !== undefined, "ref or commit is required");

export const BitbucketDataCenterEvidenceRequestSchema = z
  .object({
    repository: BitbucketDataCenterRepositorySchema,
    ref: SCMRefSchema.optional(),
    commit: SCMCommitSchema.optional(),
    build: BitbucketDataCenterBuildSelectorSchema.optional(),
    pullRequest: CIProviderNativeIdSchema.optional(),
    compare: z.object({ base: BitbucketDataCenterRevisionSchema, head: BitbucketDataCenterRevisionSchema }).strict().optional(),
  })
  .strict()
  .refine((value) => value.ref !== undefined || value.commit !== undefined || value.build !== undefined || value.pullRequest !== undefined || value.compare !== undefined, "one evidence selector is required");
export type BitbucketDataCenterEvidenceRequest = z.infer<typeof BitbucketDataCenterEvidenceRequestSchema>;

const ISODateSchema = z.iso.datetime({ offset: true }).refine((value) => value.endsWith("Z"));

export const BitbucketDataCenterBuildEvidenceSchema = z
  .object({
    key: CIProviderNativeIdSchema,
    number: z.number().int().min(1).max(1_000_000_000).optional(),
    state: z.enum(["IN_PROGRESS", "SUCCESSFUL", "FAILED", "UNKNOWN"]),
    url: z.string().url().max(2_048).optional(),
    commit: SCMCommitSchema.optional(),
    startedAt: ISODateSchema.optional(),
    completedAt: ISODateSchema.optional(),
  })
  .strict();

export const BitbucketDataCenterCommitEvidenceSchema = z
  .object({
    id: SCMCommitSchema,
    displayId: z.string().min(1).max(256),
    message: z.string().max(4_096).optional(),
    author: z.string().max(256).optional(),
    committer: z.string().max(256).optional(),
    timestamp: ISODateSchema.optional(),
    parents: z.array(SCMCommitSchema).max(100),
  })
  .strict();

const PullRequestSideSchema = z
  .object({ repository: BitbucketDataCenterRepositorySchema, ref: SCMRefSchema, commit: SCMCommitSchema.optional() })
  .strict();

export const BitbucketDataCenterPullRequestEvidenceSchema = z
  .object({
    id: CIProviderNativeIdSchema,
    title: z.string().max(512).optional(),
    state: z.enum(["OPEN", "DECLINED", "MERGED", "SUPERSEDED", "UNKNOWN"]),
    version: z.number().int().min(1).max(1_000_000_000).optional(),
    from: PullRequestSideSchema,
    to: PullRequestSideSchema,
    updatedAt: ISODateSchema.optional(),
  })
  .strict();

export const BitbucketDataCenterChangeEvidenceSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    status: SCMFileStatusSchema,
    additions: z.number().int().min(0).max(1_000_000_000),
    deletions: z.number().int().min(0).max(1_000_000_000),
    binary: z.boolean(),
    patch: z.string().max(32 * 1_024).optional(),
    suppressedReason: z.enum(["binary", "secret", "budget", "provider-omitted"]).optional(),
  })
  .strict();

const BitbucketDataCenterEvidenceDataSchema = z
  .object({
    repository: BitbucketDataCenterRepositorySchema,
    selector: BitbucketDataCenterEvidenceRequestSchema,
    ref: SCMRefSchema.optional(),
    build: BitbucketDataCenterBuildEvidenceSchema.optional(),
    commit: BitbucketDataCenterCommitEvidenceSchema.optional(),
    pullRequest: BitbucketDataCenterPullRequestEvidenceSchema.optional(),
    changes: z.array(BitbucketDataCenterChangeEvidenceSchema).max(100),
    summary: z.object({ files: z.number().int().nonnegative(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative() }).strict(),
  })
  .strict();
export type BitbucketDataCenterEvidenceData = z.infer<typeof BitbucketDataCenterEvidenceDataSchema>;

export const BitbucketDataCenterErrorSchema = z
  .object({
    code: z.enum(["unavailable", "permission", "malformed", "not-found", "unsupported"]),
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    providerStatus: z.number().int().min(100).max(599).optional(),
  })
  .strict();
export type BitbucketDataCenterError = z.infer<typeof BitbucketDataCenterErrorSchema>;

const TruncationSchema = z
  .object({
    projects: z.boolean(),
    repositories: z.boolean(),
    refs: z.boolean(),
    builds: z.boolean(),
    commits: z.boolean(),
    pullRequests: z.boolean(),
    changes: z.boolean(),
    hunks: z.boolean(),
    lines: z.boolean(),
    bytes: z.boolean(),
    providerRequests: z.boolean(),
    timeWindow: z.boolean(),
  })
  .strict();
export type BitbucketDataCenterTruncation = z.infer<typeof TruncationSchema>;

export const BitbucketDataCenterProvenanceSchema = z
  .object({
    source: z.literal(BITBUCKET_DATA_CENTER_PROVIDER_CLASS),
    endpointPath: z.string().min(1).max(512).regex(/^\/[^\s?#]*$/),
    apiPath: z.literal(BITBUCKET_DATA_CENTER_API_PATH),
    requestCount: z.number().int().nonnegative().max(16),
    resources: z.array(z.enum(["project", "repository", "ref", "build", "commit", "pull-request", "change"])).max(16),
    responseIds: z.array(CIProviderNativeIdSchema).max(32),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type BitbucketDataCenterProvenance = z.infer<typeof BitbucketDataCenterProvenanceSchema>;

const AvailableDataSchema = z.object({ available: z.literal(true), evidence: BitbucketDataCenterEvidenceDataSchema }).strict();
const UnavailableDataSchema = z.object({ available: z.literal(false), error: BitbucketDataCenterErrorSchema }).strict();

export const BitbucketDataCenterEvidenceResultSchema = z
  .object({
    schemaVersion: z.literal(BITBUCKET_DATA_CENTER_CONTRACT_VERSION),
    observedAt: ISODateSchema,
    providerClass: z.literal(BITBUCKET_DATA_CENTER_PROVIDER_CLASS),
    freshness: z.enum(["fresh", "stale", "unknown"]),
    truncated: z.boolean(),
    truncation: TruncationSchema,
    redactionsApplied: z.boolean(),
    warnings: z.array(z.object({ code: z.string().min(1).max(64), message: z.string().min(1).max(512) }).strict()).max(20),
    provenance: BitbucketDataCenterProvenanceSchema,
    data: z.discriminatedUnion("available", [AvailableDataSchema, UnavailableDataSchema]),
  })
  .strict();
export type BitbucketDataCenterEvidenceResult = z.infer<typeof BitbucketDataCenterEvidenceResultSchema>;

export const BitbucketDataCenterAdapterContractSchema = z
  .object({
    contractVersion: z.literal(BITBUCKET_DATA_CENTER_CONTRACT_VERSION),
    identity: BitbucketDataCenterProviderIdentitySchema,
    connection: BitbucketDataCenterConnectionSchema,
    capabilities: BitbucketDataCenterCapabilitiesSchema,
    unsupported: BitbucketDataCenterUnsupportedBehaviorSchema,
  })
  .strict();
export type BitbucketDataCenterAdapterContract = z.infer<typeof BitbucketDataCenterAdapterContractSchema>;

export function bitbucketDataCenterEndpointFromBaseUrl(baseUrl: string): CIProviderEndpoint {
  return assertBitbucketDataCenterEndpoint(ciProviderEndpointFromUrl(baseUrl));
}

export function normalizeBitbucketDataCenterEndpoint(endpoint: CIProviderEndpoint): CIProviderEndpoint {
  return assertBitbucketDataCenterEndpoint(normalizeCIProviderEndpoint(endpoint));
}

/** Resolve API-relative paths under the server context root and API path once. */
export function resolveBitbucketDataCenterUrl(endpoint: CIProviderEndpoint, resourcePath = ""): URL {
  const normalized = normalizeBitbucketDataCenterEndpoint(endpoint);
  if (resourcePath.includes("#") || resourcePath.startsWith("//") || /^[a-z][a-z0-9+.-]*:\/\//i.test(resourcePath)) {
    throw new Error("Bitbucket Data Center request paths must be relative and fragment-free");
  }
  const request = new URL(resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`, "https://pak-satpam-request.invalid");
  const requestPath = normalizePath(request.pathname);
  const apiRelativePath = requestPath === BITBUCKET_DATA_CENTER_API_PATH || requestPath.startsWith(`${BITBUCKET_DATA_CENTER_API_PATH}/`)
    ? requestPath
    : joinPath(BITBUCKET_DATA_CENTER_API_PATH, requestPath);
  const result = new URL(normalized.origin);
  result.pathname = joinPath(normalized.path, apiRelativePath);
  result.search = request.search;
  return result;
}

function assertBitbucketDataCenterEndpoint(endpoint: CIProviderEndpoint): CIProviderEndpoint {
  const normalized = normalizeCIProviderEndpoint(endpoint);
  if (new URL(normalized.origin).protocol !== "https:") throw new Error("Bitbucket Data Center credentials require HTTPS");
  if (normalized.path === BITBUCKET_DATA_CENTER_API_PATH || normalized.path.startsWith(`${BITBUCKET_DATA_CENTER_API_PATH}/`)) {
    throw new Error("Bitbucket Data Center endpoint path must omit /rest/api/1.0");
  }
  return normalized;
}

function normalizePath(path: string): string {
  const normalized = `/${path.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/" : normalized;
}

function joinPath(prefix: string, suffix: string): string {
  if (prefix === "/") return suffix;
  if (suffix === "/") return prefix;
  return `${prefix}/${suffix.replace(/^\/+/, "")}`;
}

export type { SCMCommit };
