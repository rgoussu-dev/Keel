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
The question is shared with [`distribution`](distribution.md) and
asked once per project: whichever vertical installs first asks, and
the other borrows the recorded answer.

### On GitLab, the pipeline file is shared

GitLab gives a project one `.gitlab-ci.yml`, and `distribution` writes
its tag-triggered release jobs into the same file. Each vertical owns
a **sentinel-delimited region** of it rather than the file —
`# keel:ci-pipeline:begin` … `:end` here, `# keel:distribution-pipeline:*`
there — the same idiom [`code-style`](code-style.md) uses for
`.editorconfig`. So the two install in either order and read the same
either way (the build gate carries the top-level `image:` and
`variables:` keys, so it stays on top), `keel add ci --reapply`
re-renders the gate without touching the release jobs, and a
hand-written job outside both regions survives untouched. Editing one
marker of a pair without the other is refused, with the fix in the
message, rather than guessed at.

## Dimensions & adapters

One adapter per stack family covers the single `pipeline` dimension —
the build-system choice is read from the manifest tags, never a
second adapter:

| Stacks                                | Adapter         | Pipeline                                                                                                     |
| ------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| all twelve JVM stacks                 | `jvm-pipeline`  | the pinned JDK (temurin) + the wrapper: `./gradlew build` or `./mvnw verify` per `pkg.*`                     |
| `go-cli`, `go-http`                   | `go-pipeline`   | toolchain per `go.mod` on GitHub, the pinned Go image on GitLab; `go build ./...` + `go test ./...`          |
| `rust-cli`, `rust-http`               | `rust-pipeline` | latest stable; `cargo build --workspace` + `cargo test --workspace`                                          |
| `ts-cli`, `ts-http`, `web-components` | `ts-pipeline`   | the pinned Node major; `npm ci`/`pnpm install --frozen-lockfile`, typecheck, lint/build `--if-present`, test |

Both TypeScript installs run from the **committed lockfile**, so the
pipeline fails loudly on dependency drift instead of resolving
silently; under `pkg.pnpm` the pnpm version is corepack-provisioned
from the workspace's own `packageManager` field — on both providers.

### Single-source versions

The JDK, Node and Go versions the pipelines above provision are **not
stated by these templates**. They resolve through the shared pin
source
([`src/domain/core/adapters/version-pins.ts`](../../src/domain/core/adapters/version-pins.ts)),
which names the
[`version-pins.json`](../../assets/composition/version-pins.json)
entry each tool's version comes from — the same entry the
[`toolchain`](toolchain.md) block records the need from and the
[`dev-container`](dev-container.md) feature provisions. One registry
edit moves all three, and `tests/toolchain-pins.test.ts` runs in
`verify` and fails if a scaffolded project's pipeline and its
recorded needs disagree.

Three of the surfaces deliberately carry no version at all, and stay
that way: GitHub's Go setup reads `go-version-file: go.mod`, the Rust
workflow runs `rustup update stable`, and pnpm is corepack-provisioned
from the workspace's own `packageManager` field. The guard lists them
as absences, so a template quietly growing a version of its own is as
red as one stating the wrong one.

`keel toolchain install` is deliberately **not** emitted into these
pipelines: the provider setup actions are faster and cached, and the
convergence is about the values, not the provisioning mechanism.

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
