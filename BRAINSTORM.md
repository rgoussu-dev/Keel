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
  - `.claude/.keel-manifest.json` tracks version + sha256 of each installed file.
  - `keel update` compares user hash vs shipped-old vs shipped-new. Unchanged → overwrite. Modified → diff + prompt (keep/overwrite/merge).
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

## Universality Principle — LOCKED

**All hooks, skills, commands, and schematics apply the same patterns and
principles regardless of language.** Only rendering differs. A single
conventions table drives language-specific behavior.

### Language Conventions (ships at `assets/conventions/languages.json`)

| Concept | Java | Kotlin | TypeScript | Rust | Go |
|---|---|---|---|---|---|
| Public-API doc | JavaDoc `/** */` | KDoc `/** */` | TSDoc `/** */` | rustdoc `///` | doc comment |
| Formatter | google-java-format | ktlint | prettier | rustfmt | gofmt |
| Linter | ErrorProne | detekt | eslint | clippy | `go vet` + staticcheck |
| Test runner | JUnit 5 + AssertJ | JUnit 5 + Kotest | vitest | built-in + proptest | built-in + testify |
| Mutation | PIT | PIT (Gradle) | Stryker | cargo-mutants | go-mutesting |
| Null safety | JSpecify + NullAway | non-null default | strict TS | built-in | explicit checks |
| Result type | sealed `Result<T>` | sealed `Result<T>` | discriminated union | `std::Result<T,E>` | `(T, error)` |
| Build tool | Gradle | Gradle | pnpm | Cargo | Go modules |

All hooks, commands, skills, and schematics read this table; behavior is
uniform, syntax is language-appropriate.

### Schematic layout reflects universality

```
schematics/<name>/
├── schematic.json
├── factory.ts              # language-agnostic Rule chain
└── templates/
    ├── java/ kotlin/ typescript/ rust/ go/
```

Schematics take `--language <lang>` (auto-detected from project markers).

### Naming cleanup
- Skill `javadoc-public-api` → **`public-api-docs`** (language-agnostic).
- Command `/javadoc-check` → **`/docs-check`** (language-agnostic).

## Java/Quarkus Proving Ground — LOCKED

- **Java:** 25 LTS. Global principle: **always latest stable** (LTS for langs, latest for frameworks).
- **Build tool:** Gradle (always). Kotlin DSL.
- **Multi-module:** standard multi-project build + `build-logic/` included build (convention plugins) + `gradle/libs.versions.toml` version catalog.
- **Test stack:** JUnit 5 + AssertJ + **ArchUnit** (hex boundary enforcement) + **PIT/pitest** (mutation testing, `pitest-junit5-plugin`, changed-classes scope by default).
- **Quality stack:** Spotless + google-java-format · ErrorProne · NullAway + JSpecify · ArchUnit · PIT. **No Checkstyle** — JavaDoc-on-public-API enforced via Claude skill/hook/command triad.
- **Mediator:** explicit DI at construction; `Collection<Handler>` only; handlers self-declare supported actions via `supports()`. Lives in `domain/core/kernel/`.

### Mediator design (Java 25)

```java
// Sealed action hierarchy
public sealed interface Action<R>  permits Command, Query {}
public non-sealed interface Command<R> extends Action<R> {}
public non-sealed interface Query<R>   extends Action<R> {}

// Result type
public sealed interface Result<T> {
  record Success<T>(T value)     implements Result<T> {}
  record Failure<T>(Error cause) implements Result<T> {}
  // + map / flatMap / fold / isSuccess
}

// Handler bound to a sealed base; multi-action within that base
public interface Handler<B extends Action<?>> {
  Set<Class<? extends B>> supports();
  Result<?> handle(B action);
}

// Sync mediator
public final class Mediator {
  private final Map<Class<? extends Action<?>>, Handler<?>> registry;
  public Mediator(Collection<Handler<?>> handlers) { /* build + detect dupes */ }
  public <R> Result<R> dispatch(Action<R> action) { /* typed, unchecked cast centralized */ }
}

// Reactive variant (Mutiny/Quarkus)
public final class ReactiveMediator {
  public <R> Uni<Result<R>> dispatch(Action<R> action);
}
```

### Error mapping

- Domain: sealed `Error` hierarchy per aggregate (pattern-matchable).
- REST: map `Error` → **RFC 9457 Problem Details** in the interface-layer adapter.
- Non-REST: equivalent adapted formats (CLI → exit code + structured stderr; messaging → CloudEvents error extension; gRPC → `google.rpc.Status`).
- Mapping lives in `application/<channel>/executable`; domain stays transport-agnostic.

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

## Design — COMPLETE

All architectural decisions resolved. Ready to build.

## MVP Build Plan

1. **`keel` CLI scaffold** (`bin/keel.js`, manifest, install/update/migrate).
2. **Homegrown schematics engine** behind `Engine` / `Schematic` / `Tree` / `Context` wrapper.
3. **Global `CLAUDE.md`** encoding all architectural constraints (hex, DIP, mediator, walking-skeleton, IaC, XP/SOLID/12-factor, trunk-based, commit discipline, comment policy, always-latest).
4. **Global `settings.json`** with pre-allowed permissions (toolchain + read-only).
5. **Hooks** (.sh + .ps1 pairs, language-aware via conventions table):
   - `PostToolUse` → auto-format on Edit/Write (picks formatter by file extension).
   - `PreToolUse` on git commit → type-check + scoped tests + public-API doc check (all language-aware).
   - `SessionStart` → context load.
   - `Stop` → commit-discipline reminder.
6. **Schematics (Java/Quarkus proving ground first; templates added per language over time):** `walking-skeleton`, `port`, `scenario`.
7. **Slash commands (language-agnostic):** `/commit`, `/docs-check`, `/sync`, `/diff-review`.
8. **Skills (language-agnostic):** `hexagonal-review`, `test-scenario-pattern`, `public-api-docs`, `walking-skeleton-guide`.
