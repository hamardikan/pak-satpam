# Bitbucket Data Center Adapter Contract

This is a future-adapter contract for Bitbucket Data Center. It is not a
runtime adapter, runtime profile, MCP tool surface, release claim, or deployment
configuration. The implementation status is deliberately contract-only:
runtime selection is rejected, provider requests are not attempted, and the
MCP server exposes no tools for this provider identity.

## Identity And Capabilities

The provider identity is `bitbucket-data-center`. It is distinct from the
existing `bitbucket` CI provider, which means Bitbucket Cloud. The contract
declares read mappings for project/repository, refs, build status, commits,
pull requests, and changes. Rerun and every runtime capability are unsupported.

```yaml
providerClass: bitbucket-data-center
kind: bitbucket-data-center
adapterStatus: contract-only
capabilities:
  projectRepositoryRead: true
  refRead: true
  buildRead: true
  commitRead: true
  pullRequestRead: true
  changeRead: true
  rerun: unsupported
runtime:
  selectable: false
  tools: []
  errorCode: unsupported
```

The runtime parser accepts only the implemented provider types `github`,
`jenkins`, and `bitbucket`. Unknown or forged provider types fail closed before
tool registration.

## Connection And Auth

`base_url` is the Bitbucket server context root, not the REST API root. For
example, `https://bitbucket.example/bitbucket` resolves a future request for
`/projects/PLN/repos/scheduler` to:

```text
https://bitbucket.example/bitbucket/rest/api/1.0/projects/PLN/repos/scheduler
```

The equivalent structured form is:

```yaml
endpoint:
  origin: https://bitbucket.example
  path: /bitbucket
```

Configure exactly one `base_url` or `endpoint`. The origin is HTTPS-only and
must not contain credentials, query data, or fragments. The context path must
not include `/rest/api/1.0`. Reverse-proxy prefixes are retained exactly once;
the adapter appends `/rest/api/1.0` exactly once. Redirects and cross-origin
absolute requests are unsupported by the future transport boundary.

Credentials are references to regular 0600 files and never inline values:

```yaml
auth:
  method: bearer
  token_file: /run/secrets/bitbucket-data-center-token
```

Basic auth is also contract-shaped as `method: basic`, a non-secret
`username`, and a `password_file`. A future adapter must validate file type,
permissions, bounded size, and HTTPS before making a request. Auth values,
authorization headers, and file contents never enter evidence, warnings,
provenance, logs, or durable state.

## Selectors And Provider Mapping

The contract keeps the Bitbucket Data Center project key and repository slug
separate because the REST API addresses repositories as
`projects/{projectKey}/repos/{repositorySlug}`. A normalized repository is:

```yaml
repository:
  projectKey: PLN
  repositorySlug: scheduler
```

Selectors may identify a bounded evidence request by `ref`, full `commit`,
build `key` or `number`, pull-request ID, or a base/head compare pair. Refs
are allowlisted and commit IDs are full 40-character SHA-1 values.

| Evidence | Bitbucket Data Center source mapping | Normalized contract field |
| --- | --- | --- |
| Project/repository | project key plus repository slug from the REST resource path and response | `repository.projectKey`, `repository.repositorySlug` |
| Ref | `displayId`/ref name from ref or commit responses | `ref` and revision `ref` |
| Build | commit build-status resource, preserving provider key and optional number | `build.key`, `build.number`, `build.state`, `build.commit` |
| Commit | commit `id`, `displayId`, message, author/committer, timestamp, parents | `commit` |
| Pull request | pull-request `id`, title, state, version, `fromRef`, `toRef`, updated date | `pullRequest.id`, `from`, `to` |
| Change | pull-request or commit change entries, path/type/line counts, bounded diff | `changes[]` and `summary` |

Provider-native build and pull-request IDs remain strings. The adapter must
verify that every response still names the requested project and repository
before normalizing it. It must not fetch a checkout, archive, raw repository
contents, or arbitrary search results.

## Evidence Envelope

`BitbucketDataCenterEvidenceResultSchema` uses contract version `1.0` and
contains:

- `freshness`, `observedAt`, `warnings`, `redactionsApplied`, and a SHA-256
  digest over normalized evidence;
- six resource truncation flags for projects, repositories, refs, builds,
  commits, pull requests, and changes, plus hunk, line, byte, provider-request,
  and time-window flags;
- a provenance record with the context path, fixed API path, bounded request
  count, logical resource kinds, provider response IDs, and digest;
- `data.available: true` with normalized evidence, or `data.available: false`
  with a typed error.

Errors are one of `unavailable`, `permission`, `malformed`, `not-found`, or
`unsupported`, with a safe bounded message, retryability, and optional HTTP
status. Provider payloads and response bodies are not copied into the result.
An unsupported result means no request was attempted; it is not a signal to
fall back to another provider.

## Explicit Unsupported Behavior

Until a later implementation adds an adapter and separate runtime tests, the
only valid behavior is:

```text
configuration selection -> rejected as unsupported
provider requests       -> not attempted
MCP tools               -> none
rerun/mutation          -> unsupported
```

This document and the contract-only fixture are evidence for a future adapter,
not an advertisement that Bitbucket Data Center can be configured today.
