# Installation And Portability

Pak Satpam keeps one MCP schema contract across npm, OCI, stdio, and private
Streamable HTTP. The supported runtime is Node.js 22 or newer.

## Distribution Matrix

| Distribution | Launch | Platforms | Current condition |
| --- | --- | --- | --- |
| npm package @hmrdkn-labs/pak-satpam | pak-satpam or pak-satpam-http | Node.js 22, Linux amd64/arm64 | package contract implemented; publication requires authorized release |
| OCI image ghcr.io/hmrdkn-labs/pak-satpam | node dist/cli.js or node dist/http-cli.js | linux/amd64 and linux/arm64 | image contract and non-publishing Buildx gates implemented; publication/deploy not proven here |
| npm package or OCI image | observability-agent-mcp-observer | Node.js 22, Linux amd64/arm64 | optional observer companion; private deployment required |

The compatibility identities are package @hmrdkn-labs/pak-satpam, MCP name
io.github.hmrdkn-labs/pak-satpam, schema version 1.0, the preserved
observability-agent-mcp aliases, and the OCI repository
ghcr.io/hmrdkn-labs/pak-satpam. A release process must provide an immutable
version or digest. This documentation does not claim that an artifact has been
published.

## npm And Stdio

~~~bash
mkdir pak-satpam-runtime
cd pak-satpam-runtime
npm init -y
npm install @hmrdkn-labs/pak-satpam
npm exec -- pak-satpam
~~~

The stdio server does not open a network listener and uses the deterministic
local provider. A client launches the executable and owns its stdin/stdout
lifecycle. The installed package also exposes the HTTP and doctor aliases.

For a source checkout:

~~~bash
npm ci
npm run build
npm run test:stdio
node dist/cli.js
~~~

Do not type MCP requests into the process. Configure the executable as the
command of an MCP-compatible client.

## Private Streamable HTTP

Private HTTP is stateless per MCP request and intended for a private,
single-operator network. It is not the public OAuth transport.

Required environment names are:

~~~text
MCP_HTTP_HOST
MCP_HTTP_PORT
MCP_HTTP_ALLOWED_HOSTS
OBSERVABILITY_PROVIDER_CONFIG
MCP_TOKEN_FILE
GRAFANA_TOKEN_FILE
~~~

GRAFANA_TOKEN_FILE is omitted for ci-only. Every credential path must point to a
regular 0600 file and values must stay outside configuration, arguments,
requests, logs, and source control. MCP_TOKEN_FILE must contain at least 16
bytes. Exact Host matching and a constant-time bearer comparison protect the
current private route. Bind examples to loopback; a private ingress still needs
its own authentication and authorization review.

Routes are /mcp for observability, /mcp/ci for CI, and /healthz for process
liveness. The /mcp route includes CI tools only in combined. The /mcp/ci route
does not expose observability tools.

## OCI

The Containerfile builds a non-root Node.js image with entrypoint node and
default command dist/cli.js:

~~~bash
docker run --rm -i ghcr.io/hmrdkn-labs/pak-satpam@sha256:<immutable-digest>
~~~

For HTTP, select dist/http-cli.js and mount the configuration and 0600 files
read-only. Pin the image by digest and retain the previous digest for rollback.
The public validation workflow builds both target architectures without
publishing, then runs per-platform runtime smoke where the host supports it.

## Profiles And Examples

The examples/v1 directory contains placeholder-only contracts:

| Profile | Route or transport | Configuration |
| --- | --- | --- |
| observability-only | /mcp | observability providers and policy |
| ci-only | /mcp/ci | CI allowlist and provider |
| combined | /mcp and /mcp/ci | both modules |
| stdio | process stdin/stdout | deterministic fake provider |
| private-http | /mcp | loopback observability HTTP |

The examples build the local image and bind HTTP to loopback. Replace provider
origins, allowlists, and file paths in a private copy. Do not add real hostnames,
addresses, credentials, or topology to this repository.

## Release And Rollback

Validation is non-publishing. The authorized release flow separately validates
metadata, builds the artifact, and records the immutable reference. It does not
deploy the runtime. A deployment owner must canary the pinned artifact privately,
verify health and MCP read-only calls, and keep the previous pinned artifact.

Rollback means restarting the previous npm version or OCI digest with the same
private configuration and credential paths, then repeating those checks. Do not
delete observer metadata-only state as part of a routine rollback.
