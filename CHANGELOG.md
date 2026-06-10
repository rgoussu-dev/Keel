# Changelog

All notable changes to `@rgoussu.dev/keel` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Composition engine.** Replaces the v0.3 schematic-and-engine model
  with a capability-tag composition layer: predicate-driven adapters
  contribute files, patches, and deferred actions; verticals group
  adapters under a coverage requirement; the resolver hard-fails if
  any dimension is uncovered for the current tag set. See
  `src/composition/types.ts` for the contract.
- **`keel new --stack=<id>`.** Greenfield bootstrap from a stack
  preset. Today the only stack is `quarkus-cli` — a Quarkus 3 CLI on
  Gradle (Java 21) in a hexagonal layout — composing the `vcs` and
  `walking-skeleton` verticals.
- **`keel add <vertical>`.** Brownfield path: layer an additional
  vertical onto an already-initialised keel project. Today
  `distribution` is the headline use case; the add command refuses to
  run without a manifest, rejects unknown verticals with a list of
  available ones, and refuses to install the same vertical twice.
- **`walking-skeleton/quarkus-cli-bootstrap` adapter.** Emits a
  multi-module hexagonal Quarkus picocli skeleton: `domain/contract`,
  `domain/core`, and `infrastructure/cli`, with a `Mediator` interface,
  a sample `GreetCommand` + handler, a picocli subcommand, and a
  `QuarkusMainTest` that drives it end to end. Reads `basePackage` and
  `projectName` as sticky answers reused by downstream adapters.
- **`walking-skeleton/sample-port-fake` adapter.** Adds a sample
  `Clock` secondary port to `domain/contract` plus a `FakeClock`
  module under `infrastructure/clock/fake` with a contract test, and
  patches `settings.gradle.kts` to include the new module.
- **`walking-skeleton/gradle-wrapper` adapter.** Generates the Gradle
  Wrapper via the canonical `gradle wrapper` task as a deferred Action
  after the bootstrap files land — no checked-in jar. Requires
  `gradle` on PATH; surfaces a clear error otherwise.
- **`distribution` vertical with `quarkus-cli-native` adapter.** Ships
  GitHub Actions workflows that cross-compile the Quarkus CLI to
  native binaries via GraalVM and publish them to a GitHub Release on
  tag push. One sticky question selects the matrix targets
  (linux-amd64, linux-arm64, darwin-arm64). Promotes
  `runtime.graalvm-native` so future verticals can key off it.
- **Manifest v2.** Adds `tags`, `verticals`, `versions`, and `answers`
  alongside the v1 file-tracking entries. Reads are version-aware: a
  v1 manifest on disk migrates in memory on first read, and writes
  always emit v2.
- **`walking-skeleton/claude-core` adapter.** Emits the universal
  binding spec (`assets/project/CLAUDE.md`) into
  `<project>/.claude/CLAUDE.md` so every keel-scaffolded project
  carries the conventions Claude Code reads at session start. Covers
  a new `agentic-baseline` dimension on the walking-skeleton vertical,
  predicate empty so it fires unconditionally. Reads from the same
  canonical file contributors edit, so there's exactly one source of
  truth for the spec.
- **Walking-skeleton end-to-end test.** New
  `tests/composition/walking-skeleton-e2e.test.ts` drives `newProject`
  for the `quarkus-cli` stack into a temp directory, then runs
  `./gradlew build` (compile + tests) and the produced
  `quarkus-run.jar` against a sample `hello --name E2E` invocation,
  asserting the greeting reaches stdout. Per the brief, the only
  side effect that's faked is git: `vcs/git-init` is replaced with a
  no-op; every other deferred action runs for real. Each run uses a
  fresh `GRADLE_USER_HOME` so the scenario starts from a blank cache.
  Skipped automatically when `gradle` or `java` is missing from PATH,
  and on CI by default (the cold-cache Quarkus download is too heavy
  to run on every PR); opt out locally with `KEEL_SKIP_E2E=1`, opt in
  on CI with `KEEL_RUN_E2E=1`.

### Fixed

