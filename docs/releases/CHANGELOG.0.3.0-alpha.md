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

[0.3.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.2.0-alpha...v0.3.0-alpha
