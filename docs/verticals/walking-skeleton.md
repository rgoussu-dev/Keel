# `walking-skeleton` — the runnable skeleton

The thinnest end-to-end runnable project for the chosen stack, in a
hexagonal layout with a sample secondary port + fake. This vertical
**is** the greenfield scaffold — every stack installs it, and its
adapters are selected by predicate from the stack's tags.

## Dimensions

| Dimension          | Covered by                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoint`       | one bootstrap adapter per stack shape — JVM picocli CLI or REST service, Go/Rust CLI or HTTP, `ts-http`, the SPA                             |
| `port-example`     | the sample `Clock` secondary port + canonical fake, rendered per language                                                                    |
| `build-tool`       | wrapper/workspace generation: `gradle wrapper` / `mvn -N wrapper:wrapper` / `npm install` / `pnpm install` per `pkg.*` tag                   |
| `agentic-baseline` | the `claude-core` adapter — emits the [binding spec](../../assets/project/AGENTS.md) as `AGENTS.md` + a `CLAUDE.md` pointer, unconditionally |

## What each stack's skeleton looks like

The generated trees, questions, and prerequisites are documented per
stack family:

- [JVM — Quarkus, Spring Boot, Micronaut, Java & Kotlin](../stacks/jvm.md)
- [Go](../stacks/go.md) · [Rust](../stacks/rust.md)
- [ts-http](../stacks/ts-http.md) ·
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
