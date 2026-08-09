# keel

Universal Claude Code workflow kit. Opinionated defaults for hexagonal
architecture, trunk-based development, XP, and composition-driven
project scaffolding.

[![CI](https://github.com/rgoussu-dev/Keel/actions/workflows/ci.yml/badge.svg)](https://github.com/rgoussu-dev/Keel/actions/workflows/ci.yml)
[![Release](https://github.com/rgoussu-dev/Keel/actions/workflows/release.yml/badge.svg)](https://github.com/rgoussu-dev/Keel/actions/workflows/release.yml)

---

## Why keel

Claude Code is much more useful when it shares your team's conventions.
keel ships a curated, opinionated set of those conventions — architecture,
testing, workflow, infra — composed into your project from a small set
of capability tags. The composition engine resolves a stack into the
right adapters, asks only the questions it needs to, and emits a
runnable project plus the agentic affordances Claude needs to work
inside it.

**keel is project-scoped only.** It writes into `<project>/.claude/`
and never reads, writes, or otherwise touches `~/.claude` or any other
global Claude Code configuration. Everything keel adds lives in your
repository, so the configuration travels with the code.

---

## Quickstart

Greenfield — bootstrap a Quarkus CLI project from scratch:

```sh
mkdir my-cli && cd my-cli
npx @rgoussu.dev/keel new --stack=quarkus-cli
```

You'll be asked for a base Java package, a project name, and an
optional `origin` git remote. The result is a hexagonal Gradle
multi-module project (`domain/contract`, `domain/core`,
`infrastructure/cli`), a Quarkus picocli entrypoint with a sample
subcommand and a Quarkus test, a sample secondary port (`Clock`) with
a fake module, an initialised git repo, and the Gradle wrapper.

Brownfield — layer an additional vertical onto an existing keel
project:

```sh
keel add distribution
```

The `distribution` vertical adds GitHub Actions workflows that
cross-compile the CLI to native binaries via GraalVM and publish them
to a GitHub Release on tag push.

---

## CLI

| Command                  | What it does                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `keel new --stack=<id>`  | Bootstrap a greenfield project from a stack preset. Today: `quarkus-cli`.                           |
| `keel new ... --yes`     | Non-interactive — use defaults for unanswered questions.                                            |
| `keel new ... --dry-run` | Print the plan without writing any file.                                                            |
| `keel new ... --set k=v` | Preset an answer as `adapterId:questionId=value` (repeatable).                                      |
| `keel add <vertical>`    | Install a vertical onto an existing keel project. Today: `vcs`, `walking-skeleton`, `distribution`. |
| `keel add ... --yes`     | Non-interactive.                                                                                    |
| `keel add ... --dry-run` | Print the plan; write nothing.                                                                      |
| `keel add ... --set k=v` | Preset an answer (same shape as `keel new`).                                                        |

All commands operate on the current working directory. There is no
`--global` flag and no path under `$HOME` is ever touched.

---

## Composition model

A keel project is composed from three primitives:

- **Tags.** Flat strings with hierarchical-dot naming —
  `lang.java`, `framework.quarkus`, `arch.cli`, `pkg.gradle`,
  `runtime.graalvm-native`, `arch.hexagonal`. Tags are facts about
  the project, captured in the manifest at install time and grown by
  adapters that promote new capabilities (via `tagsAdd`).
- **Adapters.** A single composable unit. Each adapter declares the
  tags it requires and excludes (its `predicate`), the dimensions of
  its parent vertical that it covers, any user choice points
  (`questions`), ordering hints (`after`), and a `contribute()`
  function that returns files, patches, deferred actions, agentic
  bundles, and tags to add.
- **Verticals.** Bundles of adapters under one umbrella
  (`vcs`, `walking-skeleton`, `distribution`). The resolver verifies
  that every entry in `vertical.dimensions` is covered by at least
  one matching adapter; if a dimension is uncovered after predicate
  filtering, install hard-fails with a clear message naming the gap.

A **stack preset** (`keel new --stack=<id>`) is sugar over a list of
tags + verticals — pick `quarkus-cli` and the engine seeds
`lang.java`, `framework.quarkus`, `pkg.gradle`, `arch.cli`,
`arch.hexagonal`, then composes the `vcs` and `walking-skeleton`
verticals. Adding a stack is a couple of lines in
`src/domain/core/stacks.ts`.

---

## Verticals shipped

- **`vcs`** — version control bootstrap. Initialises a git repo (with
  the requested default branch) and optionally registers an `origin`
  remote. Sticky answers, so subsequent runs don't re-ask.
- **`walking-skeleton`** — the thinnest end-to-end runnable project
  for the chosen stack. Today: a Quarkus picocli CLI on Gradle in a
  hexagonal layout, plus a sample secondary port with a fake module,
  plus the Gradle wrapper. Requires `gradle` on PATH (the wrapper is
  generated via the canonical `gradle wrapper` task, not committed
  as a binary).
- **`distribution`** — how the project ships. Today: native CLI
  binaries via GraalVM, cross-compiled in a GitHub Actions matrix
  (linux-amd64, linux-arm64, darwin-arm64) and uploaded to a GitHub
  Release on tag push. Promotes `runtime.graalvm-native` so future
  verticals can key off it.

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

For working on keel itself. Requirements: Node 22+ and pnpm 9+.

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
  domain/
    kernel/               # Command/Query, Result, Handler, Mediator
    contract/             # commands, composition vocabulary,
                          # manifest schema, ports/
    core/                 # engine + composition adapters/verticals +
                          # handlers + RegistryMediator
  application/
    cli/                  # contract/ (commander → mediator) +
                          # executable/ (composition root)
  infrastructure/         # one directory per port: real adapter +
                          # canonical fake (tree, prompt, manifest,
                          # template, process, commons)
assets/
  composition/            # adapter template trees (ejs)
tests/                    # vitest (Scenario + Factory + fakes),
                          # mirrors src/; support/factory.ts
```

keel dogfoods its own binding spec: hexagonal trisection with the
dependency rule enforced by dependency-cruiser in `pnpm lint`.

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
