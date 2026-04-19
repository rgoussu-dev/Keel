---
description: Self-review the current uncommitted diff before committing.
---

Review the uncommitted changes as if they were someone else's PR. Produce a
short, actionable report — no restating of the diff, no filler.

## What to examine

1. **Architecture fit.** Does each changed file belong in the layer where
   it now lives? Any framework types leaking into `domain/`? Any business
   logic in `application/<channel>` or `infrastructure/`?
2. **Dependency direction.** Are new imports consistent with the
   hexagonal dependency rule? (`domain/contract` ← nothing outside
   `domain/`; `domain/core` ← `domain/contract`; `application/*` &
   `infrastructure/*` ← `domain/contract`.)
3. **Mediator usage.** New business operations routed through the mediator
   (not bypassing it)? Handlers self-declare `supports()`? `Collection<Handler>`
   stays the only injection shape?
4. **Tests.** New or changed production code has matching tests using the
   Scenario + Factory + fakes pattern. No mocking frameworks introduced.
   No tests importing concrete adapters or handlers.
5. **Error handling.** Expected failures returned as `Result.Failure`, not
   thrown. Sealed `Error` hierarchies extended correctly. Interface-layer
   adapters map errors to transport (RFC 9457 for REST, etc.).
6. **Public API docs.** Every new public symbol documented in the correct
   format for the language.
7. **Commit hygiene.** Is this one logical unit, or should it be split via
   `/micro`?
8. **Scope creep.** Any changes unrelated to the stated intent? If yes,
   propose reverting them from this commit and committing separately.

## Output format

```
REVIEW <path>
  - <finding>
  - <finding>

OVERALL: <green | yellow | red>
RECOMMENDATION: <ship | split | revise>
```

Keep the whole report under 30 lines. Do not quote more than one line of
code per finding. If there are no findings for a file, omit it entirely.
