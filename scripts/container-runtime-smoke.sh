#!/usr/bin/env bash
set -euo pipefail

image="${1:-observability-agent-mcp:runtime-smoke}"
platforms_string="${CONTAINER_RUNTIME_PLATFORMS:-linux/amd64 linux/arm64}"
builder="${BUILDX_BUILDER:-pak-satpam-runtime-smoke}"
version="$(node -p "require('./package.json').version")"
revision="${GITHUB_SHA:-$(git rev-parse HEAD)}"
created=false

if ! docker buildx inspect "$builder" >/dev/null 2>&1; then
  docker buildx create --name "$builder" --driver docker-container --use >/dev/null
  created=true
fi

cleanup() {
  if [ "$created" = true ]; then
    docker buildx rm "$builder" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker buildx inspect "$builder" --bootstrap >/dev/null

read -r -a platforms <<<"$platforms_string"
test "${#platforms[@]}" -gt 0

for platform in "${platforms[@]}"; do
  case "$platform" in
    linux/amd64|linux/arm64) ;;
    *)
      echo "unsupported runtime smoke platform: $platform" >&2
      exit 2
      ;;
  esac

  platform_tag="${image}-${platform//\//-}"
  docker buildx build \
    --builder "$builder" \
    --platform "$platform" \
    --file Containerfile \
    --build-arg "VERSION=$version" \
    --build-arg "VCS_REF=$revision" \
    --tag "$platform_tag" \
    --provenance=false \
    --sbom=false \
    --load \
    .

  CONTAINER_PLATFORM="$platform" node scripts/container-stdio-smoke.mjs "$platform_tag" "$platform"
  CONTAINER_PLATFORM="$platform" ./scripts/container-smoke.sh "$platform_tag"
  echo "container_runtime_platform=$platform status=ok"
done
