# ADR 0002: Grafana Visual Context

Status: accepted for the version 1 contract

## Decision

Version 1 includes `observability.render_panel` and
`observability.render_dashboard`. Each returns a PNG as MCP `ImageContent` plus
a separate structured evidence envelope. `observability.incident_context` may
attach bounded visuals when explicitly requested; visuals never replace
structured metric values.

The Grafana adapter calls Grafana's configured render endpoint backed by the
maintained Grafana Image Renderer. The MCP does not expose the renderer, accept
arbitrary URLs, provide a browser, or mutate dashboards. If rendering is
unavailable, structured evidence remains available with a typed warning.

## Boundaries

- Only allowlisted logical dashboard and panel identifiers are accepted.
- Dashboard rendering requires `agentSafe: true` classification.
- Variables, dimensions, time ranges, bytes, concurrency, and deadlines are
  bounded by deployment policy.
- Renderer authentication is separate from MCP and Grafana client tokens.
- Image bytes are not logged or persisted by default.
- The renderer network policy permits only its configured Grafana callback.

Rendered pixels can disclose labels or annotations that text redaction cannot
reliably remove. OCR is not a security boundary; operator-reviewed dashboards
and a least-privilege Grafana identity are required.

## References

- [MCP ImageContent](https://modelcontextprotocol.io/specification/2025-11-25/schema#imagecontent)
- [Grafana image rendering](https://grafana.com/docs/grafana/latest/setup-grafana/image-rendering/)
