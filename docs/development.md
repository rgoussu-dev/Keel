# Development guide

For working on keel itself. The contribution workflow (forks, PRs) is
in [CONTRIBUTING.md](../CONTRIBUTING.md); this page is the technical
side.

## Requirements

The toolchain is one file, [`mise.toml`](../mise.toml), and one
command:

```sh
mise install
```

That is Node 22 and pnpm 10 for the package itself, plus what the e2e
suites scaffold and build with: **JDK 25** (`temurin-25`, the spelling
keel's own toolchain vertical emits), **Gradle 9.7.0**, Maven, Go and
Rust. The JVM three are coupled and none of them is arbitrary — see
[End-to-end tests](#end-to-end-tests). The same file provisions every
CI shard (`jdx/mise-action`, installing the subset the shard probes
for) and a Claude Code web session, so a workstation, a runner and a
web session cannot drift from one another; `tests/mise-toolchain.test.ts`
holds the file's Gradle to the wrapper's own version and its tool list
to what the CI matrix can ask for. Without mise, the same versions by
any other manager work too — the suites probe binaries, not mise.

### Claude Code on the web

`.claude/hooks/session-start.sh` provisions the above on session start,
so a web session's toolchain matches CI's rather than the image's. It
runs only when `CLAUDE_CODE_REMOTE=true`, so it never touches a
developer's own home, and it is idempotent — a warm container re-runs
it in seconds.

It does what a CI shard does, with the same file: installs mise if the
image lacks it or carries another version — a pinned release tarball
from GitHub, checked against the checksums the hook carries, never an
installer script piped into a shell, since this runs with shell
privileges before anything in the project is trusted; bumping mise is
the version and the two sums, copied from the release's
`SHASUMS256.txt` — runs `mise install` over
`mise.toml` (the whole file,
since a web session may run any shard and the container is snapshotted
after the hook), and writes `mise env` to `$CLAUDE_ENV_FILE` so every
later command in the session sees the tools' PATH entries and
`JAVA_HOME`. Then `pnpm install`, and a version line proving the JDK,
Gradle and Maven the session will actually build with.

Two things the image gets wrong are why the hook exists at all. Its
Gradle cannot start on JDK 25, and its shell profile exports a JDK 21
`JAVA_HOME` — quietly expensive, because the Maven e2e suites skip
themselves below JDK 25, so a stale `JAVA_HOME` does not fail the
Maven half of the modulith grid, it runs none of it, and a skipped
suite reads exactly like a passing one. `mise env` is what wins over
the profile, per session, through the env file.

The hook is the only place the session's `JAVA_HOME` is set, on
purpose. It once sat in `.claude/settings.json`'s `env` block as well,
as a distro path, and a settings `env` block cannot be conditional: on
a developer machine, where the JDK comes from mise, sdkman or the
distro, it overrode a correct `JAVA_HOME` with a directory that does
not exist, and `gradle wrapper` failed in every JVM suite of a local
Claude session. Do not put a machine-specific path back there.

Distribution integrity is mise's: the core `java` tool checks the
JDK against the vendor's published checksum, and the `aqua` registry
entries Gradle and Maven resolve through carry theirs. That retired
the hand-maintained `GRADLE_SHA256` table the hook used to carry.

## The dev loop

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests) + prettier --check . + depcruise src
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:watch    # vitest watch mode
pnpm build         # compile to dist/ via tsconfig.build.json
pnpm format        # prettier --write .
```

`pnpm lint` covers eslint, prettier, **and dependency-cruiser** — the
hexagonal dependency rule fails the same gate as code style.

Every commit must pass `pnpm lint && pnpm typecheck && pnpm test` on
its own.

## Trying keel locally

Two loops, and which one you want depends on the question. When the
question is **your change** — an adapter, a template, the engine — use
the fast inner loop. When the question is the **package** — bin
wiring, the `files` list, whether the template assets actually ship —
use the tarball loop: the e2e suites drive the engine from the working
tree, so none of that is inside what they prove.

### The fast inner loop: `pnpm keel …`

```sh
pnpm keel new --stack=go-cli --dry-run
```

Builds (`pnpm build`) and runs `bin/keel.js` against `dist/` — in a
**playground directory**, not the repo. That indirection is
load-bearing: every keel command operates on the current working
directory, and pnpm runs scripts at the package root, so running the
CLI in place would scaffold into the keel repo itself. Each invocation
gets a fresh directory under the system temp dir and prints its path.
To keep working in the same project across invocations — which any
`keel add` flow needs — pin the playground:

```sh
export KEEL_PLAYGROUND=/tmp/keel-playground
pnpm keel new --stack=quarkus-rest
pnpm keel add persistence
```

The script refuses a `KEEL_PLAYGROUND` that resolves inside the repo.

### The packaging loop: install the tarball

The user-shaped run, and a release gate: install from local sources
exactly the way npm delivers them, `keel new` a project, answer the
real prompts, then run the emitted project's own gates. The tarball —
not `pnpm link --global` — because the tarball is what `npm publish`
ships: a template asset missing from the `files` list or a broken
`bin` entry surfaces here instead of on the registry, where a link
(which serves the whole working tree) would mask it.

```sh
pnpm build
npm pack                            # → rgoussu.dev-keel-<version>.tgz
prefix=$(mktemp -d)
npm install --global --prefix "$prefix" ./rgoussu.dev-keel-*.tgz
```

`--prefix` confines the install to a scratch prefix — your real global
prefix is untouched — and puts the bin at `$prefix/bin/keel`. Run it
from an empty directory, interactively (this loop is also the one
place a human exercises the prompt flow):

```sh
mkdir -p /tmp/keel-scratch && cd /tmp/keel-scratch
"$prefix/bin/keel" new --stack=ts-http
```

Then prove the result on its own terms — the emitted project's own
gates, per stack (`npm test`, `./gradlew build`, `cargo test`,
`go test ./...`):

```sh
npm test
```

Done looks like: the gates pass, and nothing in the scaffolded project
references the keel checkout — `grep -r <path-to-your-clone> .` finds
nothing.

## Repository layout

keel dogfoods its own [binding spec](../assets/project/AGENTS.md):
hexagonal trisection with the dependency rule enforced by
dependency-cruiser. Every layer directory carries a `README.md` +
`AGENTS.md` with its local conventions.

```
src/
  domain/
    kernel/               # Action/Command/Query, Result, Handler,
                          # Mediator — depends on nothing
    contract/             # commands + InstallReport, composition
                          # vocabulary (Adapter, Vertical, …), the
                          # Stack vocabulary (stack.ts) and the
                          # plugin contract (plugin.ts), the harness
                          # seams (skill.ts, hook.ts, doc.ts,
                          # region.ts), manifest types + zod schemas,
                          # ports/ (Tree, Prompt, Logger, Clock,
                          # ManifestStore, TemplateSource,
                          # ProcessRunner, Registry)
    core/                 # the engine (predicate, resolver,
                          # compatibility, dials, answers, apply,
                          # install, actions, docs-index,
                          # hook-settings), composition adapters/ +
                          # verticals/, the stack presets as data
                          # (stack-presets.json) + the schema and id
                          # resolution over them (stacks.ts),
                          # handlers/, registry.ts (registryOf + the
                          # shipped source, and every refusal naming
                          # its origin), RegistryMediator
    toolchain/            # the provisioning bounded context (own
      contract/ core/     # hexagon): provider records (mise, asdf,
                          # nvm, corepack, sdkman, rustup,
                          # go-native) + the manager dial that
                          # computes which cover a needs set whole +
                          # the keel toolchain install|check engine;
                          # meets the rest of keel only at
                          # domain/contract — the seam is held by
                          # .dependency-cruiser.cjs both ways
  application/
    cli/                  # primary adapter #1 — the `keel` binary
      contract/           # commander → commands → mediator → Result
                          # rendered; zero business logic
      executable/         # process composition root: wires infra
                          # adapters + handlers + mediator + the UI
                          # server; no logic
    web/                  # primary adapter #2 — `keel ui`, the local
      contract/           # scaffolder. contract/ maps UiRequest →
      executable/         # commands/queries → UiResponse (no
                          # node:http) and holds the loopback guards;
                          # executable/ owns the socket, the per-run
                          # token and the asset roots. The two primary
                          # adapters never import each other, bar the
                          # types-only contract/server.ts the CLI
                          # names to inject `keel ui`
  infrastructure/         # one directory per port, real adapter +
    tree/ prompt/         # canonical fake side by side.
    manifest/ template/   # registry/ finds and imports a project's
    process/ commons/     # plugins; template/ also holds the router
    registry/             # that sends `plugin:` ids to their assets
assets/
  composition/            # adapter template trees (ejs), one
                          # directory per `<vertical>/<adapter>/`;
                          # plus shared trees several adapters
                          # render (walking-skeleton/jvm-domain/).
                          # A `*-modulith` sibling tree is the same
                          # content under the modulith module layout,
                          # picked by the manifest's `layout.*` tag
  project/                # binding spec (AGENTS.md) — source of truth
                          # for the universal engineering conventions
  web/                    # the `keel ui` page: framework-free custom
                          # elements on @rgoussu.dev/planks, served
                          # as-is (no bundler). src/finder.js walks
                          # the drill-down tree and src/steps.js says
                          # which steps the rail has — both pure, both
                          # unit-tested without a browser. Linted with
                          # src/tests, unlike the ejs template trees
tests/                    # vitest; mirrors src/ (domain/, e2e/,
  support/factory.ts      # infrastructure/); the shared test Factory.
  support/ui-e2e.ts       # support/ also holds the browser harness
  support/fixtures/       # both `keel ui` suites drive. fixtures/
  plugins/                # plugins/ holds the fixture plugins the
                          # plugins/ suite loads from disk
bin/keel.js               # npm bin entry → dist/application/cli/executable
.dependency-cruiser.cjs   # the dependency rule, enforced in pnpm lint
```

Naming note: a _composition adapter_ (`git-init`,
`quarkus-cli-bootstrap`, …) is keel **domain content** — a unit
contributing files to a scaffolded project — not a hexagonal adapter
of keel itself; those implement `src/domain/contract/ports/` and live
under `src/infrastructure/`.

### Where the conventions live

keel applies its own per-directory-docs model (#145) to itself. The
root [`AGENTS.md`](../AGENTS.md) is held to the same ≤ 120 lines it
emits, and carries a `keel:map` region indexing every directory that
has notes of its own — `.github/`, `assets/`, `docs/`, `tests/` and
each `src/` layer — with a one-line `CLAUDE.md` pointer beside each so
Claude Code lazy-loads a document exactly when files in that directory
are touched. Depth lives where it binds: the e2e grid in
[`tests/e2e/AGENTS.md`](../tests/e2e/AGENTS.md), the CI and release
mechanics in [`.github/AGENTS.md`](../.github/AGENTS.md), the four
standing engine notes (registration, compatibility, drill-down, the
presets-as-data rule) in
[`src/domain/core/AGENTS.md`](../src/domain/core/AGENTS.md).

`tests/repo-docs.test.ts` is the repo-local `keel docs check`: it holds
the root to its budget, holds the map rows to the documents they point
at (each document declares a `<!-- keel:purpose: … -->` line and the
row's description must match it verbatim — the same one-description
rule the emitted skills index holds), requires the sibling pointer, and
fails on a relative link that does not resolve. A document added
without a map row, or a row whose subject is gone, is red in `verify`.

Adding notes: write them in the `AGENTS.md` of the directory they are
about. If that directory had none, give it one with a purpose line, a
`CLAUDE.md` pointer, and a row in the root map — the guard names
whichever of the three is missing.

## Testing approach

- Vitest, run via `pnpm test`; test files live under `tests/`
  mirroring `src/`.
- **Scenario + Factory + port pattern** from the
  [binding spec §3](../assets/project/AGENTS.md): no mocking libraries
  — fakes are built directly, side by side with the real adapters.
- Every public API change is accompanied by a test change.
- **The composition grid** (`tests/domain/core/composition-grid/`)
  previews every stack × vertical in both phases and every product's
  services under both repository layouts, grows every
  single-entrypoint backend preset with `keel add entrypoint` on every
  dial setting and holds it to its twin, and holds the invariants of
  roadmap epics Q and R over them: a golden of every verdict, and a
  known-violations file that can only shrink. How to read and
  regenerate it is in [`tests/AGENTS.md`](../tests/AGENTS.md). What it
  leaves out to stay fast — every dial setting but a preset's opening
  one where it previews, every extras set, every pair's arrival order,
  every answer choice — is the weekly
  [composition sweep](#the-composition-sweep).

### End-to-end tests

The suites under `tests/e2e/` scaffold a real project into a temp
directory, build it with the generated wrapper, boot it, and drive it
over the wire. They are the only tests that can catch a template which
renders but does not compile.

They are **opt-in**: skipped on CI unless `KEEL_RUN_E2E=1`, skipped
anywhere when the toolchain is missing, and opted out with
`KEEL_SKIP_E2E=1`. Run one with:

```sh
KEEL_RUN_E2E=1 pnpm test:e2e     # all of them
KEEL_RUN_E2E=1 pnpm vitest run tests/e2e/walking-skeleton-modulith.test.ts
```

Most of a JVM suite is shared. `tests/support/jvm-e2e.ts` carries the
three steps every one of them runs — scaffold through the real
mediator, build with the generated wrapper, locate the runnable jar —
behind a `JvmProjectSpec`. What happens next is the only difference:
`jvm-rest-e2e.ts` boots the jar and drives the `/greet` wire contract,
`jvm-cli-e2e.ts` runs it once with an argv and asserts on stdout. A new
JVM stack is usually a spec object and a `describe`.

CI runs them too, in a second job — the `verify` matrix stays the fast
gate. That job is **sharded by toolchain**, so each shard provisions
only what its suites probe for and a failure names the stack in the
check title. The JVM is sharded again along the grid its suites
populate, and the two typologies take different shapes because their
volumes differ. `e2e (jvm-basic-quarkus)`, `e2e (jvm-basic-spring)`
and `e2e (jvm-basic-micronaut)` each take that framework's four
`basic` stacks (CLI and REST, Java and Kotlin). The modulith is 25
files and splits by framework **and language** —
`e2e (jvm-modulith-quarkus-java)`, `…-quarkus-kotlin`,
`…-spring-java`, and so on, four cells each. `e2e (go)`,
`e2e (rust)` and `e2e (web)` are unchanged.

`e2e (dev-compose)` is the odd one out: it compiles nothing and
probes for `docker` alone. Its single suite is the only place an
emitted `dev/compose.yaml` is actually run — every other docker-using
suite reaches its database through Testcontainers, which mounts no
volume, so the whole grid stayed green over a dev database whose
volume mount made PostgreSQL 18 refuse to start. A unit test reads
the YAML; only `docker compose up --wait` reads it the way a user
does.

`keel add module` populates that same 24-cell grid a second time, and
there the split goes all the way down: **one cell, one file, one
shard**, named `e2e (jvm-add-module-<stack>-<build>)`. Typology is a
real axis on this half — it picks the assembly the wiring class
renders into and the build file the new dependencies anchor in, and
on Spring it moves `@ComponentScan` between `Main` and `Application`.
The failure these name is the silent one: a container that never
discovered a handler compiles clean and starts clean, so only a build
of that exact framework, in that exact language, in that exact
assembly catches it. The cost is runner minutes rather than wall
clock — each shard pays its own provisioning and its own cold
dependency resolve, and they run in parallel.

The composed-entrypoint stacks — the ones pairing `arch.cli` with
`arch.server-http`, so one hexagon ships two deployment units — get a
grid of their own, `e2e (jvm-combo-<framework>-<language>)` plus
`e2e (web-combo)`. Its two halves are covered to different depths on
purpose: `modulith` is exhausted (6 JVM stacks × Gradle and Maven,
plus `ts-cli-http` × npm and pnpm), `basic` is sampled at one build
per stack. The asymmetry is not laziness — `basic` shipped with its
whole half built by hand, `modulith` shipped with none of it built at
all, and the modulith cells re-exercise the shared seed builders on
every run anyway. Shards follow the `jvm-modulith-*` convention rather
than the job-per-cell one above: a combo cell builds two assemblies,
and three per shard still finish inside the matrix floor, so they cost
no wall clock.

Language is an axis on the modulith half only, and the grid is what
made it one. A shard that runs nothing is worse than no shard, since
the check name asserts coverage that does not exist — and before the
modulith's Kotlin cells were built, `jvm-modulith-*-kotlin` would
have been precisely that. On the `basic` half it stays out: those
shards already sit near their longest-file floor, so splitting them
by language would buy attribution and no wall clock, at the price of
three more JDK provisionings.

Sharding buys much less than the shard count suggests, because each
Gradle build is itself parallel and concurrent ones contend. The
smallest modulith shard is already bound by its own longest file,
which is where splitting stops paying.

Each shard lists its files explicitly in `.github/workflows/ci.yml`,
which means **a new suite must be added to a shard or it never runs**.
That is enforced, not remembered: `tests/ci-workflow.test.ts` parses the
workflow and fails in `verify` when the matrix and `tests/e2e/` disagree.

One scheduling detail shapes how these files are split. Vitest runs
files in parallel workers but the tests _inside_ a file in sequence, so
the slowest single file is the floor for the whole job — which is why
the modulith cases live in three files (`-modulith`, `-persistence`,
`-maven`) rather than four `it`s in one. When adding a long case, prefer
a new file over another `it` in a long one.

The other half of that detail is that parallel workers do not divide the
work by their number. Each Gradle build is itself parallel, so
concurrent ones contend, and the effective divisor climbs with the file
count without ever approaching the core count. The practical
consequence is for measurement rather than for design — a file timed
while many neighbours race it reads far slower than the same file timed
against two, so **re-measure on the shard shape you intend to ship**
before rebalancing the matrix.

Locally you are more likely to have one JDK than two, which is where the
next paragraph bites.

**Maven cases need more than Gradle ones.** A JVM stack scaffolds onto
either build system, and the e2e harness follows the spec's
`buildSystem`. Maven cases additionally require `mvn` on PATH — the
wrapper is generated by `mvn -N wrapper:wrapper` — and a `JAVA_HOME`
pointing at **JDK 25 or newer**. Gradle needs no such thing:
`settings.gradle.kts` carries the foojay resolver and provisions a
matching toolchain itself, while Maven compiles with whatever JDK runs
it, so an older `JAVA_HOME` fails with `release version 25 not
supported`. Maven cases skip themselves rather than fail when either
prerequisite is missing.

The catch is that the host `gradle` — the one that generates the
wrapper — **cannot start on JDK 25 before Gradle 9**: 8.x fails with
the version string as the entire error message. So a single-JDK box
running Gradle 8.x has to choose, and the usual choice is an older
`JAVA_HOME` (Gradle green, Maven skipping). Two ways out: point
`JAVA_HOME` at a 25+ JDK for the Maven cases alone —

```sh
KEEL_RUN_E2E=1 JAVA_HOME=/path/to/jdk-25 \
  pnpm vitest run tests/e2e/walking-skeleton-modulith-maven.test.ts
```

— or install a host Gradle 9.x, which is what CI does, and run
everything on one JDK 25.

### Mutation testing

```sh
pnpm test:mutation               # stryker over src/domain
pnpm test:mutation --force       # ignore the incremental file, retest everything
```

Stryker with the vitest runner, scoped to `src/domain`
([#74](https://github.com/rgoussu-dev/keel/issues/74)): the engine
(predicate, resolver, answers, apply, install) is where a surviving
mutant means a real hole in the composition logic's coverage.
Widening to `src/application` / `src/infrastructure` is follow-up
work. Three decisions shape the config (`stryker.config.mjs`), each
recorded there too:

- **Report-only.** `thresholds.break` is `null`: the run never fails
  on score, it reports. A hard gate on an unknown baseline blocks
  unrelated PRs; the threshold arrives once the baseline is known and
  has settled.
- **Static mutants are ignored** (`ignoreStatic: true`), and this is
  the one deliberate hole in the score. A static mutant lives in code
  executed at module load — here, overwhelmingly the module-level
  adapter and vertical definition tables — so coverage cannot be
  attributed to individual tests and every such mutant re-runs the
  whole suite. Measured on the first full run: 2274 of 9085 mutants
  (25%), estimated by Stryker at 71% of the run. Their guard is the
  unit assertions over emitted trees plus the e2e grid, which is a
  stronger check of that declarative surface than a mutant re-running
  the unit suite.
- **Mutants run against `vitest.stryker.config.ts`**, which is the
  ordinary config minus six suites — all excluded by construction,
  not by environment. `tests/e2e/` decides for itself whether to run,
  and on a box with a JDK on PATH it would happily build a real
  project once per mutant. `tests/version-pins.test.ts` is a text
  sweep over the sources rather than a behavioral test, and Stryker
  runs the suite against an **instrumented** copy of the tree: every
  mutable literal is wrapped in a mutation switch, so
  `version: '42.7.13'` reaches the sandbox as
  `version: stryMutAct_9fa48("4286") ? "" : (stryCov_9fa48("4286"), '42.7.13')`
  and the registry patterns, anchored on the surrounding syntax, stop
  matching. Left in, the guard fails the initial dry run and aborts
  the whole run before a single mutant is tested. It would be the
  right exclusion regardless: a text sweep sees the mutant in the
  _source_ rather than in the behavior, so a mutant blanking a
  version literal in `src/domain/core/adapters/` would fail the guard
  and be scored killed — coverage credited to an assertion nobody
  wrote. The guard's home is `verify`, on every push and PR, against
  the real tree. The composition grid
  (`tests/domain/core/composition-grid/`) sweeps the registry in a
  `beforeAll`, which the runner attributes to no test: its own tests
  cover nothing, so it could kill no mutant, and a mutant only it
  reaches would count as static — Ignored under `ignoreStatic`,
  rather than reported as uncovered. The shared-file byte golden
  (`tests/domain/core/shared-files.golden.test.ts`) runs its installs
  in a `beforeAll` too, and is left out for the same reason, as are
  the growth golden and its render guard
  (`tests/domain/core/growth.golden.test.ts`,
  `tests/domain/core/growth-render.test.ts`).

Incremental mode is on: `reports/stryker-incremental.json`
(gitignored) records what was tested against which code, so a re-run
only retests mutants whose code or covering tests changed — minutes,
against hours for a cold run. The HTML report lands in
`reports/mutation/mutation.html`.

The first full run on this shape (2026-08-18, 4 vCPUs, 155 minutes
for the 6852 non-static mutants) put the baseline at **67.47%** —
75.37% on covered code; 4519 killed, 104 timeouts, 1511 survived,
718 without coverage. The shape of the number matters more than the
number: the engine the scope was chosen for sits at 78–100%
(`mediator` 100, `answers` 98, `install` 96, `resolver` 93,
`predicate` 88, `apply` 78; `actions`, the deferred-action runner,
is its outlier at 60), and the tail is concentrated in the
composition adapters and verticals — 31 files score 0, all of them
declarative surface whose primary guard is the emitted-tree
assertions and the e2e grid. That distribution is what the break
threshold conversation starts from.

CI runs this in `.github/workflows/mutation.yml`, on `main` rather
than on PRs: every push to `main` is an incremental run, a weekly
schedule retests everything (`--force`, correcting whatever the
incremental diffs accumulated), and `workflow_dispatch` covers the
rest. A report nobody is gated on is most useful as a current picture
of `main`; the job moves onto PRs when the break threshold does. The
incremental state rides the actions cache, the report is a run
artifact, and losing the cache costs a full run, not correctness.

### Version currency

The emitted templates pin framework and tool versions (Quarkus /
Spring / Micronaut BOMs, the Gradle wrapper, Node majors, Cargo
requirements, image tags, …), and the binding spec says "always latest
stable" — so those pins rot silently. Two pieces keep that honest
(roadmap [#75](https://github.com/rgoussu-dev/keel/issues/75)):

- **The registry.**
  [`assets/composition/version-pins.json`](../assets/composition/version-pins.json)
  records every pin: its value, where it lives (glob + regex over the
  template trees and the adapter sources), and the upstream feed that
  knows the latest stable. `tests/version-pins.test.ts` runs in
  `verify`, offline, and fails when the registry and the templates
  disagree — or when a sweep of the templates finds a pin-shaped
  string no entry claims. Adding a pin means adding (or extending) an
  entry; the failure message names the file and the match.
- **The covered surfaces.** The registry describes more than the
  template trees. It also covers the manifest's `toolchain` block —
  every need's version and the entry it cites (`ToolchainNeed.source`)
  — and the provisioning providers' **spellings**: the JDK
  distribution the mise and asdf records qualify the block's major
  with (`mise-java-distribution`, `asdf-java-distribution`) and the
  nvm release its bootstrap installs from (`nvm-installer`). Those
  three are `check: none` on purpose: a distribution name is a
  provider-record decision, not a version, so it is human-reviewed
  like any pin bump rather than chased upstream.
- **One entry per toolchain fact.** The `toolchain` block, the
  `dev-container` features and the `ci` setup steps used to state
  their versions independently. They now resolve through
  [`src/domain/core/adapters/version-pins.ts`](../src/domain/core/adapters/version-pins.ts),
  whose `TOOLCHAIN_PIN_SOURCE` names the registry entry each tool's
  version comes from — so a pin bump is one edit and the three cannot
  disagree. `tests/toolchain-pins.test.ts` is the wall around that: it
  scaffolds each family, reads the versions back out of the emitted
  `devcontainer.json`, `ci.yml` and `.gitlab-ci.yml`, and fails in
  `verify` when any of them departs from the recorded needs. It also
  lists the surfaces that deliberately state **no** version (GitHub's
  `go-version-file`, `rustup update stable`, corepack's
  `packageManager`), so one quietly growing a literal is equally red.
- **The report.** The suite under `tests/currency/` fetches each
  entry's upstream latest stable and fails per pin on drift. It is
  **opt-in** (`KEEL_RUN_CURRENCY=1`) and runs on a weekly schedule in
  the `version-currency` workflow — never on PRs, since an upstream
  release must not turn unrelated PRs red. A red run there is the
  report, not a build failure: bumping stays a human-reviewed change
  that updates the template(s) and the registry together, proved by
  the e2e grid. Range pins (npm carets, Cargo requirements) only count
  as drifted when the latest stable escapes the range.

```sh
KEEL_RUN_CURRENCY=1 pnpm vitest run tests/currency
```

### The composition sweep

The composition grid (above, and [`tests/AGENTS.md`](../tests/AGENTS.md))
holds keel's composition surface in `verify`, so it reads each preset's
opening dials only — each extra alone, and the whole menu — and answers
one non-default choice per question. The weekly lane under
`tests/sweep/` asks the same engine the rest, on **every dial setting
`keel.dials` offers** every preset: each build system, module layout,
peer context and, on a product, each repository layout and each
service's build system, every one again with the agent harness left out
where it may be. The settings are walked from the replies
(`tests/support/dial-walk.ts`, the walk the `keel ui` API test makes
too), never listed. Three suites, each a test per preset:

- **`extras`** — every set of offered extras: the full powerset of the
  setting's menu (a product's per service), each set ticked as the page
  ticks it, so each box brings what it needs. Each set must be one
  `keel.dials` keeps as it is. Its preview must be Ok (I1, I2), and a
  dry-run install must stage the same paths, kinds and bytes (I9).
  Named backwards, in every order for up to three extras, and in every
  order its boxes can be ticked in for up to three boxes (what a user
  ticks, before what those bring), it must stage the same too (I8). On
  a product, a set whose every extra the product also takes without a
  service (`--with persistence` for `--with backend:persistence`) is
  sent that way as well, to a preview and a dry-run install, and must
  stage what it stages per service.
- **`arrival`** — every ordered pair `(x, y)` of offered extras, with
  what each needs, installed for real into scratch directories: one run
  naming both, against `keel new --with x` then `keel add y` (in `y`'s
  service directory on a product, with the `--refresh` the add's
  preview proposes). Each extra also arrives on its own the same way,
  `keel new` then `keel add y` against `keel new --with y`, the path a
  user takes most. The two trees must hold the same bytes, file for
  file, and each manifest is compared with its timestamps, key order
  and arrival-ordered lists normalised. The planner sorts whatever set
  it is given, so no naming order can catch a vertical whose
  `contribute()` reads another without declaring it
  (`Vertical.reads`). Arrival can: the undeclared read writes one thing
  when the other vertical is already there and another when it is not,
  and a refresh does not hide it, since a refresh re-renders only the
  verticals that declare the read. A declared read shows as the
  refresh the later add proposes. A read is a fact about two verticals,
  so pairs are exhaustive for it.
- **`choices`** — previewed with no answers, three ways: the whole menu
  ticked, no extra, and each offered extra ticked alone with what it
  needs. The whole menu alone would miss questions: an extra can answer
  another's (`ci` decides distribution's CI provider) or move it onto
  another adapter (a container image takes a CLI's distribution off
  the native binary, and its targets), and a whole menu that throws
  asks nothing. Then every question an adapter asks is answered with
  each choice it offers (for a `multi-select`: none, each one alone,
  and all; for a free-form question, one sample), one answer per body,
  on the first of those targets that offers it. Each body must preview
  and install as a dry run without a throw or a refusal, the preview
  must read the answer, and both must stage the same changes.

Opt-in (`KEEL_RUN_SWEEP=1`); every suite self-skips otherwise, so
`pnpm test` and `verify` never run it — only `machinery.test.ts` beside
them, which holds the lane's helpers there in about a second, so one
that rots is caught on a PR. `KEEL_SWEEP_STACKS` narrows a run to the
presets it names, and a name the catalog lacks, or a list that names
none, fails the run rather than sweeping nothing:

```sh
KEEL_RUN_SWEEP=1 pnpm vitest run tests/sweep                                   # every preset: about an hour
KEEL_RUN_SWEEP=1 KEEL_SWEEP_STACKS=go-http,ts-cli pnpm vitest run tests/sweep  # two presets, about half a minute
KEEL_RUN_SWEEP=1 KEEL_SWEEP_STACKS=fullstack pnpm vitest run tests/sweep/arrival.test.ts
```

**What it costs.** It was measured in full when it landed
(2026-09-25, four vCPUs). `tests/sweep` took 57 minutes of wall time,
with the three files running in three workers.

- `extras` is the long pole, at 57 minutes. Over 340 dial settings it
  ticked 96,160 subsets, which came to 28,288 distinct sets. Each set
  went to `keel.dials`, a preview and a dry-run install: 79,740
  previews in all, counting the reorderings and the 120 sets spelled
  without services, and 28,408 dry-run installs. Most of that time is
  the products. A polyrepo product offers twelve extras, six in each
  service, which makes 1,024 sets on each of its settings. The four
  products with a build-system dial in both services ran side by side
  and took about 47 minutes each.
- `arrival` took 21 minutes, measured again on its own once each extra
  also arrived alone: 8,928 pairs and 1,844 extras alone, 6,288
  scaffolds and 10,496 adds, all written to disk.
- `choices` took 8 minutes: 6,346 answers to 3,974 questions.

That is about 179,000 dispatches, all through the mediator. The
workflow's limit is three hours. Swept alone, a preset takes from
seconds to some eleven minutes — `KEEL_SWEEP_STACKS=fullstack`, a
product with a build-system dial in each service, nearly all of it
`extras` — and `KEEL_SWEEP_STACKS=go-http,ts-cli` runs all three
suites in about half a minute.

**Reading a red run.** There is no golden and no known file: a red run
is the report. Each failing test is a preset. Its message counts what
it found, groups the findings by kind (what does not hold, and which
paths differ), and lists under each kind every command line that
reproduces it: `keel new …`, with the `--set` that answered a question,
or for an `arrival` pair, the one run naming both `; against` the two
runs (`keel new … then keel add …`). It also gives the sizes of the
two change lists or trees it compared. Nothing a dispatch answers ends
a preset early: a throw or a refusal from `keel.dials`, on a setting
or a set, is a finding like one from a preview or an install, and the
preset goes on. The one exception is the blank preview a product's
repository layouts are read from, which the composite grid already
holds in `verify`. An `arrival` finding names each extra as `--with`
does (`backend:persistence` on a product) and says what kind of
difference it is, from which way the two trees differ:

- `the manifest records them otherwise` — the same files, another
  record;
- `lines … in another order` — an adapter whose output follows the
  order it runs in;
- `leaves files … never writes` — files only the two runs hold, and
  nothing else but a record, where the add's refresh moves a vertical
  onto another adapter: the refresh does not take back what the first
  adapter wrote;
- `other files` — anything else: a file only one run holds, or one
  holding other bytes, refresh or none. That is what an undeclared read
  looks like, or an order-dependent adapter.

A pair that differs only as `y` does arriving on its own is listed
under one heading, `arriving after another extra … only as it does
arriving on its own`, so a fact about `keel add y` reads once, not once
per `x`. Each preset logs one summary line
(`[sweep:<suite>] <preset>: … settings, … sets, … previews …`), and
each suite logs its totals once at the end. A setting that offers more
extras than the powerset bound (twelve, `POWERSET_BOUND`) is swept over
every set of up to three, the whole menu less each one, and the whole
menu, with a warning in the log. No shipped setting passes it: a
polyrepo product offers exactly twelve, and is swept whole.

What a run found when the lane landed, and what is left to plan from it,
is in [`roadmap.md`](roadmap.md) → Q3.4.

CI runs it in `.github/workflows/composition-sweep.yml`: weekly, Monday
04:41 UTC, and on dispatch (its `stacks` input is `KEEL_SWEEP_STACKS`).
It is never on a PR, and it needs Node alone.

### The toolchain real-install suite

The provisioning engine (`keel toolchain install`, the bounded
context under [`src/domain/toolchain/`](../src/domain/toolchain/))
is proved in `verify` with fakes: the rendered `mise.toml`, the
delegation sequence, the check verdicts. What fakes cannot prove is
mise itself — that `mise trust` + `mise install` really provision
the rendered file and that `mise ls --current --json` parses. The
suite under `tests/toolchain/` does exactly that, against a real
mise on PATH, provisioning the cheapest need in the vocabulary
(pnpm, version from the pin registry).

It is **opt-in** (`KEEL_RUN_TOOLCHAIN=1`), the `tests/currency/`
pattern, and deliberately never in the PR matrix: it reaches the
network and mutates the runner's mise state, neither of which
belongs in a fast gate. Opting in asserts mise is installed — the
first test says so loudly instead of skipping silently.

```sh
KEEL_RUN_TOOLCHAIN=1 pnpm vitest run tests/toolchain
```

It covers mise, the default answer on the manager dial, and only
mise. The other records (asdf, nvm, corepack) are proved in `verify`
with fakes — their rendered files, their invocation sequences, their
status parsers — plus one direct test of the coverage invariant
itself: for every family profile the `toolchain` vertical really
produces, every choice the dial offers covers that profile whole.
Extending the real-install suite to a second manager means a second
tool on the runner and a second mutated state, so it waits for a
reason beyond symmetry.

### Upstream checks

`tests/upstream/` checks the agent behaviour keel's emitted harness
rests on, against the real tool rather than an assumption. Today it
holds one suite: Claude Code loads a nested `CLAUDE.md` when a file in
its directory is read, and resolves its `@AGENTS.md` import relative to
that file — the shape of every per-directory doc pointer. It is opt-in
(`KEEL_RUN_UPSTREAM=1`, plus `claude` on the PATH), spends one short
Haiku session of the operator's subscription, and never gates a PR:

```sh
KEEL_RUN_UPSTREAM=1 pnpm vitest run tests/upstream
```

## Harness evals

`evals/` measures how well coding agents navigate what keel emits —
the harness redesign program (#147) is judged on its before/after
numbers. The rig is deliberately **agent-agnostic**: the emitted
harness serves every AGENTS.md-reading agent, so a rig tied to one
CLI would validate one consumer.

- **Cases are data** — `evals/cases/<name>/case.yaml`: id, tags, a
  `scaffold` block (stack, growth steps, sticky answers), prompt,
  oracle, budgets (wall-clock seconds + max turns — never USD), runs.
  Nothing agent-specific may appear in a case; the strict schema
  (`evals/lib/case-schema.mjs`) refuses unknown keys. Each case ships
  a reference `solve.sh` proving it solvable.
- **Drivers are adapters** of the `AgentDriver` port
  (`evals/drivers/driver.mjs`): `probe()` (installed? version?),
  `run()` (maps case concepts — autonomy, config isolation, budgets —
  to that agent's CLI flags), `harvest()` (normalized metrics). Each
  driver declares a **capability manifest** per mode; a metric it
  cannot measure is `null`, never a guess. Shipped: `claude-code`
  (reference, both modes) and `codex` (`codex exec --json`, scripted)
  — the second driver exists because one driver would make the seam
  fiction. The canonical fake (`fake-driver.mjs`) sits beside them.
- **The oracle judges workspace state**, never agent output: the
  universal floor every agent shares is oracle verdict + wall time +
  git diff stats against a pinned baseline. Navigation probes have
  the agent write `key=value` lines to `.keel-eval/answers.txt`
  (excluded from the diff), graded by exact match, with
  `clean_worktree` asserting the probe stayed read-only.
- **A static context-budget audit** (`evals/lib/context-audit.mjs`)
  rides along in every benchmark: sizes of every `AGENTS.md` /
  `CLAUDE.md` / skill body the emitted harness asks an agent to
  carry.

### Two lanes

- **Lane A, navigation** (`baseline`): orientation questions answered
  by writing paths into `.keel-eval/answers.txt`, graded by exact
  match, `clean_worktree` asserting the probe changed nothing. Cheap,
  read-only, and the lane the redesign's "zero search calls" claim is
  measured on.
- **Lane B, tasks** (`tasks`): SWE-bench shape. The setup injects a
  failing test into a scaffolded project; the agent has to make it
  pass; the oracle is `check.sh` — **the injected test passes AND the
  project's own build stays green**. One case per family, five in
  all, each the same change carried through every ring of that
  family's hexagon, so a campaign compares harnesses rather than
  languages. Each ships a reference `solve.sh`, and the rig proves it
  (see [Proving the cases solvable](#proving-the-cases-solvable)).

  A task run is heavy — fifteen agent sessions, each ending in a real
  Gradle, cargo or npm build — which is why the campaign is
  dispatch-only and never scheduled against an agent.

### A/B: what a harness change was worth

A **variant** is a harness overlay, and a campaign records the one it
ran under. Two kinds:

- **An overlay directory** (`--variant <id> --overlay <dir>`): every
  file under it is copied over each prepared workspace after the
  scaffold and before the git baseline, so the agent meets the
  variant and the diff floor still starts at zero. A `.keel-remove`
  list in the overlay deletes paths first — exact paths, or `**`
  patterns matching a name at depth one or deeper, which is how
  `evals/overlays/no-nested-docs` takes the per-directory documents
  and leaves the root one.
- **A keel ref**: check it out, `pnpm build`, run the campaign with
  `--variant <ref>`. The benchmark already records `keel.commit`, so
  the report names what it compared.

Then pair the two benchmarks:

```sh
node evals/ab.mjs --before evals/results/tasks-claude-code-scripted.json \
                  --after  evals/results/tasks-claude-code-scripted-no_nested_docs.json
```

Three rules the report encodes, all of them about not over-reading a
small sample:

- **Paired per scenario.** A case is compared with itself, never with
  the campaign average — cases differ from one another far more than
  harnesses do, so an unpaired comparison measures the case mix. A
  case only one side ran is listed under `unpaired` and compared
  nowhere.
- **One stddev is the tripwire, not a p-value.** N=3 is a regression
  detector. A delta inside the pooled spread of the two samples
  (`sqrt((sa² + sb²) / 2)`) is this campaign's noise, and the report
  marks the ones that clear it rather than leaving it to the eye.
- **The analyst pass runs first.** A case both variants pass every
  time discriminates nothing; one that passes sometimes is flaky and
  its own variance can swamp the harness effect. Both are flagged on
  the case, because the fix is to the case.

A comparison may vary the harness and nothing else: `ab.mjs` refuses
two benchmarks whose campaign, driver, version, mode or model differ,
and refuses two of the same variant.

### Two drive modes

- **Scripted** — the automation default where the CLI supports it:
  the driver spawns the agent headlessly (`claude -p --output-format
stream-json --setting-sources project`, `codex exec --json
--sandbox workspace-write --ignore-user-config`) and parses its
  structured stream. Config isolation keeps the operator's home-dir
  settings, skills and MCP servers out of the run; `--bare` is never
  passed — it would also drop the project layer under measurement.
- **Attended** — for agents without headless structured output, or
  to measure exactly what an interactive subscription session does:
  the rig prepares the workspace and prints the prompt; the operator
  pastes it into a normal interactive session of their agent, and
  presses Enter when it finishes. The rig then runs the oracle, wall
  clock and git diff as usual, and harvests the session transcript
  where the agent leaves one (Claude Code:
  `~/.claude/projects/<cwd-slug>/<session>.jsonl`). The model is the
  operator's to pick in that session, and the rig cannot verify it, so
  an attended benchmark records `driver.model` as `null` — the
  driver's manifest says so (`model: false`), the same way it declares
  a metric it cannot measure.

### Billing posture

Headless ≠ API billing: `claude -p` uses whatever auth the CLI
holds, and subscription OAuth (`/login`) works headlessly. The rig
strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from every agent
environment so a stray key cannot silently re-bill a campaign;
`KEEL_EVALS_API_BILLING=1` is the explicit opt-in. `total_cost_usd`
is a client-side estimate — notional on Pro/Max — so it is recorded
as an estimate and **budgets are wall-clock + max-turns + case
count, never USD**. Subscription runs draw from the operator's
normal session allowance: campaigns stay small (5 representative
stacks, a handful of probes, N=2 — ten sessions, and
`tests/evals/probes.test.ts` holds the baseline at that ceiling) and
run locally.

The model is pinned too, never inherited. `claude -p` would otherwise
run whatever the operator last picked interactively, so two baselines
captured on two machines could measure two models. The `claude-code`
driver passes `--model sonnet` unless `--model <id>` says otherwise
(`opus` is the other reasonable choice; a campaign is a claim about
the harness, not the model, so keep it at one of those). The `codex`
driver maps `--model` onto `-m` and otherwise leaves Codex's own
default, declaring none. The benchmark records the effective model
under `driver.model` — `null` when neither the flag nor the driver
named one.

### Running

```sh
node evals/run.mjs --list                    # campaigns and cases, no gate
node evals/run.mjs --check [--driver codex]  # agent installed + authenticated?
node evals/run.mjs --solvable --campaign tasks   # reference solutions, no agent
KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline
KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --model opus
KEEL_RUN_EVALS=1 node evals/run.mjs --campaign tasks \
  --variant no-nested-docs --overlay evals/overlays/no-nested-docs
```

Live runs are gated on `KEEL_RUN_EVALS=1` (plus per-driver auth:
`claude /login` or an authenticated `codex`) and need `pnpm build`
first — workspaces are scaffolded through the packaged CLI, the very
commands the verify suites dispatch in process, so the two trees
cannot drift. Results land in
`evals/results/<campaign>-<driver>-<mode>.json` — with `-<model>`
and `-<variant>` appended when either is named, since both are part
of a benchmark's identity and an Opus run must not overwrite the
Sonnet one, nor a variant its baseline — **written after every run**, not once at the end: each run is a paid agent session,
and a crash in the ninth must not discard the eight. Each write is a
sibling temp file renamed over the benchmark, so a kill mid-write
leaves the previous checkpoint rather than a truncated one. Every
prepared workspace is kept under the OS temp directory
(`keel-eval-<case>-*`), and the benchmark names it per run: it is
what you open to see what the agent did with the tree, and the diff
and transcript are read from it after the fact. Nothing removes them
but the OS's own temp cleanup — a campaign is ten of them, each with
its installs, so clear `keel-eval-*` by hand when you are done with a
benchmark. A scaffold that fails removes its own directory before the
retry. The file
carries `complete: false` until the campaign finishes.

A scaffold that fails is retried once — it runs real package managers
and real wrappers, and the first baseline attempt lost eight sessions
to an npm internal error that did not recur — and a second failure is
recorded as an `unprepared` run: no agent ran, so nothing was
measured, and the run is kept out of every rate rather than counted
as a failure. The campaign goes on; the summary carries the count.
Once the cause is fixed, `--only <case-id>` (repeatable) re-runs just
those cases and folds them into the existing benchmark — same
campaign, and the same driver down to its version and model, or it
refuses before a workspace is built or a session is spent (an agent
upgraded between sittings is a different measurement) — and the file
records the merge under `merged`, naming the cases and the keel
commit they were re-run at, so a baseline finished in two sittings
says so. While a re-run case is still in progress (its entry says
`complete: false`) its earlier entry stays in the file: a kill
mid-case loses the partial re-run, never the measurement it was
replacing. And the merged file is `complete` only once every case of
the campaign has a settled entry from one sitting or the other — a
one-case `--only` over an interrupted campaign does not call it
finished.

**The baseline is the owner's local step.** The `baseline` campaign
captures the current emitted harness _before_ the redesign lands:
run the command above on a machine with Claude Code authenticated
and commit the resulting `evals/results/baseline-*.json`. It draws
on the owner's Claude subscription, so no CI job and no cloud
session can capture it — and it must exist before #134 merges, or
the "before" is unrepeatable.

The benchmark records the keel commit it ran at and whether the
working tree was dirty (`keel.dirty`), because the commit alone would
name a tree the run did not measure. The committed baseline
(`baseline-claude-code-scripted.json`) says `73bf83b`, dirty: both
sittings ran on the working tree that became the rig commits landed
just after it (the npm override for the TypeScript scaffold, the mise
toolchain, the runner's retry and merge), none of which touches the
emitted harness. What the attribution rests on is the audit the
benchmark carries: the `contextAudit` of every baseline case — the
`AGENTS.md`, `CLAUDE.md` and skill bytes the agent was handed — is
byte-for-byte what a clean checkout of `73bf83b` grows for that case
(`tests/support/evals-fixture.ts` over the same scaffold blocks), so
the harness measured is that commit's. The "after"
(`after-wave2-claude-code-scripted.json`) ran clean.

### Proving the cases solvable

```sh
node evals/run.mjs --solvable --campaign tasks [--only task/go-http]
```

The terminal-bench rule as a command: for each case it prepares a
real workspace, runs the setup, checks the oracle is **red**, runs
the reference `solve.sh`, and checks the oracle is **green**. No
agent, so it is neither billed nor gated on `KEEL_RUN_EVALS` — but
the oracle is each family's own build, so it needs the family's
toolchain (`mise install`).

Both halves rot, and differently. A template change that moves a
wiring file breaks the reference solution; a scaffold that starts
shipping the feature makes the oracle green before anything solves
it, and **an eval whose oracle is already green measures nothing
while looking perfectly healthy** — which is why the first check is
that it starts red. The `harness-evals` workflow runs this weekly.

### The workflow

`.github/workflows/harness-evals.yml` — report-only, the
`mutation.yml` precedent, never a PR gate. Two jobs:

- `solvable` runs on the weekly schedule and on every dispatch. No
  key, no billing; it provisions every toolchain `mise.toml` pins,
  because the campaign spans every family.
- `campaign` is dispatch-only and opt-in (`agent: true`). It installs
  the chosen driver and runs with `KEEL_EVALS_API_BILLING=1`: on a
  runner there is no subscription to protect, so the key **is** the
  auth. The benchmark is uploaded as an artifact on every outcome —
  a campaign killed at the timeout has still paid for the sessions it
  finished, and the runner checkpoints after each one. Two
  dispatches, one per `variant`, make an A/B.

**`verify` never makes an agent call.** The rig's unit tests
(`tests/evals/`) drive the whole runner through the fake driver and
fixture transcripts, and prove every shipped probe solvable by
growing its fixture in process
(`tests/support/evals-fixture.ts`) and running the reference
`solve.sh` against the real oracle. An adapter that moves a wiring
file breaks `verify`, not the owner's live campaign. Evals are never
a PR gate.

For the task cases, `verify` proves everything that needs no
toolchain — the setup lands where the scaffold really is, and the
oracle starts red — and leaves the build half to `--solvable`. It
also sweeps the **driver registry**: every driver declares how it
keeps the operator's home-dir configuration out of a measured
session (`isolation`) and is held to actually passing it, because
that failure arrives with the _next_ driver and a campaign that read
the operator's machine would report it as a harness finding.

## Adding surface

- **A stack** is an entry in
  [`src/domain/core/stack-presets.json`](../src/domain/core/stack-presets.json)
  — tags + vertical ids + the dials it offers. Add it to
  `tests/domain/core/stack-registry.golden.json` in the same change;
  that file is the frozen picture of what users see, and the guard
  beside it fails in `verify` when the two disagree.
- **An adapter** lives in `src/domain/core/adapters/` with its
  template tree under `assets/composition/<vertical>/<adapter>/`, and
  registers in its vertical's adapter list.
- **A vertical** lives in `src/domain/core/verticals/` and declares
  the dimensions its adapters must cover.
- **A stack or a vertical** adds cells to the composition grid.
  Regenerate the grid's goldens (`KEEL_UPDATE_GOLDEN=1` over
  `tests/domain/core/composition-grid`, greenfield first — brownfield's
  I5 reads its golden) and read the verdict diff; a cell that breaks
  an invariant fails the grid rather than joining its known file. A
  single-service stack, or a vertical one installs or offers, also
  adds or moves cells of `tests/domain/core/shared-files.golden.json`,
  the byte golden of the files several adapters write into
  (`README.md`, the build files, `devcontainer.json`), as does any
  template or pin change that reaches one of those files — a bounded
  context's registration in them included, which its module-history
  cells pin. That golden reads no other, so regenerate it on its own —
  `KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/domain/core/shared-files.golden.test.ts`
  — and check that only the files you meant to change moved. A
  single-service stack, a dial, or an adapter keyed on an entrypoint
  tag — a context's wiring adapter included, which its module-history
  cells read — moves `tests/domain/core/growth.golden.json` too, what
  adding an entrypoint reads on each preset; it reads no other golden —
  `KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/domain/core/growth.golden.test.ts`
  — but the grid's growth axis reads it (I10 holds each grown cell to
  the refusal it records), so regenerate it before the grid.

See the [composition model](composition.md) for the vocabulary, and
the [roadmap](roadmap.md) for what's wanted next.

## Related

- [CONTRIBUTING](../CONTRIBUTING.md) — fork workflow, commit
  conventions, PR expectations.
- [Release process](release.md) — for maintainers.
- [Contributor guide for coding agents](../AGENTS.md).
