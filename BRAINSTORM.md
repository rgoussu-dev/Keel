# Brainstorm: Universal Claude Code Kit

Checkpoint of an in-progress design session. Pick up from "Open questions" below.

## Goal

Build a one-size-fits-all, installable toolkit (Claude Code workflows, hooks,
skills, slash commands, templates) that can be dropped into any project.

## Distribution & Install Model — LOCKED

- **Distribution:** npx-based CLI (Node.js). Cross-platform: Windows, macOS, Linux.
- **Package name:** TBD — pick npm scope. (**OPEN**)
- **CLI verbs:** `install`, `update`, `add <component>`, `remove <component>`, `doctor`, `new <lang>` (scaffold).
- **Install mode:** copy (not symlink), with a migration/update path.
- **Scope targets:**
  - `--global` → `~/.claude/` (universal defaults)
  - default → `./.claude/` in current project (per-project overrides)
- **Update/migration:**
  - `.claude/.kit-manifest.json` tracks version + sha256 of each installed file at install time.
  - `kit update` compares user hash vs. shipped-old vs. shipped-new. Unchanged → overwrite. Modified → diff + prompt (keep/overwrite/merge).
  - Per-component `CHANGELOG.md` shipped with the package.

## Proposed Layout

```
claude-kit/
├── bin/kit.js
├── lib/                            # installer, manifest, diff/merge
├── assets/
│   ├── global/                     # → ~/.claude/
│   │   ├── CLAUDE.md
│   │   ├── settings.json
│   │   ├── agents/
│   │   ├── skills/
│   │   └── commands/
│   ├── project/                    # → <project>/.claude/
│   │   ├── settings.json
│   │   ├── hooks/                  # .sh + .ps1 pair per hook (shell-native per OS)
│   │   └── commands/
│   └── templates/                  # `kit new <lang>` starters, all hexagonal
│       ├── java/  kotlin/  typescript-backend/  typescript-frontend/
│       ├── rust/  go/  iac/
└── manifest.schema.json
```

## User Preferences — CAPTURED

### Languages & Tooling
- **Languages:** Java, Kotlin, TypeScript, Rust, Go
- **Formatters/linters:** mainstream per language (prettier/eslint, ktlint, rustfmt+clippy, gofmt+go vet, google-java-format)
- **Comments:** JavaDoc/JSDoc on public interfaces/methods/classes only. Otherwise none.
- **Tests:** mainstream per language. Strict DIP (see Architecture).

### Workflow
- **Branching:** none — **trunk-based**, XP style, continuous integration; parallel work must not interfere (feature flags, small commits, fast sync).
- **Commits:** auto after each logical unit, **Conventional Commits** format.
- **Hook — block commits to main:** NO (trunk-based requires committing to main).
- **Hook — auto-format on save/edit:** YES (PostToolUse on Edit/Write).
- **Hook — pre-commit tests:** YES, commit must fail if tests fail.
- **PRs:** none (trunk-based).
- **"Done" discipline:** Claude must run type-check + tests before claiming done.
- **Verbosity:** very terse.
- **Permissions (pre-allow):** full toolchain per language + all read-only tools (rg, ls-equivalents, git status/diff/log/show/branch).

### Environment
- **Editors:** VS Code primary; moving off JetBrains but still possible. Configs must be cross-IDE / standardized.
- **Shell:** native per OS — PowerShell on Windows, bash/sh on Linux. Hooks ship as `.sh` + `.ps1` pairs.

## Architectural Constraints — NON-NEGOTIABLE

1. **Hexagonal architecture, always** — including frontend.
   - Layers: `domain/`, `application/` (primary ports + command/query handlers + mediator), `infrastructure/` (secondary adapters), `interface/` (primary adapters — HTTP/CLI/UI).
2. **Interface layer = dumb:** map request DTO → dispatch via mediator → map response. No logic.
3. **Infrastructure layer = dumb:** adapters only. Zero business logic.
4. **Command/Query + Mediator** for all business operations.
5. **Test pattern (strict DIP):**
   - **Scenario** — encapsulates data for a given test.
   - **Factory** — wires SUT with test doubles (**fakes, not mocks**).
   - **Test** — depends only on Scenario, Factory, and the port interface under test. Never on concrete implementations.
