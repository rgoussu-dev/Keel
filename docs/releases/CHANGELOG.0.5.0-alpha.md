## [0.5.0-alpha] — 2026-08-09

### Changed

- **keel now dogfoods its own binding spec.** The source tree is
  trisected into `domain/` (kernel ← contract ← core), `application/`
  (`cli/contract` interface adapter + `cli/executable` composition
  root), and `infrastructure/` (one directory per port). Business
  operations dispatch as commands (`keel.new-project`,
  `keel.add-vertical`) through a `RegistryMediator` over handlers that
  self-declare via `supports()`; expected failures return
  `Result`-wrapped `DomainError`s that the CLI maps to stderr + exit
  code 1. All technology (fs, EJS, inquirer, chalk, `spawnSync`) sits
  behind ports — `Tree`, `Prompt`, `Logger`, `Clock`, `ManifestStore`,
  `TemplateSource`, `ProcessRunner` — each shipping a canonical
  in-memory fake beside its real adapter.
- **The agent-instructions files migrated to the AGENTS.md
  convention** — in this repo (the contributor guide is `AGENTS.md`;
  `CLAUDE.md` is a one-line `@AGENTS.md` import) and in scaffolded
  projects: the `walking-skeleton/claude-core` adapter now emits the
  binding spec as `<project>/AGENTS.md` plus the `CLAUDE.md` pointer,
  instead of `<project>/.claude/CLAUDE.md`, and the canonical asset
  moved to `assets/project/AGENTS.md`. Existing projects keep their
  `.claude/CLAUDE.md` until re-scaffolded.
- **Binding spec §2 now states the settled per-language dispatch
  stances**: commands through one explicit dispatch seam everywhere;
  registry Mediator on the JVM (and server-side TypeScript), enum +
  exhaustive match as Rust's unified-seam form, no mediator object in
  Go or the frontend (per-use-case ports + decorators). Mirrors the
  knowledge-base ruling of 2026-08-09.
- **CLI output ordering.** The planned-changes listing now prints
  after deferred actions run (the plan is part of the command's
  result). Dry-run output is unchanged.
- **Node 20 support dropped** (`engines.node` is now `>=22`). Node 20
  reached end-of-life in April 2026, and the enforced-dependency-rule
  tooling follows the node.js release cycle; CI now verifies on
  Node 22 and 24.
- The composition layer's deferred side effect is renamed `Action` →
  `DeferredAction` to keep it distinct from the kernel's dispatchable
  `Action` base; `InMemoryTree` is renamed `FsTree` and lives in
  `infrastructure/tree` (it stages in memory but reads/commits the
  real filesystem).

### Added

- **The scaffolded walking skeleton now follows the binding spec's
  layout itself**: a `domain/kernel` Gradle module owns the
  `Command`/`Handler`/`Mediator` bases; `GreetCommand` (the public
  surface) moves to `domain/contract`; the mediator implementation is
  named `RegistryMediator`; and the CLI — a primary adapter — moves
  from `infrastructure/cli` to `application/cli` (one module, per the
  earned-pair rule: a CLI has no consumable API artifact). The
  distribution workflows follow the new build paths.
- **The dependency rule is now enforced.** dependency-cruiser runs in
  `pnpm lint` (and CI): the kernel imports nothing, the contract sees
  only the kernel, core never imports outward, infrastructure sees
  only kernel+contract and adapters never import each other, the CLI
  interface adapter can't touch core or infrastructure, and the
  composition-root exception is pinned to
  `application/cli/executable`. No import cycles anywhere.
- Per-layer `README.md` + `AGENTS.md` documenting each layer's
  purpose and local conventions.
- Typecheck (`pnpm typecheck`) now covers `tests/` as well as `src/`.

### Removed

- The dead `util/hash` module (no importers).

[0.5.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.3.0-alpha...v0.5.0-alpha
