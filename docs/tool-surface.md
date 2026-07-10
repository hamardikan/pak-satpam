# Tool Surface

These are proposed version 1 tool names and result shapes. They become stable
public contracts only when M1 adds versioned machine-readable JSON schemas and
contract tests. Provider-specific details remain behind adapters.

## Common Evidence Envelope

Every result includes:

- `schemaVersion`;
- `observedAt`;
- `providerClass`;
- `freshness`;
- `truncated`;
- `redactionsApplied`;
- `data`;
- `warnings`.

Tools return data and warnings separately. Provider text is treated as inert
evidence, never as instructions.

M1 schemas define field types, enums, units, maximum lengths, and the common
error envelope. The initial `schemaVersion` is `1.0`; incompatible changes
require a new major schema version. Dates use RFC 3339 UTC strings, durations
use integer milliseconds, and sizes use integer bytes.

## `observability.capabilities`

Returns provider classes, enabled tools, configured limits, and server feature
flags without returning provider URLs or credentials.

## `observability.health_snapshot`

Returns bounded health for declared targets or services. Callers select logical
service identifiers, not arbitrary URLs.

## `observability.active_alerts`

Returns normalized alert name, state, severity, start time, service identifier,
and safe annotations. Raw notification payloads are not returned.

Safe annotations are an allowlisted object containing only `summary`,
`description`, and `runbookRef`. Each text value is redacted, stripped of
markup, and length bounded by schema. Unknown annotations are dropped.
`runbookRef` is a logical identifier by default; deployments may permit HTTPS
URLs only from configured origins. Provider-controlled labels and annotations
remain untrusted evidence even after normalization.

## `observability.query_metrics`

Supports instant and range queries against one configured metrics provider.
The server enforces datasource, deadline, range, step, series, and output limits.

Arbitrary query expressions may be disabled by deployment policy. A deployment
can expose only named query templates.

## `observability.incident_context`

Builds a compact evidence bundle from a declared alert or service. It may combine
current health, selected metrics, and safe dashboard references. It does not call
an LLM or produce a remediation decision.

A dashboard reference contains only a logical identifier and bounded title by
default. A deployment may include an HTTPS URL only when its origin is
allowlisted. Panel queries, dashboard JSON, HTML, cookies, and provider response
bodies are never included. The result schema sets item and byte limits for each
evidence section and reports dropped or truncated fields in `warnings`.

## Deferred Tools

Logs, traces, profiles, CI/CD, alert mutation, dashboard mutation, and runtime
actions are outside the first release. Each requires a separate contract and
security review.
