# Version 1 Examples

These examples are placeholder-only runtime contracts. They use reserved
example.test names, fake repository names, and operator-supplied file paths.
Replace them in a private deployment copy. Never commit credential values,
private addresses, or topology here.

| Profile | Client surface | Runtime |
| --- | --- | --- |
| observability-only | /mcp | private HTTP, CI disabled |
| ci-only | /mcp/ci | private HTTP, CI enabled |
| combined | /mcp and /mcp/ci | private HTTP, both modules |
| stdio | process stdin/stdout | local deterministic provider |
| private-http | /mcp | loopback private HTTP |

The HTTP Compose files build the local Containerfile and publish only to
127.0.0.1. They default to linux/amd64; set PLATFORM=linux/arm64 for the other
supported target. Create each referenced regular 0600 file outside source
control before starting an HTTP profile. The ci-only profile does not require
Grafana configuration or a Grafana credential.

## Start

From the repository root:

~~~bash
docker compose -f examples/v1/observability-only/compose.yml up --build
~~~

Use the matching client configuration and operator-supplied bearer file. The
runtime configuration contains only placeholder provider origins and allowlists.
Run pak-satpam-doctor with private paths before exposing the client endpoint.

These examples are starting points, not deployment policy. Public exposure
requires the separate OAuth, authorization, Origin, ingress, and tenant
isolation review described in the security documentation.
