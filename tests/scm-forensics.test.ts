import { describe, expect, it, vi } from "vitest";

import {
  BitbucketSCMProvider,
  GitHubSCMProvider,
  JenkinsSCMProvider,
  SCMProviderError,
  boundSCMItems,
  redactSCMText,
} from "../src/scm/index.js";

const NOW = new Date("2026-07-10T00:00:00.000Z");
const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);

describe("SCM context boundaries", () => {
  it("uses deterministic byte, item, and token-like budgets", () => {
    const result = boundSCMItems([
      { path: "one.ts", patch: "1234" },
      { path: "two.ts", patch: "5678" },
    ], { maxBytes: 48, maxItems: 1, maxTokens: 12 });

    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.usage.items).toBe(1);
    expect(result.usage.bytes).toBe(Buffer.byteLength(JSON.stringify(result.items)));
    expect(result.usage.tokens).toBe(Math.ceil(result.usage.bytes / 4));
  });

  it("redacts secrets, suppresses binary content, and bounds UTF-8 bytes", () => {
    expect(redactSCMText("token=top-secret", 100)).toMatchObject({ text: "[REDACTED]", redacted: true, binary: false });
    expect(redactSCMText("safe", 2)).toMatchObject({ redacted: true, truncated: true });
    expect(Buffer.byteLength(redactSCMText("safe", 2).text)).toBeLessThanOrEqual(2);
    expect(redactSCMText("\u0000PNG", 100)).toMatchObject({ text: "[BINARY_SUPPRESSED]", binary: true, redacted: true });
  });
});

describe("GitHub SCM evidence adapter", () => {
  it("returns bounded PR change metadata without credentials or binary payloads", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        number: 17,
        title: "token=should-not-leak",
        state: "open",
        base: { ref: "main", sha: BASE_SHA, repo: { full_name: "acme/app" } },
        head: { ref: "feature/x", sha: HEAD_SHA, repo: { full_name: "acme/app" } },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { filename: "src/a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@\n+token=should-not-leak" },
        { filename: "image.png", status: "added", additions: 0, deletions: 0 },
      ])));
    const adapter = new GitHubSCMProvider({
      token: "github-secret-token",
      fetch,
      clock: () => NOW,
      allowedRepositories: ["acme/app"],
      allowedRefs: ["main", "feature/x"],
    });

    const result = await adapter.getChangeEvidence({ repository: "acme/app", pullRequest: "17", budget: { maxBytes: 8_000, maxItems: 10, maxTokens: 2_000 } });

    expect(result.data.repository).toBe("acme/app");
    expect(result.data.pullRequest).toMatchObject({ id: "17", base: { ref: "main", sha: BASE_SHA }, head: { ref: "feature/x", sha: HEAD_SHA } });
    expect(result.data.files[0]).toMatchObject({ path: "src/a.ts", status: "modified" });
    expect(result.data.files[0]?.patch).toContain("[REDACTED]");
    expect(result.data.files[1]).toMatchObject({ path: "image.png", binary: true });
    expect(result.data.files[1]?.patch).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("github-secret-token");
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.github.com/repos/acme/app/pulls/17",
      "https://api.github.com/repos/acme/app/pulls/17/files?per_page=10",
    ]);
  });

  it("fails closed before network access for a repository outside the allowlist", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const adapter = new GitHubSCMProvider({ token: "secret", fetch, allowedRepositories: ["acme/app"], allowedRefs: ["main"] });

    await expect(adapter.getChangeEvidence({ repository: "other/app", commit: HEAD_SHA })).rejects.toMatchObject({ code: "permission" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a PR response for the wrong repository", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      number: 17,
      base: { ref: "main", sha: BASE_SHA, repo: { full_name: "other/app" } },
      head: { ref: "feature/x", sha: HEAD_SHA, repo: { full_name: "other/app" } },
    })));
    const adapter = new GitHubSCMProvider({ token: "secret", fetch, allowedRepositories: ["acme/app"], allowedRefs: ["main"] });

    await expect(adapter.getChangeEvidence({ repository: "acme/app", pullRequest: "17" })).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects an oversized provider response before normalization", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("x".repeat(2 * 1_024 * 1_024 + 1)));
    const adapter = new GitHubSCMProvider({ token: "secret", fetch, allowedRepositories: ["acme/app"], allowedRefs: ["main"] });

    await expect(adapter.getChangeEvidence({ repository: "acme/app", commit: HEAD_SHA })).rejects.toMatchObject({ code: "malformed" });
  });
});

