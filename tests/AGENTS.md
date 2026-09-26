# Agent conventions — tests

<!-- keel:purpose: how a test is built, the guard suites, the composition grid and its weekly sweep, mutation testing -->

What lives here: vitest suites mirroring `src/` (`domain/`, `contract/`
pieces under it, `application/`, `infrastructure/`, `toolchain/`), the
shared test `support/factory.ts`, the browser harness the `keel ui`
suites drive (`support/ui-e2e.ts`), the fixture trees under
`support/fixtures/`, the fixture plugins the `plugins/` suite loads from
disk, the guard tests that keep this repo's registries honest, the
composition grid (`domain/core/composition-grid/`), and its weekly
sweep (`sweep/`).

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

Seven suites in `verify` exist because an index nobody checks rots
silently. They check structure, never prose — a generated table is
structure too, checked as the projection it claims to be — and they
are the reason a matching change lands in the same commit as the thing
it guards:

- `ci-workflow.test.ts` — the `e2e` shard matrix against `tests/e2e/`. A
  suite in no shard never runs, and that looks exactly like a suite that
  passed. The same file holds `composition-sweep.yml` to running
  `tests/sweep/` opted in, with no `if:` to skip it and no
  `continue-on-error` to pass it red, and to a schedule and dispatch
  only (the weekly sweep, below).
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
- `generated-docs.test.ts` — the two tables `docs/` does not write by
  hand, the verticals compatibility matrix and the stack catalog's
  defaults, against what `support/generated-docs.ts` renders from the
  grid's goldens, `keel.dials` and the registry. It fails when
  regenerating would change a committed file, as `prettier --check`
  does, and `KEEL_UPDATE_GOLDEN=1` rewrites what lies between each
  region's `generated:` sentinels, and nothing around them:
  `KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/generated-docs.test.ts`.
  See [`docs/`](../docs/AGENTS.md).

## The composition grid

`domain/core/composition-grid/` sweeps keel's whole composition surface
through the real mediator, over `support/composition-grid.ts`: the
measure behind roadmap epic Q, whose invariants (I1–I9) it
holds, and epic R's I10. Four suites, split so vitest runs them in
parallel:

- `greenfield` — every stack × every vertical as its one extra, held
  against the `keel.dials` menu (I2 offered ⇒ Ok, I3 accepted ⇒
  offered, or shown as coming with the preset — naming one of those
  adds nothing), every permutation of each offered set whose order
  could matter — a vertical that `reads` another, with both chains —
  and the whole menu named forwards and backwards, held to staging the
  same bytes (I8, read back through the Trees the preview opened — a
  product's services' too), every preset with its whole menu sent as
  one body to a preview and to a dry-run install, held to the same
  bytes or the same refusal (I9, over the bodies `answerBodies`
  derives: none, every question answered away from its default, the
  same keyed to the sibling its asker borrows from, and one question
  answered twice), plus each file the empty-directory scaffold writes
  at its root, and `.claude/settings.json`, seeded before `keel new`
  (`seededBeforeNew`, read off that scaffold's changes): `README.md`
  and `.gitignore` are adopted (Ok on every stack), every other is
  `keel.path-conflict` — a patch that would merge into the user's
  file included.
- `brownfield` — every single-service stack scaffolded once, `keel add`
  previewed for every vertical (I4: each vertical is installed or a
  `keel.project-status` card, and the card agrees with the preview —
  `ready` Ok, `needs` Ok staging what naming its prerequisites with it
  stages, a refusal on the card the add's own, code, sentence and
  data, the entrypoint it names as its action included — and I5, the
  same outcome as greenfield: Ok on both sides, or refused under the
  same code in the same sentence), plus a user `Dockerfile`
  or `.github/workflows/ci.yml` seeded wherever the add would create
  it.
- `composite` — every product under every repository layout its install
  offers: first each service's own extras menu (`keel.dials`'
  `services[].verticals`), every vertical of it named for that service
  in a `keel new` preview — offered ⇒ Ok (I2), neither offered nor the
  service's own ⇒ refused (I3), and I7 against its polyrepo twin as
  below — then scaffolded, at the root and in each service, its cards
  held to I4 as brownfield's are — a vertical a monorepo service has from its product,
  or a monorepo root's services have (`ProjectStatus.provided`), held
  to an add that stages nothing and says the card's note, and at the
  root, what `keel.dials` shows as coming with the product under that
  layout held to be exactly what the add answers with that empty Ok,
  so both phases read one answer there (recorded under I4, which is
  hard: I5 is not, and would give this axis an allowance) — and every
  service cell to I7: never refused for a file in the way, and Ok or
  `keel.wrong-scope` under the monorepo layout wherever its polyrepo
  twin, a repository of its own, is Ok.
