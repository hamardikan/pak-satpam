import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parseRuntimeConfiguration } from "../src/runtime/load-runtime-configuration.js";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("published runtime examples", () => {
  it.each([
    ["observability-only", "observability-only"],
    ["private-http", "observability-only"],
    ["combined", "combined"],
    ["ci-only", "ci-only"],
  ])("matches the runtime schema for %s", (profile, expectedProfile) => {
    const configuration = parseRuntimeConfiguration(readFileSync(join(root, "examples", "v1", profile, "runtime-config.yml"), "utf8"));
    expect(configuration.profile).toBe(expectedProfile);
    if (configuration.profile === "ci-only") {
      expect(configuration.providers).toBeUndefined();
      expect(configuration.policy).toBeUndefined();
      expect(configuration.ci?.enabled).toBe(true);
    } else {
      expect(configuration.providers).toBeDefined();
      expect(configuration.policy).toBeDefined();
      expect(configuration.profile === "combined" ? configuration.ci?.enabled : false).toBe(configuration.profile === "combined");
    }
  });

  it("keeps examples placeholder-only and loopback-bound", () => {
    const files = [
      "examples/v1/README.md",
      "examples/v1/ci-only/compose.yml",
      "examples/v1/combined/compose.yml",
      "examples/v1/observability-only/compose.yml",
      "examples/v1/private-http/compose.yml",
      "examples/v1/private-http/client-config.json",
    ];
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      expect(text).not.toMatch(/(?:100\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|ts\.net)/i);
      expect(text).not.toMatch(/BEGIN (?:RSA |OPENSSH |EC |PRIVATE )?PRIVATE KEY/);
    }
    expect(readFileSync(join(root, "examples/v1/private-http/compose.yml"), "utf8")).toContain('"127.0.0.1:8765:8765"');
    expect(readFileSync(join(root, "scripts/container-smoke.sh"), "utf8")).toContain("profile: observability-only");
  });
});
