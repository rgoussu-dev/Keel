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

# mise itself is pinned, and its tarball is checked against a checksum
# this file carries, because this runs with shell privileges before
# anything in the project is trusted: piping the project's installer
# endpoint into a shell would execute whatever it served on the day.
# The release tarball is fetched straight from the tagged GitHub
# release, and the sums below are the two lines of that release's
# SHASUMS256.txt this hook can land on. Bumping mise is a three-line
# edit here, with the new sums copied from the new release — never
# re-derived from the download itself. `tests/mise-toolchain.test.ts`
# holds the shape.
MISE_VERSION="v2026.9.6"
MISE_SHA256_X64="afa8079a2c75a48d8d39bbb6ca5566c652bda8ae49ce8ca1f41a72e80184140f"
MISE_SHA256_ARM64="9d5d4c3187ccc2c5a9659be427231208eba689c8adcc0203004c4c2ef75caf8d"

# mise lands in ~/.local/bin, which the image's PATH may or may not
# carry; put it there explicitly rather than assume.
export PATH="${HOME}/.local/bin:${PATH}"
# Not "is there a mise" but "is it the pinned one": an older binary the
# image or a warm container carries would otherwise provision the
# toolchain with an unpinned resolver, and the pin above would be a
# claim about a download that never happened.
installed="$(mise --version 2>/dev/null | cut -d' ' -f1 || true)"
if [ "${installed}" != "${MISE_VERSION#v}" ]; then
  echo "session-start: installing mise ${MISE_VERSION}${installed:+ (replacing ${installed})}"
  case "$(uname -m)" in
    x86_64 | amd64) arch="x64"; sum="${MISE_SHA256_X64}" ;;
    aarch64 | arm64) arch="arm64"; sum="${MISE_SHA256_ARM64}" ;;
    *) echo "session-start: no pinned mise build for $(uname -m)" >&2; exit 1 ;;
  esac
  tarball="mise-${MISE_VERSION}-linux-${arch}.tar.gz"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 --retry-delay 5 --retry-all-errors \
    -o "${tmp}/${tarball}" \
    "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/${tarball}"
  echo "${sum}  ${tmp}/${tarball}" | sha256sum -c --quiet - \
    || { echo "session-start: ${tarball} does not match its pinned checksum" >&2; exit 1; }
  tar -xzf "${tmp}/${tarball}" -C "$tmp"
  install -D -m 0755 "${tmp}/mise/bin/mise" "${HOME}/.local/bin/mise"
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
