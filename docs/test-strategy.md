# Test And Verification Strategy

Tests scale with the trust boundary. A green unit suite proves source behavior;
it does not prove that an external provider, public endpoint, or private
deployment is live.

## Local Gates

Run the repository-defined aggregate gate:

~~~bash
npm run validate
~~~

It runs typecheck, all Vitest tests, build, stdio smoke, MCP Inspector discovery,
installed-package smoke, high-severity npm audit, foundation checks, forbidden
private/secret-surface checks, and local Markdown link validation.

Run the foundation/link gate independently when editing documentation:

~~~bash
./ci/validate-foundation.sh
~~~

The public workflow adds non-publishing multi-architecture Buildx verification,
a local image build and smoke test, and per-platform runtime smoke for
linux/amd64 and linux/arm64. The workflow does not publish or deploy.

## Contract Coverage

- Zod schemas reject unknown fields, malformed IDs, unallowlisted resources, and
  over-budget requests.
- Provider tests cover GitHub Actions, Jenkins, Bitbucket Cloud, SCM selectors,
  provider-native IDs, authentication boundaries, response normalization, and
  reverse-proxy URL joining.
- CP3 tests cover the direct SCM contract, all six budgets, digest stability,
  provider capability registration, and non-causal SCM/telemetry correlation.
- Observer tests cover signed webhooks, polling overlap, bounded pagination,
  lease/restart recovery, webhook/poll dedupe, stale suppression, route
  selection, delivery retry, payload truncation, and metadata-only state.
- Transport tests cover stdio, Streamable HTTP, bearer denial, Host denial,
  MCP initialization, tool discovery, and read-only calls.
- Package and metadata tests cover npm identity, aliases, OCI identity,
  Inspector discovery, and installed-package launch.

## Security Negatives

Coverage includes DNS rebinding, multi-address DNS, redirect and proxy bypass,
private address classes, credential/userinfo URLs, secret-like provider text,
prompt injection, raw payload leakage, malformed responses, stale evidence,
approval replay/expiry, duplicate delivery, and provider capability mismatch.
It also checks that the inbound MCP bearer is not sent to providers.

## Evidence Limits

The tests assert the documented bounds for observability, CI logs, SCM bytes,
files, hunks, lines, provider requests, duration, aggregate failure analysis,
telemetry windows/items/samples, renderer output, observer pages/payloads/retries,
and approval TTL. Truncation and unavailable evidence remain explicit.

## Live Shadow

Any live shadow must be read-only, private, scoped to synthetic or
operator-approved resources, and compared with direct operator-visible provider
state. It must not publish, deploy, alter provider configuration, or expose
credentials.
