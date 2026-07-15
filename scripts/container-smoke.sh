#!/usr/bin/env bash
set -euo pipefail

image="${1:-observability-agent-mcp:local}"
name="observability-agent-mcp-smoke-$$"
volume="observability-agent-mcp-smoke-runtime-$$"
temporary=""
operation_timeout_seconds="${CONTAINER_RUNTIME_OPERATION_TIMEOUT_SECONDS:-300}"
cleanup_timeout_seconds="${CONTAINER_RUNTIME_CLEANUP_TIMEOUT_SECONDS:-30}"
container_created=false
volume_created=false
cleanup_started=false

case "$operation_timeout_seconds" in
  ''|*[!0-9]*) echo "invalid CONTAINER_RUNTIME_OPERATION_TIMEOUT_SECONDS" >&2; exit 2 ;;
esac
case "$cleanup_timeout_seconds" in
  ''|*[!0-9]*) echo "invalid CONTAINER_RUNTIME_CLEANUP_TIMEOUT_SECONDS" >&2; exit 2 ;;
esac

temporary="$(mktemp -d)"

run_bounded() {
  timeout --foreground "${operation_timeout_seconds}s" "$@"
}

run_cleanup_bounded() {
  timeout --foreground "${cleanup_timeout_seconds}s" "$@"
}

docker_run() {
  if [[ -n "${CONTAINER_PLATFORM:-}" ]]; then
    run_bounded docker run --platform "$CONTAINER_PLATFORM" "$@"
  else
    run_bounded docker run "$@"
  fi
}

cleanup() {
  if [ "$cleanup_started" = true ]; then
    return
  fi
  cleanup_started=true
  if [ "$container_created" = true ]; then
    run_cleanup_bounded docker rm -f "$name" >/dev/null 2>&1 || true
  fi
  if [ "$volume_created" = true ]; then
    run_cleanup_bounded docker volume rm -f "$volume" >/dev/null 2>&1 || true
  fi
  run_cleanup_bounded rm -rf -- "$temporary" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

cat >"$temporary/provider-config.yml" <<'YAML'
version: 1
profile: observability-only
providers:
  metrics: { type: prometheus-compatible, base_url: "http://127.0.0.1:1" }
  alerts: { type: vmalert, base_url: "http://127.0.0.1:1" }
  grafana: { type: grafana, base_url: "http://127.0.0.1:1" }
policy:
  named_queries:
    smoke-up: { expression: "up", label_keys: [] }
  service_health:
    smoke-service:
      query_template: smoke-up
      healthy_when: { operator: eq, value: 1 }
      summary: Smoke service availability
  dashboards:
    smoke-dashboard:
      uid: smoke-dashboard
      slug: smoke-dashboard
      title: Smoke Dashboard
      panels:
        smoke-panel: { id: 1 }
YAML
printf '%s\n' 'grafana-container-smoke-token' >"$temporary/grafana-token"
printf '%s\n' 'mcp-container-smoke-token-123' >"$temporary/mcp-token"
chmod 600 "$temporary"/*

if run_bounded docker volume inspect "$volume" >/dev/null 2>&1; then
  echo "smoke volume already exists: $volume" >&2
  exit 1
else
  inspect_status=$?
  test "$inspect_status" -eq 1
fi
volume_created=true
run_bounded docker volume create "$volume" >/dev/null
docker_run --rm --entrypoint test "$image" -f /app/dist/observer/cli.js
docker_run --rm --user 0:0 \
  --volume "$temporary:/source:ro" \
  --volume "$volume:/target" \
  --entrypoint sh \
  "$image" -c 'cp /source/provider-config.yml /source/grafana-token /source/mcp-token /target/ && chmod 600 /target/* && chown 1000:1000 /target/*'

if run_bounded docker container inspect "$name" >/dev/null 2>&1; then
  echo "smoke container already exists: $name" >&2
  exit 1
else
  inspect_status=$?
  test "$inspect_status" -eq 1
fi
container_created=true
docker_run -d --name "$name" \
  --publish 127.0.0.1::8765 \
  --env MCP_HTTP_HOST=0.0.0.0 \
  --env MCP_HTTP_PORT=8765 \
  --env MCP_HTTP_ALLOWED_HOSTS=127.0.0.1 \
  --env OBSERVABILITY_PROVIDER_CONFIG=/run/runtime/provider-config.yml \
  --env GRAFANA_TOKEN_FILE=/run/runtime/grafana-token \
  --env MCP_TOKEN_FILE=/run/runtime/mcp-token \
  --volume "$volume:/run/runtime:ro" \
  "$image" dist/http-cli.js >/dev/null

binding="$(run_bounded docker port "$name" 8765/tcp | head -n 1)"
endpoint="http://$binding/mcp"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 2 -o /dev/null "http://$binding/healthz" 2>/dev/null; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    run_bounded docker logs "$name" >&2
    exit 1
  fi
  sleep 1
done

test "$(run_bounded docker inspect "$name" --format '{{.Config.User}}')" = "node"
if [[ -n "${CONTAINER_PLATFORM:-}" ]]; then
  expected_arch=""
  case "$CONTAINER_PLATFORM" in
    linux/amd64) expected_arch="x64" ;;
    linux/arm64) expected_arch="arm64" ;;
  esac
  test -n "$expected_arch"
  test "$(run_bounded docker exec "$name" node -p 'process.arch')" = "$expected_arch"
fi
unauthorized_status="$(curl -sS --max-time 2 -o /dev/null -w '%{http_code}' "$endpoint")"
test "$unauthorized_status" = "401"
rejected_host_status="$(curl -sS --max-time 2 -o /dev/null -w '%{http_code}' -H 'Host: untrusted.example.test' "http://$binding/healthz")"
test "$rejected_host_status" = "403"
run_bounded node scripts/http-smoke.mjs "$endpoint" "$temporary/mcp-token"
echo "container_runtime_smoke=ok"
