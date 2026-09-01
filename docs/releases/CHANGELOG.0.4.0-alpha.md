## [0.4.0-alpha] — 2026-06-10

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

[0.4.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.3.0-alpha...v0.5.0-alpha
