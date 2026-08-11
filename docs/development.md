# Development guide

For working on keel itself. The contribution workflow (forks, PRs) is
in [CONTRIBUTING.md](../CONTRIBUTING.md); this page is the technical
side.

## Requirements

- Node 22+
- pnpm 10+

## The dev loop

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests) + prettier --check . + depcruise src
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:watch    # vitest watch mode
pnpm build         # compile to dist/ via tsconfig.build.json
pnpm format        # prettier --write .
```

`pnpm lint` covers eslint, prettier, **and dependency-cruiser** — the
hexagonal dependency rule fails the same gate as code style.

Every commit must pass `pnpm lint && pnpm typecheck && pnpm test` on
its own.

## Trying the CLI locally

The CLI entry is `bin/keel.js`, which loads
`dist/application/cli/executable/main.js` — **build before trying it**:

```sh
pnpm build
mkdir /tmp/playground && cd /tmp/playground
node /path/to/keel/bin/keel.js new --stack=go-cli --dry-run
```

## Repository layout

keel dogfoods its own [binding spec](../assets/project/AGENTS.md):
hexagonal trisection with the dependency rule enforced by
dependency-cruiser. Every layer directory carries a `README.md` +
`AGENTS.md` with its local conventions.

```
src/
  domain/
    kernel/               # Action/Command/Query, Result, Handler,
                          # Mediator — depends on nothing
    contract/             # commands + InstallReport, composition
                          # vocabulary (Adapter, Vertical, …),
                          # manifest types + zod schemas, ports/
    core/                 # the engine (predicate, resolver, answers,
                          # apply, install, actions), composition
                          # adapters/ + verticals/ + stacks,
                          # handlers/, RegistryMediator
  application/
    cli/
      contract/           # commander → commands → mediator → Result
                          # rendered; zero business logic
      executable/         # composition root: wires infra adapters +
                          # handlers + mediator; no logic
  infrastructure/         # one directory per port, real adapter +
                          # canonical fake side by side (tree, prompt,
                          # manifest, template, process, commons)
assets/
  composition/            # adapter template trees (ejs), one directory
                          # per <vertical>/<adapter>/
  project/                # the binding spec (AGENTS.md) — source of
                          # truth for the universal conventions
tests/                    # vitest; mirrors src/; support/factory.ts is
                          # the shared test Factory
bin/keel.js               # npm bin entry → dist/application/cli/executable
.dependency-cruiser.cjs   # the dependency rule, enforced in pnpm lint
```

Naming note: a _composition adapter_ (`git-init`,
`quarkus-cli-bootstrap`, …) is keel **domain content** — a unit
contributing files to a scaffolded project — not a hexagonal adapter
of keel itself; those implement `src/domain/contract/ports/` and live
under `src/infrastructure/`.

## Testing approach

- Vitest, run via `pnpm test`; test files live under `tests/`
  mirroring `src/`.
- **Scenario + Factory + port pattern** from the
  [binding spec §3](../assets/project/AGENTS.md): no mocking libraries
  — fakes are built directly, side by side with the real adapters.
- Every public API change is accompanied by a test change.

## Adding surface

- **A stack** is a couple of lines in
  [`src/domain/core/stacks.ts`](../src/domain/core/stacks.ts) — tags +
  verticals.
- **An adapter** lives in `src/domain/core/adapters/` with its
  template tree under `assets/composition/<vertical>/<adapter>/`, and
  registers in its vertical's adapter list.
- **A vertical** lives in `src/domain/core/verticals/` and declares
  the dimensions its adapters must cover.

See the [composition model](composition.md) for the vocabulary, and
the [roadmap](roadmap.md) for what's wanted next.

## Related

- [CONTRIBUTING](../CONTRIBUTING.md) — fork workflow, commit
  conventions, PR expectations.
- [Release process](release.md) — for maintainers.
- [Contributor guide for coding agents](../AGENTS.md).
