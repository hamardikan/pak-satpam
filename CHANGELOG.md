# Changelog

All notable changes to Pak Satpam are documented here. A changelog entry is not
a publication receipt.

## [0.2.0] - 2026-07-15

### Goal 19 CP3 Documentation And Contract

- Add a contract-only Bitbucket Data Center provider artifact, normalized
  evidence schema, fixture, and fail-closed runtime/no-tool tests; no Data
  Center adapter or runtime support is added.
- Document the direct provider-neutral SCM evidence contract and all six SCM
  budgets.
- Document GitHub Actions, Jenkins, Bitbucket Cloud, and Bitbucket Data Center
  contract-only status.
- Document provider-native IDs and origin/path URL semantics for reverse proxies.
- Document bounded CI, SCM, metric, telemetry, render, observer, and approval
  budgets.
- Clarify webhook/poll dedupe, stale suppression, the external Hermes/AI
  boundary, forbidden capabilities, operator workflows, rollback, and current
  publication/deployment blockers.
- Preserve the npm and OCI release identities without changing package version or
  release workflows.

### Release Identity

- npm package: @hmrdkn-labs/pak-satpam.
- MCP name: io.github.hmrdkn-labs/pak-satpam.
- OCI image: ghcr.io/hmrdkn-labs/pak-satpam.
- Legacy observability-agent-mcp executable aliases remain supported.

### Release Hardening

- Pin both OCI build stages to the official Node multi-platform digest.
- Exercise real OCI stdio and private HTTP MCP clients on linux/amd64 and
  linux/arm64 during non-publishing validation.
- Enforce strict semantic version and dated changelog consistency, immutable
  version/SHA image tags, and post-publish manifest, provenance, and SPDX SBOM
  verification.

This entry records the source/documentation state. It does not claim that npm,
GHCR, a private edge runtime, or a Hermes route was published or deployed.