- `growth` — every single-entrypoint backend preset the stack finder
  lists, on every dial setting `keel.dials` offers it (build system,
  module layout, the peer context, each again with the agent harness
  left out: `support/dial-walk.ts`'s `harnessSettings`), with no
  extras, grown for real by `keel add entrypoint` with each entrypoint
  its framework offers and it lacks — 192 cells, 96 each way — and
  every modulith setting again after a module history
  (`support/dial-walk.ts`'s `moduleHistory`: `keel add module orders
--consumes greeting`, then `shipping --consumes orders`), 128 more.
  Each is held to its twin, the preset carrying both, scaffolded by
  `keel new` on the same dials and given the same history: every file
  byte for byte, the manifest included (the pinned clock makes its
  timestamps equal), and the deferred actions' descriptions in order —
  the grown run's against the twin's `keel new`, less its repository
  setup (version control's: `git init`, the hooks path — read off
  `vcs` itself, not the handler's own rule of what settles) — or
  refused, under the code `domain/core/growth.golden.json` (R.2a's
  record of `growthOf`) reads for the cell (I10, over the actions the
  grid's deferred runner records, `Grid.queued`). The add also
  previews as it installs on the scaffold (I9, over no answers and
  over the monitoring stack answered away from its default). Of the
  192, 132 grow and 60 are refused as `keel.contexts-need-rewiring` —
  every setting with the peer context but Go's; of the 128 with a
  history, Go's 8 grow and 120 are refused — until epic R's R.3 lifts
  them family by family (Go's with R.3a).

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
  worded by one builder that prints no tag, I4 and I7 since Q1.10,
  when a monorepo service came to read what its product gives it and
  what only a repository root may carry, I9 since Q2.1, when the
  preview came to read the answers it is sent as the install does,
  and I10 hard from the day it landed, with R.2b's command. Every
  known file is empty now but brownfield's I5 key; growth's holds only
  hard invariants, and is `{}` because `sweepGrid` reads each axis's
  known file whatever it holds.
- brownfield's I5 reads `greenfield.golden.json`, so when a change moves
  both, regenerate greenfield first. Where either side refuses, it
  previews the greenfield twin again (`Grid.twin`, which records
  nothing) for the sentence the golden does not keep.
- The growth axis reads `domain/core/growth.golden.json` (R.2a's
  record) for each refused cell's code, so when a change moves both,
  regenerate that golden before the grid.
- The docs' compatibility matrix is rendered from the brownfield and
  composite goldens (`generated-docs.test.ts`, above), so a change that
  moves a verdict regenerates the docs last, after the grid.

About 43 s wall on its own, growth and greenfield the longest: growth
about 38 s alone (390 real scaffolds — 320 cells and 70 twins, one per
setting and history, which both directions share — 264 real `keel add
module` runs, 320 real adds and 780 dry-run dispatches for I9; the
module histories are about 13 s of it), greenfield ~23 s, of which
I8's orderings are about 3.5 s and I9's bodies — some 260 whole-menu
dispatches — about 14 s.

**The weekly sweep beside it.** The grid's preview axes read each
preset's opening dials only, each extra alone and the whole menu, and
its growth axis every dial setting with no extras, because `verify`
has to stay fast. What that leaves out is `sweep/`: three opt-in
suites over `support/composition-sweep.ts`, self-skipping unless
`KEEL_RUN_SWEEP=1`, run weekly by
`.github/workflows/composition-sweep.yml` and never on a PR. They
sweep every dial setting `keel.dials` offers. The settings come
from `support/dial-walk.ts`, the walk `application/web/dials.test.ts`
makes too, started from each repository layout on a product and taken
again with the agent harness left out wherever that is allowed.

- `extras` takes every set of offered extras (the full powerset, a
  product's per service), ticked through the page's own `toggleExtra`.
  Each set is sent to `keel.dials`, which must keep it as it is, then
  to a preview, which must be Ok, and to a dry-run install, which must
  stage the same changes (I1, I2, I9). It is also named backwards, in
  every order for up to three extras, and in every order its boxes can
  be ticked in for up to three boxes (I8).
- `arrival` installs every ordered pair of offered extras for real,
  once in one run and once in two runs (`keel new --with x`, then
  `keel add y` with the `--refresh` its preview proposes), and each
  extra on its own the same way (`keel new`, then `keel add y`). The
  two trees must match, manifests normalised. This is the one
  comparison an undeclared `Vertical.reads` cannot pass, because the
  planner sorts a set whatever order it is named in. A pair that
  differs only as `y` does on its own is said so, under one heading.
- `choices` answers every choice of every question asked by the whole
  menu, by no extra, or by any one extra with what it needs, one answer
  per body, then previews it and installs it as a dry run. The whole
  menu alone would miss some: `ci` answers distribution's CI provider,
  and a container image moves a CLI's distribution off the native
  binary and its targets.

There is no golden and no known file. Each preset is a test that fails
with every finding it collected, grouped by kind, with the command line
that reproduces each one listed underneath; a dispatch that throws or
refuses, `keel.dials` on a setting included, is a finding, never the
end of the preset — all but the blank preview a product's repository
layouts are read from, which the composite grid holds in `verify`.
`KEEL_SWEEP_STACKS=go-http,ts-cli` narrows a run. What a full run
costs, and how to read one, is in `docs/development.md` → The
composition sweep. `sweep/machinery.test.ts` is the one file there
that is not opted in. It holds the lane's helpers in `verify` (the
settings walked, a setting `keel.dials` refuses, the powerset and its
cap, a tick and its closure, a product's ticks and keys per service,
its two spellings, the read-back of what a dispatch staged, both
comparisons, the report), so a helper that rots shows on a PR rather
than as a weekly run that swept nothing. The skipped suites read
nothing when they are collected, but they still import the engine, a
couple of seconds each.

Only I9 posts answers, and only one non-default choice per question —
on each preset's opening dials, and on every dial setting of a grown
one — so the grid cannot see an answer choice that is offered and then
refused. The sweep's `choices` suite covers every offered choice of
every question the whole menu, no extra or one extra asks, on every
dial setting. `verify` keeps a focused slice of
that class in `handlers/preview.test.ts`: every stack whose menu
offers `persistence`, and every non-default choice its dials declare,
posted to a preview and to a dry-run install. Both must be Ok where
the preview offers the choice, and both must be `keel.invalid-answer`
where it does not. That second half, a hidden choice refused, is one
the sweep never posts.

**The planner's readiness golden.** `domain/core/planner-readiness.golden.json`
records what `planner.ts` reads for every single-service preset × every
registered vertical on default dials. `KEEL_UPDATE_GOLDEN=1` rewrites
it, and a change to a declaration — a predicate, an adapter's
`promotes`, a vertical's `reads`, a preset's own verticals (which the
nearest stacks' `comesWith` reads) — shows there as a diff to review. It
is a record of the planner, not an oracle for the gate: the menus and
both front doors read the planner, and the grid holds each of them to
the install through preview.

**The shared-file byte golden.** `domain/core/shared-files.golden.json`
records the sha256 of each file more than one adapter writes into —
the root `README.md`, `settings.gradle.kts`, `pom.xml`, `package.json`,
`Cargo.toml` and `.devcontainer/devcontainer.json` — on every
single-service preset, every dial setting `keel.dials` offers it
(`support/dial-walk.ts`), and three extras sets: none, the whole menu,
and `dev-env` alone where it is an extra. On each preset's opening
setting it also records `keel add dev-env` on the scaffold wherever
dev-env is an extra (every CLI and SPA preset), the whole menu with
Liquibase chosen wherever the preview offers it (the one writer of
these files no default answer reaches), and the whole menu over a
README of the user's whose `### Toolchain` and `### Dev container`
headings sit above keel's part. And on every modulith setting, with no
extras, it records the module history (`support/dial-walk.ts`'s
`moduleHistory`: `keel add module orders --consumes greeting`, then
`shipping --consumes orders`), whose contexts register themselves in
the build files — 100 cells, which R.3 holds as it splits the context
adapters. Roadmap epic R moves those writers from appending to a
ranked place (`src/domain/core/rank.ts`: the README sections since
R.1a, the build-file lists with R.1b), with ranks chosen to reproduce
the order a scaffold already has. This golden landed
before any of that code, and it holds R.1 to leaving every cell
byte-identical: a cell a rank moves is a rank that moved a scaffold,
fixed in the rank, never regenerated away. On every one of its cells
the rule and an append write the same bytes, so it cannot see a writer
that stopped going through the rule; `domain/core/rank-arrival.test.ts`
holds each README writer, and the JVM and TypeScript build-file lists,
where they differ — a section a later `keel add` brings, or an entry
`--reapply` puts back, against one run. Two writers no later run
reaches before epic R's growth are held by their own suites: the
basic Rust crate's CLI `[[bin]]`, in a `Cargo.toml` a reapply writes
afresh (`domain/core/adapters/rust-cli-bootstrap.test.ts`), and the
dev container's attach on an HTTP project, which every preset
installs with its dev environment
(`domain/core/verticals/dev-container.test.ts`).
Every cell is a dry run, read back through the Tree that staged it,
except the ten scaffolds `keel add dev-env` runs on, and each module
history's scaffold and first add, which are written for real so the
next add has a project on disk; a real run adds only the commit. The
agent harness is left on: it writes none of these files, and leaving
it out moves no cell. A failure names the cell, as the
command line that makes it, and the file. A new single-service preset,
dial or extra adds or moves cells here as well as in the grid, as does
any template or pin change that reaches one of these files, and the
same change regenerates the golden:
`KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/domain/core/shared-files.golden.test.ts`.
It reads no other golden, so the order does not matter. Its installs
run in a `beforeAll`, so mutation testing leaves it out, as it does
the grid.

**The growth golden and its render guard.** `domain/core/growth.golden.json`
records `growthOf` (`src/domain/core/growth.ts`), what `keel add
entrypoint` would do, for every single-service preset on every dial
setting `keel.dials` offers it — each again with the agent harness left
out, and each modulith setting again after the module history — and
each back entrypoint the scaffold lacks: the twin, the adapters that
newly match, the verticals installed, the contexts `keel add module`
added wired in by their replay, and the verticals re-rendered, or the
refusal's code and why. Each setting is a real run, not a dry one, into
the shipped in-memory `Tree` and `ManifestStore` fakes — a `Tree`
seeded with what earlier runs in its directory committed, since a
context's add patches the scaffold's files — so the reading is of the
manifest keel writes; a record, like the planner's readiness
golden, that the command's own change is reviewed against.
`KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/domain/core/growth.golden.test.ts`
rewrites it, through prettier, since its cells hold lists `JSON.stringify`
lays out otherwise and `pnpm lint` checks it; it reads no other golden.
`domain/core/growth-render.test.ts`
holds growth's structural refusal to what the adapters render: on every
single-entrypoint backend preset, under each layout, with the peer
context, and after `keel add module`, every adapter that matches both
without and with the missing entrypoint is rendered both ways, and one
that renders otherwise must be one growth re-renders or one whose
context it refuses — and each refusal and re-render must rest on such
an adapter. Today those are exactly the family kits, and the
peer-context and context adapters of every family but Go, whose are
split into a shell and one wiring adapter per entrypoint (R.3a). Both
run their scaffolds in a `beforeAll`, so mutation testing leaves them
out; `domain/core/growth.test.ts` holds each rule of the reading on a
fixture family, and the replay of `keel add module`'s contexts on
keel's Go presets, since that command runs keel's own
`bounded-context` alone.

**A menu-versus-gate test uses preview or install as its oracle.** A
test claiming that what a front end offers is what keel accepts — a dial
menu, the extras list, a brownfield card — dispatches `keel.preview` (or
the install) for the offered choice. It never re-derives the gate from
`compatibility.ts`, `resolver.ts` or the tags: a re-derivation shares
the menu's blind spots. `application/web/dials.test.ts` held the page's
bodies to `assemblyRefusal`, the function the menu itself filters by,
and an offered extra that throws passed it. Its walk now posts every
body it reaches to `POST /api/preview`: each dial setting of every
preset (`support/dial-walk.ts`, which moves one service's build system
of a product and keeps the others', through the page's own
`withServiceBuild`), each extra ticked and unticked through the page's
own `toggleExtra`, and the agent harness left out once per single
preset. That is some 370 previews, about 10 s, under a timeout of its
own.

## Mutation testing

Stryker runs over `src/domain` with the vitest runner —
`pnpm test:mutation`, report-only until the baseline settles. It runs on
`main`, not on PRs, so a surviving mutant never blocks unrelated work.
Scope, the static-mutant exception and the CI shape are in
`docs/development.md` → Mutation testing; the workflow's posture is in
[`.github/`](../.github/AGENTS.md).
