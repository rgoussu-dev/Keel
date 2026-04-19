# Brainstorm: Universal Claude Code Kit

Checkpoint of an in-progress design session. Pick up from "Open questions" below.

## Goal

Build a one-size-fits-all, installable toolkit (Claude Code workflows, hooks,
skills, slash commands, templates) that can be dropped into any project.

## Distribution & Install Model — LOCKED

- **Package:** `@rgoussu.dev/keel` — LOCKED.
- **Distribution:** npx-based CLI (Node.js). Cross-platform: Windows, macOS, Linux.
- **CLI verbs:** `install`, `update`, `add <component>`, `remove <component>`, `doctor`, `generate <schematic>` (aka `g`).
- **Install mode:** copy (not symlink), with migration/update path.
- **Scope targets:**
  - `--global` → `~/.claude/` (universal defaults)
  - default → `./.claude/` in current project (per-project overrides)
- **Update/migration:**
  - `.claude/.kit-manifest.json` tracks version + sha256 of each installed file.
  - `kit update` compares user hash vs shipped-old vs shipped-new. Unchanged → overwrite. Modified → diff + prompt (keep/overwrite/merge).
  - Per-component `CHANGELOG.md` shipped with the package.
  - Schematics carry `migration-*.ts` Rules to auto-evolve projects across kit versions (Angular-schematics style).

## Schematics Architecture — LOCKED

Generators are composable, parameterized, and ship migration scripts per
version. **Engine is abstracted behind a wrapper interface** so the
implementation can be swapped.

### Wrapper Interface (ports)
```ts
interface Engine {
  register(s: Schematic): void;
  run(name: string, opts: Options, ctx: Context): Promise<void>;
}
interface Schematic {
  name: string; description: string;
  parameters: ParamSchema;
  run(tree: Tree, opts: Options, ctx: Context): Promise<void>;
}
interface Tree {                       // virtual FS; commits only after dry-run review
  read|write|delete|exists|list
}
interface Context {
  logger; prompt(schema); invoke(name, opts);  // composition
}
```

### Default Engine: Homegrown (A) — LOCKED
- Built on `ejs` (templates) + `inquirer` (prompts) + `fs-extra`.
- ~500 LoC; zero impedance with wrapper.
- Tree provides dry-run + diff + atomic write.
- Migrations: `migrations/<version>.ts` in each schematic; `keel update` runs pending.

### Swappable adapters (future, to prove abstraction)
- `PlopAdapter`, `NxDevkitAdapter`, `HygenAdapter` — shipped as optional packages.
- Explicitly **not** `@angular-devkit/schematics` (rejected — avoid dependency unless overwhelming reason).

## Proposed Layout

```
<kit-name>/
├── bin/kit.js
├── lib/                            # installer, manifest, diff/merge, schematic runner
├── assets/
│   ├── global/                     # → ~/.claude/
│   │   ├── CLAUDE.md
│   │   ├── settings.json
│   │   ├── agents/
│   │   ├── skills/
│   │   └── commands/
│   ├── project/                    # → <project>/.claude/
│   │   ├── settings.json
│   │   ├── hooks/                  # .sh + .ps1 pair per hook
│   │   └── commands/
│   └── schematics/                 # Angular-style generators
│       ├── walking-skeleton/
│       ├── port/
│       ├── adapter/
│       ├── handler/
│       ├── scenario/
│       ├── executable/
│       ├── iac/
│       └── collection.json
└── manifest.schema.json
```

## Project Layout Produced by Schematics — LOCKED

Multi-module, framework-agnostic until walking-skeleton time.

```
application/
  <channel>/                       # rest, cli, worker, ui, graphql, …
    contract/                      # API contracts (OpenAPI, schema, DTOs)
    executable/                    # actual runnable; framework chosen at WS scaffold
domain/
  contract/                        # ports (primary + secondary) + domain DTOs
  core/
    kernel/                        # mediator (roll-your-own, per-language)
    <aggregate>/                   # business logic
infrastructure/
  <port>/
    <impl>/                        # real adapter (e.g., postgres, kafka)
    fake/                          # fake as its own module
      # always test-dep; opt-in as prod-dep for prototyping
```

- Multiple executables per project are expected.
- `/executable <channel>` schematic adds a new one; chooses framework at generation time.

## User Preferences — CAPTURED

### Languages & Tooling
- **Languages:** Java, Kotlin, TypeScript, Rust, Go.
- **Formatters/linters:** mainstream per language (prettier/eslint, ktlint, rustfmt+clippy, gofmt+go vet, google-java-format).
- **Comments:** JavaDoc/JSDoc on public interfaces/methods/classes only. Otherwise none.
- **Tests:** mainstream per language. Strict DIP (see Architecture).

### Workflow
- **Branching:** none — trunk-based, XP, continuous integration; parallel work via feature flags + small commits + fast sync.
- **Commits:** auto after each logical unit, Conventional Commits format.
- **Hook — block commits to main:** NO (trunk-based requires committing to main).
- **Hook — auto-format on save/edit:** YES (PostToolUse on Edit/Write).
- **Hook — pre-commit tests:** YES, commit must fail if tests fail.
- **PRs:** none (trunk-based).
- **"Done" discipline:** Claude must run type-check + tests before claiming done.
- **Verbosity:** very terse.
- **Permissions (pre-allow):** full toolchain per language + all read-only tools.