- **Walking-skeleton template now actually builds.** Bumped the
  `quarkus-cli-bootstrap` template's Quarkus version from `3.16.0`
  (which was never published to Maven Central — the 3.16 line jumped
  from `3.16.0.CR1` to `3.16.1`) to `3.34.6`, the latest stable in
  the 3.x line. The new version is also compatible with the Gradle
  9.4.1 wrapper the `gradle-wrapper` adapter pins, where 3.16's Gradle
  plugin tripped Gradle 9's stricter detached-configuration model.
- **JUnit Platform launcher on the test runtime classpath.** Gradle 9
  no longer auto-provides the platform launcher, so
  `useJUnitPlatform()` alone fails with "Failed to load JUnit
  Platform". The root `build.gradle.kts` template now adds
  `testRuntimeOnly("org.junit.platform:junit-platform-launcher")` to
  every subproject.
- **`gradle-wrapper` adapter surfaces the actual Gradle error.**
  Gradle prints task failures (`Test of distribution url ... failed`,
  `BUILD FAILED in Ns`, the stacktrace under `--stacktrace`) on
  stdout, not stderr. The previous `describeFailure` only captured
  stderr and fell back to `exit N`, leaving users with a context-free
  message when `gradle wrapper` failed. The adapter now joins both
  streams into the thrown error.

### Removed

- **Legacy schematics engine.** Every module that the v0.3
  schematic-and-engine path needed is gone: `src/schematics/` (whole
  directory: claude-core, claude-quarkus, walking-skeleton, port,
  scenario, gradle-wrapper, executable-rest, iac-cloudrun, ci-github,
  git-init, registry, util), `src/engine/types.ts`,
  `src/engine/homegrown.ts`, `src/engine/template.ts`, the
  `assets/schematics/` template tree, and the `'schematics'` asset
  kind. The composition engine fully replaces the surface.
- **Legacy CLI commands.** `keel install`, `keel update`, `keel
doctor`, and `keel generate` are removed; the CLI ends up with just
  `new` and `add`. The legacy installers
  (`src/installer/install.ts`, `update.ts`, `doctor.ts`, `plan.ts`,
  `profile.ts`, `env.ts`) are gone.
- **Legacy manifest store.** `src/manifest/schema.ts` and
  `src/manifest/store.ts` are gone. The v1 ManifestSchema and
  `MANIFEST_FILENAME` are inlined into `schema-v2.ts` solely to keep
  the migration path working.

## [0.3.0-alpha] — 2026-04-26

### Added

- **Context-aware install.** `keel install` is now a progressive,
  schematic-driven flow. On a greenfield workspace it asks **language →
  framework → native?**, runs an environment preflight, and composes
  the chosen schematics through the engine onto a single shared tree:
  `claude-core` (universal scaffold), `claude-<framework>` (stack
  runbook skills + CLAUDE.md addendum), and `walking-skeleton` (the
  thinnest end-to-end slice). The progressive picker is driven by a
  small profile registry (`src/installer/profile.ts`); adding a stack
  is a profile-only change.
- **`claude-core` schematic.** Renders the universal Claude scaffold
  (CLAUDE.md, settings, hooks, commands, agents, conventions) into
  `<project>/.claude/`. Runnable standalone via
  `keel generate claude-core`.
- **`claude-quarkus` schematic.** Renders five universal-verb runbook
  skills tailored to the stack — `build`, `test`, `run`, `format`,
  `troubleshoot` — and appends a sentinel-marked addendum to
  `CLAUDE.md` describing the project layout, default endpoints, and a
  quick command reference. Idempotent: a second run does not duplicate
  the addendum.
- **Environment preflight.** New `Env` port + `realEnv` adapter +
  `preflight()` driver. Universal check: `git` is required (fatal).
  Stack-gated checks for `java-quarkus`: a JDK on PATH at major ≥ 25
  (warning if missing or older — Gradle toolchains still bail out on
  first build), and — when native packaging is opted into — GraalVM's
  `native-image` (warning).
- **Runtime gradle-wrapper download.** `gradle-wrapper.jar` is fetched
  from `services.gradle.org/distributions/` at install time and
  verified against the published `.sha256` sidecar. The committed
  binary jar is gone from the repo. Dry-run uses a placeholder buffer
  so the planned-changes preview still shows the path without any
  network I/O.

### Changed

