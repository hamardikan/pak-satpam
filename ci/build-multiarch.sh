#!/usr/bin/env bash
set -euo pipefail

builder="${BUILDX_BUILDER:-pak-satpam-ci}"
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
docker buildx build \
  --builder "$builder" \
  --platform linux/amd64,linux/arm64 \
  --file Containerfile \
  --build-arg "VERSION=$version" \
  --build-arg "VCS_REF=$revision" \
  --tag "ghcr.io/hmrdkn-labs/pak-satpam:ci-$revision" \
  --provenance=false \
  --sbom=false \
  --output type=cacheonly \
  .
