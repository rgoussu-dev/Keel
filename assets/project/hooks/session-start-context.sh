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
[ -d "domain/core/kernel" ]       && echo "found: domain/core/kernel"        || echo "missing: domain/core/kernel (mediator expected here)"
[ -d "domain/contract" ]          && echo "found: domain/contract"           || echo "missing: domain/contract (ports expected here)"
[ -d "application" ]              && echo "found: application"               || echo "missing: application (interface layer expected here)"
[ -d "infrastructure" ]           && echo "found: infrastructure"            || echo "missing: infrastructure (adapters expected here)"
INFRA_IAC=$(ls -d infrastructure/iac 2>/dev/null || ls -d infra 2>/dev/null || true)
[ -n "$INFRA_IAC" ] && echo "found: IaC at $INFRA_IAC" || echo "missing: IaC (OpenTofu expected)"

exit 0
