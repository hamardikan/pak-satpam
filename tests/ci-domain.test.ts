import { describe, expect, it } from "vitest";
import {
  CICategorySchema,
  CIJobIdSchema,
  CIRunIdSchema,
  CIWorkflowStatusResultSchema,
  classifyFailure,
} from "../src/domain/ci-schemas.js";

describe("provider-neutral CI domain", () => {
  it("exposes the deterministic failure classes", () => {
    expect(CICategorySchema.options).toEqual([
      "build",
      "test",
      "lint",
      "dependency",
      "deployment",
      "infrastructure-connectivity",
      "permission",
      "unknown",
    ]);
  });

  it.each([
    ["build", "TypeScript compilation"],
    ["test", "unit tests"],
    ["lint", "ESLint"],
    ["dependency", "npm audit"],
    ["deployment", "deploy production"],
    ["infrastructure-connectivity", "terraform network timeout"],
    ["permission", "403 permission denied"],
    ["unknown", "step failed"],
  ] as const)("classifies %s deterministically", (expected, text) => {
    expect(classifyFailure(text)).toBe(expected);
  });

  it("rejects malformed provider-neutral status", () => {
    expect(
      CIWorkflowStatusResultSchema.safeParse({
        schemaVersion: "1.0",
        observedAt: "2026-07-10T00:00:00.000Z",
        providerClass: "github-actions",
        freshness: "fresh",
        truncated: false,
        redactionsApplied: false,
        warnings: [],
        data: { run: { id: "bad/run" } },
      }).success,
    ).toBe(false);
  });

  it("accepts bounded provider-native string and UUID identifiers", () => {
    expect(CIRunIdSchema.safeParse("build-main-7").success).toBe(true);
    expect(CIRunIdSchema.safeParse("{550e8400-e29b-41d4-a716-446655440000}").success).toBe(true);
    expect(CIJobIdSchema.safeParse("job-uuid-7").success).toBe(true);
    expect(CIRunIdSchema.safeParse("unsafe/run").success).toBe(false);
  });
});
