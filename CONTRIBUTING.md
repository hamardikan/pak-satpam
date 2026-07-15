# Contributing

## Before Code

Open an issue for changes to tool names, result schemas, authentication,
provider permissions, or the read-only boundary. These are public contracts.

## Development Rules

- Add a failing test before production behavior.
- Keep domain, transport, provider, and policy boundaries separate.
- Do not add credentials, provider payloads, private hostnames, or production
  data to fixtures.
- Use synthetic fixtures for security and integration tests.
- Keep write tools outside version 1 except the approval-gated failed-job rerun.
- Update the provider matrix and client compatibility docs when behavior changes.
- Keep documentation product-first; put test mechanics in
  docs/test-strategy.md.
- Do not publish, deploy, or modify private infrastructure from validation work.

## Verification

~~~bash
npm run validate
./ci/validate-foundation.sh
~~~

For container changes, also run the non-publishing container build and smoke
gates documented in docs/portability.md. Do not claim public release or live
deployment from local green tests alone.

## Documentation Changes

Keep examples placeholder-only. Credential files must be referenced by path and
must be regular 0600 files; never include secret values, private topology, or
provider payloads. Preserve useful historical objective and decision documents,
but label deferred targets and release blockers clearly.
