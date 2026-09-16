# keel — contributor guide for coding agents

This is the source repository for `@rgoussu.dev/keel`, the universal
Claude Code workflow kit. Everything in this file applies to **working
on keel itself**; projects that _consume_ keel get the binding spec in
[`assets/project/AGENTS.md`](assets/project/AGENTS.md).

keel is **project-scoped**: everything it installs lands inside the
target project — the user's home directory (`~/.claude`) is never
touched. This file follows the [AGENTS.md](https://agents.md)
convention, the same one keel's per-directory documents use; `CLAUDE.md`
beside each is a one-line pointer importing it, and nothing but the
pointer ever goes there.

## Binding spec

[`assets/project/AGENTS.md`](assets/project/AGENTS.md) is the source of
truth for the conventions every keel-scaffolded project follows — and
**keel dogfoods them.** Any change to this repo must conform: hexagonal
architecture with the dependency rule enforced; business logic as
Command/Query data through one dispatch seam (a registry Mediator here,
handlers self-declaring via `supports()`, never an injected `Map`); tests
as Scenario + Factory + port with fakes, never mocks; walking skeleton
first; XP + SOLID + 12-Factor; always latest stable; TSDoc on every
exported symbol, and no comments on private code unless the "why" is
non-obvious. Read that file when in doubt. The rest of this one is the
**repo-specific additions and exceptions**.

This root is held to the same ≤ 120 lines keel emits, by
`tests/repo-docs.test.ts`. Depth goes in the directory it binds to.

<!-- keel:map:begin -->

**Map** — every directory with notes of its own; read the one for the directory you work in.

- [`.github/`](.github/AGENTS.md) — CI jobs, the report-only workflows, release and supply chain, the PR workflow
- [`assets/`](assets/AGENTS.md) — everything shipped to a scaffold: template trees, the binding spec, the `keel ui` page, version pins
- [`docs/`](docs/AGENTS.md) — the depth behind the README, and the split-changelog convention
- [`src/application/cli/`](src/application/cli/AGENTS.md) — primary adapter #1, the `keel` binary; presentation and wiring, no logic
- [`src/application/web/`](src/application/web/AGENTS.md) — primary adapter #2, `keel ui`; the loopback guards live here
- [`src/domain/contract/`](src/domain/contract/AGENTS.md) — commands, composition and stack vocabulary, harness seams, manifest schemas, the ports
- [`src/domain/core/`](src/domain/core/AGENTS.md) — the engine, the composition adapters and verticals, the stack presets, the handlers
- [`src/domain/kernel/`](src/domain/kernel/AGENTS.md) — Action/Command/Query, Result, Handler, Mediator; depends on nothing
- [`src/domain/toolchain/`](src/domain/toolchain/AGENTS.md) — the provisioning bounded context, its own hexagon
- [`src/infrastructure/`](src/infrastructure/AGENTS.md) — one directory per port, real adapter and canonical fake side by side
- [`tests/`](tests/AGENTS.md) — how a test is built, the guard suites, mutation testing
<!-- keel:map:end -->

`bin/keel.js` is the npm bin entry → `dist/application/cli/executable`.
`.dependency-cruiser.cjs` is the dependency rule, enforced in `pnpm lint`.

## Dev commands

Node 22+, pnpm 10+.

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests + assets/web + evals) + prettier --check . + depcruise src
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:e2e      # vitest run tests/e2e (opt in with KEEL_RUN_E2E=1)
pnpm test:mutation # stryker over src/domain (report-only; hours cold, minutes warm)
pnpm test:watch    # vitest watch
pnpm build         # tsc -p tsconfig.build.json → dist/
pnpm format        # prettier --write .
pnpm keel <args>   # build + run the CLI in a scratch playground
```

`pnpm lint` covers eslint, prettier and dependency-cruiser, so formatting
drift and dependency-rule violations fail the same gate as code style. A
Claude `PreToolUse` hook (`.claude/hooks/pre-commit-format.sh`) runs
`pnpm format`, re-stages previously-staged files before every
Claude-issued `git commit`, then verifies `pnpm lint` — so you almost
never run `pnpm format` by hand, and a lint failure after the
auto-correct blocks the commit.

**Before claiming a task done: run `pnpm lint`, `pnpm typecheck` and
`pnpm test`. If the environment prevents running them, say so explicitly
rather than asserting success.**

The CLI is intentionally thin: `keel new --stack=<id>` for greenfield
bootstrap, `keel add <vertical>` for brownfield layering. Local loops
(`pnpm keel`, the `npm pack` tarball) are in `docs/development.md` →
"Trying keel locally".

## Working agreements

- **Conventional Commits**, types `feat` · `fix` · `refactor` · `docs` ·
  `test` · `chore` · `ci` · `build` · `perf`; scopes encouraged
  (`fix(composition):`, `feat(cli):`). One commit = one logical unit —
  never refactor + feature + fix together — and every commit passes
  `pnpm lint && pnpm typecheck && pnpm test` on its own.
- **Feature branches and PRs are keel's one deviation** from the binding
  spec's pure trunk-based rule, because contributions land via Claude
  Code cloud sessions. The branch name is assigned by the harness; every
  PR targets `main`. Rules and the PR review loop:
  [`.github/`](.github/AGENTS.md).
- **A change updates its docs in the same commit.** A new stack,
  vertical or CLI flag touches the matching `docs/` page and the README
  matrix; every user-visible change gets a `CHANGELOG.md` `[Unreleased]`
  entry; a new e2e suite goes into a shard in `ci.yml`. Four guard tests
  in `verify` exist because each of those indexes rots silently
  otherwise — see [`tests/`](tests/AGENTS.md).
- **Extract knowledge to the nearest document.** A non-obvious discovery
  about this repo goes into the `AGENTS.md` of the directory it is about,
  and gets a map row here if that directory had none. It does not go in
  a chat message, and it does not go here.
- The remaining working agreements — Active Partner, Chain of Small
  Steps, No Perfect Recall, Noise Cancellation, the Canary signal — are
  the binding spec's, unchanged.
