#!/usr/bin/env bash
# SessionStart hook: emits a compact context snapshot Claude reads on startup.
# Covers: current diff summary, recent commits, walking-skeleton markers.
set -euo pipefail

echo "=== keel session context ==="

if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  echo "branch: $BRANCH"
  DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
  echo "uncommitted files: $DIRTY"
  echo "--- recent commits ---"
  git log --oneline -n 5 2>/dev/null || true
fi

echo "--- walking skeleton markers ---"
if   [ -d "domain/contract/src/main/java" ] && find domain/contract/src/main/java -type d -name kernel -print -quit 2>/dev/null | grep -q .; then echo "found: domain/contract/kernel";
elif [ -d "domain/core/kernel" ]; then echo "found (legacy location): domain/core/kernel — kernel now lives in domain/contract";
else echo "missing: domain/contract/kernel (mediator expected here)"; fi
[ -d "domain/contract" ]          && echo "found: domain/contract"           || echo "missing: domain/contract (ports expected here)"
[ -d "application" ]              && echo "found: application"               || echo "missing: application (interface layer expected here)"
[ -d "infrastructure" ]           && echo "found: infrastructure"            || echo "missing: infrastructure (adapters expected here)"
IAC_DIR=$(ls -d iac 2>/dev/null || ls -d infrastructure/iac 2>/dev/null || ls -d infra 2>/dev/null || true)
[ -n "$IAC_DIR" ] && echo "found: IaC at $IAC_DIR" || echo "missing: IaC (OpenTofu expected at /iac/)"

exit 0
