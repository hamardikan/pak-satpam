# Architecture

## Design Goals

- Work with multiple AI clients without embedding an LLM.
- Keep the default runtime read-only.
- Support Grafana and Prometheus-compatible metrics backends.
- Return small, deterministic evidence rather than raw backend payloads.
- Run locally through stdio or remotely through authenticated Streamable HTTP.
- Keep provider credentials outside prompts, tool results, logs, and storage.
- Keep CI provider adapters portable and the rerun action deny-by-default.

## Runtime

```text
                         +----------------------+
                         | AI client / agent    |
                         +----------+-----------+
                                    |
                         stdio or Streamable HTTP
                                    |
                         +----------v-----------+
                         | MCP transport        |
                         +----------+-----------+
                                    |
                         +----------v-----------+
                         | Tool application     |
                         | - validate            |
                         | - authorize           |
                         | - bound               |
                         | - normalize           |
                         | - redact              |
                         +-----+------------+----------------+
                               |            |                |
                  +------------v--+  +------v-----------+ +--v----------------+
                  | Grafana port  |  | Metrics port     | | CI provider port  |
                  +------------+--+  +------+-----------+ +--+----------------+
                               |            |                |
                         Grafana API   Prometheus API    GitHub Actions API
```

## Bounded Contexts

### Protocol

Owns MCP lifecycle, tool registration, transport behavior, errors, and client
compatibility. It does not own provider credentials or observability semantics.

### Evidence

Owns normalized health, alert, metric, and incident-context schemas. Evidence
records observation time, provider class, truncation, redaction, and freshness.

### Provider Adapters

Owns Grafana and Prometheus-compatible HTTP behavior. Adapters implement ports;
they do not expose provider response bodies directly to MCP clients.

### Policy

Owns configured providers, datasource allowlists, time ranges, query deadlines,
series limits, output limits, and tool availability.

### CI Operations

Owns provider-neutral run/job schemas, deterministic failure classification,
log redaction, repository/workflow allowlists, approval verification, replay
state, and metadata-only audit events. GitHub App authentication is an adapter;
the domain does not depend on GitHub response shapes. The rerun port exposes
only `rerun-failed-jobs` and cannot dispatch, cancel, deploy, or write source.

## Non-Responsibilities

- Webhook/event ingestion.
- Discord or other chat gateways.
- LLM selection or prompting.
- CI/CD mutations other than the optional approved failed-job rerun.
- Shell or script execution.
- Infrastructure mutation.
- Secret management products.

Those concerns belong to the client agent or deployment environment.

## Technology Direction

The implementation uses TypeScript on Node.js 22 and the pinned official MCP
SDK. It packages as an npm CLI and non-root OCI image, with stdio and stateless
Streamable HTTP entry points sharing the same tool application. A language
change requires an ADR and equivalent compatibility tests.
