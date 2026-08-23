# Contributing to keel

Thanks for considering a contribution! keel is small on purpose — the
composition engine stays thin, and most contributions are new
**adapters**, **verticals**, or **stacks** (plus their docs and
tests). This page covers the workflow; the technical side lives in the
[development guide](docs/development.md).

## The workflow: fork → branch → PR

Contributions land through **forks**:

1. **Fork** the repository on GitHub and clone your fork.
2. **Branch** off `main` in your fork (any descriptive name is fine).
3. **Develop** — see the [development guide](docs/development.md) for
   the dev loop and repository layout. Every commit must pass on its
   own:

   ```sh
   pnpm lint && pnpm typecheck && pnpm test
   ```

4. **Commit** following
   [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
   — one commit = one logical unit; never mix refactor + feature +
   fix. Types used here: `feat`, `fix`, `refactor`, `docs`, `test`,
   `chore`, `ci`, `build`, `perf`. Scopes are encouraged:
   `feat(walking-skeleton): …`, `fix(composition): …`.
5. **Open a pull request** against `rgoussu-dev/Keel:main`. The
   description needs a `## Summary` and a `## Test plan` — the test
   plan is a real list of things to verify post-merge, not a
   restatement of the changes.

CI (lint, typecheck, test, build on Node 22 and 24) must be green.
History on `main` stays linear — PRs are squash- or rebase-merged, and
the branch is deleted after merge.

## What a change must conform to

keel **dogfoods its own binding spec** —
[`assets/project/AGENTS.md`](assets/project/AGENTS.md). In short:

- Hexagonal architecture; the dependency rule is enforced by
  dependency-cruiser in `pnpm lint`.
- Business logic as Command/Query data through the registry Mediator.
- Tests = Scenario + Factory + port interface; **fakes, never mocks**.
- TSDoc on every exported symbol; no comments on private code unless
  the "why" is non-obvious.
- Every user-visible change gets a `CHANGELOG.md` entry under
  `[Unreleased]` (Keep a Changelog 1.1.0).

Conventions for coding agents working in this repo are in
[`AGENTS.md`](AGENTS.md).

## Good first contributions

- A new **stack** — an entry in `src/domain/core/stack-presets.json`
  (plus its row in `tests/domain/core/stack-registry.golden.json`)
  once the adapters exist.
- A sibling **adapter** filling a `⛔` cell of the
  [compatibility matrix](docs/verticals/README.md#compatibility-matrix)
  (e.g. distribution for Go/Rust CLIs).
- A [roadmap](docs/roadmap.md) item.

When in doubt, open an issue first and sketch the tags, predicate, and
dimensions your idea would use — it makes the review conversation
concrete.

## Releases

Maintainers only — see the [release process](docs/release.md).
