import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeObservabilityProvider } from "../src/providers/fake-provider.js";
import type {
  ObservabilityVisualProvider,
  VisualRenderResult,
} from "../src/providers/observability-provider.js";
import { createObservabilityServer } from "../src/server/create-server.js";

const FIXED_NOW = new Date("2026-07-10T00:00:00.000Z");
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);
const RANGE = {
  from: "2026-07-09T23:00:00.000Z",
  to: FIXED_NOW.toISOString(),
};

describe("production visual provider protocol", () => {
  let client: Client;
  let server: ReturnType<typeof createObservabilityServer>;

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  async function connect(visualProvider: ObservabilityVisualProvider): Promise<void> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = createObservabilityServer({
      provider: new FakeObservabilityProvider(() => FIXED_NOW),
      visualProvider,
      clock: () => FIXED_NOW,
    });
    client = new Client({ name: "visual-provider-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  }

  it("returns production PNG evidence through MCP ImageContent", async () => {
    const visualProvider: ObservabilityVisualProvider = {
      renderPanel: async (input): Promise<VisualRenderResult> => ({
        mimeType: "image/png",
        data: PNG,
        rawByteSize: PNG.byteLength,
        width: input.width,
        height: input.height,
      }),
      renderDashboard: async (input): Promise<VisualRenderResult> => ({
        mimeType: "image/png",
        data: PNG,
        rawByteSize: PNG.byteLength,
        width: input.width,
        height: input.height,
      }),
    };
    await connect(visualProvider);

    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: "observability.render_panel",
        arguments: {
          dashboardId: "service-overview",
          panelId: "request-rate",
          ...RANGE,
          width: 800,
          height: 450,
        },
      }),
    );

    expect(result).not.toMatchObject({ isError: true });
    expect(result.content.some((item) => item.type === "image")).toBe(true);
    expect(result.structuredContent).toMatchObject({
      providerClass: "grafana",
      freshness: "fresh",
      data: { available: true, rawByteSize: PNG.byteLength },
    });
  });

  it("preserves structured unknown evidence when Grafana rendering fails", async () => {
    const secretSentinel = "grafana-upstream-secret-sentinel";
    const visualProvider: ObservabilityVisualProvider = {
      renderPanel: async () => {
        throw new Error(secretSentinel);
      },
      renderDashboard: async () => {
        throw new Error(secretSentinel);
      },
    };
    await connect(visualProvider);

    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: "observability.render_dashboard",
        arguments: {
          dashboardId: "service-overview",
          ...RANGE,
          width: 800,
          height: 600,
        },
      }),
    );

    expect(result).not.toMatchObject({ isError: true });
    expect(result.content).toHaveLength(1);
    expect(result.structuredContent).toMatchObject({
      providerClass: "grafana",
      freshness: "unknown",
      data: { available: false },
      warnings: [{ code: "visual-unavailable" }],
    });
    expect(JSON.stringify(result)).not.toContain(secretSentinel);
  });
});
