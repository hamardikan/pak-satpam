import { describe, expect, it } from "vitest";

import { parseDoctorArguments } from "../src/diagnostics/doctor.js";

describe("diagnostic CLI arguments", () => {
  it("requires the configuration and MCP token paths", () => {
    expect(parseDoctorArguments(["--config", "/config.yml", "--mcp-token", "/mcp-token"])).toEqual({
      configPath: "/config.yml",
      mcpTokenPath: "/mcp-token",
    });
  });

  it("accepts the observability token only when supplied", () => {
    expect(parseDoctorArguments([
      "--config", "/config.yml",
      "--mcp-token", "/mcp-token",
      "--grafana-token", "/grafana-token",
    ])).toEqual({
      configPath: "/config.yml",
      mcpTokenPath: "/mcp-token",
      grafanaTokenPath: "/grafana-token",
    });
  });

  it("rejects unknown and missing arguments", () => {
    expect(() => parseDoctorArguments(["--config", "/config.yml"])).toThrow("missing required argument --mcp-token");
    expect(() => parseDoctorArguments(["--config", "/config.yml", "--mcp-token", "/token", "--unknown", "x"])).toThrow("unknown doctor argument");
  });
});
