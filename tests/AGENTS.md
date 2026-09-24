# Agent conventions — tests

<!-- keel:purpose: how a test is built, the guard suites, the composition grid, mutation testing -->

What lives here: vitest suites mirroring `src/` (`domain/`, `contract/`
pieces under it, `application/`, `infrastructure/`, `toolchain/`), the
shared test `support/factory.ts`, the browser harness the `keel ui`
suites drive (`support/ui-e2e.ts`), the fixture trees under
`support/fixtures/`, the fixture plugins the `plugins/` suite loads from
disk, the guard tests that keep this repo's registries honest, and the
composition grid (`domain/core/composition-grid/`).

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

## The composition grid

`domain/core/composition-grid/` sweeps keel's whole composition surface
through the real mediator, over `support/composition-grid.ts`: the
measure behind roadmap epic Q, whose invariants (I1–I8 today) it
holds. Three suites, split so vitest runs them in parallel:

- `greenfield` — every stack × every vertical as its one extra, held
  against the `keel.dials` menu (I2 offered ⇒ Ok, I3 accepted ⇒
  offered, or shown as coming with the preset — naming one of those
  adds nothing), every permutation of each offered set whose order
  could matter — a vertical that `reads` another, with both chains —
  and the whole menu named forwards and backwards, held to staging the
  same bytes (I8, read back through the Trees the preview opened),
  plus `README.md` and `.gitignore` seeded before `keel new`.
- `brownfield` — every single-service stack scaffolded once, `keel add`
  previewed for every vertical (I4: each vertical is installed or a
  `keel.project-status` card, and the card agrees with the preview —
  `ready` Ok, `needs` Ok staging what naming its prerequisites with it
  stages, a refusal on the card the add's own, code and sentence —
  and I5, the same outcome as greenfield: Ok on both sides, or refused
  under the same code in the same sentence), plus a user `Dockerfile`
  or `.github/workflows/ci.yml` seeded wherever the add would create
  it.
- `composite` — every product under every repository layout its install
  offers, at the root and in each service, its cards held to I4 as
  brownfield's are — a vertical a monorepo service has from its product
  (`ProjectStatus.provided`) held to an add that stages nothing and says
  the card's note — and every service cell to I7: never refused for a
  file in the way, and Ok or `keel.wrong-scope` under the monorepo
  layout wherever its polyrepo twin, a repository of its own, is Ok.

Cells come from `keel.catalog`, `keel.dials` and `keel.project-status`,
never from a hand list, so a new preset or vertical is swept without an
edit. The grid is a **ratchet**: today's violations are on record, and
the record can only shrink. Beside each suite:

- `<axis>.golden.json` holds every cell's verdict (`ok`, the code, or
  `thrown:<Error>`). `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate
  change; the diff is the review.
- `<axis>.known.json` maps invariant → cell → finding id, asserted by
  exact equality both ways. `KEEL_UPDATE_GOLDEN=1` writes known ∩
  actual, so it only shrinks: a step that clears a violation drops its
  key in the same commit, and adding a key is never the fix.
- An invariant a step brings to zero for good becomes **hard**
  (`HARD` in the support module): its key leaves every known file, so
  there is nowhere to list a cell, and one violation fails the grid.
  I1 has been hard since Q0.3 — a thrown cell is always a failure —
  I2, I3 and I8 since Q1.3, when the menus and both front doors moved
  onto the planner, I6 since Q1.7, when every refusal came to be
  worded by one builder that prints no tag, and I4 and I7 since Q1.10,
  when a monorepo service came to read what its product gives it and
  what only a repository root may carry. Every known file is empty now
  but brownfield's I5 key.
- brownfield's I5 reads `greenfield.golden.json`, so when a change moves
  both, regenerate greenfield first. Where either side refuses, it
  previews the greenfield twin again (`Grid.twin`, which records
  nothing) for the sentence the golden does not keep.

About 11 s wall on its own, greenfield the longest at ~9 s, of which
I8's orderings are about 3.5 s.

The grid posts no answers, so every question resolves to its default
and an answer choice offered where it is refused is invisible to it.
That class has a focused sweep instead, in `handlers/preview.test.ts`:
every stack whose menu offers `persistence`, every non-default choice
its dials declare, posted to a preview and to a dry-run install — Ok
from both where the preview offers it, `keel.invalid-answer` from both
where it does not.

**The planner's readiness golden.** `domain/core/planner-readiness.golden.json`
records what `planner.ts` reads for every single-service preset × every
registered vertical on default dials. `KEEL_UPDATE_GOLDEN=1` rewrites
it, and a change to a declaration — a predicate, an adapter's
`promotes`, a vertical's `reads` — shows there as a diff to review. It
is a record of the planner, not an oracle for the gate: the menus and
both front doors read the planner, and the grid holds each of them to
the install through preview.

**A menu-versus-gate test uses preview or install as its oracle.** A
test claiming that what a front end offers is what keel accepts — a dial
menu, the extras list, a brownfield card — dispatches `keel.preview` (or
the install) for the offered choice. It never re-derives the gate from
`compatibility.ts`, `resolver.ts` or the tags: a re-derivation shares
the menu's blind spots. `application/web/dials.test.ts` held the page's
bodies to `assemblyRefusal`, the function the menu itself filters by,
and an offered extra that throws passed it. Its walk now posts every
body it reaches — each dial setting of every preset, and each extra
ticked and unticked through the page's own `toggleExtra` — to
`POST /api/preview`: some 300 previews, about 10 s, under a timeout of
its own.

## Mutation testing

Stryker runs over `src/domain` with the vitest runner —
`pnpm test:mutation`, report-only until the baseline settles. It runs on
`main`, not on PRs, so a surviving mutant never blocks unrelated work.
Scope, the static-mutant exception and the CI shape are in
`docs/development.md` → Mutation testing; the workflow's posture is in
[`.github/`](../.github/AGENTS.md).