- **Default versions for the Java/Quarkus stack.** Gradle Wrapper
  default bumped from `8.11.1` → **`9.4.1`** (Java 25 toolchain
  support). Quarkus default bumped from `3.15.0` → **`3.33.1` LTS**
  (full Java 25 support). Version catalog refreshed: junit `5.13.4`,
  assertj `3.27.7`, archunit `1.4.2`, pitest (lib) `1.23.0`, nullaway
  `0.13.0`, spotless plugin `8.4.0`, pitest plugin `1.19.0`.
- **Asset layout.** The universal scaffold moved from
  `assets/project/` to `assets/schematics/claude-core/templates/` —
  it's now a regular schematic. `paths.asset('project')` is replaced
  by `paths.claudeCoreTemplates()` as the seam used by `install` and
  `update`. Manifest `source` prefix shifts from `project/<rel>` to
  `<schematic>/<rel>` (informational only — manifests carrying the
  legacy `project/` prefix continue to upgrade cleanly).
- **`update` orphan handling.** Files installed by stack-specific
  schematics (`claude-<stack>`, `walking-skeleton`) are tracked in
  the manifest but live outside `claudeCoreTemplates()`. `update`
  now preserves their entries verbatim instead of treating them as
  orphans and deleting them on the next run.
- **`sha256Shipped` records the first-writer content.** For files
  composed by multiple schematics (e.g. `CLAUDE.md` = claude-core +
  claude-quarkus addendum), `sha256Shipped` is the first writer's
  content and `sha256Current` is the final composed content. The gap
  signals "non-trivial composition" to `update`, which then routes
  the file through the user-modified-conflict path instead of
  silently overwriting and dropping the addendum.

### Removed

- **Methodology-only skills.** The seven skills that only restated
  conventions already present in `CLAUDE.md` are gone:
  `hexagonal-review`, `mediator-pattern`, `trunk-based-xp`,
  `public-api-docs`, `test-scenario-pattern`, `walking-skeleton-guide`,
  `iac-opentofu`. The binding-spec content stays in CLAUDE.md;
  actionable skills now live alongside each stack profile.
- **Committed `gradle-wrapper.jar`.** The binary is no longer checked
  in; it is fetched and verified at install time.

### Notes

- `keel install` now refuses to operate on a directory containing
  anything beyond `.git` (override with `--force`). Brownfield-aware
  install support is on the roadmap.

## [0.2.0-alpha] — 2026-04-25

### Removed

- **Global install scope.** The `--global` flag is gone from
  `keel install` and `keel update`, and `keel doctor` no longer audits
  `~/.claude`. keel is now **project-scoped only**: the entire kit
  (CLAUDE.md, skills, agents, slash commands, hooks, settings) installs
  into `<project>/.claude/`, and the user's home directory is never
  read, written, or otherwise touched. This is a breaking change for
  anyone running `keel install --global` — the command now fails with
  an unknown-option error. Existing `~/.claude/` installs are left
  alone (no cleanup is performed); to migrate, run `keel install` in
  each project that should have keel and remove the now-orphaned
  `~/.claude/` files manually if desired.

### Changed

- **`assets/global/` and `assets/conventions/` collapsed into
  `assets/project/`.** The packaged asset tree no longer distinguishes
  scopes: `CLAUDE.md`, `agents/`, `commands/`, and `skills/` moved from
  `assets/global/` to `assets/project/`; the permissions / env block
  from `assets/global/settings.json` was merged into
  `assets/project/settings.json` alongside the existing hooks; and
  `assets/conventions/languages.json` (the per-language toolchain
  matrix consulted by hooks, agents, and slash commands) moved to
  `assets/project/conventions/`. Consumers see the merged bundle land
  in `<project>/.claude/`. Shipped agents and commands now reference
  `.claude/conventions/languages.json` instead of the keel-repo path
  `assets/conventions/languages.json`, which fixes a broken reference
  for consumer projects.
- **`doctor` foreign-file scan.** `conventions/` is now a managed
  directory; foreign files dropped there are flagged.
- **Manifest schema.** The `scope` field is removed from the schema (no
  longer typed, no longer written). Old manifests that still carry a
  `scope` key continue to parse — Zod silently strips unknown keys —
  but the value is ignored everywhere.
