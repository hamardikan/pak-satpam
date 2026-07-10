# Security Model

## Default Posture

Version 1 is read-only and deny-by-default. A configured backend does not imply
that every datasource, label, metric, dashboard, or time range is available to
every client.

## Trust Boundaries

1. MCP requests are untrusted input.
2. Provider responses are untrusted data and may contain prompt injection.
3. Credentials are runtime inputs and never evidence fields.
4. Evidence is normalized and redacted before it crosses the MCP boundary.
5. The client LLM is outside this server's trust boundary.

## Required Controls

- Strict JSON schemas with unknown fields rejected.
- Configurable datasource and provider allowlists.
- Query timeout, time-range, sample, series, and output-size limits.
- Response truncation recorded explicitly.
- Sensitive label names and secret-like values redacted.
- No provider response body written to normal logs.
- No token, password, cookie, authorization header, or private key in errors.
- SSRF protection through configured provider origins and an explicit egress
  policy.
- Origin validation for Streamable HTTP.
- Rate limits and concurrent-query limits for remote deployment.
- Separate render timeout, pixel, byte, and concurrency limits.

Every control fails closed. Validation, authorization, origin, provider,
deadline, output-limit, or redaction failures return a structured MCP error and
do not call the provider. Provider timeout or malformed responses return a
degraded evidence result only when no unredacted provider data crossed the
boundary. Otherwise the call fails.

The implementation is not accepted until the negative tests in
`docs/test-strategy.md` prove these behaviors.

### Provider URL And Egress Policy

Provider base URLs are operator configuration, never tool arguments. The
implementation must parse and canonicalize each URL, reject userinfo and
fragments, disable proxy-environment inheritance, and disable redirects. Before
each connection it resolves every address and permits the connection only when
the hostname and resolved address are both covered by the configured provider
and egress allowlists. Private, loopback, link-local, multicast, unspecified,
and reserved IPv4 or IPv6 destinations are denied unless the operator has
explicitly allowed the exact destination or CIDR for a private deployment.

Resolution is checked again when a connection is opened; a hostname that
changes to a disallowed address fails closed. Redirect responses are not
followed, including same-origin redirects. Alternate numeric address forms,
IPv4-mapped IPv6, trailing-dot hostnames, and internationalized hostnames are
normalized before policy evaluation. Tests must cover DNS rebinding,
multi-address answers, redirect chains, proxy variables, and every denied
address class.

## Transport Authentication

### stdio

The client launches the process. Version 1 accepts credentials through the
local process environment only. Credentials must not be accepted as tool input,
written to logs, or returned through capability discovery.

### Streamable HTTP

Remote deployments target MCP specification `2025-11-25`. They must expose
OAuth Protected Resource Metadata at the applicable well-known URI and identify
the authorization server. Access tokens must be sent only in the Authorization
header and validated for issuer, audience, expiry, and required tool scope on
every HTTP request.

Missing or invalid tokens return HTTP 401 with a `WWW-Authenticate: Bearer`
challenge whose `resource_metadata` parameter is the absolute HTTPS URL of the
server's protected-resource metadata. An invalid token challenge also includes
the standards-defined `error` value without echoing token material. The 401
challenge includes the minimum required `scope` when the request identifies
one. Valid
tokens with insufficient scope return HTTP 403 and a Bearer challenge containing
`error="insufficient_scope"`, the minimum required `scope`, and the same
`resource_metadata` URL. Invalid Origin values return HTTP 403 before session
creation. Tokens in query strings are rejected. A private network is defense
in depth, not a replacement for authorization when more than one principal can
connect.

The protected resource identifier is the canonical external Streamable HTTP
endpoint. Its metadata document declares that exact resource and the accepted
authorization server. Issuer, resource/audience, expiry, signature, and scope
are validated independently; discovery never relaxes those checks.

The inbound MCP access token is used only to authorize the MCP request. It is
never forwarded, exchanged, logged, or otherwise transited to Grafana,
Prometheus-compatible providers, or another MCP server. Provider credentials
are separate operator-configured runtime inputs with their own audience and
least-privilege policy.

### Visual Evidence

Rendered pixels can disclose labels, annotations, variables, usernames, or
topology that text redaction cannot reliably remove. Only operator-reviewed
dashboards marked `agentSafe: true`, allowlisted panels and variables, and a
dedicated read-only Grafana identity may be rendered. OCR is not a security
boundary.

The MCP calls configured Grafana render endpoints and never exposes the image
renderer directly. Caller-supplied URLs, browser flags, external navigation,
downloads, file URLs, and redirects are denied. Renderer authentication is
separate, renderer egress is limited to the configured Grafana callback, and
PNG bytes are not logged or persisted by default.

## Version 1 Scopes

- `observability:capabilities`
- `observability:health:read`
- `observability:alerts:read`
- `observability:metrics:query`
- `observability:visuals:render`
- `observability:incident:read`

There are no write scopes in version 1.

## Explicitly Forbidden

- Generic shell or command tools.
- Secret retrieval or environment export tools.
- Arbitrary outbound URLs supplied by a caller.
- Alert silencing or rule mutation.
- Dashboard mutation.
- Service restart or deployment tools.
- Persisting unredacted provider payloads.
- Generic screenshot, browser automation, or arbitrary render tools.
