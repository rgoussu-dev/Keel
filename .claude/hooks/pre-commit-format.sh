#!/usr/bin/env bash
# PreToolUse hook: before Claude runs `git commit`, auto-correct prettier drift
# and verify lint. Anything unrelated to `git commit` passes straight through.
set -euo pipefail

input=$(cat)
# Node is already a hard requirement of this repo, so we use it rather than jq
# to avoid another environment dependency.
command=$(printf '%s' "$input" | node -e '
  const d = require("fs").readFileSync(0, "utf8");
  try { process.stdout.write(JSON.parse(d || "{}")?.tool_input?.command ?? ""); }
  catch { /* malformed payload: treat as no-op */ }
')

case "$command" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}"

staged=$(git diff --name-only --cached || true)

pnpm format >/dev/null

if [ -n "$staged" ]; then
  printf '%s\n' "$staged" | xargs git add --
fi

if ! pnpm lint >/dev/null 2>&1; then
  echo "pre-commit-format: pnpm lint failed after formatting. Fix lint errors before committing." >&2
  exit 2
fi
