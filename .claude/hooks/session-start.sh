#!/bin/bash
#
# Brings a Claude Code on the web session's toolchain up to what this
# repo's e2e suites actually need, so the first JVM suite of a session
# does not fail on the box rather than on the code.
#
# Two things are wrong out of the box:
#
#   - The image ships Gradle 8.14.3, and Gradle 8.x **cannot start** on
#     JDK 25 — it fails with the version string as the whole error
#     message. The emitted projects target release 25 and `JAVA_HOME`
#     is pinned to 25 in `.claude/settings.json`, so the host Gradle
#     has to move rather than the JDK. That is the same coupling
#     `.github/workflows/ci.yml` documents, and this hook is what keeps
#     the box matching CI instead of drifting from it.
#   - `node_modules` is absent, so `pnpm lint` fails with a missing
#     `@eslint/js` before it lints anything.
#
# Idempotent: a warm container re-runs this in well under a second,
# because the version check is a filesystem test and pnpm no-ops.
#
set -euo pipefail

# Local sessions have their own toolchains; only the remote image needs
# fixing, and this must never reach into a developer's /opt.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$repo"

# JDK 25, and this is load bearing rather than tidy. The Maven e2e
# suites skip themselves when `JAVA_HOME` is older — Maven compiles
# with whatever JDK runs it, and the emitted projects target release
# 25 — so a stale JAVA_HOME does not fail the Maven half of the
# modulith grid, it silently runs none of it. A skipped suite reads
# exactly like a passing one.
#
# `.claude/settings.json` sets this too, and on its own that is not
# enough: the image's shell profile exports JAVA_HOME=21 and wins, so
# a session lands on 21 despite the setting. `$CLAUDE_ENV_FILE` is the
# mechanism that applies per session, so write it there as well and
# keep the setting as a second line of defence.
if [ -d /usr/lib/jvm/java-25-openjdk-amd64 ]; then
  export JAVA_HOME=/usr/lib/jvm/java-25-openjdk-amd64
  export PATH="${JAVA_HOME}/bin:${PATH}"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export JAVA_HOME=/usr/lib/jvm/java-25-openjdk-amd64' >> "$CLAUDE_ENV_FILE"
    echo 'export PATH="${JAVA_HOME}/bin:${PATH}"' >> "$CLAUDE_ENV_FILE"
  fi
else
  echo "session-start: WARNING no JDK 25 at /usr/lib/jvm/java-25-openjdk-amd64;" >&2
  echo "  every Maven e2e suite will skip itself, which looks like passing." >&2
fi

# ---------------------------------------------------------------------
# Gradle
# ---------------------------------------------------------------------

# The version keel tells every generated wrapper to use is the one the
# host must run, so read it from there rather than adding a third copy
# of the number to keep in sync (ci.yml's pin is the second, and it
# exists to match this same constant).
wrapper_src='src/domain/core/adapters/gradle-wrapper.ts'
version="$(sed -n "s/^const GRADLE_VERSION = '\([^']*\)';/\1/p" "$wrapper_src" | head -1)"
if [ -z "$version" ]; then
  echo "session-start: could not read GRADLE_VERSION from $wrapper_src" >&2
  exit 1
fi

# Distribution hashes, keyed by version, each checked against Gradle's
# published SHA-256 before being added — see `docs/development.md` for
# how, since the sandbox cannot fetch them itself.
declare -A GRADLE_SHA256=(
  [9.4.1]='2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb'
)

target="/opt/gradle-${version}"

if [ ! -x "${target}/bin/gradle" ]; then
  echo "session-start: installing Gradle ${version}"
  zip="$(mktemp -t "gradle-${version}-XXXXXX.zip")"
  trap 'rm -f "$zip"' EXIT

  # services.gradle.org, not downloads.gradle.org: the latter is not on
  # the proxy allowlist, while this URL redirects to a host that is.
  curl -fsSL --retry 3 --retry-delay 5 --retry-all-errors \
    -o "$zip" \
    "https://services.gradle.org/distributions/gradle-${version}-bin.zip"

  expected="${GRADLE_SHA256[$version]:-}"
  if [ -n "$expected" ]; then
    actual="$(sha256sum "$zip" | cut -d' ' -f1)"
    if [ "$actual" != "$expected" ]; then
      echo "session-start: checksum mismatch for gradle-${version}-bin.zip" >&2
      echo "  expected ${expected}" >&2
      echo "  actual   ${actual}" >&2
      exit 1
    fi
  else
    # Loud rather than fatal: bumping GRADLE_VERSION should not brick
    # every web session, but it must not install unpinned bytes
    # quietly either.
    echo "session-start: WARNING no pinned checksum for Gradle ${version}." >&2
    echo "  Verify against https://gradle.org/release-checksums/ and add it" >&2
    echo "  to GRADLE_SHA256 in $(basename "${BASH_SOURCE[0]}")." >&2
  fi

  rm -rf "$target"
  unzip -q "$zip" -d /opt/
fi

# `/opt/gradle/bin` is already on PATH in this image and `/opt/gradle`
# is a symlink, so repointing it is the whole switch — no PATH edit,
# and `gradle` resolves to the new version immediately.
ln -sfn "$target" /opt/gradle

# …unless a future image drops that from PATH, in which case say so and
# put it back, rather than leaving the wrong `gradle` winning silently.
if [ "$(command -v gradle || true)" != '/opt/gradle/bin/gradle' ]; then
  echo "session-start: /opt/gradle/bin is not first on PATH; prepending it"
  export PATH="/opt/gradle/bin:${PATH}"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="/opt/gradle/bin:${PATH}"' >> "$CLAUDE_ENV_FILE"
  fi
fi

# A wrong Gradle here costs a JVM build to discover, so prove it now.
if ! gradle --version 2>/dev/null | grep -qx "Gradle ${version}"; then
  echo "session-start: expected Gradle ${version}, got:" >&2
  gradle --version >&2 || true
  exit 1
fi

# ---------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------

# Not `--frozen-lockfile`: the container is snapshotted after this hook,
# so a warm start should reuse the store rather than reinstall, and a
# lockfile drift should not stop a session from starting at all — CI is
# where that is enforced.
pnpm install

# `grep -o` rather than a field cut: JAVA_TOOL_OPTIONS makes the JVM
# print a "Picked up …" line first, which shifts every column.
jdk="$("${JAVA_HOME}/bin/javac" -version 2>&1 | grep -om1 'javac [0-9][^ ]*' | cut -d' ' -f2)"
mvn_version="$(mvn --version 2>/dev/null | grep -om1 'Apache Maven [0-9][^ ]*' || echo 'Maven absent')"
echo "session-start: ready — JDK ${jdk}, Gradle ${version}, ${mvn_version}"
