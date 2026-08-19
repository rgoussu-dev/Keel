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
  coverage invariant); the handlers guard it even while mise covers
  the entire vocabulary.
- Version spellings that embed a keel-chosen value (the JDK
  distribution) register in `assets/composition/version-pins.json`;
  the sweep in `tests/version-pins.test.ts` scans this directory.
- Tests live in `tests/domain/toolchain/`, Scenario + Factory + port
  with the shipped fakes. The real-install suite
  (`tests/toolchain/`) is opt-in and env-gated — never in the PR
  matrix.
