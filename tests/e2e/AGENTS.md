# Agent conventions — tests/e2e

<!-- keel:purpose: the real-toolchain grid: which cells exist, how they shard, what they cost -->

What lives here: the suites that scaffold a project for real and build
it with its real toolchain. They are opt-in (`KEEL_RUN_E2E=1`) and run
in the `e2e` job, sharded by toolchain — the job shape and the
`mise.toml` pins are in [`.github/`](../../.github/AGENTS.md). This file
is the **grid**: which cells exist, what a cell is, and why each family
is grouped the way it is.

**A suite in no shard never runs, which looks exactly like a suite that
passed.** `tests/ci-workflow.test.ts` parses `ci.yml` and fails in
`verify` when the matrix and this directory disagree. A new suite goes
into a shard in the same change.

**A test file is the unit of CI scheduling.** Vitest parallelises across
files and runs the tests inside one file in sequence, so the slowest
single file floors the whole job regardless of sharding. Long cases get
their own file rather than another `it` in a long one — which is why the
modulith suite is `-modulith`, `-persistence` and `-maven`.

## The grids

- **The JVM shards follow the grid, and the grid comes first.** The
  `basic` typology splits by framework — `jvm-basic-quarkus`, `-spring`,
  `-micronaut`, four stacks each (CLI and REST × Java and Kotlin). The
  `modulith` typology is 25 files and splits by framework × **language**:
  `jvm-modulith-<framework>-<java|kotlin>`, four cells each, six on
  `quarkus-java` which also carries `modulith-baseline` and
  `modulith-persistence`. Never shard onto a cell no suite populates: a
  green `e2e (jvm-kotlin)` that runs nothing asserts coverage that does
  not exist, and the check name hides it. Language became a legal axis
  only once the modulith grid was closed (roadmap J.1); it is
  deliberately _not_ an axis on the `basic` half, where a further split
  buys attribution and no wall clock.
- **The modulith grid is 24 cells and one file is one cell.** 12 stacks
  × 2 build systems, named `modulith-<stack>-<build>.test.ts` so "every
  cell has a suite" is checkable from `ls`. `modulith-baseline` and
  `modulith-persistence` are the two exceptions and neither is a cell:
  the first is the only e2e scaffolding the layout _without_
  `--with-peer-context` (what proves that adapter family is additive),
  the second is a vertical layered onto a cell. A new stack or build
  system means new cells, and they go in the matrix in the same change.
- **The Rust grid is 2 stacks × 2 layouts**, cargo being the only build
  system there, so the modulith half is
  `modulith-rust-{cli,http}.test.ts` plus `modulith-rust-peer-context`,
  which is not a cell — it is the Rust counterpart of
  `modulith-baseline`, the one suite proving the peer-context adapter
  family is additive. All of it stays in the single `rust` shard:
  measured on the shipped shape that shard is already floor-bound by its
  slowest file, so a split would buy attribution and no wall clock.
- **Go, the TypeScript stacks and `web-components` follow the same
  shape, and their grids are small.** Go is 2 stacks × 1 build system
  (`modulith-go-{cli,http}`); each TypeScript stack is 1 stack × 2
  package managers (`modulith-ts-cli-{npm,pnpm}`,
  `modulith-ts-http-{npm,pnpm}`, `modulith-web-components-{npm,pnpm}`).
  The package manager is a real axis rather than a duplicate: npm's
  hoisting hides a missing dependency declaration that pnpm's isolated
  store refuses. Each family also carries a
  `modulith-<family>-peer-context` suite, which is not a cell — same
  role as `modulith-rust-peer-context`. Their `walking-skeleton-*` files
  keep the `basic` layout **only**; a modulith case living inside one is
  invisible to `ls tests/e2e/` and floors that file, which is exactly
  the state I.6 found and fixed.

## The combo grid — 21 cells, two halves, two depths

