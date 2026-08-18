# `ci` — the pipeline every push has to pass

A **build-and-test pipeline on push**, for the CI provider you pick —
GitHub Actions at `.github/workflows/ci.yml`, or GitLab CI at
`.gitlab-ci.yml`:

```sh
keel add ci
```

The binding spec's "done means green gates" gets its scaffold backing
here. The pipeline **trusts the project's own build**: it provisions a
toolchain, invokes the wrapper or package manager the scaffold
shipped, and never duplicates build configuration — the pipeline is a
description of the gate, not a second build system.

It triggers on `push` alone, deliberately: the emitted binding spec
(§6) mandates trunk-based development with no PRs, so a `pull_request`
trigger (or merge-request pipeline) would document a workflow the spec
forbids.

## The provider question

One **sticky question**, asked once — nothing in the manifest's tag
set knows where the repository is hosted, so the choice is yours:

| Answer                     | Emits                      | Toolchains via                 |
| -------------------------- | -------------------------- | ------------------------------ |
| `github-actions` (default) | `.github/workflows/ci.yml` | the official `setup-*` actions |
| `gitlab-ci`                | `.gitlab-ci.yml`           | the official language images   |

Both flavors run the same commands; only the host differs. The chosen
flavor promotes its own tag: `ci.github-actions` or `ci.gitlab-ci`.

## Dimensions & adapters

One adapter per stack family covers the single `pipeline` dimension —
the build-system choice is read from the manifest tags, never a
second adapter:

| Stacks                                | Adapter         | Pipeline                                                                                       |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| all twelve JVM stacks                 | `jvm-pipeline`  | JDK 25 (temurin) + the wrapper: `./gradlew build` or `./mvnw verify` per `pkg.*`               |
| `go-cli`, `go-http`                   | `go-pipeline`   | toolchain per `go.mod`; `go build ./...` + `go test ./...`                                     |
| `rust-cli`, `rust-http`               | `rust-pipeline` | latest stable; `cargo build --workspace` + `cargo test --workspace`                            |
| `ts-cli`, `ts-http`, `web-components` | `ts-pipeline`   | Node 22; `npm ci`/`pnpm install --frozen-lockfile`, typecheck, lint/build `--if-present`, test |

Both TypeScript installs run from the **committed lockfile**, so the
pipeline fails loudly on dependency drift instead of resolving
silently; under `pkg.pnpm` the pnpm version is corepack-provisioned
from the workspace's own `packageManager` field — on both providers.

## Module layout

Nothing moves with the layout: the JVM wrappers build every module
from the root, `--workspace` spans the Rust crates, `go build ./...`
walks the tree, and the TypeScript root scripts already fan out
across the workspace. One pipeline per provider serves `basic` and
`modulith` unchanged.

## Prerequisites

| Requirement            | When                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| none at install time   | keel only writes the pipeline file.                                         |
| a GitHub / GitLab repo | Per the chosen provider — the pipeline runs where the repository lives.     |
| a committed lockfile   | TypeScript stacks: `npm ci` / `--frozen-lockfile` need the lockfile in git. |

## Related

- [`distribution`](distribution.md) — release workflows on tag push;
  `ci` is the every-push gate, `distribution` is the shipping story.
- [`containerization`](containerization.md) — the Dockerfile `ci`'s
  build artifact would be copied into.
- [Verticals catalog](README.md)
