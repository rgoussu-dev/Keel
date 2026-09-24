# Agent conventions — application/cli

<!-- keel:purpose: primary adapter #1, the `keel` binary; presentation and wiring, no logic -->

What lives here: primary adapter #1, the `keel` binary. `contract/` is
commander → commands → mediator → `Result` rendered, with zero business
logic; `executable/` is the process composition root that wires the
infrastructure adapters, the handlers, the mediator and the UI server —
no logic.

- `contract/` may import `domain/kernel` and `domain/contract` only
  (enforced by dependency-cruiser); presentation (chalk, commander)
  lives here and nowhere deeper.
- `executable/` is the one place allowed to import everything — and
  it must contain wiring only. If a line in `main.ts` makes a
  decision, it belongs in a handler.
- A new CLI command = a command type in `domain/contract`, a handler
  in `domain/core`, one `.command()` block in `contract/program.ts`,
  one constructor call in `executable/main.ts`.
- An example in a help string is a command a reader copies, so it
  must run. `tests/application/cli/new-with-example.test.ts` reads the
  `--with` example out of the program, plans it on two stacks and
  holds `docs/cli.md` to it; `persistence,iac` sat in the help,
  refused on every stack, until it did.
- `keel add --list` inside a project prints `keel.project-status` —
  one dispatch, the readiness the add front door plans by — never a
  list of its own; `availableVerticals` is only the catalog it prints
  where there is no project.
- A refusal's sentence is the domain's and the same in both phases;
  what to type next is the CLI's. `contract/hint.ts` builds the
  `hint:` line `unwrap` prints under a `RefusalError` from its fields,
  per command (`--with` under `keel new`, `cd <service>` under `keel
add`) — never by reading the sentence.
