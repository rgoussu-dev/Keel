#!/bin/sh
# Cuts CHANGELOG.md for a release: moves the [Unreleased] body verbatim
# into docs/releases/CHANGELOG.<version>.md, leaves a fresh empty
# [Unreleased], and prepends the release to the ## Releases index.
# Deterministic: same tree and arguments, same output. Refuses to cut
# twice.
#
#   scripts/cut-changelog.sh <version> [YYYY-MM-DD]
#
# POSIX sh + awk only, deliberately: a release is cut from a checkout
# of this project, which is not guaranteed to have Node, jq or Python
# on it. Run it from the repository root.
set -eu

version=${1:-}
date=${2:-$(date -u +%Y-%m-%d)}

die() {
  printf 'cut-changelog: %s\n' "$1" >&2
  exit 1
}

if [ -z "$version" ]; then
  die 'usage: scripts/cut-changelog.sh <version> [YYYY-MM-DD]'
fi
if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$'; then
  die "'$version' is not a semantic version"
fi
if [ ! -f CHANGELOG.md ]; then
  die 'no CHANGELOG.md here — run me from the repository root'
fi

target="docs/releases/CHANGELOG.$version.md"
if [ -e "$target" ]; then
  die "$target already exists — this cut has already run"
fi
if ! grep -q '^## \[Unreleased\]$' CHANGELOG.md; then
  die 'CHANGELOG.md has no ## [Unreleased] heading'
fi
if ! grep -q '^## Releases$' CHANGELOG.md; then
  die 'CHANGELOG.md has no ## Releases heading'
fi

# Three slices of the file: everything up to and including the
# [Unreleased] heading, the body under it, and the index rows under
# ## Releases. Link refs at the foot belong to none of them — they are
# rewritten from the versions, not carried.
slice() {
  awk -v want="$1" '
    BEGIN { where = "head" }
    /^## \[Unreleased\]$/ { if (want == "head") print; where = "body"; next }
    /^## Releases$/       { where = "index"; next }
    /^\[[^]]+\]: /        { where = "refs" }
    where == want         { print }
  ' CHANGELOG.md
}

# Command substitution drops trailing newlines; the sed drops leading
# blank lines, so each slice is exactly its own content.
head=$(slice head)
body=$(slice body | sed -e '/./,$!d')
index=$(slice index | sed -e '/./,$!d')

if [ -z "$(printf '%s' "$body" | tr -d '[:space:]')" ]; then
  die '[Unreleased] is empty — nothing to cut'
fi

# The repository URL, for the compare links. Derived from the remote
# rather than configured: the remote is where the tags actually are.
# No remote means no links, never a wrong link.
repo=$(git config --get remote.origin.url 2>/dev/null || true)
case "$repo" in
  git@*) repo="https://$(printf '%s' "$repo" | sed -e 's|^git@||' -e 's|:|/|')" ;;
  ssh://git@*) repo=$(printf '%s' "$repo" | sed -e 's|^ssh://git@|https://|') ;;
esac
repo=${repo%.git}
case "$repo" in
  https://*) ;;
  *) repo='' ;;
esac

previous=$(printf '%s\n' "$index" | sed -n 's|^- \[\([^]]*\)\].*|\1|p' | sed -n 1p)

link=''
if [ -n "$repo" ]; then
  if [ -n "$previous" ]; then
    link="$repo/compare/v$previous...v$version"
  else
    link="$repo/releases/tag/v$version"
  fi
fi

mkdir -p docs/releases
{
  printf '## [%s] — %s\n\n%s\n' "$version" "$date" "$body"
  if [ -n "$link" ]; then
    printf '\n[%s]: %s\n' "$version" "$link"
  fi
} > "$target"

{
  printf '%s\n' "$head"
  printf '\n## Releases\n\n'
  printf -- '- [%s](%s) — %s\n' "$version" "$target" "$date"
  if [ -n "$index" ]; then
    printf '%s\n' "$index"
  fi
  if [ -n "$repo" ]; then
    printf '\n[Unreleased]: %s/compare/v%s...HEAD\n' "$repo" "$version"
  fi
} > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md

printf 'cut %s (compare base: %s)\n' "$target" "${previous:-none}"