### Environment
- **Editors:** VS Code primary; cross-IDE standardized configs required.
- **Shell:** native per OS — PowerShell on Windows, bash/sh on Linux. Hooks ship as `.sh` + `.ps1` pairs.

## Architectural Constraints — NON-NEGOTIABLE

1. **Hexagonal architecture, always** — including frontend.
2. **Interface (application/<channel>) = dumb:** map DTO → dispatch via mediator → map response.
3. **Infrastructure = dumb:** adapters only. Zero business logic.
4. **Command/Query + Mediator** for all business operations. Mediator lives in `domain/core/kernel/`.
5. **Test pattern (strict DIP):**
   - **Scenario** — encapsulates data.
   - **Factory** — wires SUT with fakes (not mocks).
   - **Test** — depends only on Scenario, Factory, port interface under test.
6. **Walking skeleton first.** Greenfield: build before features. Brownfield: assess → build if missing → then work.
7. **IaC mandatory.** **OpenTofu** is the default.
8. **Fakes strategy:** own modules, always test-dep, opt-in as prod-dep for fast prototyping.
9. **Framework choice deferred** to walking-skeleton time. Supported executable/framework registry = TBD.
10. **Invariants:** XP, SOLID, 12-Factor App.

## Components to Ship

### Hooks (cross-platform .sh + .ps1)
- `PostToolUse` on Edit/Write → format touched file (language-detected).
- `PreToolUse` on Bash `git commit` → type-check + scoped tests; fail on red. `--full` flag.
- `SessionStart` → load context: diff, recent commits, failing tests, walking-skeleton status.
- `Stop` → remind Claude to commit logical units in Conventional Commit format.

### Slash Commands / Schematics
Workflow:
- `/commit`, `/sync`, `/micro`, `/flag <name>`, `/tdd <behavior>`, `/spike [end]`, `/diff-review`, `/unblock`, `/context`.

Schematic-backed:
- `/walking-skeleton [init|check]` — composes: `/executable` + `/port` + `/handler` + `/adapter` + fake + `/iac`.
- `/executable <channel>` — scaffold new runnable; prompts for framework.
- `/port <name> [primary|secondary]` — port interface + fake module + factory registration.
- `/adapter <port> <tech>` — real adapter for existing port.
- `/handler <command|query> <name>` — handler via mediator, wired in factory.
- `/scenario <name>` — Scenario + Factory + port-only test stub.
- `/iac [module]` — OpenTofu module scaffolding.

Audits:
- `/hex-check` — domain→infra leaks, logic in dumb layers, missing fakes, mock usage (flag), bypasses of factory.
- `/12factor-check` — config, deps, backing services, statelessness, logs.

### Skills (auto-activated knowledge)
- `hexagonal-review` — nudge correct layer on edits.
- `test-scenario-pattern` — enforce Scenario+Factory+fakes.
- `walking-skeleton-guide` — activate on init / brownfield.

## Java/Quarkus Proving Ground — LOCKED

- **Build tool:** Gradle (always). Kotlin DSL.
- **Multi-module:** standard multi-project build + `build-logic/` included build (convention plugins) + `gradle/libs.versions.toml` version catalog.
- **Test stack:** JUnit 5 + AssertJ + **ArchUnit** (hex boundary enforcement) + **PIT/pitest** (mutation testing, `pitest-junit5-plugin`, changed-classes scope by default).
- **Mediator:** explicit DI at construction — handlers wired via `Map<Class<?>, Handler>` passed to `Mediator` constructor. No reflection, no annotation scanning. Lives in `domain/core/kernel/`.

### Example mediator
```java
public final class Mediator {
  private final Map<Class<?>, CommandHandler<?, ?>> commandHandlers;
  private final Map<Class<?>, QueryHandler<?, ?>> queryHandlers;

  public Mediator(Map<Class<?>, CommandHandler<?, ?>> cmds,
                  Map<Class<?>, QueryHandler<?, ?>> qrys) { … }

  public <C extends Command<R>, R> R send(C command) { … }
  public <Q extends Query<R>, R> R ask(Q query) { … }
}
```

### Project skeleton
```
<root>/
├── settings.gradle.kts            # includes modules + build-logic
├── gradle/libs.versions.toml
├── build-logic/
│   └── src/main/kotlin/
│       ├── keel.java-conventions.gradle.kts
│       ├── keel.test-conventions.gradle.kts
│       └── keel.quality-conventions.gradle.kts
├── application/rest/{contract,executable}/build.gradle.kts
├── domain/{contract,core}/build.gradle.kts
└── infrastructure/<port>/{<impl>,fake}/build.gradle.kts
```

## Open Questions — RESUME HERE

1. **Java version:** 21 LTS (Quarkus 3.x default) or 17?
2. **Quality toolchain:** Spotless + google-java-format + Checkstyle + ArchUnit + PIT — all in? Or drop Checkstyle?

## Next Actions

- Resolve the two open questions.
- Build MVP:
  1. Scaffold `keel` CLI (`bin/keel.js`) + manifest + install/update + update-migration runner.
  2. Homegrown schematics engine behind `Engine` wrapper interface.
  3. Global `CLAUDE.md` + `settings.json` encoding all architectural constraints.
  4. Auto-format + pre-commit-tests hooks (.sh + .ps1).
  5. First three schematics end-to-end for Java/Quarkus: `walking-skeleton`, `port`, `scenario`.
  6. `/commit` slash command.
