# Security Model

## Current Posture

Version 1 is read-only and deny-by-default. The only mutation is a GitHub
failed-job rerun after exact allowlist checks, a fresh one-time approval, and
fresh run binding. Jenkins and Bitbucket Cloud never expose a mutation.

MCP requests, provider responses, log lines, SCM patches, and rendered pixels
are untrusted input or evidence. The external AI client is outside this
server's trust boundary.

## Required Controls

- Strict schemas reject unknown fields, malformed IDs, arbitrary URLs, and
  over-budget requests.
- Provider, repository, workflow, ref, query, dashboard, and visual allowlists
  are configuration, not caller input.
- Provider origins and reverse-proxy paths are canonicalized; credentials,
  query strings, fragments, cross-origin requests, redirects, and unsafe
  transport are rejected.
- Responses are bounded, redacted before the MCP boundary, and marked with
  freshness, truncation, warnings, and redactionsApplied.
- Normal logs and durable state contain no provider payloads, raw logs, tokens,
  passwords, cookies, authorization headers, private keys, or image bytes.
- File-injected credentials are regular 0600 files. The doctor checks metadata
  and never prints file contents.
- Private HTTP uses a file-injected bearer, exact Host allowlist, and constant-
  time comparison. It is private single-operator transport, not public OAuth.
- Observer delivery uses trusted internal URLs, HMAC over timestamp.body,
  deterministic request IDs, redirect rejection, bounded retries, and
  metadata-only state.
- Provider failures, malformed data, unavailable evidence, stale records, and
  truncation fail closed or remain explicit; the server never guesses health or
  causality.

The implementation and tests cover DNS rebinding, redirect chains, proxy
variables, multi-address and denied address classes, credential URLs, prompt
injection, secret redaction, provider timeouts, and cross-client isolation.
The test strategy documents the negative gates.

## Provider URL And Egress

Provider base_url is operator configuration, never a tool argument. Configure
exactly one base_url or structured endpoint with origin and path. The origin
must be HTTP(S) without userinfo, query, or fragment. The path is absolute and
cannot contain query or fragment. Request paths are joined below that path once;
an absolute request must have the same origin. Redirects are rejected.

GitHub requires HTTPS api.github.com. Bitbucket credentials require HTTPS.
Jenkins permits cleartext only for an explicitly enabled anonymous loopback
development endpoint. A reverse proxy does not grant new provider capability.

## HTTP Authentication Boundary

The current private HTTP route returns a generic 401 with a
WWW-Authenticate bearer challenge for missing or invalid credentials and
rejects non-allowlisted Host values. It does not publish OAuth protected-
resource metadata, validate issuer/audience/scope, enforce public Origin policy,
or isolate multiple principals. Do not expose it publicly.

The public OAuth design in older documents is a deferred target, not current
behavior. Public release requires protected-resource metadata, authorization
server linkage, issuer/audience/expiry/scope validation, Origin policy,
concurrent-client isolation, reconnect coverage, and a separate tenant review.

The inbound MCP bearer is used only for MCP authorization. It is never forwarded
to Grafana, metrics, CI, SCM, Hermes, or another MCP server. Provider
credentials are separate runtime inputs with least-privilege policy.

## CI Approval Boundary

A GitHub approval token is HMAC-signed, bound to repository, workflow, run ID,
run attempt, head SHA, request ID, nonce, issue time, and expiry, and limited to
300 seconds. Replay and request digests are consumed atomically before the
provider action. The server rechecks fresh failed/cancelled state and calls
only rerun-failed-jobs. Approval material, GitHub tokens, PEM data, and raw logs
are never audited.

## Observer Boundary

The observer accepts only exact allowlisted targets. Polling and verified
workflow_run webhooks share one event ID and durable dedupe state. Terminal
runs older than the stale threshold are recorded as suppressed and never
delivered or analyzed. Pagination truncation degrades health instead of
silently advancing. The observer has no rerun, shell, secret-read, browser,
source-write, deploy, or chat-gateway authority.

## Explicitly Forbidden

Generic shell or command tools, secret retrieval/export, arbitrary outbound
URLs, alert silencing or mutation, dashboard mutation, service restart,
deployment, workflow dispatch/cancellation/arbitrary rerun, source writes,
unredacted payload persistence, generic screenshots, browser automation, and
public multi-tenant access are outside the product boundary.

## Security Reporting

See SECURITY.md for private vulnerability reporting. Do not put credentials,
private provider responses, exploit payloads, or deployment topology in an issue.