- **CLI help text** updated to describe the project-only behavior; the
  `keel doctor` summary line now reports a single audit instead of one
  per scope.
- **README rewritten.** New sections: _Why keel_, _Quickstart_,
  _CLI_ (full command table with flags and behavior), _What ships in
  the kit_, _Customizing your install_. Drops every reference to
  `--global`.
- **Root `CLAUDE.md`** updated: §1 points the binding spec at
  `assets/project/CLAUDE.md`; §6 layout shows a single `assets/project/`
  bundle; §7 testing reference relinked.

### Added

- `LICENSE` file at the repository root (MIT, © 2026 Romain Goussu).
  The package was already declared MIT in `package.json` but lacked a
  root license file.
- `THIRD_PARTY_LICENSES/` scaffolding for tracking derived work:
  `citypaul-dotfiles.LICENSE` (verbatim upstream license),
  `citypaul-dotfiles.NOTICE.md` (audit trail of imported artifacts
  pinned to upstream commit `a4b6c469`), and `HEADER_TEMPLATE.md`
  (per-file provenance header templates for Markdown, shell,
  TypeScript, PowerShell, and JSON sidecars).
- `README.md`: `Acknowledgments` section pointing to the
  `THIRD_PARTY_LICENSES/` audit trail.
- Four specialised agents under `assets/project/agents/`, adapted from
  citypaul/.dotfiles (MIT, © 2024 Paul Hammond) at upstream commit
  `a4b6c469`: `tdd-guardian`, `pr-reviewer`, `learn`, `adr`. Each file
  carries a provenance header listing the substantive deltas; the
  audit trail is in
  `THIRD_PARTY_LICENSES/citypaul-dotfiles.NOTICE.md`. Distributed to
  `<project>/.claude/agents/` by `keel install` (no installer change
  required; the planner walks `assets/project/` recursively).
- Three new skills extracted from the binding spec, each with TRIGGER /
  SKIP guidance for Claude Code's on-demand loading:
  - `mediator-pattern`: Action/Command/Query/Result kernel, mediator
    construction rules, sealed error hierarchies, transport mapping.
  - `iac-opentofu`: OpenTofu rules, walking-skeleton checkpoint,
    container-registry choice, anti-patterns.
  - `trunk-based-xp`: workflow, commit discipline, the "done"
    checklist.
- GitHub MCP permissions in `assets/project/settings.json`: read tools
  (`mcp__github__pull_request_read`,
  `mcp__github__list_pull_requests`,
  `mcp__github__get_file_contents`,
  `mcp__github__subscribe_pr_activity`, etc.) are pre-allowed; write
  tools (`mcp__github__pull_request_review_write`,
  `mcp__github__add_issue_comment`, `mcp__github__create_pull_request`,
  `mcp__github__merge_pull_request`, etc.) are ask-listed. Same
  read-vs-write split as the existing git permissions.

