---
name: hexagonal-review
description: |
  Use when creating or modifying source files in a keel-governed project to
  verify the change lands in the correct hexagonal layer and respects the
  dependency rule. TRIGGER on any edit under application/, domain/, or
  infrastructure/. SKIP for config files, documentation, and build scripts.
---

# hexagonal-review

This project enforces hexagonal architecture. Before writing or editing code,
verify the change belongs in the intended layer and does not violate the
dependency rule.

## Layers

| Layer                    | Location                  | Allowed to depend on      |
| ------------------------ | ------------------------- | ------------------------- |
| Domain — contract        | `domain/contract/`        | nothing outside `domain/` |
| Domain — core            | `domain/core/`            | `domain/contract` only    |
| Application (interface)  | `application/<channel>/*` | `domain/contract` only    |
| Infrastructure (adapter) | `infrastructure/<port>/*` | `domain/contract` only    |

`domain/core` never imports from `application/*`, `infrastructure/*`, or any
framework module. `infrastructure/*` and `application/*` never import from
`domain/core`; they work through `domain/contract` only.

## Responsibilities

- **Interface layer** (`application/<channel>`): map transport DTO → `Action`,
  dispatch via mediator, map `Result` back. No branching on business rules,
  no validation beyond deserialization, no orchestration. If you find
  yourself writing an `if` that checks business state, stop — move it to a
  handler in `domain/core`.
- **Infrastructure** (`infrastructure/<port>/<impl>`): adapt an external
  technology to a port interface. No business logic. A repository adapter
  translates rows to domain types; it does not decide what to do with them.
- **Domain/core**: holds every rule, every invariant, every decision.
  Mediator lives in `domain/core/kernel`. Handlers live in
  `domain/core/<aggregate>`.
- **Domain/contract**: port interfaces (primary + secondary), domain DTOs,
  sealed `Action` / `Command` / `Query` / `Error` / `Result` types. Nothing
  executable.

## Red flags to watch for

- A framework annotation (`@RestController`, `@GET`, `@PathParam`, Express
  `Request/Response`, etc.) appearing in any `domain/` file — move to the
  interface layer immediately.
- A database driver, HTTP client, or message-bus SDK referenced in `domain/`
  — move to `infrastructure/`.
- A handler that calls another handler directly — route through the
  mediator, or merge the logic if the second handler is an implementation
  detail of the first.
- An interface layer that constructs domain aggregates — it should hand the
  request to the mediator and consume the `Result`.
- Business validation in DTO classes — move to the `Command`'s factory /
  smart constructor or to the handler.

## Workflow when editing

1. Identify the layer of the file you are editing.
2. Confirm every new import is allowed for that layer (see table).
3. If you need something that is not allowed, introduce a port in
   `domain/contract` and an adapter in `infrastructure/<port>`.
4. Keep handlers pure: they receive an `Action`, interact with ports, and
   return a `Result`. No framework types.

If architecture boundary tests exist (ArchUnit, dependency-cruiser,
cargo-deny), run them before commit: boundaries are non-negotiable.
