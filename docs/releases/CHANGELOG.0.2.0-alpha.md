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

[0.2.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha...v0.2.0-alpha