- **Domain split refined into a three-module DAG**:
  `domain/kernel ← domain/contract ← domain/core`. Builds on the
  kernel-relocation work in #6 (which had grouped everything in
  `domain/contract/kernel/`) by extracting the higher abstractions —
  sealed `Action` / `Command` / `Query` / `Result` / `Error` bases plus
  the `Handler` and `Mediator` interfaces — into a dedicated
  `:domain:kernel` Gradle module. The concrete `Command` / `Query` /
  `Error` subtypes that name each supported operation stay in
  `domain/contract` (the system's public surface). The Mediator
  implementation (`RegistryMediator`) and the handlers live in
  `domain/core`. Adapters
  (`application/<channel>/contract`, `infrastructure/<port>/*`)
  depend on `domain/kernel` and `domain/contract`; the composition
  root (`application/<channel>/executable`) keeps its cross-layer
  wiring exception introduced in #6. CLAUDE.md §1 + §2,
  `hexagonal-review` skill, `mediator-pattern` skill,
  `walking-skeleton-guide` skill, and `pr-reviewer` agent updated to
  match.
- **Walking-skeleton schematic ships the new module structure**: the
  Java template scaffolds `:domain:kernel`, `:domain:contract`,
  `:domain:core` as separate Gradle modules. `Mediator` becomes an
  interface in `domain/kernel/`; `RegistryMediator` (default impl
  built from `Collection<Handler<?>>`) lives in `domain/core/`.
  `settings.gradle.kts` includes `:domain:kernel` ahead of
  `:domain:contract`. `domain/contract/build.gradle.kts` declares
  `implementation(project(":domain:kernel"))`;
  `domain/core/build.gradle.kts` adds `:domain:kernel` alongside the
  existing `:domain:contract`. The walking-skeleton test asserts the
  new file layout, the interface/impl split, and the new include.
- **`executable-rest` schematic adapted to the three-module split**:
  `application/rest/contract/build.gradle.kts` and
  `application/rest/executable/build.gradle.kts` now also depend on
  `:domain:kernel`. `MediatorProducer.java.ejs` constructs
  `RegistryMediator` (the impl) and exposes it via the `Mediator`
  interface.
- **`iac-opentofu` skill aligned with `/iac/<target>/`**: the skill
  now describes IaC modules at the repo root (`/iac/cloudrun/`,
  `/iac/hetzner/`, etc.) instead of `infrastructure/iac/`, matching
  #6's IaC-relocation; container-registry section added per the same.
- **`assets/project/CLAUDE.md` trimmed from 214 to ~150 lines** (file
  was at `assets/global/CLAUDE.md` before the global-scope removal):
  each
  major section keeps a 2–4 line summary and points to its skill
  (`§1` → `hexagonal-review`, `§2` → `mediator-pattern`, `§3` →
  `test-scenario-pattern`, `§4` → `walking-skeleton-guide`, `§5` →
  `iac-opentofu`, `§6` → `trunk-based-xp`, `§8` → `public-api-docs`).
  `§7 Principles` and `§9 Claude behavior` (always-loaded) stay in
  the core. The on-demand-skills pattern is inspired by
  `citypaul/.dotfiles` (see `THIRD_PARTY_LICENSES/`).

### Fixed

- `package.json` `files` list now ships `LICENSE` and
  `THIRD_PARTY_LICENSES/` on `npm publish`, so consumers receive the
  audit trail and upstream permission notices the README points at.
- `THIRD_PARTY_LICENSES/HEADER_TEMPLATE.md` no longer hard-codes
  `© 2026 Romain Goussu, MIT.` in the modifier-copyright line; the
  year, holder, and license are now `<YYYY>` / `<holder>` /
  `<license>` placeholders documented under "Required fields", with
  a default pointing at the repo `LICENSE`.
- `THIRD_PARTY_LICENSES/HEADER_TEMPLATE.md` PowerShell template
  snippet uses an em dash (`MIT — see ...`) like the other templates
  instead of a hyphen.
- `trunk-based-xp` skill no longer claims "no branches / no pull
  requests" without acknowledging the keel-repo cloud-session
  exception for both. Each rule explicitly scopes to consumer
  projects and links to the keel repo root `CLAUDE.md`, §2 and §4
  for the exception.
- `pr-reviewer` agent's "Quality gates" section no longer references
  the stale `assets/global/CLAUDE.md §6.2`. It now points at the
  `trunk-based-xp` skill's "Done means" section, which is the live
  source of those checks since the binding spec was trimmed.

## [0.1.0-alpha.2] — 2026-04-19

### Added

- `CI` workflow (`.github/workflows/ci.yml`): lint, typecheck, test, build on
  every pull request and push to `main`, matrixed across Node 20 and 22 with
  pnpm 9 and a pnpm cache.
- `Release` workflow (`.github/workflows/release.yml`): on `v*` tag push,
  verifies the tag matches `package.json`, reruns the full verify pipeline,
  publishes to npm with `--provenance --access public`, and creates a GitHub
  Release with auto-generated notes.
- npm dist-tag is derived from the semver prerelease identifier (`alpha` →
  `alpha`, `beta` → `beta`, `rc` → `next`, none → `latest`); unknown
  prerelease identifiers fail the release.
- `CLAUDE.md` at the project root documenting repo-specific engineering and
  workflow conventions, including the PR auto-subscribe preference for
  cloud-hosted Claude sessions.
- `.github/dependabot.yml`: weekly grouped updates for `github-actions`.
- README: CI/Release badges, `Development` section, `Release process`
  section.
- `.prettierignore` so generated files (lockfile, `dist/`, schematic
  templates, manifests) are excluded from the prettier check.
- Claude `PreToolUse` hook (`.claude/hooks/pre-commit-format.sh`) that
  auto-formats and re-stages before every `git commit`, and blocks the
  commit if lint still fails after formatting.
- `format:check` npm script that runs `prettier --check .`.

### Changed

- `pnpm lint` now also runs `prettier --check .` after eslint, so
  formatting drift fails the same gate as code-style rules.

### Security

- Pinned every GitHub Action in CI and release workflows to a full commit
  SHA with a `# vX.Y.Z` comment (`actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`, `softprops/action-gh-release`) so upstream changes
  cannot reach the publishing pipeline without review.

## [0.1.0-alpha.1] — 2026-04-19

First cut of the kit. Installs globally (user-wide defaults) and per-project
(hooks, per-repo settings). Copy-based install with manifest tracking and
three-way update reconciliation. Homegrown schematics engine behind a
swappable `Engine` / `Schematic` / `Tree` / `Context` port interface.

### CLI

- `keel install [--global] [--force] [--dry-run]`
- `keel update  [--global] [--dry-run] [--yes]` — three-way merge, prompts on conflict
- `keel doctor` — audit both scopes for drift
- `keel generate <schematic> [--dry-run] [--set k=v...]` (alias `g`)

### Global assets (`~/.claude/`)

- `CLAUDE.md` encoding: hexagonal architecture, Command/Query + Mediator,
  DIP-strict tests (Scenario + Factory + fakes), walking skeleton first,
  IaC via OpenTofu, trunk-based + XP + SOLID + 12-Factor, public-API-docs
  policy, always-latest-stable rule, terse Claude behaviour.
- `settings.json` with pre-allowed toolchain (Gradle, pnpm, Cargo, Go,
  OpenTofu, rg/fd/tree) + ask-list (push/reset/rebase) + deny-list
  (force-push, reset --hard, sudo).
- Skills: `hexagonal-review`, `test-scenario-pattern`, `public-api-docs`,
  `walking-skeleton-guide` — language-agnostic, same principle across
  Java / Kotlin / TypeScript / Rust / Go.
- Slash commands: `/commit`, `/sync`, `/diff-review`, `/docs-check`.

### Project assets (`<project>/.claude/`)

- Hooks (`.sh` + `.ps1` pair each, platform-scoped in settings):
  - `PostToolUse` format-on-edit (spotless, prettier, rustfmt, gofmt, tofu fmt)
  - `PreToolUse` pre-commit-verify (gradle check, pnpm typecheck+test, cargo,
    go vet+test)
  - `SessionStart` context load (branch, dirty count, recent commits,
    walking-skeleton markers)
  - `Stop` commit-discipline reminder

### Conventions table

- `assets/conventions/languages.json` — per-language formatter, linter,
  typecheck, test, mutation, doc format. Single source of truth for all
  hooks / commands / schematics.

### Schematics (Java proving ground)

- `port` — secondary port + fake module + contract test (4 files).
- `scenario` — Scenario + Factory + Test triad in the domain test tree.
- `walking-skeleton` — multi-module Gradle shell + build-logic convention
  plugins + kernel (Action / Command / Query / Result / Error / Handler /
  Mediator / DuplicateHandlerException / NoHandlerError) + IaC stub +
  composes `port` for a starter secondary port (27 files).

### Not yet shipped (roadmap)

- `executable` schematic — chooses web / messaging framework at
  walking-skeleton time; wires an `application/<channel>/executable`.
- `handler` schematic — Action + Handler + wiring.
- `adapter` schematic — real adapter for an existing port.
- Additional language templates (Kotlin, TypeScript, Rust, Go).
- Adapter packages for alternative schematics engines (Plop, Nx).
- Migration runner for `keel update` (scripts exist as a concept but are
  not yet executed).

[Unreleased]: https://github.com/rgoussu-dev/Keel/compare/v0.3.0-alpha...HEAD
[0.3.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.2.0-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha.2...v0.2.0-alpha
[0.1.0-alpha.2]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/rgoussu-dev/Keel/releases/tag/v0.1.0-alpha.1
