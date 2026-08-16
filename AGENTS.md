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
Stack-specific addenda (e.g. a Quarkus runbook appended under a
sentinel marker) are a roadmap item.

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
pnpm test:watch    # vitest watch
pnpm build         # tsc -p tsconfig.build.json → dist/
pnpm format        # prettier --write .
pnpm format:check  # prettier --check .
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
entry is `bin/keel.js`, which loads `dist/application/cli/executable/main.js`. Build before
trying the CLI locally.

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
    core/                 # the engine (predicate, resolver, answers,
                          # apply, install, actions), composition
                          # adapters/ + verticals/ + stacks,
                          # handlers/ (new-project, add-vertical),
                          # RegistryMediator
  application/
    cli/
      contract/           # commander → commands → mediator → Result
                          # rendered; zero business logic
      executable/         # composition root: wires infra adapters +
                          # handlers + mediator; no logic
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
tests/                    # vitest; mirrors src/ (domain/, e2e/,
  support/factory.ts      # infrastructure/); the shared test Factory
bin/keel.js               # npm bin entry → dist/application/cli/executable
.dependency-cruiser.cjs   # the dependency rule, enforced in pnpm lint
```

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
- Mutation testing is on the roadmap; not yet wired in this repo.

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
  nine `jvm-*` shards (JDK 25 + Gradle 9.4.1, plus Maven on every
  `jvm-modulith-*`), `go` (Go + Docker), `rust` (cargo), `web` (npm/pnpm +
  Chrome). Each shard provisions only what its suites probe for. Between
  the two jobs, nothing in the suite is skipped for want of a tool.
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
- **Go, `ts-http` and `web-components` follow the same shape, and
  their grids are small.** Go is 2 stacks × 1 build system
  (`modulith-go-{cli,http}`); each TypeScript stack is 1 stack × 2
  package managers (`modulith-ts-http-{npm,pnpm}`,
  `modulith-web-components-{npm,pnpm}`). The package manager is a real
  axis rather than a duplicate: npm's hoisting hides a missing
  dependency declaration that pnpm's isolated store refuses. Each
  family also carries a `modulith-<family>-peer-context` suite, which
  is not a cell — same role as `modulith-rust-peer-context`. Their
  `walking-skeleton-*` files keep the `basic` layout **only**; a
  modulith case living inside one is invisible to `ls tests/e2e/` and
  floors that file, which is exactly the state I.6 found and fixed.
- **The modulith grid is 24 cells and one file is one cell.**
  12 stacks × 2 build systems, named
  `tests/e2e/modulith-<stack>-<build>.test.ts` so "every cell has a
  suite" is checkable from `ls`. `modulith-baseline` and
  `modulith-persistence` are the two exceptions and neither is a cell:
  the first is the only e2e scaffolding the layout _without_
  `--with-peer-context` (what proves that adapter family is additive),
  the second is a vertical layered onto a cell. A new stack or build
  system means new cells, and they go in the matrix in the same change.
- **`add-module-*` is not a grid either.** The six
  `tests/e2e/add-module-{rust,go,ts,wc,jvm,jvm-maven}.test.ts` suites
  have the same status as `modulith-baseline` and
  `modulith-rust-peer-context`: one per stack family, each scaffolding
  **three** bounded contexts and building them. Three rather than two
  because that is the first shape where the consumed context is not
  always the skeleton, which is where the emitters branch. They ride
  in their family's existing shard — `rust`, `go`, `web`, and
  `jvm-modulith-quarkus-java` for the two JVM ones, whose stack that
  shard already carries. `add-module-jvm-maven` is its own file for
  the standing reason a long case is, and its own _case_ because the
  scope holding the seam wall is spelled differently there
  (`optional`, not `implementation`) and the peer context's Maven half
  once shipped without it.
- **They moved the floors of the shards they landed in, and the
  numbers are on the runner.** `jvm-modulith-quarkus-java` was
  recorded at 415s against a 260s floor when J.1 shipped, and called
  "the only shard with real headroom left". Measured with these two
  files in it: **565.60s wall, 1453.50s of test time across eight
  files, longest file `add-module-jvm` at 391.27s.** On `web`, the
  floor changed hands outright: **188.68s wall over eleven files,
  longest `add-module-wc` at 110.94s**, where the standing note says
  `modulith-wc-peer-context` "is the floor and will stay the floor" —
  it is now second at 103.75s. The one-shard conclusion survives (the
  floor is 59% of the wall, as it was), but the file named in it does
  not.

- **A shared dependency cache per file is worth more than a split,
  and here that is measured rather than assumed.** Both JVM
  `add-module` suites first shipped taking a fresh `GRADLE_USER_HOME`
  / `-Dmaven.repo.local` in `beforeEach`, so their second case
  re-resolved and re-downloaded everything the first had just
  fetched. On the runner that showed as `add-module-jvm` = 257.95s +
  **133.32s**. Moving the cache to `beforeAll` — one home per file,
  the project tree still per case — takes the second case to
  **23.50s**, measured locally on the same box in the same run.

  That answers the split question, and inverts the obvious reading of
  it. Two long cases in one file look like a file wanting to be two;
  splitting these would hand the second case its own cold Gradle
  resolve again and cost ~110s to buy attribution. It is the run-217
  `go` lesson with a number attached: **fix the cache, not the file
  layout**. So `add-module-jvm` stays one file, and any future suite
  running two real builds should share its home from the start.

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
  wrapper. Pinning the host to 9.4.1 (the wrapper's own version) lets
  one JDK serve both build systems. Change one, check the other.
- `.github/workflows/release.yml` runs on `v*` tag push — verifies the tag
  matches `package.json`, reruns verification, publishes to npm with
  provenance, creates a GitHub Release. Dist-tag is derived from the
  prerelease identifier: `alpha` → `alpha`, `beta` → `beta`, `rc` →
  `next`, none → `latest`; unknown identifiers are a hard error.
- Third-party actions are pinned to full commit SHAs with a `# vX.Y.Z`
  comment for supply-chain integrity. Dependabot
  (`.github/dependabot.yml`) proposes grouped weekly updates.
- Secrets required: `NPM_TOKEN`. Provenance is enabled via the workflow's
  `id-token: write` permission.

To cut a release: bump `package.json`, move `[Unreleased]` in
`CHANGELOG.md` to a dated heading, commit as `chore(release): vX.Y.Z`, tag
`vX.Y.Z`, push the tag. The workflow does the rest.
