# keel

Universal Claude Code workflow kit. Opinionated defaults for hexagonal
architecture, trunk-based development, XP, and schematics-driven scaffolding.

[![CI](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/ci.yml)
[![Release](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/release.yml/badge.svg)](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/release.yml)

## What it installs

- **Global** (`~/.claude/`): `CLAUDE.md`, `settings.json`, skills, commands — shared across projects.
- **Project** (`<project>/.claude/`): hooks, per-project settings, slash commands — checked in per repo.

## Install into a project

```sh
npx @rgoussu.dev/keel install          # installs into current project
npx @rgoussu.dev/keel install --global # installs universal defaults into ~/.claude
npx @rgoussu.dev/keel update           # re-sync with new kit versions, migrating as needed
npx @rgoussu.dev/keel doctor           # audit the installation
npx @rgoussu.dev/keel generate <name>  # run a schematic
```

## Principles

- Hexagonal always (domain / application / infrastructure / interface).
- Command/Query + mediator in `domain/core/kernel`.
- Tests: Scenario + Factory + fakes (never mocks), DIP-strict.
- Walking skeleton first. IaC via OpenTofu.
- Trunk-based, Conventional Commits, XP, SOLID, 12-Factor.
- Always latest stable (langs: latest LTS; frameworks: latest stable).

The full, binding spec of these principles is `assets/global/CLAUDE.md` — the
same file `keel install --global` copies into `~/.claude/CLAUDE.md`.

## Development

Requirements: Node 20+ and pnpm 9+.

```sh
pnpm install
pnpm lint          # eslint (flat config) + prettier --check .
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:watch    # vitest watch mode
pnpm build         # compile to dist/ via tsconfig.build.json
pnpm format        # prettier --write .
```

Repository layout:

```
src/
  cli/           # commander entry points
  engine/        # schematics engine (Tree, Context, templates)
  installer/     # install / update / doctor / plan
  manifest/      # .keel-manifest.json read/write
  schematics/    # port, scenario, walking-skeleton
  util/
assets/
  global/        # → ~/.claude/
  project/       # → <project>/.claude/
  conventions/   # language toolchain matrix
  schematics/    # schematic templates (ejs)
tests/           # vitest (Scenario + Factory + fakes)
```

Conventions for contributing to keel itself are in the root `CLAUDE.md`.

## Release process

1. Bump `version` in `package.json` (SemVer prerelease identifier: `alpha`,
   `beta`, or `rc`; omit for a stable release).
2. Update `CHANGELOG.md` — move items from `[Unreleased]` under a new
   `[x.y.z] — YYYY-MM-DD` heading (Keep a Changelog 1.1.0).
3. Commit with a Conventional Commit (`chore(release): vX.Y.Z`).
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The `Release` workflow then:

- verifies the tag matches `package.json`,
- reruns lint / typecheck / test / build,
- publishes to npm with `--provenance --access public` using an npm dist-tag
  derived from the prerelease identifier (`alpha` → `alpha`, `beta` → `beta`,
  `rc` → `next`, none → `latest`; any other identifier is a hard error),
- creates a GitHub Release with auto-generated notes (marked prerelease for
  non-`latest` dist-tags).

Required repository secret: `NPM_TOKEN` (npm automation token with publish
rights on `@rgoussu.dev/keel`).

## License

MIT. See `package.json`.
