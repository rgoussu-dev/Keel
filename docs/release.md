# Release process

For maintainers of `@rgoussu.dev/keel`.

## Cutting a release

1. Bump `version` in `package.json` (SemVer; prerelease identifier
   `alpha`, `beta`, or `rc` — omit for a stable release).
2. Cut the changelog — `node scripts/cut-changelog.mjs x.y.z`. It
   moves the `[Unreleased]` body verbatim into
   `docs/releases/CHANGELOG.x.y.z.md` with its own compare link,
   leaves a fresh empty `[Unreleased]`, and prepends the release to
   the root's `## Releases` index. (The root file follows
   [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
   with one deliberate deviation: released sections live one file per
   release under `docs/releases/`, the split Kubernetes and Node.js
   use. A cut file is frozen once its version is tagged.)
3. Commit with a Conventional Commit: `chore(release): vX.Y.Z`.
4. Tag and push:

   ```sh
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

## What the workflow does

`.github/workflows/release.yml` runs on the `v*` tag push:

- verifies the tag matches `package.json`,
- verifies `docs/releases/CHANGELOG.x.y.z.md` exists and is non-empty
  (a tag pushed without the cut refuses to publish),
- reruns lint / typecheck / test / build,
- publishes to npm with `--provenance --access public`, dist-tag
  derived from the prerelease identifier:

  | Identifier | npm dist-tag |
  | ---------- | ------------ |
  | `alpha`    | `alpha`      |
  | `beta`     | `beta`       |
  | `rc`       | `next`       |
  | _none_     | `latest`     |

  Any other identifier is a **hard error**.

- creates a GitHub Release whose body is the release's changelog file
  plus auto-generated notes (marked prerelease for non-`latest`
  dist-tags).

## Requirements

- Repository secret `NPM_TOKEN`: an npm automation token with publish
  rights on `@rgoussu.dev/keel`.
- Provenance is enabled via the workflow's `id-token: write`
  permission.
- Direct pushes to `main` are reserved for `chore(release)` tags —
  everything else goes through a PR.

There is also a `/release` Claude Code skill in this repository that
walks the checklist.

## Related

- [Development guide](development.md) · [CONTRIBUTING](../CONTRIBUTING.md)
