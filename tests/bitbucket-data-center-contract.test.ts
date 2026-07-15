import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import {
  BITBUCKET_DATA_CENTER_API_PATH,
  BITBUCKET_DATA_CENTER_PROVIDER_IDENTITY,
  BITBUCKET_DATA_CENTER_UNSUPPORTED_BEHAVIOR,
  BitbucketDataCenterConnectionSchema,
  BitbucketDataCenterEvidenceResultSchema,
  bitbucketDataCenterEndpointFromBaseUrl,
  resolveBitbucketDataCenterUrl,
} from "../src/domain/bitbucket-data-center-contract.js";
import { parseRuntimeConfiguration } from "../src/runtime/load-runtime-configuration.js";
import type { CIProviderRuntimeMetadata, CIService } from "../src/ci/service.js";
import { BitbucketProvider } from "../src/providers/bitbucket-provider.js";
import { createCIAllowlist } from "../src/ci/policy.js";
import { createCIServer } from "../src/server/create-server.js";
import {
  BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE,
  BITBUCKET_DATA_CENTER_EVIDENCE_FIXTURE,
} from "./fixtures/bitbucket-data-center-contract.js";

describe("Bitbucket Data Center contract-only artifact", () => {
  it("keeps provider identity, capabilities, and unsupported behavior explicit", () => {
    expect(BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE.identity).toEqual(BITBUCKET_DATA_CENTER_PROVIDER_IDENTITY);
    expect(BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE.capabilities.runtime).toEqual({ selectable: false, tools: [], errorCode: "unsupported" });
    expect(BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE.capabilities.contract.rerun).toBe("unsupported");
    expect(BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE.unsupported).toEqual(BITBUCKET_DATA_CENTER_UNSUPPORTED_BEHAVIOR);
    expect(JSON.stringify(BITBUCKET_DATA_CENTER_CONTRACT_FIXTURE)).not.toContain("token-value");
  });

  it("normalizes a server context base URL and appends the REST API path once", () => {
    const endpoint = bitbucketDataCenterEndpointFromBaseUrl("https://bitbucket.example/bitbucket/");

    expect(endpoint).toEqual({ origin: "https://bitbucket.example", path: "/bitbucket" });
    expect(resolveBitbucketDataCenterUrl(endpoint, "/projects/PLN/repos/scheduler").toString()).toBe(
      "https://bitbucket.example/bitbucket/rest/api/1.0/projects/PLN/repos/scheduler",
    );
    expect(resolveBitbucketDataCenterUrl(endpoint, `${BITBUCKET_DATA_CENTER_API_PATH}/projects/PLN/repos/scheduler`).toString()).toBe(
      "https://bitbucket.example/bitbucket/rest/api/1.0/projects/PLN/repos/scheduler",
    );
    expect(resolveBitbucketDataCenterUrl(endpoint, "projects/PLN/repos/scheduler?limit=20").search).toBe("?limit=20");
  });

  it("rejects API-root ambiguity, cleartext transport, and inline auth material", () => {
    expect(() => bitbucketDataCenterEndpointFromBaseUrl("https://bitbucket.example/rest/api/1.0")).toThrow("omit /rest/api/1.0");
    expect(() => bitbucketDataCenterEndpointFromBaseUrl("http://bitbucket.example/bitbucket")).toThrow("require HTTPS");
    expect(() => BitbucketDataCenterConnectionSchema.parse({
      endpoint: { origin: "https://bitbucket.example", path: "/bitbucket" },
      auth: { method: "bearer", token: "inline-secret" },
    })).toThrow();
    expect(() => BitbucketDataCenterConnectionSchema.parse({
      endpoint: { origin: "https://bitbucket.example", path: "/bitbucket" },
      auth: { method: "bearer", token_file: "relative-token-file" },
    })).toThrow();
  });

  it("validates normalized build, commit, PR, change, truncation, error, and provenance evidence", () => {
    expect(BitbucketDataCenterEvidenceResultSchema.parse(BITBUCKET_DATA_CENTER_EVIDENCE_FIXTURE)).toMatchObject({
      providerClass: "bitbucket-data-center",
      data: { available: true, evidence: { repository: { projectKey: "PLN", repositorySlug: "scheduler" } } },
      provenance: { apiPath: BITBUCKET_DATA_CENTER_API_PATH, requestCount: 6 },
    });

    expect(BitbucketDataCenterEvidenceResultSchema.parse({
      ...BITBUCKET_DATA_CENTER_EVIDENCE_FIXTURE,
      truncated: false,
      data: {
        available: false,
        error: { code: "unsupported", message: "contract-only", retryable: false },
      },
    }).data).toEqual({ available: false, error: { code: "unsupported", message: "contract-only", retryable: false } });
  });

  it("rejects Data Center as a runtime provider type", () => {
    expect(() => parseRuntimeConfiguration(`
version: 1
profile: ci-only
ci:
  enabled: true
  provider: bitbucket-data-center
  allowlist:
    - repo: PLN/scheduler
      workflows: [build]
`)).toThrow("Invalid runtime configuration");
  });

  it("exposes no MCP tools even when an unknown type is forged at the runtime boundary", async () => {
    const provider = new BitbucketProvider({
      baseUrl: "https://bitbucket.example",
      token: "contract-only-fixture-user:contract-only-fixture-token",
      fetch: globalThis.fetch,
    });
    const runtimeMetadata = {
      name: "bitbucket-data-center",
      type: "bitbucket-data-center",
      capabilities: { read: true, rerun: false },
      approvalRequired: false,
    } as unknown as CIProviderRuntimeMetadata;
    const server = createCIServer({
      ci: {
        provider,
        policy: createCIAllowlist({ "PLN/scheduler": ["build"] }),
        runtimeMetadata,
      } satisfies CIService,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "bitbucket-data-center-contract-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      try {
        const result = await client.listTools();
        expect(result.tools).toEqual([]);
      } catch (error) {
        expect(error).toMatchObject({ code: -32601, message: "MCP error -32601: Method not found" });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
