# Architecture

## Design Goals

- Work with multiple AI clients without embedding an LLM.
- Keep the default runtime read-only.
- Support Grafana and Prometheus-compatible metrics backends.
- Return small, deterministic evidence rather than raw backend payloads.
- Run locally through stdio or remotely through authenticated Streamable HTTP.
- Keep provider credentials outside prompts, tool results, logs, and storage.

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
                         +-----+------------+----+
                               |            |
                  +------------v--+      +--v--------------------+
                  | Grafana port  |      | Metrics query port    |
                  +------------+--+      +--+--------------------+
                               |            |
                         Grafana API     Prometheus-compatible API
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

## Non-Responsibilities

- Webhook/event ingestion.
- Discord or other chat gateways.
- LLM selection or prompting.
- CI/CD reruns.
- Shell or script execution.
- Infrastructure mutation.
- Secret management products.

Those concerns belong to the client agent or deployment environment.

## Technology Direction

The first implementation targets TypeScript on Node.js 22 using the official
MCP SDK. M1 must pin the SDK and runtime versions in the package lock and CI
matrix before code is accepted. The server must remain transport-neutral and
package as both an npm CLI and an OCI image. A language change requires an ADR
and equivalent compatibility tests.
