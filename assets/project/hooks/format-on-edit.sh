#!/usr/bin/env bash
# PostToolUse hook: runs the language-appropriate formatter on the edited file.
# Input: JSON on stdin from Claude Code with tool_input.file_path.
# Behavior: detect language by extension, run matching formatter, fail silent on miss.

set -euo pipefail

INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.tool_input&&j.tool_input.file_path)||"")}catch(e){}})')"

[ -z "${FILE:-}" ] && exit 0
[ ! -f "$FILE" ] && exit 0

case "$FILE" in
  *.java|*.kt|*.kts)
    if [ -x "./gradlew" ]; then ./gradlew spotlessApply -PspotlessFiles="$FILE" >/dev/null 2>&1 || true; fi
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.yaml|*.yml)
    if command -v pnpm >/dev/null 2>&1; then pnpm exec prettier --write "$FILE" >/dev/null 2>&1 || true
    elif command -v npx >/dev/null 2>&1; then npx prettier --write "$FILE" >/dev/null 2>&1 || true; fi
    ;;
  *.rs)
    command -v rustfmt >/dev/null 2>&1 && rustfmt "$FILE" >/dev/null 2>&1 || true
    ;;
  *.go)
    command -v gofmt >/dev/null 2>&1 && gofmt -w "$FILE" >/dev/null 2>&1 || true
    ;;
  *.tf|*.tofu)
    command -v tofu >/dev/null 2>&1 && tofu fmt "$FILE" >/dev/null 2>&1 || true
    ;;
esac

exit 0
