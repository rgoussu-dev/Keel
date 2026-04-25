# keel

Universal Claude Code workflow kit. Opinionated defaults for hexagonal
architecture, trunk-based development, XP, and schematics-driven scaffolding.

[![CI](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/ci.yml)
[![Release](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/release.yml/badge.svg)](https://github.com/rgoussu-dev/Claude-workspace/actions/workflows/release.yml)

---

## Why keel

Claude Code is much more useful when it shares your team's conventions.
keel ships a curated, opinionated set of those conventions — architecture,
testing, workflow, infra — as a Claude Code project bundle: a `CLAUDE.md`
binding spec, on-demand skills, agents, slash commands, hooks, and
permission/env defaults. One command installs the bundle into your
project; subsequent updates merge cleanly with anything you've customized.

**keel is project-scoped only.** It installs into `<project>/.claude/` and
never reads, writes, or otherwise touches `~/.claude` or any other global
Claude Code configuration. Everything keel adds is checked into your
repository, so the configuration travels with the code and is identical
for every contributor and every Claude Code session.

---

## Quickstart

Run from the root of the project you want to add keel to:

```sh
npx @rgoussu.dev/keel install
```

That writes the kit into `<cwd>/.claude/`:

```
.claude/
├── CLAUDE.md              # binding spec (architecture, tests, workflow)
├── settings.json          # permissions, env vars, hooks
├── .keel-manifest.json    # tracks which files keel owns
├── agents/                # adr, learn, pr-reviewer, tdd-guardian
├── commands/              # /commit, /sync, /diff-review, /docs-check
├── conventions/           # languages.json — per-language toolchain matrix
├── hooks/                 # format-on-edit, pre-commit-verify, …
└── skills/                # hexagonal-review, mediator-pattern, …
```

Commit the directory. Open the project in Claude Code. Done — Claude now
operates under the keel conventions.

---

## CLI

| Command                                 | What it does                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `keel install`                          | Install the kit into `<cwd>/.claude/`. Refuses if a manifest already exists.            |
| `keel install --force`                  | Reinstall, overwriting any kit-owned files (and the manifest).                          |
| `keel install --dry-run`                | Print every file the install would create. Writes nothing.                              |
| `keel update`                           | Upgrade an existing install to the latest kit version. Prompts on conflict.             |
| `keel update --yes`                     | Non-interactive update. User-modified files are kept; the rest is upgraded silently.    |
| `keel update --dry-run`                 | Print the update plan. Writes nothing.                                                  |
| `keel doctor`                           | Audit `<cwd>/.claude/` for drift (missing, modified, foreign files). Non-zero on issue. |
| `keel generate <schematic>` (alias `g`) | Run a registered schematic. See `Schematics` below.                                     |

All commands operate on the current working directory's `.claude/`.
There is no `--global` flag and no path under `$HOME` is ever touched.

### Updates and conflicts

`keel update` does a three-way merge between (a) what was shipped at
your last install, (b) the file currently on disk, and (c) what the new
kit ships:

- File unchanged since install → silently upgraded to the new version.
- File you've edited and the kit also changed → conflict. Interactively
  you get **keep / overwrite / show diff**; with `--yes` your version is
  kept (safe default).
- File you've edited but the kit did not change → kept as-is.
- File previously shipped, no longer shipped, untouched by you → removed.
- File previously shipped, no longer shipped, edited by you → kept,
  un-tracked, with a warning.

The manifest (`<project>/.claude/.keel-manifest.json`) records both the
hash that was shipped and the hash currently on disk for every kit-owned
file, which is what makes the three-way reconciliation possible. Don't
hand-edit it.

### Schematics

`keel generate <name>` (alias `keel g`) runs a registered schematic.
Currently shipped:

- `port` — secondary port + fake module + contract test (4 files).
- `scenario` — Scenario + Factory + Test triad in the domain test tree.
- `walking-skeleton` — multi-module Gradle shell, kernel + contract +
  core split, IaC stub, composes `port` for a starter secondary port.
- `git-init`, `gradle-wrapper`, `executable-rest`, `iac-cloudrun`,
  `ci-github` — supporting fragments.

Pass parameters with `--set k=v` (repeatable). Use `--dry-run` to preview.

---

## What ships in the kit

### `CLAUDE.md` — the binding spec

Hexagonal architecture (three-module DAG: `kernel ← contract ← core`),
Command/Query + Mediator, fakes-not-mocks tests with Scenario + Factory,
walking skeleton first, OpenTofu IaC, trunk-based + XP, public-API docs.
Source of truth: [`assets/project/CLAUDE.md`](assets/project/CLAUDE.md).

### `settings.json` — permissions, env, hooks

- **Permissions**: pre-allows the toolchains keel knows about (git
  read-only, pnpm/npm, Gradle, Cargo, Go, OpenTofu, rg/fd/tree, GitHub
  MCP read tools); ask-lists destructive operations (`git push`,
  `git reset`, `tofu apply`, GitHub MCP write tools); denies force-push,
  `git reset --hard`, `sudo`, `rm -rf /`.
- **Env**: `KEEL_ENFORCE_HEXAGONAL`, `KEEL_ENFORCE_TRUNK_BASED`,
  `KEEL_ENFORCE_PUBLIC_API_DOCS`.
- **Hooks**: `PostToolUse` formats files on every edit; `PreToolUse`
  runs typecheck/test/docs-check before `git commit`; `SessionStart`
  prints branch and dirty state; `Stop` reminds about commit discipline.

### Skills (on-demand)

Loaded by Claude Code only when relevant: `hexagonal-review`,
`mediator-pattern`, `test-scenario-pattern`, `walking-skeleton-guide`,
`iac-opentofu`, `trunk-based-xp`, `public-api-docs`.

### Agents

`tdd-guardian`, `pr-reviewer`, `learn`, `adr`. Adapted from
[`citypaul/.dotfiles`](https://github.com/citypaul/.dotfiles) (MIT) — see
[`THIRD_PARTY_LICENSES/`](./THIRD_PARTY_LICENSES/) for provenance.

### Slash commands

`/commit`, `/sync`, `/diff-review`, `/docs-check`.

### Language conventions

`conventions/languages.json` is the canonical per-language toolchain
matrix (formatter, linter, typecheck, test, mutation, doc-comment style)
that the hooks, agents, and slash commands consult. Edit it to teach the
kit about a language it doesn't yet know, or to override defaults for
your project.

---

## Customizing your install

Anything under `.claude/` is yours to edit. The next `keel update`
detects the edit (via the SHA recorded in the manifest) and:

- if the kit hasn't changed that file, leaves your version alone;
- if the kit has changed it, treats it as a conflict and asks (or keeps
  your version, with `--yes`).

Deleting a kit-tracked file is **not** a way to opt out of it: on the
next `keel update`, keel sees the file is missing and reinstalls it
(it's still a shipped file). To genuinely drop a shipped file, the
kit itself has to stop shipping it; once that happens, an unmodified
local copy is removed by `update`, and a modified local copy is kept
but un-tracked.

To go further off-piste, add your own files alongside the kit's. Files
keel has never installed are untouched by `update` and reported as
`foreign` by `doctor` (non-zero exit) when they sit inside a managed
directory (`hooks/`, `commands/`, `skills/`, `agents/`, `conventions/`).
Put your own files outside those directories — anywhere else under
`.claude/` — to avoid that warning.

---

## Principles

The four-line summary; the binding version is in
[`assets/project/CLAUDE.md`](assets/project/CLAUDE.md).

- Hexagonal always (domain / application / infrastructure / interface),
  three-module DAG: `domain/kernel ← domain/contract ← domain/core`.
- Command/Query + Mediator: sealed bases and Mediator interface in
  `domain/kernel`; concrete commands in `domain/contract`; Mediator
  implementation (`RegistryMediator`) and handlers in `domain/core`.
- Tests: Scenario + Factory + fakes (never mocks), DIP-strict.
- Walking skeleton first. IaC via OpenTofu.
- Trunk-based, Conventional Commits, XP, SOLID, 12-Factor.
- Always latest stable (langs: latest LTS; frameworks: latest stable).

---

## Development

For working on keel itself. Requirements: Node 20+ and pnpm 9+.

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
  schematics/    # port, scenario, walking-skeleton, …
  util/
assets/
  project/       # → <project>/.claude/ (CLAUDE.md, settings, hooks,
                 #   commands, agents, skills, conventions)
  schematics/    # schematic templates (ejs)
tests/           # vitest (Scenario + Factory + fakes)
```

Conventions for contributing to keel itself are in the root
[`CLAUDE.md`](./CLAUDE.md).

---

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

---

## Acknowledgments

keel's TDD-first agent and skill methodology is being progressively informed
by [`citypaul/.dotfiles`](https://github.com/citypaul/.dotfiles) by Paul
Hammond, licensed under MIT. Each file derived from that work carries a
provenance header pointing back to the upstream commit it was lifted from;
the audit trail and the upstream license are kept under
[`THIRD_PARTY_LICENSES/`](./THIRD_PARTY_LICENSES/).

## License

MIT. See [`LICENSE`](./LICENSE). Third-party material under
[`THIRD_PARTY_LICENSES/`](./THIRD_PARTY_LICENSES/).
