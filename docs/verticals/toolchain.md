# `toolchain` — the declared toolchain needs

Derives the project's toolchain **needs** from the manifest's tags
and records them in the manifest's
[`toolchain` block](../composition.md#the-toolchain-block) — the
contract between keel, which records _what_ the project requires,
and the provisioning engine
([`keel toolchain install`](../cli.md#keel-toolchain)), which
decides _how_ to satisfy it. Deliberately **opt-in** — in no stack's
default vertical set until the end-to-end provisioning story has
settled:

```sh
keel add toolchain
```

## What it does

Writes the `toolchain` block into `.claude/.keel-manifest.json` —
`schemaVersion` plus one need per tool, each `{ tool, version,
source }` — and appends a short "Toolchain" note to the README
saying the project declares its toolchain and how to satisfy the
declaration (`keel toolchain install`) or audit it
(`keel toolchain check`).

Versions come from keel's own pin registry
(`assets/composition/version-pins.json`): the block is one more
consumer of the registry, never a second place versions are stated.
Each need's `source` cites the registry entry that supplied its
version, so a pin bump can find every block it should touch — and
after upgrading keel,

```sh
keel add toolchain --reapply
```

refreshes the block to the new pins (needs update **in place**, by
tool — nothing duplicates). The block's `provider` field is the
provisioning engine's, not this vertical's: a reapply refreshes
versions and leaves the recorded manager choice exactly where
[`keel toolchain install`](../cli.md#the-manager-dial) put it.

On a fullstack composite, each service records its own block via its
own manifest — run `keel add toolchain` in each service directory,
per the per-service precedent.

## Dimensions & adapters

| Dimension | Adapter                    | Predicate         | Needs recorded                                                                                    |
| --------- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `needs`   | `toolchain/jvm-toolchain`  | `runtime.jvm`     | `jdk`, plus the build system the manifest's `pkg.*` tag names (`gradle` or `maven`, wrapper pins) |
| `needs`   | `toolchain/go-toolchain`   | `lang.go`         | `go` — the toolchain minor `go.mod` directs                                                       |
| `needs`   | `toolchain/rust-toolchain` | `lang.rust`       | `rust` — the major the scaffold's build images pin (tracks latest stable by construction)         |
| `needs`   | `toolchain/node-toolchain` | `lang.typescript` | `node`; plus `pnpm` under `pkg.pnpm` (npm rides with Node, so `pkg.npm` adds no need of its own)  |

## Which manager satisfies it

Nothing here — that is the provisioning engine's choice, computed
from the needs this vertical records. The dial offers the two
universal managers (`mise`, `asdf`) on every profile, plus whichever
ecosystem-native ones cover the declaration whole:

| Profile | Also offered                                       |
| ------- | -------------------------------------------------- |
| JVM     | `sdkman` (`.sdkmanrc`)                             |
| Go      | `go-native` — no manager, `go.mod`'s own directive |
| Rust    | `rustup` (`rust-toolchain.toml`)                   |
| Node    | `nvm`, or `nvm+corepack` under `pkg.pnpm`          |

An ecosystem manager is offered only where its ecosystem is the
whole declaration: sdkman covers `jdk`/`gradle`/`maven` and nothing
else, so it never appears on a project that also declares Node or
Go. See
[the manager dial](../cli.md#the-manager-dial) for the full table
and the per-provider notes.

## Prerequisites

| Requirement          | When                        |
| -------------------- | --------------------------- |
| none at install time | keel only writes the block. |

## Related

- [`keel toolchain install` / `check`](../cli.md#keel-toolchain) —
  the provisioning engine that consumes the block.
- [The toolchain block](../composition.md#the-toolchain-block) — the
  block's schema and versioning contract.
- [Verticals catalog](README.md)
