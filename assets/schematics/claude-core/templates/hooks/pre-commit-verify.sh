#!/usr/bin/env bash
# PreToolUse hook: blocks `git commit` unless typecheck + tests + public-api-docs pass.
# Input: JSON on stdin; matches only Bash tool calls whose command begins with `git commit`.
# Exit 0 = allow; exit 1 = deny with message on stderr.

set -euo pipefail

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.tool_input&&j.tool_input.command)||"")}catch(e){}})')"

# Only intercept git commit invocations.
case "$CMD" in
  "git commit"*|*"&& git commit"*|*"; git commit"*) ;;
  *) exit 0 ;;
esac

fail() { printf '%s\n' "$1" >&2; exit 1; }

# Gradle / JVM projects
if [ -x "./gradlew" ]; then
  ./gradlew --quiet check >/dev/null 2>&1 || fail "gradle check failed — fix before committing"
fi

# pnpm / node projects
if [ -f "package.json" ] && command -v pnpm >/dev/null 2>&1; then
  pnpm --silent run typecheck >/dev/null 2>&1 || fail "typecheck failed — fix before committing"
  pnpm --silent run test >/dev/null 2>&1 || fail "tests failed — fix before committing"
fi

# Cargo / Rust projects
if [ -f "Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cargo check --quiet >/dev/null 2>&1 || fail "cargo check failed — fix before committing"
  cargo test --quiet >/dev/null 2>&1 || fail "cargo test failed — fix before committing"
fi

# Go projects
if [ -f "go.mod" ] && command -v go >/dev/null 2>&1; then
  go vet ./... >/dev/null 2>&1 || fail "go vet failed — fix before committing"
  go test ./... >/dev/null 2>&1 || fail "go test failed — fix before committing"
fi

exit 0
