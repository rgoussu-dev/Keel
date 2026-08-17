# `ci` — the pipeline every push has to pass

A **GitHub Actions workflow** at `.github/workflows/ci.yml` that
builds and tests on every push:

```sh
keel add ci
```

The binding spec's "done means green gates" gets its scaffold backing
here. The workflow **trusts the project's own build**: it provisions a
toolchain, invokes the wrapper or package manager the scaffold
shipped, and never duplicates build configuration — the pipeline is a
description of the gate, not a second build system.

It triggers on `push` alone, deliberately: the emitted binding spec
(§6) mandates trunk-based development with no PRs, so a `pull_request`
trigger would document a workflow the spec forbids.

## Dimensions & adapters

One adapter per stack family covers the single `pipeline` dimension —
the build-system choice is read from the manifest tags, never a
second adapter:

| Stacks                      | Adapter               | Workflow                                                                                       |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| all twelve JVM stacks       | `jvm-github-actions`  | JDK 25 (temurin) + the wrapper: `./gradlew build` or `./mvnw verify` per `pkg.*`               |
| `go-cli`, `go-http`         | `go-github-actions`   | toolchain from `go.mod`; `go build ./...` + `go test ./...`                                    |
| `rust-cli`, `rust-http`     | `rust-github-actions` | latest stable via rustup; `cargo build --workspace` + `cargo test --workspace`                 |
| `ts-http`, `web-components` | `ts-github-actions`   | Node 22; `npm ci`/`pnpm install --frozen-lockfile`, typecheck, lint/build `--if-present`, test |

Every adapter adds the `ci.github-actions` tag. Both TypeScript
installs run from the **committed lockfile**, so the pipeline fails
loudly on dependency drift instead of resolving silently; under
`pkg.pnpm` the pnpm version is corepack-provisioned from the
workspace's own `packageManager` field.

## Module layout

Nothing moves with the layout: the JVM wrappers build every module
from the root, `--workspace` spans the Rust crates, `go build ./...`
walks the tree, and the TypeScript root scripts already fan out
across the workspace. One workflow serves `basic` and `modulith`
unchanged.

## Prerequisites

| Requirement          | When                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| none at install time | keel only writes the workflow file.                                         |
| a GitHub repository  | The workflow runs on GitHub Actions.                                        |
| a committed lockfile | TypeScript stacks: `npm ci` / `--frozen-lockfile` need the lockfile in git. |

## Related

- [`distribution`](distribution.md) — release workflows on tag push;
  `ci` is the every-push gate, `distribution` is the shipping story.
- [`containerization`](containerization.md) — the Dockerfile `ci`'s
  build artifact would be copied into.
- [Verticals catalog](README.md)