describe("Bitbucket SCM evidence adapter", () => {
  it("combines PR identity, bounded diffstat, and redacted diff hunks", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 17,
        title: "Safe change",
        state: "OPEN",
        destination: { branch: { name: "main" }, commit: { hash: BASE_SHA } },
        source: { branch: { name: "feature/x" }, commit: { hash: HEAD_SHA } },
        repository: { full_name: "acme/app" },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [{
        status: { type: "modified" }, lines_added: 2, lines_removed: 1,
        old: { path: "src/a.ts" }, new: { path: "src/a.ts" },
      }] })))
      .mockResolvedValueOnce(new Response("diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n-token=should-not-leak\n+safe\n"));
    const adapter = new BitbucketSCMProvider({
      baseUrl: "https://bitbucket.example/2.0/",
      token: "reader:secret",
      fetch,
      clock: () => NOW,
      allowedRepositories: ["acme/app"],
      allowedRefs: ["main", "feature/x"],
    });

    const result = await adapter.getChangeEvidence({ repository: "acme/app", pullRequest: "17", budget: { maxBytes: 8_000, maxItems: 10, maxTokens: 2_000 } });

    expect(result.data.base).toEqual({ ref: "main", sha: BASE_SHA });
    expect(result.data.head).toEqual({ ref: "feature/x", sha: HEAD_SHA });
    expect(result.data.files[0]).toMatchObject({ path: "src/a.ts", status: "modified", additions: 2, deletions: 1 });
    expect(result.data.files[0]?.patch).toContain("[REDACTED]");
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://bitbucket.example/2.0/repositories/acme/app/pullrequests/17",
      "https://bitbucket.example/2.0/repositories/acme/app/pullrequests/17/diffstat?pagelen=10",
      "https://bitbucket.example/2.0/repositories/acme/app/pullrequests/17/diff",
    ]);
  });

  it("rejects an untrusted host and provider-malformed responses", async () => {
    expect(() => new BitbucketSCMProvider({ baseUrl: "https://user:password@bitbucket.example/2.0", token: "secret", fetch: vi.fn(), allowedRepositories: ["acme/app"], allowedRefs: ["main"] })).toThrow();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 1, repository: { full_name: "acme/app" } })));
    const adapter = new BitbucketSCMProvider({ baseUrl: "https://bitbucket.example/2.0", token: "secret", fetch, allowedRepositories: ["acme/app"], allowedRefs: ["main"] });

    await expect(adapter.getChangeEvidence({ repository: "acme/app", pullRequest: "1" })).rejects.toMatchObject({ code: "malformed" });
  });
});

describe("Jenkins SCM evidence adapter", () => {
  it("returns read-only change-set summaries and never requests a checkout or patch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      number: "build-7",
      timestamp: NOW.getTime(),
      duration: 1_000,
      branchName: "feature/x",
      actions: [{ lastBuiltRevision: { SHA1: HEAD_SHA } }],
      scm: { userRemoteConfigs: [{ url: "https://github.com/acme/app.git" }] },
      changeSets: [{ items: [{ id: "commit-7", paths: [
        { editType: "edit", file: "src/a.ts" },
        { editType: "add", file: "image.png" },
      ] }] }],
    })));
    const adapter = new JenkinsSCMProvider({ baseUrl: "https://jenkins.example/", job: "ci", branch: "feature/x", fetch, clock: () => NOW, allowedRepositories: ["acme/app"], allowedRefs: ["feature/x"] });

    const result = await adapter.getChangeEvidence({ repository: "acme/app", ref: "feature/x", commit: HEAD_SHA });

    expect(result.data.head).toEqual({ ref: "feature/x", sha: HEAD_SHA });
    expect(result.data.files).toEqual([
      expect.objectContaining({ path: "src/a.ts", status: "modified", binary: false }),
      expect.objectContaining({ path: "image.png", status: "added", binary: true }),
    ]);
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://jenkins.example/job/ci/job/feature%2Fx/lastBuild/api/json");
    expect(JSON.stringify(fetch.mock.calls[0]?.[1])).not.toContain("POST");
  });

  it("fails closed when Jenkins reports a different ref", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      number: 7, timestamp: NOW.getTime(), branchName: "main", actions: [{ lastBuiltRevision: { SHA1: HEAD_SHA } }], scm: { userRemoteConfigs: [{ url: "https://github.com/acme/app.git" }] },
    })));
    const adapter = new JenkinsSCMProvider({ baseUrl: "https://jenkins.example/", job: "ci", branch: "main", fetch, allowedRepositories: ["acme/app"], allowedRefs: ["main", "feature/x"] });

    await expect(adapter.getChangeEvidence({ repository: "acme/app", ref: "feature/x" })).rejects.toMatchObject({ code: "permission" });
  });
});

it("exposes a stable provider error type", () => {
  expect(new SCMProviderError("malformed")).toBeInstanceOf(Error);
});
