# Agent conventions — application/cli

- `contract/` may import `domain/kernel` and `domain/contract` only
  (enforced by dependency-cruiser); presentation (chalk, commander)
  lives here and nowhere deeper.
- `executable/` is the one place allowed to import everything — and
  it must contain wiring only. If a line in `main.ts` makes a
  decision, it belongs in a handler.
- A new CLI command = a command type in `domain/contract`, a handler
  in `domain/core`, one `.command()` block in `contract/program.ts`,
  one constructor call in `executable/main.ts`.
