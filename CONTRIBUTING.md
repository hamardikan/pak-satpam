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
- Keep write tools outside version 1.
- Update the compatibility matrix when transport behavior changes.

Run the current foundation check with:

```bash
./ci/validate-foundation.sh
```

Implementation commands will be added with M1. Do not document commands that do
not exist yet.
