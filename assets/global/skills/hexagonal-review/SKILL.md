---
name: hexagonal-review
description: |
  Use when creating or modifying source files in a keel-governed project to
  verify the change lands in the correct hexagonal layer and respects the
  dependency rule. TRIGGER on any edit under application/, domain/, or
  infrastructure/. SKIP for config files, documentation, and build scripts.
---

# hexagonal-review

This project enforces hexagonal architecture. The domain is a three-module
DAG and the application layer is split into a dumb interface adapter and
a composition root. Before writing or editing code, verify the change
belongs in the intended layer and respects the dependency rule.

## Layers

| Layer                                       | Location                           | Allowed to depend on                                                                                           |
| ------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Domain — kernel                             | `domain/kernel/`                   | nothing (stdlib only)                                                                                          |
| Domain — contract                           | `domain/contract/`                 | `domain/kernel`                                                                                                |
| Domain — core                               | `domain/core/`                     | `domain/kernel` and `domain/contract`                                                                          |
| Application — interface adapter             | `application/<channel>/contract`   | `domain/kernel` and `domain/contract`                                                                          |
| Application — composition root (executable) | `application/<channel>/executable` | `domain/kernel`, `domain/contract`, `domain/core`, `application/<channel>/contract`, `infrastructure/<port>/*` |
| Infrastructure (adapter)                    | `infrastructure/<port>/*`          | `domain/kernel` and `domain/contract`                                                                          |

Dependency direction (no cycles):

```
kernel  ←  contract  ←  core
   ↑          ↑           ↑                ↑
   └──────────┴──── application/<channel>/contract  &  infrastructure/<port>/*
                          ↓
            application/<channel>/executable  ── wires everything
```

`domain/core/<aggregate>` (handlers and aggregate logic) never imports
from `application/*`, `infrastructure/*`, or any framework module.
Interface adapters (`application/<channel>/contract`) and infrastructure
adapters (`infrastructure/<port>/*`) never import from `domain/core`;
they reach the domain through ports declared in `domain/contract` and
through the kernel's typed dispatch (Mediator interface, sealed bases,
`Result`).

**Only** the `application/<channel>/executable` module — the composition
root — is permitted to reach across layers, and only to wire concrete
handlers into the mediator implementation and concrete adapters into
ports. It must contain no logic.

## Responsibilities

- **Domain/kernel**: sealed `Action` / `Command` / `Query` / `Result` /
  `Error` bases, the `Handler` interface, the `Mediator` interface,
  kernel-level error types (e.g. `NoHandlerError`). Higher abstractions
  only; no concrete commands, no implementations. Depends on nothing
  outside itself.
- **Domain/contract**: concrete `Command` / `Query` / per-aggregate
  `Error` subtypes that name each supported operation, domain DTOs, and
  port interfaces (primary + secondary). Depends only on `domain/kernel`.
  Nothing executable beyond the value-class constructors of the sealed
  subtypes.
- **Domain/core**: the implementations — handlers in
  `domain/core/<aggregate>` and the Mediator implementation
  (`RegistryMediator`). Holds every business rule, invariant, and
  decision. Handlers are reachable only via the Mediator interface
  declared in kernel.
- **Interface adapter** (`application/<channel>/contract`): map
  transport DTO → `Action`, dispatch via the Mediator interface, map
  `Result` back. No branching on business rules, no validation beyond
  deserialization, no orchestration. If you find yourself writing an
  `if` that checks business state, stop — move it to a handler in
  `domain/core`.
- **Composition root** (`application/<channel>/executable`): instantiate
  concrete handlers, concrete adapters, and the Mediator implementation;
  hand the wired graph to the runtime (e.g. a Quarkus/Spring startup
  bean, a `main` method). Zero business logic, zero transport mapping —
  both belong in the layers above.
- **Infrastructure** (`infrastructure/<port>/<impl>`): adapt an external
  technology to a port interface. No business logic. A repository
  adapter translates rows to domain types; it does not decide what to
  do with them.

## Red flags to watch for

- A framework annotation (`@RestController`, `@GET`, `@PathParam`,
  Express `Request/Response`, etc.) appearing in any `domain/` file —
  move to the interface adapter layer immediately.
- A database driver, HTTP client, or message-bus SDK referenced in
  `domain/` — move to `infrastructure/`.
- A handler that calls another handler directly — route through the
  mediator, or merge the logic if the second handler is an
  implementation detail of the first.
- An interface adapter that constructs domain aggregates — it should
  hand the request to the mediator and consume the `Result`.
- Business validation in DTO classes — move to the `Command`'s factory /
  smart constructor or to the handler.
- Anything in `domain/contract` that depends on `domain/core` — that's a
  cycle. Concrete commands and DTOs in contract only see
  `domain/kernel`.
- `application/<channel>/contract` (the dumb adapter) reaching into
  `domain/core` or any other module beyond `domain/kernel` and
  `domain/contract` — the composition-root exception is **only** for
  `application/<channel>/executable`.

## Workflow when editing

1. Identify the layer of the file you are editing.
2. Confirm every new import is allowed for that layer (see table).
3. If you need something that is not allowed, introduce a port in
   `domain/contract` and an adapter in `infrastructure/<port>`.
4. Keep handlers pure: they receive an `Action`, interact with ports,
   and return a `Result`. No framework types.

If architecture boundary tests exist (ArchUnit, dependency-cruiser,
cargo-deny), run them before commit: boundaries are non-negotiable.
