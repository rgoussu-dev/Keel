# keel — contributor guide for coding agents

This is the source repository for `@rgoussu.dev/keel`, the universal Claude
Code workflow kit. Everything in this file applies to **working on keel
itself**. Projects that _consume_ keel get a different binding spec (see
[`assets/project/AGENTS.md`](assets/project/AGENTS.md)).

This file follows the [AGENTS.md](https://agents.md) convention — the
same one keel's per-layer `AGENTS.md` files use. `CLAUDE.md` at the
root is a one-line pointer importing this file, so Claude Code and
AGENTS.md-native tools read the same source of truth. keel is
**project-scoped**: everything it installs lands inside the target
project — the user's home directory (`~/.claude`) is never touched.

---

## 1. Binding spec

The universal engineering conventions are defined in
[`assets/project/AGENTS.md`](assets/project/AGENTS.md). That file is
the source of truth for the conventions every keel-scaffolded project
should follow, and the `walking-skeleton/claude-core` adapter emits
it verbatim as `<project>/AGENTS.md` (plus a one-line `CLAUDE.md`
pointer importing it) whenever a project is scaffolded.
Stack-specific addenda are appended by the family claude-kit
adapters under sentinel markers (`<!-- keel:stack-runbook:… -->`),
together with the emitted `.claude/` workflow kit — see
`docs/verticals/walking-skeleton.md`.

**keel dogfoods those conventions.** Any change to this repo must conform to
that document:

- Hexagonal architecture, dependency rule enforced.
- Business logic as Command/Query data through one dispatch seam —
  a registry Mediator on the JVM and in keel itself (handlers
  self-declare via `supports()`, never inject a `Map`); per-language
  stances for Rust/Go/frontend in spec §2.
- Tests = Scenario + Factory + port interface; fakes, never mocks.
- Walking skeleton first. IaC via OpenTofu.
- XP + SOLID + 12-Factor. Always latest stable.
- Public-API docs (TSDoc here); no comments on private code unless the
  "why" is non-obvious.

Read that file when in doubt. The rest of this document lists the
**repo-specific additions and exceptions** that apply to keel itself.

---

## 2. Exception: feature branches and PRs

The universal spec (`§6`) mandates pure trunk-based development with no
branches and no PRs. **keel deviates** for one reason: contributions land via
Claude Code cloud sessions, which require a feature branch per session and a
PR to review the result before merging to `main`.

Rules for this deviation:

- Branch name is assigned by the harness (e.g.
  `claude/<short-slug>-<token>`). Do not create arbitrary branches.
- Every PR targets `main`. Direct pushes to `main` are for `chore(release)`
  tags only.
- Commits inside the branch still follow trunk-based discipline: small,
  logical, each one individually green.
- After merge, the branch is deleted. History on `main` remains linear —
  prefer squash or rebase-merge.

Everything else in `§6` (Conventional Commits, commit discipline, "Done
means…") applies unchanged.

---

## 3. Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Types
used in this repo:

| Type       | When                                               |
| ---------- | -------------------------------------------------- |
| `feat`     | user-visible feature, new vertical, or new adapter |
| `fix`      | bug fix                                            |
| `refactor` | internal change, no behavior change                |
| `docs`     | README / CHANGELOG / CLAUDE.md / inline docs       |
| `test`     | test-only changes                                  |
| `chore`    | tooling, deps, housekeeping                        |
| `ci`       | workflow / pipeline changes                        |
| `build`    | build config, packaging, release engineering       |
| `perf`     | performance                                        |

Scopes are optional but encouraged: `fix(composition): …`,
`feat(walking-skeleton): …`, `feat(distribution): …`,
`feat(cli): …`.

One commit = one logical unit. Never mix refactor + feature + fix. Every
commit must pass `pnpm lint && pnpm typecheck && pnpm test` on its own.

---

## 4. Pull request workflow

When Claude creates a PR in this repo:

1. **Auto-subscribe** to PR activity with `mcp__github__subscribe_pr_activity`
   immediately after creation. Do not ask first.
2. **Check current state**: CI status (`pull_request_read` →
   `get_check_runs`) and review comments (`get_review_comments`).
3. **Address attention items** per the standard rules:
   - Fix now if you are confident and the change is small.
   - Use `AskUserQuestion` if the fix is ambiguous or architecturally
     significant.
   - Skip with a note if no action is needed (e.g. duplicate, stale).
4. **Reply sparingly** on GitHub — only when a reply is genuinely necessary
   (rejecting a suggestion with reasoning, explaining why something is
   intentional). A pushed fix speaks for itself.
5. **Never** create a PR the user did not explicitly request.

The PR description must include a `## Summary` and a `## Test plan`
checklist. The `Test plan` is a real list of things to verify post-merge,
not a restatement of the changes.

---

## 5. Dev workflow

Requirements: Node 22+, pnpm 10+.

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests) + prettier --check . + depcruise src
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:e2e      # vitest run tests/e2e (opt in with KEEL_RUN_E2E=1)
pnpm test:mutation # stryker over src/domain (report-only; hours cold, minutes warm)
pnpm test:watch    # vitest watch
pnpm build         # tsc -p tsconfig.build.json → dist/
pnpm format        # prettier --write .
pnpm format:check  # prettier --check .
pnpm keel <args>   # build + run the CLI in a scratch playground
```

`pnpm lint` covers eslint, prettier, and dependency-cruiser, so formatting
drift and dependency-rule violations fail the same gate as code-style
rules. A Claude `PreToolUse` hook
(`.claude/hooks/pre-commit-format.sh`) runs `pnpm format` and re-stages any
previously-staged files before every Claude-issued `git commit`, then
verifies `pnpm lint`. That means you almost never need to run `pnpm format`
by hand; if lint fails after the hook's auto-correct, it blocks the commit
and surfaces the error.

Before claiming a task done: run `pnpm lint`, `pnpm typecheck`, and
`pnpm test`. If the environment prevents running them, say so explicitly
rather than asserting success.

The CLI is intentionally thin: `keel new --stack=<id>` for greenfield
bootstrap and `keel add <vertical>` for brownfield layering. The CLI
entry is `bin/keel.js`, which loads `dist/application/cli/executable/main.js`. To try it
locally, `pnpm keel …` builds and runs it in a scratch playground
(`KEEL_PLAYGROUND` pins the directory across invocations); when the
question is packaging fidelity rather than the code, install the
`npm pack` tarball instead — both loops are documented in
`docs/development.md` → "Trying keel locally".

---

## 6. Repository layout

keel is trisected per its own binding spec (§1); every layer directory
carries a `README.md` + `AGENTS.md` with its local conventions.

```
src/
  domain/
    kernel/               # Action/Command/Query, Result, Handler,
                          # Mediator — depends on nothing
    contract/             # commands + InstallReport, composition
                          # vocabulary (Adapter, Vertical, …),
                          # manifest types + zod schemas, ports/
                          # (Tree, Prompt, Logger, Clock,
                          # ManifestStore, TemplateSource,
                          # ProcessRunner)
    core/                 # the engine (predicate, resolver,
                          # compatibility, dials, answers, apply,
                          # install, actions), composition
                          # adapters/ + verticals/, the stack
                          # presets as data (stack-presets.json)
                          # + the schema and id resolution over
                          # them (stacks.ts),
                          # handlers/ (new-project, add-vertical),
                          # RegistryMediator
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
    tree/ prompt/         # canonical fake side by side
    manifest/ template/
    process/ commons/
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
                          # as-is (no bundler). Linted with src/tests,
                          # unlike the ejs template trees above
tests/                    # vitest; mirrors src/ (domain/, e2e/,
  support/factory.ts      # infrastructure/); the shared test Factory
bin/keel.js               # npm bin entry → dist/application/cli/executable
.dependency-cruiser.cjs   # the dependency rule, enforced in pnpm lint
```

Compatibility note: an incompatibility between capabilities is a
**declaration**, never a hand-written check. A `Conflict` on the
vertical or stack that owns the rule is read three times by the
engine — to refuse an assembly, to keep the choice off the terminal's
menus, and to answer `keel.dials` for a front end that shows every
dial at once — so the three answers cannot disagree. A branch in a
handler gets only the first, which is how `--with-peer-context` came
to be offered under the flat layout and then rejected. The menu
filters live in `core/dials.ts` and both front ends call them; a
copy in a page is the same defect one layer out. See
`docs/composition.md` → Conflicts and `docs/ui.md`.

Data note: the stack presets are **data**, in
`src/domain/core/stack-presets.json`, because nothing in a `Stack` is
code — `tags` and `projects` are strings and every other field names
something registered under an id. `stacks.ts` holds the zod schema for
that file, resolves the ids against the registries at load, and keeps
`Stack` as the resolved in-memory shape. It is a JSON _module import_
rather than a file read: `getStack`/`listStacks` are synchronous
everywhere, so the registry has to resolve at load, and a module
import gets that without `node:fs` or a port in the domain.
`tests/domain/core/stack-registry.golden.json` freezes what the
registry projects onto, the way `version-pins.json` and its test do
one level up — edit a preset, edit the golden.

Naming note: a _composition adapter_ (git-init, quarkus-cli-bootstrap,
…) is keel **domain content** — a unit contributing files to a
scaffolded project — not a hexagonal adapter of keel itself; those
implement `domain/contract/ports/` and live under
`src/infrastructure/`. The `Tree` port is the composition substrate;
`infrastructure/tree/fs-tree.ts` is its default adapter, and
alternative substrates (e.g. backed by a Yjs CRDT or a remote VFS)
would ship as separate packages implementing the same port.

---

## 7. Testing approach

- Vitest, run via `pnpm test`. Test files live under `tests/` mirroring
  the `src/` structure.
- Follow the Scenario + Factory + port pattern from
  `assets/project/AGENTS.md §3`. No mocking libraries — build fakes
  directly.
- Every public API change is accompanied by a test change.
- Mutation testing is wired over `src/domain` — Stryker with the
  vitest runner, `pnpm test:mutation`, report-only until the baseline
  settles. It runs on `main`, not on PRs, so a surviving mutant never
  blocks unrelated work. Scope, the static-mutant exception, and the
  CI shape are in `docs/development.md` → Mutation testing.

---

## 8. Documentation policy

- **README.md**: the engaging front door — quickstart, stack matrix,
  per-family "How to" sections, verticals table. Keep it scannable;
  depth belongs in `docs/`.
- **docs/**: the comprehensive documentation — `docs/stacks/` (one
  page per stack family: prerequisites, questions, generated tree),
  `docs/verticals/` (one page per vertical + compatibility matrix),
  `docs/cli.md`, `docs/composition.md`, `docs/development.md`,
  `docs/release.md`, `docs/roadmap.md`. New stacks, verticals, or
  CLI flags must update the matching page(s) and the README matrix
  in the same change. Contribution workflow (forks) lives in
  `CONTRIBUTING.md`.
- **CHANGELOG.md**: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
  Every user-visible change goes under `[Unreleased]` with the appropriate
  category (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
  `Security`). At release time, `[Unreleased]` is renamed to
  `[x.y.z] — YYYY-MM-DD` and a new empty `[Unreleased]` is added. Link
  references at the bottom compare against the previous tag.
- **AGENTS.md** (this file): conventions for contributors. Update when the
  workflow itself changes. `CLAUDE.md` is only the pointer stub —
  never put content there.
- **Public API docs**: TSDoc `/** … */` on every exported symbol in `src/`.

---

## 9. CI and release

- `.github/workflows/ci.yml` runs on PRs and pushes to `main`. `verify`
  is the fast gate — lint, typecheck, test, build across Node 22 and 24;
  `tests/e2e/` self-skips there, since it is opt-in on CI. `e2e` is the
  other half, running with `KEEL_RUN_E2E=1` and **sharded by toolchain**:
  40 `jvm-*` shards (JDK 25 + Gradle 9.7.0, plus Maven on every
  `jvm-modulith-*`, every `jvm-combo-*` and every
  `jvm-add-module-*-maven`), `go` (Go + Docker), `rust` (cargo), `web`
  (npm/pnpm + Chrome), `web-combo` (npm/pnpm) and `dev-compose`
  (Docker alone). Each shard provisions only what its suites probe
  for. Between the two jobs, nothing in the suite is skipped for want
  of a tool.
- **`dev-compose` is the only shard that runs an emitted
  `dev/compose.yaml`, and it exists because nothing did.** Every other
  docker-using suite reaches its database through Testcontainers,
  which mounts no volume — so the whole grid stayed green over a dev
  database whose volume mount made PostgreSQL 18 refuse to start
  (docker-library/postgres#1259). A unit test reads the YAML; only
  `docker compose up --wait` reads it the way a user does. The suite
  fakes every deferred action, so it scaffolds the reporting stack
  with no JDK and probes for `docker` alone, and it boots the database
  only: the SELinux relabel the monitoring mounts carry is inert on a
  GitHub runner, so starting those five containers would buy the shard
  a gigabyte of pulls and no assertion.
- **The JVM shards follow the grid, and the grid comes first.** The
  `basic` typology splits by framework — `jvm-basic-quarkus`,
  `-spring`, `-micronaut`, four stacks each (CLI and REST × Java and
  Kotlin). The `modulith` typology is 25 files and splits by framework
  × **language**: `jvm-modulith-<framework>-<java|kotlin>`, four cells
  each, six on `quarkus-java` which also carries `modulith-baseline`
  and `modulith-persistence`. Never shard onto a cell no suite
  populates: a green `e2e (jvm-kotlin)` that runs nothing asserts
  coverage that does not exist, and the check name hides it. Language
  became a legal axis only once the modulith grid was closed (roadmap
  J.1); it is deliberately _not_ an axis on the `basic` half, where a
  further split buys attribution and no wall clock.
- **The Rust grid is 2 stacks × 2 layouts**, cargo being the only
  build system there, so the modulith half is
  `tests/e2e/modulith-rust-{cli,http}.test.ts` plus
  `modulith-rust-peer-context`, which is not a cell — it is the Rust
  counterpart of `modulith-baseline`, the one suite proving the
  peer-context adapter family is additive. All of it stays in the
  single `rust` shard: measured on the shipped shape that shard is
  already floor-bound by its slowest file, so a split would buy
  attribution and no wall clock.
- **Go, the TypeScript stacks and `web-components` follow the same
  shape, and their grids are small.** Go is 2 stacks × 1 build system
  (`modulith-go-{cli,http}`); each TypeScript stack is 1 stack × 2
  package managers (`modulith-ts-cli-{npm,pnpm}`,
  `modulith-ts-http-{npm,pnpm}`,
  `modulith-web-components-{npm,pnpm}`). The package manager is a real
  axis rather than a duplicate: npm's hoisting hides a missing
  dependency declaration that pnpm's isolated store refuses. Each
  family also carries a `modulith-<family>-peer-context` suite, which
  is not a cell — same role as `modulith-rust-peer-context`. Their
  `walking-skeleton-*` files keep the `basic` layout **only**; a
  modulith case living inside one is invisible to `ls tests/e2e/` and
  floors that file, which is exactly the state I.6 found and fixed.
- **`keel ui` has one browser-driven suite, and it is not a cell.**
  `tests/e2e/ui-stack-finder.test.ts` spawns `keel ui --port 0`,
  parses the URL and token the CLI prints, and drives the page with
  Playwright — the only suite here that scaffolds no project and runs
  no build. It rides the `web` shard, which already declares
  `browser` in `tools:`. What it covers is the seam nothing else can:
  the facets' narrowing is pure and unit-tested, but the element
  rebuilds its subtree on every change and `<keel-app>` replaces the
  element itself, so keeping a choice is a claim about surviving a
  DOM replacement. A page-level suite is the only thing that sees a
  `pageerror` too — a throw inside a listener leaves the form looking
  right and aborts the rest of that handler.
- **The modulith grid is 24 cells and one file is one cell.**
  12 stacks × 2 build systems, named
  `tests/e2e/modulith-<stack>-<build>.test.ts` so "every cell has a
  suite" is checkable from `ls`. `modulith-baseline` and
  `modulith-persistence` are the two exceptions and neither is a cell:
  the first is the only e2e scaffolding the layout _without_
  `--with-peer-context` (what proves that adapter family is additive),
  the second is a vertical layered onto a cell. A new stack or build
  system means new cells, and they go in the matrix in the same change.
- **The combo grid is 21 cells, and its two halves are covered to
  different depths on purpose.** The stacks pairing `arch.cli` with
  `arch.server-http` ship one hexagon with two deployment units, and
  `tests/e2e/combo-<layout>-<stack>-<build>.test.ts` is one file per
  cell, same rule as above. The `modulith` half is **exhausted** — 6
  JVM combo stacks × 2 build systems, plus `ts-cli-http` × npm and
  pnpm = 14 — because that is the half issue #108 was about and no
  build had ever compiled one. The `basic` half is **sampled at one
  build per stack** (7), the build system alternating so both appear
  against each framework and each language, and the TypeScript sample
  taking pnpm rather than npm: PR #110 built the whole `basic` half by
  hand before shipping the mechanism, so what was missing there was a
  standing check, not a first look — and the 14 modulith cells
  re-exercise the seed builders in `jvm-shared-root.ts` on every run
  regardless. What is genuinely `basic`-only is the per-arch module
  list and the README shape, and one build per stack pins those.

  **Six shards, not eighteen, and that is the opposite call from
  `add-module-*` one bullet down.** These follow the `jvm-modulith-*`
  convention (framework × language, three files a shard). A job per
  cell earned its keep there because those cells are cheap enough to
  finish well inside the matrix floor, so attribution was free; a combo
  cell builds _two_ assemblies, so it costs more. Grouped three to a
  shard they still finish inside that floor and cost the e2e phase no
  wall clock, where eighteen shards would buy eighteen cold
  JDK+Gradle provisions for a red X that framework × language already
  names. `web-combo` gets a shard rather than riding `web` because its
  cells render nothing, so a shard probing for Chromium would
  misdescribe them.

  Within the heaviest combo shard the two Gradle cells are effectively
  tied and the Maven one is roughly half either, so no single file is
  that shard's floor and the standing "a long case gets its own file"
  instinct buys nothing here.

  **Every cell ends in a runtime entrypoint check.** A green compile
  is not the claim — both entrypoints reachable off one hexagon is.
  The two drive steps are the single-entrypoint suites' own
  (`driveCliJar`, `driveRestJar`), lifted into
  `tests/support/jvm-combo-e2e.ts` so a combo cell asserts the same
  stdout and the same `/greet` wire contract rather than a paraphrase.
  Each cell also asserts the root build file registers every module
  exactly once — the shared-root upsert's whole reason to exist, and
  the one failure a scaffold-and-read test cannot see.

- **On the JVM, `add-module-*` _is_ a grid — the same 24 cells, and
  one job each.** `tests/e2e/add-module-<stack>-<build>.test.ts`, 12
  stacks × 2 build systems, named so "every cell has a suite" is
  checkable from `ls`, and each with a shard of its own
  (`jvm-add-module-<stack>-<build>`). Typology is a real axis rather
  than a duplicate of its row, which is what makes 24 the honest
  number: framework and language pick the binding, and typology picks
  the assembly the wiring class renders into and the build file the
  new dependencies anchor in — and on Spring it also moves
  `@ComponentScan` between `Main` and `Application`. The body is
  shared (`tests/support/jvm-add-module-e2e.ts`) so 24 cells cannot
  drift into 24 slightly different assertions.

  Two cells carry a negative the other 22 do not, and deliberately so:
  the scope holding the seam wall is a property of the **build
  system**, not of the cell, so it is asserted once per build system —
  `implementation` in `add-module-quarkus-rest-gradle`, `optional` in
  `add-module-quarkus-rest-maven`, whose Maven half once shipped
  without it. Twelve copies of one fact would cost twelve builds and
  prove it once.

  This is the one place a `keel add module` grid is worth its runner
  time. The JVM is six bindings over three containers, each with its
  own discovery mechanism and its own way to fail silently — a handler
  the container never found compiles perfectly and starts perfectly.
  The other four families stay one file per family
  (`add-module-{rust,go,ts,wc}.test.ts`, same status as
  `modulith-baseline`), riding their family's existing shard, because
  a Rust or Go context has no container to lose a handler in.

- **A job per cell buys attribution and costs cold caches, and that
  trade is only worth taking at this granularity.** Each
  `jvm-add-module-*` shard runs one file with one real build, so each
  pays its own JDK + Gradle provisioning and its own cold dependency
  resolve — 24 of them where two files in one shard paid two. What it
  buys is a red X that names the cell —
  `e2e (jvm-add-module-spring-cli-kotlin-maven)` is a diagnosis, where
  a failure inside a 24-file shard is a log to read. Wall clock is
  unaffected (the shards run in parallel); runner minutes roughly
  triple for this command. Collapsing it back is one edit — merge the
  `files` lists by framework × language, as the modulith grid does —
  and the suites need no change for it.
- **`jvm-modulith-quarkus-java` is the slowest shard in the matrix,
  and it is what the whole e2e phase's wall clock is floored by.**
  That is the bar to check a new shard against: one that finishes
  inside it is free, one that does not moves the phase. Every
  `jvm-add-module-*` shard and every `jvm-combo-*` shard finishes
  inside it, which is what makes a job per cell cost nothing there.
  If that shard grows, split it before adding to it.

  Two results worth keeping because they invert the obvious guess. The
  **Maven cells are consistently faster than the Gradle ones** across
  the add-module grid — Maven's half is the cheap half, the opposite
  of the assumption that made `-maven` a separate file "for the
  standing reason a long case is". And on `web` the floor changed
  hands when `add-module-wc` landed: the standing note naming
  `modulith-wc-peer-context` as the permanent floor was wrong within
  one release. The one-shard conclusion for `web` survives; the file
  named in it did not.

- **A shared dependency cache per file is worth more than a split.**
  Both JVM `add-module` suites first shipped taking a fresh
  `GRADLE_USER_HOME` / `-Dmaven.repo.local` in `beforeEach`, so their
  second case re-resolved and re-downloaded everything the first had
  just fetched — enough to make the file look like a file wanting to
  be two. Moving the cache to `beforeAll` (one home per file, the
  project tree still per case) took most of the second case's cost
  away and the shard's with it.

  That answers the split question, and inverts the obvious reading of
  it: splitting those two cases would hand the second its own cold
  Gradle resolve back and buy attribution with wall clock. **Fix the
  cache, not the file layout.** So the two cells that carry a negative
  keep both cases in one file with one shared home (`beforeAll`), and
  any suite running two real builds should share its home from the
  start.

  Note what this does _not_ say. It is an argument about two cases of
  the same cell, where the second reuses the first's artifacts almost
  entirely. It is not an argument against the 24-cell split: those
  cells scaffold different stacks, so they would share little even
  co-located, and the attribution is worth more when the axis under
  test is which framework/language/typology broke.

- **The shard matrix names its files explicitly, and that is a hazard
  with a guard.** A suite in no shard never runs, which looks exactly
  like a suite that passed. `tests/ci-workflow.test.ts` parses the
  workflow and fails in `verify` when the matrix and `tests/e2e/`
  disagree — keep it when editing the matrix; it is the only thing
  standing between a new suite and silent non-coverage.
- **A test file is the unit of CI scheduling.** Vitest parallelises
  across files and runs the tests inside one file in sequence, so the
  slowest single file floors the whole job regardless of sharding. Long
  e2e cases get their own file rather than another `it` in a long one —
  which is why the modulith suite is `-modulith`, `-persistence` and
  `-maven`.
- **The e2e job's JDK and Gradle versions are coupled and neither is
  arbitrary.** The emitted JVM projects target release 25; Maven
  compiles with whatever JDK runs it, so an older `JAVA_HOME` makes the
  Maven suites skip themselves. Gradle would not care — its foojay
  resolver provisions a toolchain — except that Gradle 8.x cannot
  _start_ on JDK 25, and the host `gradle` is what generates the
  wrapper. Pinning the host to 9.7.0 (the wrapper's own version) lets
  one JDK serve both build systems. Change one, check the other.
- `.github/workflows/mutation.yml` runs the `src/domain` mutation
  suite (`pnpm test:mutation`) on every push to `main` — incremental,
  so only mutants whose code or covering tests changed are retested —
  plus a weekly full run and on dispatch. Report-only and deliberately
  absent from PRs: a full run is hours on a runner, no fast gate
  absorbs that, and with `thresholds.break` null there is nothing for
  a PR to be gated on. The incremental state rides the actions cache
  under an always-save key; the HTML report is a run artifact. Moving
  onto PRs comes with the break threshold, once the baseline settles.
- `.github/workflows/release.yml` runs on `v*` tag push — verifies the tag
  matches `package.json`, reruns verification, publishes to npm with
  provenance, creates a GitHub Release. Dist-tag is derived from the
  prerelease identifier: `alpha` → `alpha`, `beta` → `beta`, `rc` →
  `next`, none → `latest`; unknown identifiers are a hard error.
- Third-party actions are pinned to full commit SHAs with a `# vX.Y.Z`
  comment for supply-chain integrity. Dependabot
  (`.github/dependabot.yml`) proposes grouped weekly updates.
- **Dependabot covers this repo's own dependencies; the emitted
  templates' pins have their own currency loop.**
  `assets/composition/version-pins.json` registers every framework and
  tool version the templates pin (BOMs, wrappers, toolchain majors,
  image tags, action refs — in `assets/composition/` and in the
  `src/domain/core/adapters/` sources that embed template content).
  `tests/version-pins.test.ts` guards it in `verify` the way
  `ci-workflow.test.ts` guards the shard matrix: registry ↔ templates
  must agree, and a sweep fails on any pin-shaped string no entry
  claims — extend the registry, never the sweep's blind spots.
  `.github/workflows/version-currency.yml` runs the opt-in suite under
  `tests/currency/` (`KEEL_RUN_CURRENCY=1`) weekly to compare each
  entry against its upstream latest stable; a red run is the drift
  report, deliberately never a PR gate. Bumping a pin is a
  human-reviewed change that updates the template(s) and the registry
  together, proved by the e2e grid.
- Secrets required: `NPM_TOKEN`. Provenance is enabled via the workflow's
  `id-token: write` permission.

To cut a release: bump `package.json`, move `[Unreleased]` in
`CHANGELOG.md` to a dated heading, commit as `chore(release): vX.Y.Z`, tag
`vX.Y.Z`, push the tag. The workflow does the rest.
