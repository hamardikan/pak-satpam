# Operator Runbook

This runbook covers an external operator installing a private Pak Satpam
instance. It does not publish artifacts, deploy infrastructure, or grant
provider access.

## Prepare

1. Choose observability-only, ci-only, or combined.
2. Copy the matching examples/v1 configuration into a private directory.
3. Replace only placeholder origins, allowlists, dashboard IDs, job names, and
   file paths in that private copy.
4. Create regular 0600 credential files. Do not place values in YAML, command
   arguments, MCP tool inputs, logs, or source control.
5. Select an npm version or OCI digest that an authorized release process has
   recorded. Keep the previous known-good reference.

The runtime configuration is limited to 256 KiB. CI repository/workflow entries
and provider endpoints are exact allowlists. The selected provider must have
declared read capability. Only GitHub declares approval-gated rerun capability.

## Start And Verify

For npm, install the package locally and launch pak-satpam for stdio or
pak-satpam-http for private HTTP. For OCI, use the pinned digest and the
Containerfile entrypoint. Mount runtime files read-only.

Before HTTP startup:

~~~bash
npx pak-satpam-doctor \
  --config /private/path/provider-config.yml \
  --mcp-token /private/path/mcp-token \
  --grafana-token /private/path/grafana-token
~~~

Omit the Grafana option for ci-only. Require an OK result without printing the
JSON output to a shared log if it could expose local paths.

Verify, in order:

1. /healthz returns process liveness.
2. An MCP request without a bearer is rejected.
3. An untrusted Host is rejected.
4. A valid client initializes and lists only the expected surface.
5. One read-only health, status, or SCM call returns schema version 1.0.
6. For CI, the allowlist, provider class, freshness, and capability metadata
   match the intended installation.

## Operate

Treat provider text, log lines, SCM patches, and rendered pixels as untrusted
evidence. Use bounded status and analysis before requesting log or SCM detail.
Use the dry-run remediation plan as a runbook pointer, not as a command.

The CI loop is observe, classify, redact/bound evidence, dry-run plan, explicit
one-time approval, rerun failed jobs only, then observe again. An approval is
bound to the exact repository, workflow, run, attempt, head SHA, request ID,
nonce, and a maximum 300-second TTL. Jenkins and Bitbucket never expose rerun.

For the observer, monitor /healthz and /metrics. Investigate degraded health,
truncated targets, stale suppression, provider errors, delivery failures, and
backoff before changing configuration. Hermes or another external AI service
owns prompts and chat; it is not a Pak Satpam capability.

## Rollback

1. Stop the current process without deleting credentials or observer state.
2. Restore the previous npm version or OCI digest.
3. Reuse the same private configuration and file paths.
4. Repeat liveness, authorization, MCP discovery, and one read-only call.
5. Confirm observer state remains readable and duplicate events remain suppressed.
6. Escalate provider-side changes separately; Pak Satpam has no provider rollback
   or deployment authority.

Delete or migrate observer state only through an explicitly reviewed state-schema
procedure. A package/image rollback cannot undo a GitHub rerun or another
provider-side action.

## Release Blockers

A passing local gate proves source compatibility, not publication or deployment.
Before calling a release live, an authorized maintainer must publish the npm
package or OCI image, record the immutable reference, and hand it to the private
deployment owner. The deployment owner must separately prove private ingress,
credential injection, provider connectivity, Hermes route reachability, and
rollback. Public HTTP remains blocked by the missing OAuth and multi-principal
authorization boundary.
