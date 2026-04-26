#!/usr/bin/env bash
# Stop hook: reminds Claude to commit logical units in conventional-commits form.
# Only nudges when there are uncommitted changes.
set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then exit 0; fi
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
if [ "$DIRTY" = "0" ]; then exit 0; fi

cat <<'EOF'
=== keel: commit reminder ===
Uncommitted changes detected. Trunk-based workflow expects small, frequent commits.

Checklist:
  - One logical unit per commit (no mixing refactor + feature + fix).
  - Conventional Commits format: <type>(<scope>): <subject>.
  - Types: feat, fix, refactor, docs, test, chore, build, ci, perf, style.
  - Run `/commit` to verify + commit + push through the standard flow.
EOF

exit 0
