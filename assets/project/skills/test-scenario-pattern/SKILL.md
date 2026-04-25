---
name: test-scenario-pattern
description: |
  Use when writing or reviewing tests in a keel-governed project. Enforces
  the Scenario + Factory + fakes pattern and the DIP-strict rule that tests
  depend only on scenarios, factories, and port interfaces.
  TRIGGER on any edit to test files. SKIP for non-test source.
---

# test-scenario-pattern

Every test in a keel project is composed of **three collaborators and
nothing else**:

1. **Scenario** — encapsulates the data for this test (inputs, preloaded
   fixtures, expected outputs).
2. **Factory** — wires the System Under Test with fakes and returns a
   handle that exposes only the port(s) under test.
3. **Port interface** — the only type the test calls into. Concrete handler
   and adapter classes are never imported by the test.

Mocking frameworks are not used. Fakes (written and maintained alongside
each secondary port) are the canonical test doubles.

## Canonical shape (language-agnostic)

```
tests/
  <aggregate>/
    CreateUserScenario     // builder for commands, preloaded users, clock, ids
    CreateUserFactory      // constructs Mediator with fake UserRepository,
                           //   fake Clock, fake IdGenerator + the real
                           //   CreateUserHandler, returns primary port
    CreateUserTest         // arrange Scenario, act via primary port,
                           //   assert on Result<T>
```

## Rules

- Tests import: `Scenario`, `Factory`, port interface, `Result` type,
  domain error types. **Nothing else.**
- Factories depend only on port interfaces and fakes. They instantiate the
  mediator by passing `Collection<Handler>` (the handlers under test).
- Scenarios expose builder methods that return `Scenario` — fluent
  construction, no hidden state.
- Fakes live in `infrastructure/<port>/fake` and are themselves covered by
  contract tests that every adapter (real or fake) passes.
- Assertions are made on `Result.Success` / `Result.Failure` shapes and on
  observable fake state (e.g., `fakeRepo.saved(userId)` returns the stored
  aggregate). **Do not** assert on how many times something was called — if
  that matters, it belongs in the fake's state.
- Never introduce test helpers that reach into concrete handler internals.
  If a test seems to need that, the handler is doing too much; split it.

## Red flags

- `import org.mockito.*`, `import sinon`, `mockall::mock!` — replace with a
  fake that lives beside the port.
- A test that imports a concrete adapter (`PostgresUserRepository`) — swap
  for the fake via the factory.
- A test depending on a handler class directly — go through the mediator's
  port instead.
- Test setup duplicated across files — centralize in the `Factory`.
- Snapshot / golden file assertions in domain tests — keep snapshots at the
  interface layer (contract tests) only.

## Mutation budget

Domain modules run mutation testing (PIT, Stryker, cargo-mutants,
go-mutesting). A regression in mutation score is a test-quality bug, even
if line coverage is unchanged. Before claiming done, verify the module's
mutation threshold still passes.