The stacks pairing `arch.cli` with `arch.server-http` ship one hexagon
with two deployment units, and `combo-<layout>-<stack>-<build>.test.ts`
is one file per cell, same rule as above. The `modulith` half is
**exhausted** — 6 JVM combo stacks × 2 build systems, plus `ts-cli-http`
× npm and pnpm = 14 — because that is the half issue #108 was about and
no build had ever compiled one. The `basic` half is **sampled at one
build per stack** (7), the build system alternating so both appear
against each framework and each language, and the TypeScript sample
taking pnpm rather than npm: PR #110 built the whole `basic` half by
hand before shipping the mechanism, so what was missing there was a
standing check, not a first look — and the 14 modulith cells re-exercise
the seed builders in `jvm-shared-root.ts` on every run regardless. What
is genuinely `basic`-only is the per-arch module list and the README
shape, and one build per stack pins those.

**Six shards, not eighteen, and that is the opposite call from
`add-module-*` below.** These follow the `jvm-modulith-*` convention
(framework × language, three files a shard). A job per cell earned its
keep there because those cells are cheap enough to finish well inside
the matrix floor, so attribution was free; a combo cell builds _two_
assemblies, so it costs more. Grouped three to a shard they still finish
inside that floor and cost the e2e phase no wall clock, where eighteen
shards would buy eighteen cold JDK+Gradle provisions for a red X that
framework × language already names. `web-combo` gets a shard rather than
riding `web` because its cells render nothing, so a shard probing for
Chromium would misdescribe them.

Within the heaviest combo shard the two Gradle cells are effectively
tied and the Maven one is roughly half either, so no single file is that
shard's floor and the standing "a long case gets its own file" instinct
buys nothing here.

**Every cell ends in a runtime entrypoint check.** A green compile is
not the claim — both entrypoints reachable off one hexagon is. The two
drive steps are the single-entrypoint suites' own (`driveCliJar`,
`driveRestJar`), lifted into `tests/support/jvm-combo-e2e.ts` so a combo
cell asserts the same stdout and the same `/greet` wire contract rather
than a paraphrase. Each cell also asserts the root build file registers
every module exactly once — the shared-root upsert's whole reason to
exist, and the one failure a scaffold-and-read test cannot see.

## The add-module grid — a job per cell, on the JVM only

**On the JVM, `add-module-*` _is_ a grid — the same 24 cells, and one
job each.** `add-module-<stack>-<build>.test.ts`, 12 stacks × 2 build
systems, named so "every cell has a suite" is checkable from `ls`, and
each with a shard of its own (`jvm-add-module-<stack>-<build>`).
Typology is a real axis rather than a duplicate of its row, which is
what makes 24 the honest number: framework and language pick the
binding, and typology picks the assembly the wiring class renders into
and the build file the new dependencies anchor in — and on Spring it
also moves `@ComponentScan` between `Main` and `Application`. The body
is shared (`tests/support/jvm-add-module-e2e.ts`) so 24 cells cannot
drift into 24 slightly different assertions.

Two cells carry a negative the other 22 do not, and deliberately so: the
scope holding the seam wall is a property of the **build system**, not
of the cell, so it is asserted once per build system — `implementation`
in `add-module-quarkus-rest-gradle`, `optional` in
`add-module-quarkus-rest-maven`, whose Maven half once shipped without
it. Twelve copies of one fact would cost twelve builds and prove it
once.

This is the one place a `keel add module` grid is worth its runner time.
The JVM is six bindings over three containers, each with its own
discovery mechanism and its own way to fail silently — a handler the
container never found compiles perfectly and starts perfectly. The other
four families stay one file per family
(`add-module-{rust,go,ts,wc}.test.ts`, same status as
`modulith-baseline`), riding their family's existing shard, because a
Rust or Go context has no container to lose a handler in.

## The suites that are not cells

