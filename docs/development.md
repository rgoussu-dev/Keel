# Development guide

For working on keel itself. The contribution workflow (forks, PRs) is
in [CONTRIBUTING.md](../CONTRIBUTING.md); this page is the technical
side.

## Requirements

- Node 22+
- pnpm 10+
- For the JVM e2e suites: **JDK 25** on `JAVA_HOME`, **Gradle 9.7.0**
  on PATH, and Maven. Those three are coupled and none of them is
  arbitrary — see [End-to-end tests](#end-to-end-tests).

### Claude Code on the web

`.claude/hooks/session-start.sh` provisions the above on session start,
so a web session's toolchain matches CI's rather than the image's. It
runs only when `CLAUDE_CODE_REMOTE=true`, so it never touches a
developer's own `/opt`, and it is idempotent — a warm container
re-runs it in about a second.

It fixes two things the image gets wrong for this repo:

- **Gradle 8.14.3 ships on the image and cannot start on JDK 25.**
  `/opt/gradle` is a symlink already on PATH, so the hook downloads the
  version keel pins and repoints it. That version is read from
  `GRADLE_VERSION` in `src/domain/core/adapters/gradle-wrapper.ts` —
  the constant every generated wrapper gets — rather than being a
  third copy of the number to keep in sync.
- **`JAVA_HOME` lands on 21**, because the image's shell profile
  exports it and beats the `env` block in `.claude/settings.json`. That
  one is quietly expensive: the Maven e2e suites skip themselves below
  JDK 25, so a stale `JAVA_HOME` does not fail the Maven half of the
  modulith grid, it runs none of it — and a skipped suite reads exactly
  like a passing one. The hook writes `JAVA_HOME` to
  `$CLAUDE_ENV_FILE`, which does apply.

**On the pinned Gradle checksum.** `GRADLE_SHA256` in the hook is
checked against Gradle's published SHA-256, and the install aborts on
a mismatch rather than proceeding with unknown bytes.

Adding an entry takes one manual step, because the sandbox cannot do
it alone: the published checksums
(`https://services.gradle.org/distributions/gradle-<version>-bin.zip.sha256`,
or <https://gradle.org/release-checksums/>) are proxy-blocked from a
web session — 403 on the CONNECT tunnel — while the distribution URL
beside them is not, since it redirects to an allowlisted host. So the
published value has to be fetched from an unrestricted network and
compared there. A hash computed from our own download proves only that
a later download matches the earlier one; it says nothing about
whether either is the release Gradle shipped, and the two claims
should not be confused.

What the sandbox _can_ do is the other half of that comparison, and it
is worth doing: once the published value arrives from an unrestricted
network, download the distribution here and check that the two agree.
Two independent paths reaching the same digest is a real cross-check —
what it rules out is one of them having been tampered with in transit.
It is not a substitute for the published value; it is a confirmation
of it, and it fails loudly when the paths disagree. The 9.7.0 entry
was added exactly this way.

Bumping `GRADLE_VERSION` without adding a matching entry warns loudly
and continues, rather than bricking every session over a routine
version bump.

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
                          # vocabulary (Adapter, Vertical, …),
                          # manifest types + zod schemas, ports/
    core/                 # the engine (predicate, resolver, answers,
                          # apply, install, actions), composition
                          # adapters/ + verticals/ + stacks,
                          # handlers/, RegistryMediator
  application/
    cli/
      contract/           # commander → commands → mediator → Result
                          # rendered; zero business logic
      executable/         # composition root: wires infra adapters +
                          # handlers + mediator; no logic
  infrastructure/         # one directory per port, real adapter +
                          # canonical fake side by side (tree, prompt,
                          # manifest, template, process, commons)
assets/
  composition/            # adapter template trees (ejs), one directory
                          # per <vertical>/<adapter>/
  project/                # the binding spec (AGENTS.md) — source of
                          # truth for the universal conventions
tests/                    # vitest; mirrors src/; support/factory.ts is
                          # the shared test Factory
bin/keel.js               # npm bin entry → dist/application/cli/executable
.dependency-cruiser.cjs   # the dependency rule, enforced in pnpm lint
```

Naming note: a _composition adapter_ (`git-init`,
`quarkus-cli-bootstrap`, …) is keel **domain content** — a unit
contributing files to a scaffolded project — not a hexagonal adapter
of keel itself; those implement `src/domain/contract/ports/` and live
under `src/infrastructure/`.

## Testing approach

- Vitest, run via `pnpm test`; test files live under `tests/`
  mirroring `src/`.
- **Scenario + Factory + port pattern** from the
  [binding spec §3](../assets/project/AGENTS.md): no mocking libraries
  — fakes are built directly, side by side with the real adapters.
- Every public API change is accompanied by a test change.

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
and `jvm-combo-quarkus-java` run exactly as declared measures 227.55s
wall against a 225.43s longest file (locally, on 4 vCPUs, with cold
caches), which is inside the matrix floor — so three per shard cost
no wall clock.

Language is an axis on the modulith half only, and the grid is what
made it one. A shard that runs nothing is worse than no shard, since
the check name asserts coverage that does not exist — and before the
modulith's Kotlin cells were built, `jvm-modulith-*-kotlin` would
have been precisely that. On the `basic` half it stays out: those
shards already sit near their longest-file floor, so splitting them
by language would buy attribution and no wall clock, at the price of
three more JDK provisionings.

Measured on 4 vCPUs with cold caches, the modulith shards run
160–415s against sequential totals of 359–1015s — a divisor of
2.22–2.45, never near the 4 the core count suggests, because each
Gradle build is itself parallel and concurrent ones contend.
`jvm-modulith-micronaut-kotlin` is already floor-bound (252s wall
against a 249s longest file), which is where splitting stops paying.

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
concurrent ones contend on a 4-vCPU runner: measured, the divisor is
about 2.3 inside a four-file JVM shard and 2.8 across a sixteen-file
one — it climbs with the file count and never approaches 4. The
practical consequence is for measurement rather than for design — a file
timed while sixteen neighbours race it reads far slower than the same
file timed against three, so **re-measure on the shard shape you intend
to ship** before rebalancing the matrix.

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
  ordinary config minus two suites — both excluded by construction,
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
  the real tree.

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

## Adding surface

- **A stack** is a couple of lines in
  [`src/domain/core/stacks.ts`](../src/domain/core/stacks.ts) — tags +
  verticals.
- **An adapter** lives in `src/domain/core/adapters/` with its
  template tree under `assets/composition/<vertical>/<adapter>/`, and
  registers in its vertical's adapter list.
- **A vertical** lives in `src/domain/core/verticals/` and declares
  the dimensions its adapters must cover.

See the [composition model](composition.md) for the vocabulary, and
the [roadmap](roadmap.md) for what's wanted next.

## Related

- [CONTRIBUTING](../CONTRIBUTING.md) — fork workflow, commit
  conventions, PR expectations.
- [Release process](release.md) — for maintainers.
- [Contributor guide for coding agents](../AGENTS.md).
