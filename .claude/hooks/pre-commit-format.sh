#!/usr/bin/env bash
# PreToolUse hook: before Claude runs `git commit`, auto-correct prettier drift
# and verify lint. Anything unrelated to `git commit` passes straight through.
set -euo pipefail

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

case "$command" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}"

staged=$(git diff --name-only --cached || true)

pnpm format >/dev/null

if [ -n "$staged" ]; then
  printf '%s\n' "$staged" | xargs -r git add --
fi

if ! pnpm lint >/dev/null 2>&1; then
  echo "pre-commit-format: pnpm lint failed after formatting. Fix lint errors before committing." >&2
  exit 2
fi
