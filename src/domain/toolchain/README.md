# domain/toolchain

The **provisioning bounded context** (roadmap item N): reads the
manifest's `toolchain` block — the project's declared needs — and
satisfies it through a version manager. Its own hexagon inside the
keel modulith:

- `contract/` — the context's public surface: the
  `keel.toolchain-install` command, the `keel.toolchain-check` query,
  and their report DTOs;
- `core/` — the engine: the provider record model (`provider.ts`),
  one record per manager — two universal (`mise.ts`, `asdf.ts`) and
  five ecosystem-shaped (`nvm.ts`, `corepack.ts`, `sdkman.ts`,
  `rustup.ts`, and `go-native.ts`, the "no manager needed" answer) —
  the manager dial (`dial.ts`) that computes which of them are
  offered for a given needs set, and the two handlers.

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
the chosen provider's _native_ file (`mise.toml`, `.tool-versions`,
`.nvmrc`, `.sdkmanrc`, `rust-toolchain.toml`, `package.json`'s
`packageManager` field, `go.mod`'s `toolchain` directive) so IDEs
and colleagues without keel see a plain ecosystem file, then shells
out to that provider's own idempotent install through the
`ProcessRunner` port. Sometimes there is nothing to shell out to:
`go-native` runs no command at all, because the directive it renders
_is_ the provisioning — the ecosystem solved this one, and keel says
so instead of routing around it.

Which provider is a **choice**, and the choice list is computed from
coverage rather than declared: a provider covering the whole needs
set is offered alone; where none does, a curated **combination** of
providers is offered for the same coverage (`nvm+corepack` on the
pnpm-tagged TypeScript profiles). That is also all it takes to keep
an ecosystem record where it belongs: sdkman covers the JVM whole
and nothing else, so a project that also declares Node is never
offered it — no rule of sdkman's own. A partial choice is never
offered
— the coverage invariant, which `tests/domain/toolchain/dial.test.ts`
asserts against the real family profiles. The answer is sticky on
the block (`provider`), so re-runs follow it without re-asking.
