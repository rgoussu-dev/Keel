# `walking-skeleton` — the runnable skeleton

The thinnest end-to-end runnable project for the chosen stack, in a
hexagonal layout with a sample secondary port + fake. This vertical
**is** the greenfield scaffold — every stack installs it, and its
adapters are selected by predicate from the stack's tags.

## Dimensions

| Dimension          | Covered by                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoint`       | one bootstrap adapter per stack shape — JVM picocli CLI or REST service, Go/Rust/TS CLI or HTTP, the SPA                                                                                              |
| `port-example`     | the sample `Clock` secondary port + canonical fake, rendered per language                                                                                                                             |
| `build-tool`       | wrapper/workspace generation: `gradle wrapper` / `mvn -N wrapper:wrapper` / `npm install` / `pnpm install` per `pkg.*` tag                                                                            |
| `agentic-baseline` | the `claude-core` adapter — emits the [binding spec](../../assets/project/AGENTS.md) as `AGENTS.md` plus the loading shims (`CLAUDE.md`, `.gemini/settings.json`, `.aider.conf.yml`), unconditionally |
| `agentic-kit`      | one Claude-kit adapter per stack family (`jvm-`, `go-`, `rust-`, `ts-`, `wc-claude-kit`) — the stack section of `AGENTS.md` + the `.claude/` workflow kit                                             |

## The emitted `AGENTS.md`

One content file, read by every agent. `AGENTS.md` is the open
convention (Codex, Copilot, Cursor, Gemini CLI, aider and most others
read it natively or through one setting); the shims exist for the
tools that do not, and carry no rules of their own:

- `CLAUDE.md` — one line, `@AGENTS.md`. Claude Code imports the
  spec through it.
- `.gemini/settings.json` — names `AGENTS.md` first in Gemini CLI's
  `context.fileName` list.
- `.aider.conf.yml` — `read: [AGENTS.md]`, loaded read-only on start.

The root is **terse by design — 120 lines at most, keel's regions
included** — because an agent carries it on every turn. What it
holds, in reading order:

1. **Identity and precedence** — what the file is, and that the
   stack section is keel's to maintain.
2. **The stack section** (`<!-- keel:stack-runbook:… -->`), filled by
   the family kit below: commands, dispatch stance, layout map.
3. Empty `keel:map` and `keel:skills-index` slots, reserved for the
   index projection (`keel docs sync`, a later wave).
4. **Architecture** — the dependency rule, the dispatch-seam opening
   rule ("commands as data through one seam"; _which_ seam is the
   stack section's business), error→transport, fakes beside adapters,
   IaC.
5. **Tests**, **Workflow**, comments — the universal conventions,
   deduplicated.
6. **Working agreements** in the vocabulary of the
   [augmented-coding-patterns catalog](https://lexler.github.io/augmented-coding-patterns/)
   (Lada Kesseler et al.): orient by map, look up by index, grep the
   long tail; Active Partner; Chain of Small Steps; No Perfect
   Recall; the Sunk Cost tripwire; Offload Deterministic; Noise
   Cancellation; Extract Knowledge; the Canary signal; the Answer
   Injection guard. Mechanical rules — formatting, sizes, comment
   shape — are deliberately absent: they belong to hooks and linters,
   which an agent cannot selectively ignore.

What left the root and why: the dispatch stances of the four
languages a project does not use (a JVM project never needed the Go
stance), the modulith essay (a modulith project gets its own map
instead), "walking skeleton first" (keel just built it), the
principles list, a `/docs-check` command that never existed,
decision dates and the CLI plug. A guard test
(`tests/domain/core/verticals/harness-budget.test.ts`) holds every
non-composite stack, on every layout, under the line and byte budget
and refuses any other family's stance in the file.

## The Claude kit

Beyond the universal conventions, every scaffold ships the stack's
own agent affordances, resolved from the manifest tags (build system,
framework, entrypoint shape, module layout) — one adapter per stack
**family**, never per `pkg.*` tag:

- **The stack section of `AGENTS.md`**, under sentinel markers
  (`<!-- keel:stack-runbook:begin/end -->`) that the binding spec
  ships empty right under its preamble, so the section lands where an
  agent reads first. Three parts, one shape for all five families:
  - the **command table** — build, test, the commit gate, run and
    probe for exactly the shape that was scaffolded;
  - the **dispatch stance** of this project's language — registry
    Mediator on the JVM and server-side TypeScript, per-use-case
    driving ports on Go, Rust and the frontend — and of no other;
  - the **layout map** — the path grammar of the emitted tree, as
    `<ctx>` / `<peer>` placeholders rather than a listing of today's
    modules (which `keel add module` would date): where a context's
    domain, its peer seam, its `<peer>-gateway`, the assembly's
    per-context wiring file and the migrations live. This is what
    "orient by map" points at: the orientation questions the harness
    evals probe resolve from it without a search.

  The patch replaces its own region and never touches edits around
  it. That is the ownership rule the spec states — keel maintains its
  sentinel regions, the project keeps its notes outside them — and
  `keel add walking-skeleton --reapply` honours it: the section is
  re-rendered in place, the rest of `AGENTS.md` is left as the
  project has it, and the shims come back pristine. The pre-commit
  hook below follows the same rule around its format step.

- **The pre-commit format hook** keel itself uses
  (`.claude/hooks/pre-commit-format.sh`, wired via
  `.claude/settings.json`): before a Claude-issued `git commit`, it
  auto-formats where the toolchain ships a formatter (`gofmt -w .`,
  `cargo fmt`) and runs the family's fast gate — the same commands
  the `ci` vertical's pipeline runs — so every commit lands green.
  The format step sits between sentinels the `code-style` vertical
  fills when it wires a formatter in; a reapply of the walking
  skeleton re-renders the hook around that step, never over it.
- **A `run` skill** (`.claude/skills/run/SKILL.md`): the
  launch-and-probe loop for the scaffolded shape — dev mode + `curl`
  for the HTTP services, the sample invocation for the CLIs, the Vite
  dev server for the SPA. Contributed as a `SkillSpec` through the
  [skill seam](../composition.md#skills) — the vertical declares the
  name in `skills: ['run']`, and the engine stages the file with its
  provenance recorded in the manifest.

## What each stack's skeleton looks like

The generated trees, questions, and prerequisites are documented per
stack family:

- [JVM — Quarkus, Spring Boot, Micronaut, Java & Kotlin](../stacks/jvm.md)
- [Go](../stacks/go.md) · [Rust](../stacks/rust.md)
- [TypeScript — `ts-http` & `ts-cli`](../stacks/ts-http.md) ·
  [web-components](../stacks/web-components.md)

Highlights that hold everywhere:

- The **entrypoint shape is a predicate dimension**, not hard-coded:
  framework, language, and build system are ordinary tags, and the
  domain trisection is shared per language across frameworks.
- The **module layout is a second dial** on the JVM stacks:
  `layout.basic` (default) emits the flat trisection, `layout.modulith`
  emits one hexagon per bounded context under `modules/` composed by
  `application/<typology>` assemblies. Same adapters, same answers —
  a different shape. → [Module layout](../stacks/jvm.md#module-layout)
- Entrypoints **compose** — a tag set carrying both `arch.cli` and
  `arch.server-http` ships both deployment units on one hexagon,
  across every family: Go and Rust always did (one module/package,
  no change needed), and the JVM and TypeScript stacks now do too
  (`quarkus-cli-rest`, …, `ts-cli-http` — see the [stack
  catalog](../stacks/README.md#the-matrix)), sharing one domain and
  upserting the root build files instead of writing them whole. This
  holds under **both** module layouts: under the modulith an
  entrypoint contributes its driving adapter inside the bounded
  context as well as its assembly, and the seeded root files carry
  both.
- Build wrappers are **generated, never committed as binaries** (the
  build tool must be on PATH at scaffold time).
- TypeScript workspaces have their dependencies **installed at
  scaffold time**.

## Prerequisites

Those of the chosen stack — see
[prerequisites at a glance](../stacks/README.md#prerequisites-at-a-glance).

## Related

- [Verticals catalog](README.md) ·
  [Composition model](../composition.md)