6. **Walking skeleton first.** Greenfield: build one before features. Brownfield: assess, build one if missing, before anything else.
7. **IaC mandatory** for any infrastructure. Terraform or open-source equivalent (OpenTofu leaning).
8. **Invariants:** XP principles, SOLID, 12-Factor App.

## Components to Ship

### Hooks (cross-platform .sh + .ps1)
- `PostToolUse` on Edit/Write → format touched file (language-detected).
- `PreToolUse` on Bash `git commit` → run type-check + scoped tests; fail commit on red. `--full` flag for full suite.
- `SessionStart` → load context: current diff, recent commits, failing tests, walking-skeleton status.
- `Stop` → remind Claude to commit logical units in Conventional Commit format.

### Slash Commands
- `/commit` — stage, verify (type-check + tests), conventional-commit, push to trunk.
- `/sync` — `git pull --rebase`; surface conflicts.
- `/micro` — split current diff into smallest atomic commits.
- `/flag <name>` — scaffold a feature flag so incomplete work ships dark.
- `/tdd <behavior>` — failing test → implement → refactor cycle.
- `/spike` / `/spike end` — throwaway-exploration mode; prevent commits until ended.
- `/diff-review` — self-review uncommitted changes before commit.
- `/unblock` — CI/tests red on trunk: diagnose, propose rollback vs forward-fix.
- `/context` — dump recent commits + failing tests into context.
- `/walking-skeleton [init|check]` — scaffold end-to-end thinnest slice (UI → primary port → handler → secondary port → fake adapter → one real adapter → IaC deploy) or audit.
- `/port <name> [primary|secondary]` — scaffold port interface + fake + factory registration.
- `/adapter <port> <tech>` — scaffold adapter for existing port.
- `/handler <command|query> <name>` — scaffold handler via mediator, wired in factory.
- `/scenario <name>` — scaffold Scenario + Factory + port-only test stub.
- `/hex-check` — audit: domain→infra leaks, logic in dumb layers, missing fakes, mock usage (flag), direct port instantiation bypassing factory.
- `/12factor-check` — config, deps, backing services, statelessness, logs, etc.

### Skills (auto-activated knowledge)
- `hexagonal-review` — nudge toward correct layer on edits.
- `test-scenario-pattern` — enforce Scenario+Factory+fakes pattern when writing tests.
- `walking-skeleton-guide` — activate on project init / brownfield onboarding.

### Templates (`kit new <lang>`)
All hexagonal layout, mediator wired, fakes co-located, walking-skeleton seed, IaC stub, pre-commit + format hooks installed.
- `java/`, `kotlin/`, `typescript-backend/`, `typescript-frontend/`, `rust/`, `go/`, `iac/`

## Open Questions — RESUME HERE

1. **npm scope/package name?** (blocking release — not blocking design)
2. **Default frameworks per language** (pick one each):
   - Java: Spring Boot / Micronaut / Quarkus?
   - Kotlin: Ktor / Spring?
   - TypeScript backend: Nest / Fastify+custom / Express+custom?
   - TypeScript frontend: React / Vue / Svelte?
   - Rust: Axum / Actix?
   - Go: stdlib / Echo / Gin?
3. **Mediator implementation:** roll-your-own per language, or adopt mature libs where available (e.g., `mediatr-ts` for TS, Axon for Java)?
4. **IaC default:** Terraform or OpenTofu? (lean OpenTofu — fully OSS, TF-compatible)
5. **Fakes location:** co-located with port (`ports/user-repository.ts` + `ports/user-repository.fake.ts`) or separate test-support module? (lean co-located)
6. **Kit scope:** docs/commands/hooks only, or also ship working starter templates via `kit new <lang>`? (lean both)

## Next Actions

- Answer open questions above.
- Decide MVP slice: which 2–3 components to ship first (suggest: global CLAUDE.md + auto-format hook + pre-commit test hook + `/commit` + one language template as proof).
- Scaffold the CLI skeleton (`bin/kit.js`, manifest, install/update commands).
- Draft global CLAUDE.md encoding all architectural constraints above.
