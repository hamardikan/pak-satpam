# Roadmap

Each milestone must produce a visible, independently testable product.

## M0: Repository Foundation

Status: complete when the public repository, contracts, security policy, CI and
license are published.

Visible product: a contributor can understand exactly what will and will not be
built.

## M1: Protocol Skeleton

- TypeScript project and official MCP SDK.
- stdio transport.
- strict tool and evidence schemas.
- in-memory fake provider.
- protocol and security tests.

M1 tests include malformed initialization, unknown tools, extra arguments,
oversized input, cancellation, output bounds, secret redaction, configured
provider-origin enforcement, provider timeout, and deterministic errors.

Visible product: MCP Inspector can discover and call deterministic fake tools.

## M2: Read-Only Providers

- Prometheus-compatible adapter.
- Grafana adapter.
- bounded metric queries.
- health and alert normalization.
- pre-output redaction.
- allowlisted Grafana panel and dashboard rendering as MCP image content.

The integration stack pins Grafana and VictoriaMetrics image versions in a
test-only Compose file. CI must start it, wait on health endpoints, load
synthetic fixtures, run adapter tests, and remove containers plus volumes.

Visible product: the server returns real read-only evidence from a disposable
Grafana and VictoriaMetrics test stack.

## M3: Remote And Packaging

- Streamable HTTP transport.
- OAuth-protected resource behavior.
- npm CLI and OCI image.
- health endpoint and runtime metrics.

M3 includes an ephemeral authorization-server fixture. Release gates cover
protected-resource discovery, issuer and audience validation, scopes, expiry,
Origin rejection, reconnects, concurrent clients, replay attempts, and
cross-client isolation.

Visible product: two independent authenticated clients use the same remote
server without sharing credentials or state.

## M4: Incident Context

- compact incident evidence bundles;
- named query templates;
- freshness and truncation semantics;
- dashboard references without full dashboard payloads;
- opt-in panel and dashboard visuals with structured fallback.

Visible product: an agent explains a synthetic incident using bounded evidence
without receiving secrets or raw backend payloads.

## M5: Public Release

- compatibility matrix;
- threat-model review;
- resource and concurrency benchmarks;
- signed release artifacts and SBOM;
- dependency and license scanning;
- provenance verification;
- vulnerability response and dependency update policy;
- rollback and last-known-good installation guidance;
- upgrade and deprecation policy.

Visible product: a versioned release that another operator can install without
any private infrastructure repository.

## M6: CI/CD Analysis And Gated Rerun

- Provider-neutral CI domain with a GitHub Actions adapter.
- Bounded status, analysis, log evidence, and remediation-plan tools.
- One allowlisted failed-job rerun with short-lived human approval, replay
  protection, and metadata-only audit.
- Controlled first-attempt failure fixture and rollback-compatible packaging.

Visible product: an agent explains a failed workflow and can rerun only its
failed jobs after an operator issues a one-time bound approval.

## Deferred

- Logs and traces until metrics behavior is stable.
- Additional CI/CD providers and actions.
- Write tools or remediation beyond the approved failed-job rerun.
- Hosted multi-tenant service.
