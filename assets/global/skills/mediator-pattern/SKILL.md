---
name: mediator-pattern
description: |
  Use when designing or modifying business logic in a keel-governed project
  — Action/Command/Query types, Handler implementations, Mediator wiring,
  or sealed Error hierarchies. TRIGGER on edits in domain/kernel/,
  domain/contract/<aggregate>/, or domain/core/<aggregate>/, on new
  Handler classes, when discussing service-layer alternatives, or when
  wiring transports to domain operations. SKIP for adapter implementation
  details (covered by hexagonal-review) and tests (covered by
  test-scenario-pattern).
---

# mediator-pattern

All business operations in a keel-governed project go through a Mediator.
There are no service-layer god objects. This skill exists to keep that
discipline consistent across aggregates and across languages.

## Where the pieces live (three-module split)

The Mediator pattern is split across the three domain modules
described in the `hexagonal-review` skill:

| Piece                                                                | Module                    |
| -------------------------------------------------------------------- | ------------------------- |
| Sealed `Action` / `Command` / `Query` bases, `Handler` interface     | `domain/kernel`           |
| `Mediator` interface, `Result<T>`, `Error` base, kernel-level errors | `domain/kernel`           |
| Concrete `Command` / `Query` / per-aggregate `Error` subtypes        | `domain/contract`         |
| Mediator implementation (registry built from `Collection<Handler>`)  | `domain/core`             |
| Handler implementations                                              | `domain/core/<aggregate>` |

The dependency direction is `kernel ← contract ← core`. Adapters
(`application/*`, `infrastructure/*`) depend on `domain/kernel` and
`domain/contract` — they construct concrete commands from contract,
dispatch via the Mediator interface from kernel, and pattern-match on
`Result` from kernel.

## Core types — language-agnostic

Sealed hierarchies (Java `sealed`, Kotlin `sealed`, TS discriminated
unions, Rust `enum`, etc.) so the compiler enforces exhaustiveness.

```text
Action<R>              sealed marker
  Command<R>           write-side action, produces side effects
  Query<R>             read-side action, pure read
Result<T>              sealed: Success(value) | Failure(Error)
Error                  sealed hierarchy per aggregate
Handler<B : Action<?>> declares supports() → Set<Class<? extends B>>;
                       handles actions whose runtime type descends from B
Mediator               constructed from Collection<Handler>; builds its own
                       registry; dispatch(Action<R>) → Result<R>
ReactiveMediator       async variant; dispatch(Action<R>) → Future/Uni/Promise<Result<R>>
```

## Rules

- Mediator is constructed with a **single collection of handlers**. It
  builds its registry internally from each handler's `supports()`. **Never
  inject a `Map`.**
- Handlers self-declare supported actions via `supports()`, all descending
  from a shared sealed base.
- Multi-action handlers are allowed **only** when all actions descend from
  the same sealed base.
- Duplicate registrations are errors at construction time.
- Handlers **never throw** for expected failures. They return
  `Result.Failure(error)`. Only truly exceptional conditions (bugs,
  infrastructure failures) propagate as exceptions.
- No reflection, no annotation scanning, no service locators. Wiring is
  explicit.

## Error mapping at the boundary

The domain defines a sealed `Error` hierarchy per aggregate. Adapters at
the application layer translate those errors into transport-shaped
representations:

| Adapter   | Error mapping                 |
| --------- | ----------------------------- |
| REST      | RFC 9457 Problem Details      |
| CLI       | exit code + structured stderr |
| Messaging | CloudEvents error extension   |
| gRPC      | `google.rpc.Status`           |

Domain code **never** knows about transport-specific error formats. The
mapping always lives in `application/<channel>/executable/`, never in
`domain/core/`.

## Anti-patterns

- A `Map<Class<Action>, Handler>` injected into the Mediator constructor.
  Wrong — the Mediator builds the map itself from `supports()`. Injecting
  the map skips the duplicate-registration check.
- A "facade service" that wraps multiple handlers. Wrong — call the
  Mediator from the adapter directly.
- Handlers that throw `IllegalStateException` for business-rule
  violations. Wrong — return `Result.Failure(SpecificError)`.
- Reflection-based handler registration (annotation scanning, classpath
  scanning). Wrong — wiring is explicit; the Collection<Handler> is built
  at the composition root and passed in.

## Walking-skeleton checkpoint

A project's walking skeleton must include at minimum: one Action subtype,
one Handler implementing it, the Mediator constructed from
`Collection.of(handler)`, and one transport-layer call site that
dispatches the action and maps the Result back. If any of these is
missing, the skeleton is not yet end-to-end.
