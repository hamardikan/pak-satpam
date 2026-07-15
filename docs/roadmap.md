# Roadmap

Each milestone must produce a visible, independently testable product. Completed
milestones describe shipped source contracts; they do not imply npm/GHCR
publication or private deployment.

## Completed

- Repository foundation, public boundary, security policy, CI, and license.
- MCP stdio protocol skeleton with strict schemas and deterministic provider.
- Read-only Grafana, Prometheus-compatible metrics, alerts, and visual evidence.
- Private stateless Streamable HTTP and versioned npm/OCI packaging contracts.
- CI status, failure classification, redacted logs, dry-run remediation, and the
  GitHub approval-gated failed-job rerun.
- Goal 19 CP3 direct SCM contract, GitHub/Jenkins/Bitbucket Cloud read adapters,
  provider-native IDs, bounded telemetry correlation, and observer
  poll/webhook dedupe and stale suppression.

## Current Product Rule

Keep the default read-only boundary. Add capability only with a provider-neutral
contract, explicit limits, redaction, allowlist enforcement, tests, and an
operator-owned rollback path. The external AI/Hermes layer remains separate.

## Deferred

- Public OAuth protected-resource and multi-tenant HTTP deployment.
- Bitbucket Data Center runtime adapter.
- Raw observability log and trace provider integrations.
- Workflow dispatch, cancellation, arbitrary rerun, source writes, deployment,
  alert mutation, dashboard mutation, shell, browser automation, and secret
  retrieval.
- Live private edge observer/Hermes route publication and deployment.
- Hosted multi-tenant service.

## Release Gate

A tagged npm package or immutable OCI image requires authorized release
workflows, metadata validation, artifact verification, and a recorded digest.
Private deployment additionally requires private ingress, credential injection,
provider connectivity, Hermes route verification, and rollback rehearsal.
