---
name: release
description: |
  Use when cutting a release of the keel package. TRIGGER on requests
  like "release X.Y.Z", "cut a release", or "what do I need to do for
  the release". SKIP for consumer-project release questions.
---

# release

Keel releases are cut by bumping `package.json`, cutting the changelog
with `scripts/cut-changelog.mjs`, committing, tagging, and pushing the
tag. The GitHub Actions release workflow does the rest.

## Dist-tag mapping

| Prerelease identifier | npm dist-tag |
| --------------------- | ------------ |
| `alpha`               | `alpha`      |
| `beta`                | `beta`       |
| `rc`                  | `next`       |
| _(none)_              | `latest`     |
| anything else         | hard error   |

## Checklist

1. **`package.json`** — bump `version` to the target version (e.g.
   `0.2.0-alpha`).

2. **Changelog** — run the cut script:

   ```sh
   node scripts/cut-changelog.mjs X.Y.Z
   ```

   It moves the `[Unreleased]` body verbatim into
   `docs/releases/CHANGELOG.X.Y.Z.md` with its own compare link
   (against the previous release in the index), leaves a fresh empty
   `## [Unreleased]`, prepends the release to the `## Releases` index,
   and retargets the `[Unreleased]` compare ref. It refuses to cut the
   same version twice. `tests/changelog.test.ts` verifies the
   resulting shape in the fast gate.

3. **Commit** — one commit containing only `package.json`,
   `CHANGELOG.md`, and `docs/releases/CHANGELOG.X.Y.Z.md`:

   ```
   chore(release): vX.Y.Z
   ```

   Any other fixes that belong in the release (e.g. a missing schema
   file) must be committed **before** the release commit, as their own
   logical unit, so the release commit is always a clean three-file
   change.

4. **Tag** — `git tag vX.Y.Z` on the release commit.

5. **Push the tag** — `git push origin vX.Y.Z`. The release workflow
   triggers on `v*` tag pushes; confirm with the user before pushing.

## What the release workflow does

`.github/workflows/release.yml` (triggered by the tag push):

1. Verifies the tag name matches the `version` field in `package.json`.
2. Verifies `docs/releases/CHANGELOG.X.Y.Z.md` exists and is non-empty —
   a tag pushed without the cut refuses to publish.
3. Reruns `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
4. Publishes to npm with `--provenance --access public`.
5. Creates a GitHub Release whose body is the release's changelog file,
   with auto-generated notes appended.

Required secret: `NPM_TOKEN`.

## Anti-patterns

- Mixing a fix commit with the release commit. Keep them separate so
  git history is clean and the tag points to an unambiguous three-file
  diff.
- Cutting the changelog by hand. `scripts/cut-changelog.mjs` is the
  single implementation of the split — a hand-made release file drifts
  from the shape `tests/changelog.test.ts` and the release workflow
  expect.
- Editing a release file after its version is tagged — cut files are
  frozen; corrections go in `[Unreleased]`.
- Essay-length changelog entries. Released entries should be
  scannable — a bolded claim and a few lines, not essays.
- Pushing the tag without confirming with the user — the workflow
  triggers immediately and publishes to npm.
