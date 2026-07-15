# Architecture

Pak Satpam is an MCP evidence boundary, not an agent platform. It accepts
structured requests from an external AI client and returns bounded evidence
from operator-configured providers.

## Domain-Driven Design

| Bounded context | Owns | Does not own |
| --- | --- | --- |
| Protocol | MCP lifecycle, stdio and Streamable HTTP, tool registration, schemas, errors | provider credentials or provider response shapes |
| Policy | provider/repository/workflow/ref/dashboard/query allowlists and capability gates | LLM decisions or deployment policy outside this process |
| Evidence | normalized health, alerts, metrics, CI, SCM, telemetry, freshness, truncation, redaction, digests | raw provider payloads |
| Provider adapters | HTTP paths, provider authentication, provider-native normalization, provider failures | MCP semantics or arbitrary caller URLs |
| CI operations | status, failed-job analysis, redacted logs, dry-run plans, bounded failure analysis, approval-gated GitHub rerun | shell, source mutation, deploy, dispatch, cancel, arbitrary rerun |
| Observer companion | bounded poll/webhook intake, dedupe, stale suppression, signed internal delivery, metadata-only state | MCP hosting, chat, LLM calls, reruns, source writes |

## Runtime Shape

~~~text
AI client / Hermes / desktop MCP client
                 |
                 v
       stdio or private Streamable HTTP
                 |
                 v
       MCP application and tool schemas
                 |
        validate -> authorize -> bound
                 |
          normalize -> redact
                 |
     +-----------+-----------+-----------+
     |                       |           |
observability             CI/SCM      metadata
  providers               adapters      audit
     |                       |
Grafana and metrics     GitHub, Jenkins,
alerts                  Bitbucket Cloud
~~~

The stdio entrypoint uses a deterministic local provider. The private HTTP
entrypoint loads a strict version 1 YAML configuration and file-injected
credentials. The same application contract is used by the OCI image.

## Evidence Flow

1. The client selects logical services, queries, dashboards, repositories, refs,
   workflows, or provider-native IDs.
2. Schemas reject unknown fields, arbitrary URLs, invalid IDs, unallowlisted
   resources, and over-budget requests.
3. The adapter calls only its configured provider origin/path and rejects
   redirects or mismatched origins.
4. The adapter normalizes provider data, redacts secret-like text, suppresses
   binary or over-budget content, and records freshness/truncation.
5. The server returns the version 1.0 evidence envelope. Provider text and
   rendered pixels remain untrusted data.
6. The external agent decides how to explain evidence. Pak Satpam does not infer
   causality or execute remediation.

## CI Event Loop

~~~text
observe -> classify -> bounded redacted evidence -> dry-run plan
       -> explicit one-time approval -> rerun failed jobs only
       -> observe the follow-up run
~~~

The observer may discover terminal runs by polling or a verified GitHub webhook,
but it never performs the approval or rerun. A failed follow-up is a new
observation and does not trigger another action automatically.

## External Boundary

Hermes or another AI client owns prompts, conversation state, and chat delivery.
The observer sends only signed, bounded internal events to operator-configured
success and analysis routes. Those routes may cause an external agent to call
Pak Satpam through MCP. No inbound MCP bearer token is forwarded to a provider,
Hermes, or another MCP server.

## Non-Responsibilities

Pak Satpam does not own public webhook ingress, OAuth authorization servers,
tenant management, Discord/chat gateways, LLM selection, secret management,
shell execution, infrastructure mutation, deployment, alert mutation, dashboard
mutation, workflow dispatch/cancel, or source writing. Those concerns belong to
the deployment or client environment and require separate review.

The public package owns schemas, adapters, transports, tests, and packaging.
A private deployment owns network bindings, credentials, exact allowlists,
resource limits, observer routes, lifecycle, and rollback.
