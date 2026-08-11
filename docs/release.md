# Release process

For maintainers of `@rgoussu.dev/keel`.

## Cutting a release

1. Bump `version` in `package.json` (SemVer; prerelease identifier
   `alpha`, `beta`, or `rc` — omit for a stable release).
2. Update `CHANGELOG.md` — move items from `[Unreleased]` under a new
   `[x.y.z] — YYYY-MM-DD` heading
   ([Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)),
   add a fresh empty `[Unreleased]`, and update the link references at
   the bottom.
3. Commit with a Conventional Commit: `chore(release): vX.Y.Z`.
4. Tag and push:

   ```sh
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

## What the workflow does

`.github/workflows/release.yml` runs on the `v*` tag push:

- verifies the tag matches `package.json`,
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

- creates a GitHub Release with auto-generated notes (marked
  prerelease for non-`latest` dist-tags).

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
