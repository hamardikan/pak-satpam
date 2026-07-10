# Implementation Status

Last updated: 2026-07-10

## Goal 11: Private Provider Shadow

Implemented:

- Seven namespaced read-only tools with strict input and output schemas.
- Discriminated instant/range and available/unavailable result invariants.
- Exact named-query, service, dashboard, and panel allowlists.
- VictoriaMetrics metrics and vmalert alert normalization with bounded output.
- Grafana Viewer-token PNG adapter with type, size, route, and timeout checks.
- Explicit fresh/cached/stale/unknown semantics; provider failure remains unknown.
- Deterministic light/dark synthetic visuals for local tests.
- Stdio and authenticated stateless Streamable HTTP transports.
- Host allowlisting, constant-time Bearer checks, and sanitized health/errors.
- Strict YAML runtime policy plus `0600` file-injected credentials.
- Installed-package, Inspector, stdio, HTTP, and non-root OCI smoke tests.

Verified private-shadow behavior:

- Seven tools discovered by the edge agent client as read-only.
- Metrics series and active-alert counts match direct provider counts.
- Grafana renderer absence returns structured unknown/unavailable evidence.
- Deployment, network placement, and secrets remain owned by the private infra repo.

Current boundaries:

- No public endpoint or OAuth authorization-server integration.
- No write, remediation, shell, CI/CD, alert mutation, or dashboard mutation tools.
- No logs or traces until the metrics contract is stable.
- No npm or OCI release has been published.

Verification command: `npm run validate`

Next checkpoint: complete public compatibility, OAuth, concurrency, provenance,
and release gates without weakening the read-only contract.
