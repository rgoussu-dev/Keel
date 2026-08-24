## [0.1.0-alpha.2] — 2026-04-19

### Added

- `CI` workflow (`.github/workflows/ci.yml`): lint, typecheck, test, build on
  every pull request and push to `main`, matrixed across Node 20 and 22 with
  pnpm 9 and a pnpm cache.
- `Release` workflow (`.github/workflows/release.yml`): on `v*` tag push,
  verifies the tag matches `package.json`, reruns the full verify pipeline,
  publishes to npm with `--provenance --access public`, and creates a GitHub
  Release with auto-generated notes.
- npm dist-tag is derived from the semver prerelease identifier (`alpha` →
  `alpha`, `beta` → `beta`, `rc` → `next`, none → `latest`); unknown
  prerelease identifiers fail the release.
- `CLAUDE.md` at the project root documenting repo-specific engineering and
  workflow conventions, including the PR auto-subscribe preference for
  cloud-hosted Claude sessions.
- `.github/dependabot.yml`: weekly grouped updates for `github-actions`.
- README: CI/Release badges, `Development` section, `Release process`
  section.
- `.prettierignore` so generated files (lockfile, `dist/`, schematic
  templates, manifests) are excluded from the prettier check.
- Claude `PreToolUse` hook (`.claude/hooks/pre-commit-format.sh`) that
  auto-formats and re-stages before every `git commit`, and blocks the
  commit if lint still fails after formatting.
- `format:check` npm script that runs `prettier --check .`.

### Changed

- `pnpm lint` now also runs `prettier --check .` after eslint, so
  formatting drift fails the same gate as code-style rules.

### Security

- Pinned every GitHub Action in CI and release workflows to a full commit
  SHA with a `# vX.Y.Z` comment (`actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`, `softprops/action-gh-release`) so upstream changes
  cannot reach the publishing pipeline without review.

[0.1.0-alpha.2]: https://github.com/rgoussu-dev/Keel/releases/tag/v0.1.0-alpha
