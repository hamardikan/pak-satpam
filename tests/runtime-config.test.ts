import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadRuntimeConfiguration } from "../src/runtime/load-runtime-configuration.js";

const FIXED_NOW = new Date("2026-07-10T00:00:00.000Z");

describe("private runtime configuration", () => {
  let directory: string;
  let configPath: string;
  let grafanaTokenPath: string;
  let mcpTokenPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "observability-agent-mcp-runtime-"));
    configPath = join(directory, "provider-config.yml");
    grafanaTokenPath = join(directory, "grafana-token");
    mcpTokenPath = join(directory, "mcp-token");
    writeFileSync(grafanaTokenPath, "grafana-test-token-123456\n", { mode: 0o600 });
    writeFileSync(mcpTokenPath, "mcp-test-token-123456789\n", { mode: 0o600 });
    writeFileSync(configPath, VALID_CONFIG, { mode: 0o600 });
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("builds bounded production providers and visual policy without embedding secrets", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { resultType: "vector", result: [] } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const runtime = loadRuntimeConfiguration({
      configPath,
      grafanaTokenPath,
      mcpTokenPath,
      fetch,
      clock: () => FIXED_NOW,
    });

    await runtime.provider.queryMetrics({ queryTemplate: "homelab-node-up" });
    const capabilities = await runtime.provider.capabilities({});

    expect(runtime.bearerToken).toBe("mcp-test-token-123456789");
    expect(runtime.visualAllowlist).toEqual({
      dashboards: {
        "homelab-overview": {
          panels: ["scrape-health", "host-memory"],
        },
      },
    });
    const requestUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestUrl.origin).toBe("http://victoriametrics:8428");
    expect(requestUrl.searchParams.get("query")).toBe('up{job="homelab-node"}');
    expect(capabilities.data.enabledTools).toEqual(
      expect.arrayContaining([
        "observability.render_panel",
        "observability.render_dashboard",
      ]),
    );
    expect(JSON.stringify(runtime)).not.toContain("grafana-test-token-123456");
  });

  it("rejects unknown configuration and insecure secret file permissions", () => {
    writeFileSync(configPath, `${VALID_CONFIG}\nunknown_root: true\n`);
    expect(() =>
      loadRuntimeConfiguration({
        configPath,
        grafanaTokenPath,
        mcpTokenPath,
        fetch,
      }),
    ).toThrow("Invalid runtime configuration");

    writeFileSync(configPath, VALID_CONFIG);
    chmodSync(mcpTokenPath, 0o644);
    expect(() =>
      loadRuntimeConfiguration({
        configPath,
        grafanaTokenPath,
        mcpTokenPath,
        fetch,
      }),
    ).toThrow("Secret file permissions are too broad");
  });
});

const fetch = vi.fn<typeof globalThis.fetch>();

const VALID_CONFIG = `
version: 1
providers:
  metrics:
    type: prometheus-compatible
    base_url: http://victoriametrics:8428
  alerts:
    type: vmalert
    base_url: http://vmalert:8880
  grafana:
    type: grafana
    base_url: http://grafana:3000
policy:
  named_queries:
    homelab-node-up:
      expression: up{job="homelab-node"}
      label_keys: [job, host, role, site, environment]
    homelab-memory-used:
      expression: 1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
      label_keys: [job, host, site, environment]
  service_health:
    homelab-node:
      query_template: homelab-node-up
      healthy_when: { operator: eq, value: 1 }
      summary: Homelab node exporter availability
  dashboards:
    homelab-overview:
      uid: homelab-overview
      slug: homelab-overview
      title: Homelab Overview
      panels:
        scrape-health: { id: 1 }
        host-memory: { id: 2 }
`;