- **`dev-compose` is the only shard that runs an emitted
  `dev/compose.yaml`, and it exists because nothing did.** Every other
  docker-using suite reaches its database through Testcontainers, which
  mounts no volume — so the whole grid stayed green over a dev database
  whose volume mount made PostgreSQL 18 refuse to start
  (docker-library/postgres#1259). A unit test reads the YAML; only
  `docker compose up --wait` reads it the way a user does. The suite
  fakes every deferred action, so it scaffolds the reporting stack with
  no JDK and probes for `docker` alone, and it boots the database only:
  the SELinux relabel the monitoring mounts carry is inert on a GitHub
  runner, so starting those five containers would buy the shard a
  gigabyte of pulls and no assertion.
- **`keel ui` has four browser-driven suites, and none is a cell.**
  Each spawns `keel ui --port 0`, parses the URL and token the CLI
  prints, and drives the page with Playwright over the shared harness
  (`tests/support/ui-e2e.ts`); none runs a toolchain, and all four ride
  the `web` shard, which already declares `browser` in `tools:`. They are
  four files because they differ by what is on disk when the page
  opens, or by what they drive once it has:
  `ui-stack-finder` (an empty directory; the greenfield stepper),
  `ui-plugin-stack` (a keel plugin on disk; a stack keel never
  shipped), `ui-refusal` (a scaffolded project; a refusal on the page
  and the brownfield card state) and `ui-compose` (an empty directory;
  the Options step's "Also scaffold" group, and the body the page
  posts for it — `watchTraffic` keeps what went out). What they cover
  is the seam nothing else can: the narrowing, the steps, the
  transitions and the extras group are pure and unit-tested
  (`finder.js`, `steps.js`, `target.js`, `extras.js`), but the element
  rebuilds its subtree on every change and `<keel-app>` replaces the
  element itself, so keeping a choice — or the focus — across a step
  is a claim about surviving a DOM replacement. A page-level suite is
  the only thing that sees a `pageerror` too — a throw inside a
  listener leaves the page looking right and aborts the rest of that
  handler. **None of them presses Generate on a JVM stack**: the `web`
  shard provisions no JDK, and a real Quarkus install queues
  `gradle wrapper`.

## Cost — what is measured, and what inverted the guess

**`jvm-modulith-quarkus-java` is the slowest shard in the matrix, and it
is what the whole e2e phase's wall clock is floored by.** That is the
bar to check a new shard against: one that finishes inside it is free,
one that does not moves the phase. Every `jvm-add-module-*` shard and
every `jvm-combo-*` shard finishes inside it, which is what makes a job
per cell cost nothing there. If that shard grows, split it before adding
to it.

**A job per cell buys attribution and costs cold caches, and that trade
is only worth taking at this granularity.** Each `jvm-add-module-*`
shard runs one file with one real build, so each pays its own JDK +
Gradle provisioning and its own cold dependency resolve — 24 of them
where two files in one shard paid two. What it buys is a red X that
names the cell — `e2e (jvm-add-module-spring-cli-kotlin-maven)` is a
diagnosis, where a failure inside a 24-file shard is a log to read. Wall
clock is unaffected (the shards run in parallel); runner minutes roughly
triple for this command. Collapsing it back is one edit — merge the
`files` lists by framework × language, as the modulith grid does — and
the suites need no change for it.

Two results worth keeping because they invert the obvious guess. The
**Maven cells are consistently faster than the Gradle ones** across the
add-module grid — Maven's half is the cheap half, the opposite of the
assumption that made `-maven` a separate file "for the standing reason a
long case is". And on `web` the floor changed hands when `add-module-wc`
landed: the standing note naming `modulith-wc-peer-context` as the
permanent floor was wrong within one release. The one-shard conclusion
for `web` survives; the file named in it did not.

**A shared dependency cache per file is worth more than a split.** Both
JVM `add-module` suites first shipped taking a fresh `GRADLE_USER_HOME` /
`-Dmaven.repo.local` in `beforeEach`, so their second case re-resolved
and re-downloaded everything the first had just fetched — enough to make
the file look like a file wanting to be two. Moving the cache to
`beforeAll` (one home per file, the project tree still per case) took
most of the second case's cost away and the shard's with it.

That answers the split question, and inverts the obvious reading of it:
splitting those two cases would hand the second its own cold Gradle
resolve back and buy attribution with wall clock. **Fix the cache, not
the file layout.** So the two cells that carry a negative keep both
cases in one file with one shared home (`beforeAll`), and any suite
running two real builds should share its home from the start.

Note what this does _not_ say. It is an argument about two cases of the
same cell, where the second reuses the first's artifacts almost
entirely. It is not an argument against the 24-cell split: those cells
scaffold different stacks, so they would share little even co-located,
and the attribution is worth more when the axis under test is which
framework/language/typology broke.
