#!/bin/bash
#
# Brings a Claude Code on the web session's toolchain up to what this
# repo's suites actually need, so the first JVM suite of a session
# does not fail on the box rather than on the code.
#
# The image's own toolchain does not match CI — it ships a Gradle that
# cannot start on JDK 25, and its shell profile exports a JDK 21
# JAVA_HOME — so rather than patching each tool by hand, the session
# is provisioned the way CI is: mise, from the repo's `mise.toml`.
# One file, three consumers (workstation, CI shard, this hook), none
# of which can drift from the others.
#
# Idempotent: a warm container re-runs this in seconds, because
# `mise install` no-ops on what is already there and pnpm does too.
#
set -euo pipefail

# Local sessions have their own toolchains (a developer's own mise,
# sdkman, distro packages — whatever they chose); only the remote
# image needs fixing, and this must never reach into a developer's
# home.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$repo"

# ---------------------------------------------------------------------
# mise
# ---------------------------------------------------------------------

# The installer lands mise in ~/.local/bin, which the image's PATH may
# or may not carry; put it there explicitly rather than assume.
export PATH="${HOME}/.local/bin:${PATH}"
if ! command -v mise >/dev/null 2>&1; then
  echo "session-start: installing mise"
  curl -fsSL --retry 3 --retry-delay 5 --retry-all-errors https://mise.run | sh
fi
command -v mise >/dev/null || { echo "session-start: mise did not install" >&2; exit 1; }

# The repo config is what a fresh checkout trusts by default: it is
# the toolchain, not an env file with secrets.
mise trust --quiet "${repo}/mise.toml"

# Everything in the file, not a subset: a web session may run any
# shard, and the container is snapshotted after this hook, so a warm
# start pays nothing for what a cold one installed.
#
# Two attempts, not one: mise installs the tools in parallel and a
# cold rustup bootstrap has been seen to fail its first run and
# succeed its second with nothing changed in between. A second miss
# is a real error and stops the session loudly.
echo "session-start: mise install"
mise install --yes || { echo "session-start: retrying mise install once" >&2; mise install --yes; }

# The hook's own process env dies with it. `$CLAUDE_ENV_FILE` is the
# mechanism that applies to every later command in the session — it
# gets what `mise env` reports: the tools' bin dirs on PATH, and
# JAVA_HOME, which the JVM suites treat as the authority for the JDK.
#
# This is the one place the session's JAVA_HOME is set, on purpose. A
# `.claude/settings.json` `env` block cannot be conditional, and a
# distro path pinned there once overrode a developer's correct
# JAVA_HOME with a directory that did not exist.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  mise env -s bash >> "$CLAUDE_ENV_FILE"
fi
eval "$(mise env -s bash)"

# ---------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------

# Not `--frozen-lockfile`: the container is snapshotted after this hook,
# so a warm start should reuse the store rather than reinstall, and a
# lockfile drift should not stop a session from starting at all — CI is
# where that is enforced.
pnpm install

# A wrong toolchain here costs a JVM build to discover, so prove it
# now — the same three facts CI's probe step prints. `grep -o` rather
# than a field cut: JAVA_TOOL_OPTIONS makes the JVM print a "Picked
# up …" line first, which shifts every column.
[ -n "${JAVA_HOME:-}" ] || { echo "session-start: mise env set no JAVA_HOME" >&2; exit 1; }
jdk="$("${JAVA_HOME}/bin/javac" -version 2>&1 | grep -om1 'javac [0-9][^ ]*' | cut -d' ' -f2)"
gradle_version="$(gradle --version 2>/dev/null | grep -om1 'Gradle [0-9][^ ]*' | cut -d' ' -f2)"
mvn_version="$(mvn --version 2>/dev/null | grep -om1 'Apache Maven [0-9][^ ]*' || echo 'Maven absent')"
echo "session-start: ready — JDK ${jdk}, Gradle ${gradle_version}, ${mvn_version}, node $(node --version), go $(go version | cut -d' ' -f3), $(cargo --version)"
