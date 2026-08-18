# `walking-skeleton` — the runnable skeleton

The thinnest end-to-end runnable project for the chosen stack, in a
hexagonal layout with a sample secondary port + fake. This vertical
**is** the greenfield scaffold — every stack installs it, and its
adapters are selected by predicate from the stack's tags.

## Dimensions

| Dimension          | Covered by                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoint`       | one bootstrap adapter per stack shape — JVM picocli CLI or REST service, Go/Rust/TS CLI or HTTP, the SPA                                     |
| `port-example`     | the sample `Clock` secondary port + canonical fake, rendered per language                                                                    |
| `build-tool`       | wrapper/workspace generation: `gradle wrapper` / `mvn -N wrapper:wrapper` / `npm install` / `pnpm install` per `pkg.*` tag                   |
| `agentic-baseline` | the `claude-core` adapter — emits the [binding spec](../../assets/project/AGENTS.md) as `AGENTS.md` + a `CLAUDE.md` pointer, unconditionally |
| `agentic-kit`      | one Claude-kit adapter per stack family (`jvm-`, `go-`, `rust-`, `ts-`, `wc-claude-kit`) — the stack runbook + the `.claude/` workflow kit   |

## The Claude kit

Beyond the universal binding spec, every scaffold ships the stack's
own agent affordances, resolved from the manifest tags (build system,
framework, entrypoint shape, module layout) — one adapter per stack
**family**, never per `pkg.*` tag:

- **A stack runbook appended to `AGENTS.md`** under sentinel markers
  (`<!-- keel:stack-runbook:begin/end -->`): the build/test/run
  commands and layout notes for exactly the shape that was scaffolded.
  The patch replaces its own section and never touches edits around
  it, so re-applying stays idempotent.
- **The pre-commit format hook** keel itself uses
  (`.claude/hooks/pre-commit-format.sh`, wired via
  `.claude/settings.json`): before a Claude-issued `git commit`, it
  auto-formats where the toolchain ships a formatter (`gofmt -w .`,
  `cargo fmt`) and runs the family's fast gate — the same commands
  the `ci` vertical's pipeline runs — so every commit lands green.
- **A `run` skill** (`.claude/skills/run/SKILL.md`): the
  launch-and-probe loop for the scaffolded shape — dev mode + `curl`
  for the HTTP services, the sample invocation for the CLIs, the Vite
  dev server for the SPA.

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
- Go and Rust entrypoints **compose** — a tag set carrying both
  `arch.cli` and `arch.server-http` ships both deployment units on one
  module/package.
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
