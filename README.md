# Observability Agent MCP

A portable, read-only Model Context Protocol server for turning observability
data into bounded evidence that AI agents can inspect safely.

## Status

Documentation foundation only. There is no runnable server or published image
yet. The first implementation milestone starts after the contracts in this repo
are reviewed.

## Product Boundary

This project provides deterministic tools for observability evidence. It does
not run an LLM, receive chat messages, execute shell commands, deploy workloads,
or remediate production systems.

```text
AI client
  | stdio or authenticated Streamable HTTP
  v
Observability Agent MCP
  - strict tool schemas
  - query and response limits
  - label and value redaction
  - normalized evidence bundles
  |
  +--> Grafana API
  +--> Prometheus-compatible API
       - Prometheus
       - VictoriaMetrics
```

The model and agent loop remain in the client. This server only returns
structured evidence.

## First Tool Set

| Tool | Purpose |
| --- | --- |
| `observability.capabilities` | Describe configured providers and safe limits. |
| `observability.health_snapshot` | Return bounded service and target health. |
| `observability.active_alerts` | Return normalized active alert metadata. |
| `observability.query_metrics` | Run a bounded instant or range metrics query. |
| `observability.incident_context` | Build a compact evidence bundle for one alert or service. |

Version 1 is read-only. It will not create dashboards, modify alert rules,
silence alerts, restart services, run scripts, or trigger deployments.

## Portability

The same tool contracts will be available through:

- stdio for local desktop and CLI agents;
- Streamable HTTP for remote agents;
- an OCI image;
- an npm-distributed CLI.

Remote HTTP deployment requires authentication. Publishing this repository does
not imply that an MCP endpoint should be exposed without OAuth, network policy,
rate limits, and audience-bound scopes.

There is no install or run command before M1. Until then, the only supported
command is the documentation-foundation check:

```bash
./ci/validate-foundation.sh
```

## Relationship To Grafana MCP

The [official Grafana MCP server](https://github.com/grafana/mcp-grafana) is the
preferred reference and fast path for broad Grafana capabilities. This project
will not duplicate its dashboard and administration surface.

| Capability | Grafana MCP | This project |
| --- | --- | --- |
| Broad Grafana dashboards and administration | Primary owner | Not implemented |
| Grafana datasource queries | Supported | Narrow adapter only |
| Direct Prometheus-compatible backend without Grafana | Not the primary path | Supported goal |
| Provider-neutral incident evidence | Provider-specific | Primary owner |
| Conservative read-only public contract | Configurable broad surface | Required default |

The unique scope here is:

- compact incident-context evidence;
- conservative read-only defaults;
- direct Prometheus-compatible operation when Grafana is absent;
- provider-neutral schemas;
- predictable limits and redaction for agent use.

There is no automatic delegation between the two servers. Use Grafana MCP when
an agent needs Grafana-native dashboards, incidents, administration, or its
existing query tools. Use this project's namespace when the client needs the
same bounded evidence contract across Grafana and direct
Prometheus-compatible backends. `active_alerts` and `incident_context` are
normalized here rather than forwarded to Grafana MCP; `query_metrics` selects
one configured adapter and never calls another MCP server. Deployments may
offer both namespaces, but each request has one explicit owner.

## Read Next

- [Architecture](docs/architecture.md)
- [Security Model](docs/security-model.md)
- [Tool Surface](docs/tool-surface.md)
- [Client Compatibility](docs/client-compatibility.md)
- [Test Strategy](docs/test-strategy.md)
- [Roadmap](docs/roadmap.md)
- [Contributing](CONTRIBUTING.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
