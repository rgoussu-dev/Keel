# Agent conventions — domain/toolchain

- This is a **bounded context**, not another corner of `domain/core`.
  Import `domain/kernel`, `domain/contract`, and this directory —
  nothing else. Never import `domain/core`, `application/`, or
  `infrastructure/`; never let `domain/core` import from here. The
  dependency-cruiser rules enforce both directions.
- The context consumes the `toolchain` block
  (`domain/contract/toolchain.ts`) and the shared ports
  (`domain/contract/ports/`). If it needs a new fact about the
  project, that fact enters through the block schema — a contract
  change — not through a reach into keel's composition state.
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
- Tests live in `tests/domain/toolchain/`, Scenario + Factory + port
  with the shipped fakes. The real-install suite
  (`tests/toolchain/`) is opt-in and env-gated — never in the PR
  matrix.
