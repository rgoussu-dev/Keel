# Agent conventions — tests

<!-- keel:purpose: how a test is built, the guard suites, mutation testing -->

What lives here: vitest suites mirroring `src/` (`domain/`, `contract/`
pieces under it, `application/`, `infrastructure/`, `toolchain/`), the
shared test `support/factory.ts`, the browser harness both `keel ui`
suites drive (`support/ui-e2e.ts`), the fixture trees under
`support/fixtures/`, the fixture plugins the `plugins/` suite loads from
disk, and the guard tests that keep this repo's registries honest.

<!-- keel:children:begin -->

**Inside** — the directories below with notes of their own.

- [`tests/e2e/`](e2e/AGENTS.md) — the real-toolchain grid: which cells exist, how they shard, what they cost
<!-- keel:children:end -->

## How a test is built

- Follow the Scenario + Factory + port pattern from
  `assets/project/AGENTS.md §3`. A test depends on a Scenario (data), a
  Factory (wires the SUT with fakes) and the port interface under test —
  never on a concrete adapter, a concrete handler, or a mocking library.
  **No mocking libraries. Build fakes directly**; the fake shipped beside
  each port in `src/infrastructure/<port>/` is the canonical reference
  implementation of that port's contract.
- Every public API change is accompanied by a test change.
- Test files mirror the `src/` structure. `pnpm test` runs everything
  here; `tests/e2e/` self-skips unless `KEEL_RUN_E2E=1`.

## The guard tests

Four suites in `verify` exist because an index nobody checks rots
silently. They check structure, never content, and they are the reason a
matching change lands in the same commit as the thing it guards:

- `ci-workflow.test.ts` — the `e2e` shard matrix against `tests/e2e/`. A
  suite in no shard never runs, and that looks exactly like a suite that
  passed.
- `version-pins.test.ts` — `assets/composition/version-pins.json` against
  the templates. Extend the registry, never the sweep's blind spots; see
  [`assets/`](../assets/AGENTS.md).
- `changelog.test.ts` — the split changelog's shape: every release file
  has an index row, every index row a file, no released section back in
  the root. See [`docs/`](../docs/AGENTS.md).
- `repo-docs.test.ts` — this repository's own harness: the root
  `AGENTS.md` budget, its `keel:map` rows against the per-directory
  documents, and the sibling `CLAUDE.md` pointer beside each one. keel
  preaches a ≤ 120-line root; this is what keeps it one.
- `mise-toolchain.test.ts` and `toolchain-pins.test.ts` — `mise.toml`
  against the shard matrix's tool lists and against `GRADLE_VERSION`.

## Mutation testing

Stryker runs over `src/domain` with the vitest runner —
`pnpm test:mutation`, report-only until the baseline settles. It runs on
`main`, not on PRs, so a surviving mutant never blocks unrelated work.
Scope, the static-mutant exception and the CI shape are in
`docs/development.md` → Mutation testing; the workflow's posture is in
[`.github/`](../.github/AGENTS.md).
