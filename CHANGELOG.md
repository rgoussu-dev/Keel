# Changelog

All notable changes to `@rgoussu.dev/keel` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rgoussu-dev/Claude-workspace/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/rgoussu-dev/Claude-workspace/releases/tag/v0.1.0-alpha.1
