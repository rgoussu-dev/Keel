# domain/core

The hexagon's implementation face:

- the composition engine — `predicate`, `resolver`, `answers`,
  `apply`, `install`, `actions`;
- keel's domain content — composition `adapters/` and `verticals/`
  plus the `stacks` registry;
- the handlers (`handlers/new-project.ts`, `handlers/add-vertical.ts`)
  executing the contract's commands behind injected ports;
- the `RegistryMediator`, built from a handler collection and routing
  by `supports()`.

Depends on `domain/kernel` and `domain/contract` only — all I/O
(filesystem, terminal, processes, templates) arrives through the
ports the handlers and `Ctx` carry. The dependency-cruiser rule
`core-stays-inside-the-hexagon` enforces it.
