import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createObservabilityHttpApp } from "../src/http/create-http-app.js";
import { FakeObservabilityProvider } from "../src/providers/fake-provider.js";

const TEST_CREDENTIAL = "goal11-test-bearer-token";
const FIXED_NOW = new Date("2026-07-10T00:00:00.000Z");

describe("private Streamable HTTP transport", () => {
  let server: Server;
  let baseUrl: URL;

  beforeEach(async () => {
    const app = createObservabilityHttpApp({
      provider: new FakeObservabilityProvider(() => FIXED_NOW),
      bearerToken: TEST_CREDENTIAL,
      host: "127.0.0.1",
      allowedHosts: ["127.0.0.1"],
      clock: () => FIXED_NOW,
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = new URL(`http://127.0.0.1:${address.port}`);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("serves MCP tools with bearer authentication", async () => {
    const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseUrl), {
      requestInit: { headers: { Authorization: `Bearer ${TEST_CREDENTIAL}` } },
    });
    const client = new Client({ name: "goal11-http-test", version: "1.0.0" });

    await client.connect(transport as unknown as Transport);
    const tools = await client.listTools();
    const health = await client.callTool({
      name: "observability.health_snapshot",
      arguments: { services: ["api"] },
    });
    await client.close();

    expect(tools.tools).toHaveLength(7);
    expect(health).not.toMatchObject({ isError: true });
  });

  it("keeps health metadata public to the private network but protects MCP", async () => {
    const health = await fetch(new URL("/healthz", baseUrl));
    const unauthorized = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok" });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toBe("Bearer");
    expect(await unauthorized.text()).not.toContain(TEST_CREDENTIAL);
  });

  it("rejects untrusted Host headers before MCP handling", async () => {
    const response = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_CREDENTIAL}`,
        "Content-Type": "application/json",
        Host: "attacker.invalid",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });

    expect(response.status).toBe(406);
  });
});
