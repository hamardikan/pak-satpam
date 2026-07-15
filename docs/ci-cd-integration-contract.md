# CI/CD Integration Contract

This contract connects bounded CI evidence to an external event loop. Pak Satpam
is the evidence and approval boundary. The caller, observer deployment, or
Hermes route owns polling/delivery lifecycle and chat behavior.

~~~text
observe -> classify -> bounded redacted evidence -> dry-run plan
       -> explicit one-time approval -> rerun failed jobs only
       -> observe the follow-up run
~~~

A follow-up failure is observed again. No step is autonomous.

## Provider Contract

Every built-in CI adapter exposes read operations for:

| Operation | Evidence |
| --- | --- |
| getWorkflowStatus | status, conclusion, attempt, ref, SHA, freshness |
| getFailedJobAnalysis | bounded failed jobs and deterministic categories |
| getLogEvidence | at most 200 redacted lines and a digest |
| getRemediationPlan | dryRun true steps linked to the public runbook |
| failure analysis | bounded CI, SCM, and telemetry evidence when configured |

The direct CP3 enrichment ports add:

| Operation | Current support |
| --- | --- |
| ci.scm_change_evidence | GitHub, Jenkins, and Bitbucket Cloud read adapters |
| ci.telemetry_correlation | named metrics bridge when observability is configured |
| ci.rerun_failed_workflow | GitHub only, approval-gated failed-job rerun |

Inputs use allowlisted repositories/workflows, provider-native identifiers,
schema version 1.0, and bounded selectors. Provider URLs, credentials, raw
payloads, and raw logs do not cross the MCP boundary.

## Capability Matrix

| Adapter | CI read | SCM read | Telemetry bridge | Rerun |
| --- | --- | --- | --- | --- |
| GitHub Actions | supported | GitHub supported | optional named metrics | approval-gated failed jobs |
| Jenkins | supported | Jenkins multibranch supported | optional named metrics | unsupported |
| Bitbucket Cloud | supported | Cloud pull-request/diff supported | optional named metrics | unsupported |
| Bitbucket Data Center | contract-only | contract-only | contract-only | unsupported; no runtime adapter |

Provider name metadata is deployment-owned. The adapter kind and capabilities
must agree before tools register. Bitbucket Cloud is reported as
bitbucket-cloud; Data Center has no built-in runtime adapter or MCP tools. The
future-adapter mapping and explicit unsupported behavior are in
[the Data Center contract artifact](contracts/bitbucket-data-center-adapter.md).

## URL Contract

Configure exactly one base_url or endpoint. A base_url such as
https://ci.example.test/reverse-proxy/2.0 is normalized to:

~~~yaml
endpoint:
  origin: https://ci.example.test
  path: /reverse-proxy/2.0
~~~

Do not put credentials, query strings, or fragments in either form. Provider
request paths are joined below the path once. An absolute request must use the
same configured origin. Redirects are rejected. GitHub requires HTTPS
api.github.com; Jenkins credentialed access and all Bitbucket access require
HTTPS. Explicit loopback HTTP is available only for anonymous Jenkins
development.

This separation prevents a complete endpoint URL from being treated as a base
and having a reverse-proxy prefix appended twice.

## Evidence Budgets

SCM direct evidence reports maxBytes, maxFiles, maxHunks, maxLines,
maxProviderRequests, and maxDurationMs. Defaults are 64 KiB, 100, 50, 2,000,
4, and 10 seconds. Aggregate failure analysis is bounded to 25 files, 100
hunks, 200 lines, 256 KiB, 32 provider requests, and a positive 24-hour
maximum window. CI log calls accept at most 200 redacted lines; provider
responses are capped at 2 MiB. Truncation, stale/unknown freshness, redactions,
and unavailable evidence are explicit.

## Release Handoff

1. Run typecheck, tests, build, stdio, Inspector, package, audit, foundation,
   and link checks.
2. Build and smoke-test the non-root OCI image locally.
3. Build linux/amd64 and linux/arm64 without publishing.
4. An authorized release workflow may publish npm or GHCR after its own
   metadata/release gates.
5. Record the immutable artifact reference for the private deployment owner.
6. The deployment owner canary-tests privately and retains the previous
   reference for rollback.

The release loop never consumes runtime approval tokens and never deploys the
image. At this checkout, publication and private edge deployment are blockers,
not completed facts.
