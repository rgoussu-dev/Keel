# Agent conventions — domain/toolchain

<!-- keel:purpose: the provisioning bounded context, its own hexagon -->

What lives here: the provisioning bounded context, its own hexagon
(`contract/` + `core/`) — provider records (mise, asdf, nvm, corepack,
sdkman, rustup, go-native), the manager dial that computes which
providers cover a needs set whole, and the `keel toolchain
install|check` engine. It meets the rest of keel only at
`domain/contract`; `.dependency-cruiser.cjs` holds that seam both ways.

- This is a **bounded context**, not another corner of `domain/core`.
  Import `domain/kernel`, `domain/contract`, and this directory —
  nothing else. Never import `domain/core`, `application/`, or
  `infrastructure/`; never let `domain/core` import from here. The
  dependency-cruiser rules enforce both directions.
- The context consumes the `toolchain` block
  (`domain/contract/toolchain.ts`) and the shared ports
  (`domain/contract/ports/`). If it needs a new fact about the
  project, that fact enters through the block schema — a contract
  change — not through a reach into keel's composition state. Where
  there is no project to read, where the nearest one is — the engine's
  walk up — is handed in by the composition root as a function
  (`ToolchainDeps.nearby`), never imported, and worded by the
  contract's `notInitialisedSentence` — the sentence `keel add` is
  refused with, but pointing inside a product root at its services,
  since a toolchain is a service's; at the root itself, which declares
  none, the no-block refusal names them too.
- **Orchestrator, never installer.** A provider record renders the
  manager's native config and names the manager's own idempotent
  invocations. No downloads, no checksums, no platform matrices, no
  direct `spawn`/`fs` — external tools are reached through
  `ProcessRunner`, files through a `Tree`.
- Provider records are domain content, like `domain/core`'s adapter
  tables: data plus pure functions, one file per provider. A provider
  is only ever offered for a needs set it covers **whole** (the
  coverage invariant), and `dial.ts` is the only place that decides
  it — a new record joins `DIAL.providers` and the dial does the
  rest.
- **Combinations are compositions, never records.** A combination is
  a list of member ids in `DIAL.combinations`; it renders each
  member's file and runs each member's install, and its coverage is
  the union of its members'. Adding a provider to a combination must
  never mean copying a record. A combination is offered only when
  every member earns its place — otherwise the dial would offer
  `nvm+corepack` where corepack contributes nothing.
- A member's install runs only when **every** member's binary
  answers: half a combination is the half-install the invariant
  exists to prevent.
- Version spellings that embed a keel-chosen value (the JDK
  distribution for mise, asdf and sdkman; the `stable` channel rustup
  spells a bare-major Rust need as) and versions a record names (the
  nvm release its bootstrap installs) register in
  `assets/composition/version-pins.json`; the sweep in
  `tests/version-pins.test.ts` scans this directory.
- A record whose native file belongs to the **project** rather than
  the manager merges its one field in place and touches nothing else
  — corepack's `packageManager` in `package.json`, go-native's
  `toolchain` directive in `go.mod`. The block stays the source of
  truth, and the engine's own "does the render match disk" check is
  what turns that merge into a consistency check on the read path.
- An empty `install()` is legal and is not a stub: go-native runs no
  command because the rendered directive _is_ the provisioning. Where
  the ecosystem solved provisioning, the dial says so instead of
  routing around it.
- A record whose native file is a **lockfile** declares a `resolve`,
  and the engine runs it before any render. Order is lockfile order —
  the config on disk first, while it still answers the prefix, and the
  manager's own lookup only when nothing does. Never the other way
  round: asking upstream every run would call a good lockfile stale
  the day a patch ships. keel never invents the missing half of a
  version; an unresolvable prefix renders as it stands and rides the
  report, because N.2's guarantee is that the config lands anyway.
- Tests live in `tests/domain/toolchain/`, Scenario + Factory + port
  with the shipped fakes. The real-install suite
  (`tests/toolchain/`) is opt-in and env-gated — never in the PR
  matrix.
