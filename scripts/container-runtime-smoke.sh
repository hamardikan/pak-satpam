#!/usr/bin/env bash
set -euo pipefail

image="${1:-observability-agent-mcp:runtime-smoke}"
platforms_string="${CONTAINER_RUNTIME_PLATFORMS:-linux/amd64 linux/arm64}"
builder="${BUILDX_BUILDER:-pak-satpam-runtime-smoke}"
operation_timeout_seconds="${CONTAINER_RUNTIME_OPERATION_TIMEOUT_SECONDS:-300}"
cleanup_timeout_seconds="${CONTAINER_RUNTIME_CLEANUP_TIMEOUT_SECONDS:-30}"
version="$(node -p "require('./package.json').version")"
revision="${GITHUB_SHA:-$(git rev-parse HEAD)}"
builder_created=false
created_images=()
cleanup_started=false

case "$operation_timeout_seconds" in
  ''|*[!0-9]*) echo "invalid CONTAINER_RUNTIME_OPERATION_TIMEOUT_SECONDS" >&2; exit 2 ;;
esac
case "$cleanup_timeout_seconds" in
  ''|*[!0-9]*) echo "invalid CONTAINER_RUNTIME_CLEANUP_TIMEOUT_SECONDS" >&2; exit 2 ;;
esac

run_bounded() {
  timeout --foreground "${operation_timeout_seconds}s" "$@"
}

run_cleanup_bounded() {
  timeout --foreground "${cleanup_timeout_seconds}s" "$@"
}

cleanup() {
  if [ "$cleanup_started" = true ]; then
    return
  fi
  cleanup_started=true
  for created_image in "${created_images[@]}"; do
    run_cleanup_bounded docker image rm "$created_image" >/dev/null 2>&1 || true
  done
  if [ "$builder_created" = true ]; then
    run_cleanup_bounded docker buildx rm "$builder" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

if run_bounded docker buildx inspect "$builder" >/dev/null 2>&1; then
  :
else
  inspect_status=$?
  test "$inspect_status" -eq 1
  builder_created=true
  run_bounded docker buildx create --name "$builder" --driver docker-container --use >/dev/null
fi

run_bounded docker buildx inspect "$builder" --bootstrap >/dev/null

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
  image_preexisting=false
  if run_bounded docker image inspect "$platform_tag" >/dev/null 2>&1; then
    image_preexisting=true
  else
    inspect_status=$?
    test "$inspect_status" -eq 1
  fi

  if [ "$image_preexisting" = false ]; then
    created_images+=("$platform_tag")
  fi
  run_bounded docker buildx build \
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
  run_bounded env CONTAINER_PLATFORM="$platform" node scripts/container-stdio-smoke.mjs "$platform_tag" "$platform"
  run_bounded env CONTAINER_PLATFORM="$platform" ./scripts/container-smoke.sh "$platform_tag"
  echo "container_runtime_platform=$platform status=ok"
done
