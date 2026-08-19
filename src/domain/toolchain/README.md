# domain/toolchain

The **provisioning bounded context** (roadmap item N): reads the
manifest's `toolchain` block — the project's declared needs — and
satisfies it through a version manager. Its own hexagon inside the
keel modulith:

- `contract/` — the context's public surface: the
  `keel.toolchain-install` command, the `keel.toolchain-check` query,
  and their report DTOs;
- `core/` — the engine: the provider record model (`provider.ts`),
  the mise record (`mise.ts`), and the two handlers.

It meets the rest of keel only at `domain/contract` — the block
schema it consumes and the shared ports it runs on — and never at
`domain/core`: the composition engine does not know this context
exists, and this context knows nothing of verticals, adapters, tags,
or stacks. The dependency-cruiser rules
`toolchain-context-meets-keel-at-the-contract` and
`keel-core-never-enters-the-toolchain-context` enforce the seam,
which is the "modulith first, extraction later" decision on record:
when provider churn starts forcing keel releases that change nothing
else, this directory extracts to its own package, and the seam must
already hold.

The engine is an **orchestrator, never an installer**: it renders
the provider's _native_ file (`mise.toml`) so IDEs and colleagues
without keel see a plain ecosystem file, then shells out to the
provider's own idempotent install through the `ProcessRunner` port.
