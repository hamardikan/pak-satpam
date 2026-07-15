#!/usr/bin/env bash
set -euo pipefail

required=(
  README.md
  LICENSE
  SECURITY.md
  CONTRIBUTING.md
  docs/architecture.md
  docs/security-model.md
  docs/tool-surface.md
  docs/client-compatibility.md
  docs/ci-observer.md
  docs/test-strategy.md
  docs/roadmap.md
  docs/decisions/0001-product-boundary.md
  docs/decisions/0002-grafana-visual-context.md
  docs/implementation-status.md
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  Containerfile
  src/cli.ts
  src/approval-cli.ts
  src/approval.ts
  src/ci/approval.ts
  src/ci/index.ts
  src/ci/policy.ts
  src/ci/service.ts
  src/domain/ci-schemas.ts
  src/server/create-server.ts
  src/domain/tool-schemas.ts
  src/domain/visual-policy.ts
  src/http/create-http-app.ts
  src/http-cli.ts
  src/providers/fake-provider.ts
  src/providers/grafana-visual-provider.ts
  src/providers/victoriametrics-provider.ts
  src/runtime/load-runtime-configuration.ts
  src/observer/cli.ts
  src/observer/config.ts
  src/observer/delivery.ts
  src/observer/runtime.ts
  src/observer/state.ts
  src/providers/mapped-github-app-token-provider.ts
  src/visuals/synthetic-renderer.ts
  scripts/container-smoke.sh
  scripts/container-stdio-smoke.mjs
  scripts/container-runtime-smoke.sh
  scripts/assert-tool-surface.mjs
  scripts/http-smoke.mjs
  scripts/package-smoke.mjs
  scripts/prepare-release.mjs
  scripts/validate-package-metadata.mjs
  scripts/verify-published-image.mjs
  ci/build-multiarch.sh
)

for path in "${required[@]}"; do
  test -f "$path" || { echo "missing=$path" >&2; exit 1; }
done

grep -q "# Pak Satpam" README.md
grep -q "Version 1 is read-only" docs/security-model.md
grep -q "Streamable HTTP" docs/client-compatibility.md
grep -q "WWW-Authenticate" docs/security-model.md
grep -q "DNS rebinding" docs/test-strategy.md
grep -q "machine-readable Zod schemas" docs/tool-surface.md
grep -q "observability.render_panel" docs/tool-surface.md
grep -q "observability.render_dashboard" docs/tool-surface.md
grep -q "ImageContent" docs/tool-surface.md
grep -q "agentSafe: true" docs/tool-surface.md
grep -q "ci.rerun_failed_workflow" docs/tool-surface.md
grep -q "goal14-controlled-fixture.yml" README.md
test -f .github/workflows/goal14-controlled-fixture.yml

for pattern in \
  '[a-z0-9.-]+\.ts\.net' \
  '100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]+\.[0-9]+' \
  '10\.[0-9]+\.[0-9]+\.[0-9]+' \
  '172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+' \
  '192\.168\.[0-9]+\.[0-9]+' \
  '(fc|fd)[0-9a-f]{2}:[0-9a-f:]+' \
  'fe80:[0-9a-f:]+' \
  '(^|[^a-z0-9.-])(localhost|host\.docker\.internal)([^a-z0-9.-]|$)' \
  '/Users/[A-Za-z0-9._-]+/' \
  '/home/[A-Za-z0-9._-]+/' \
  '[A-Za-z0-9._%+-]+@(gmail|icloud|outlook)\.[A-Za-z]{2,}' \
  'gh[pousr]_[A-Za-z0-9_]{20,}' \
  'sk-[A-Za-z0-9_-]{20,}' \
  'BEGIN (RSA |OPENSSH |EC |PRIVATE )?PRIVATE KEY' \
  '(TOKEN|PASSWORD|SECRET|API_KEY)[[:space:]]*=[[:space:]]*[^<$ {][^[:space:]]*'
do
  while IFS= read -r -d '' path; do
    test "$path" = "ci/validate-foundation.sh" && continue
    test -f "$path" || continue
    if grep -qEI "$pattern" "$path"; then
      echo "forbidden private or secret surface detected: $path" >&2
      exit 1
    fi
  done < <(git ls-files -z --cached --others --exclude-standard)
done

for workflow in .github/workflows/*.yml; do
  ruby -e 'require "yaml"; YAML.safe_load(File.read(ARGV.fetch(0)), aliases: true)' "$workflow"
done

if grep -REq 'uses:[[:space:]]+[^@]+@(main|master|v[0-9])([[:space:]]|$)' .github/workflows; then
  echo "unpinned GitHub Action reference detected" >&2
  exit 1
fi

while IFS= read -r action; do
  if ! [[ "$action" =~ uses:[[:space:]]+[^@[:space:]]+@[0-9a-f]{40}$ ]]; then
    echo "GitHub Action must be pinned to a full commit SHA: $action" >&2
    exit 1
  fi
done < <(grep -REho 'uses:[[:space:]]+[^[:space:]]+' .github/workflows)

if grep -Eq 'npm publish|docker push|push:[[:space:]]*true' .github/workflows/validate.yml; then
  echo "publishing operation detected in validation workflow" >&2
  exit 1
fi

python3 - <<'PY'
import re
from pathlib import Path

errors = []
link_pattern = re.compile(r"(?<!!)\[[^]]+\]\(([^)]+)\)")
for source in Path(".").rglob("*.md"):
    if any(part in {".git", "node_modules", "dist"} for part in source.parts):
        continue
    for target in link_pattern.findall(source.read_text(errors="ignore")):
        target = target.strip().split("#", 1)[0]
        if not target or "://" in target or target.startswith("mailto:"):
            continue
        destination = (source.parent / target).resolve()
        if not destination.exists():
            errors.append(f"{source}: broken local link: {target}")

if errors:
    raise SystemExit("\n".join(errors))
PY

echo "foundation validation passed"
