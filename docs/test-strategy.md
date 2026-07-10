# Test Strategy

Tests scale with the trust boundary. A green unit suite is not enough to claim
remote or provider compatibility.

## Fast Tests

- Domain unit tests for evidence and policy behavior.
- JSON schema contract tests for every tool and result.
- Transport-independent application tests.
- Redaction fixtures with synthetic secrets and prompt injection.
- Property tests for bounds, truncation, and canonical serialization.

## Provider Integration

A pinned disposable Compose stack provides Grafana and VictoriaMetrics with
synthetic metrics and alerts. Tests prove startup health, normal queries,
timeouts, malformed responses, large result truncation, and teardown including
volumes. No external credentials or production data are used.

## Transport Compatibility

- MCP Inspector initialization, discovery, and tool calls.
- Two independent stdio clients.
- Two authenticated concurrent Streamable HTTP clients.
- Cancellation, reconnect, malformed sessions, and protocol-version mismatch.

## Security Negatives

- Unknown provider origins and redirect-based SSRF.
- DNS rebinding, multi-address DNS, alternate IP forms, IPv4-mapped IPv6,
  denied address classes, and proxy-environment bypass attempts.
- Secret values in labels, annotations, errors, and nested objects.
- Prompt injection in every provider-controlled string.
- Missing, expired, wrong-issuer, wrong-audience, and wrong-scope tokens.
- Missing or incorrect `WWW-Authenticate` resource metadata and scope
  challenges.
- Insufficient-scope responses missing `error="insufficient_scope"`, the
  minimum `scope`, or `resource_metadata`.
- Inbound MCP access-token sentinels appearing in provider requests, logs,
  errors, evidence, or any outbound call.
- Token in URI query string.
- Invalid Origin and session replay.
- Cross-client state and credential leakage.
- Query timeout, range, series, output, concurrency, and rate-limit overflow.
- Provider payload persistence and normal-log leakage.

## Live Shadow

Live testing remains read-only. It starts on a private network, uses a scoped
test principal, compares MCP evidence with direct operator-visible provider
state, and verifies removal without touching provider configuration.
