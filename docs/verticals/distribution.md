# `distribution` — how the project ships

Release engineering as a vertical:

```sh
keel add distribution
```

Two shapes cover the same `build` / `release-channel` dimensions,
selected by predicate:

- **CLI projects** ship as **native binaries**: GraalVM
  cross-compiles in a CI matrix and the binaries land on a release on
  tag push.
- **Server-shaped projects** (every HTTP stack and the SPA) ship as a
  **CI-built container image pushed to a registry on tag push**, plus
  a deployment descriptor.

## Dimensions & adapters

| Dimension                  | Adapter                           | Predicate                                               |
| -------------------------- | --------------------------------- | ------------------------------------------------------- |
| `build`, `release-channel` | `distribution/quarkus-cli-native` | `framework.quarkus` + `arch.cli` + `pkg.gradle`         |
| `build`, `release-channel` | `distribution/jvm-container`      | `runtime.jvm` + `arch.server-http` (all 12 stacks)      |
| `build`, `release-channel` | `distribution/go-container`       | `lang.go` + `arch.server-http`                          |
| `build`, `release-channel` | `distribution/rust-container`     | `lang.rust` + `arch.server-http`                        |
| `build`, `release-channel` | `distribution/ts-container`       | `lang.typescript` + `runtime.node` + `arch.server-http` |
| `build`, `release-channel` | `distribution/wc-container`       | `framework.web-components` + `arch.spa`                 |

## The container family

The release pipeline **builds the Dockerfile the
[`containerization`](containerization.md) vertical emitted** — one
image definition, no second build system. That is a prerequisite:
`keel add distribution` on a server-shaped project refuses with the
fix in the message until `keel add containerization` has run.

What each family's pipeline does on a `v*` tag:

- **JVM** — provisions JDK 25 (or GraalVM, when the containerization
  install recorded the native flavor — the dial is read from the
  manifest, never re-asked, so the pipeline always builds the
  artifact the Dockerfile copies), runs the recorded build system's
  package command, then `docker build` + push.
- **Go** — a static Linux binary pinned to the project's own
  `go.mod` toolchain, then the distroless image.
- **Rust** — `cargo build --release` on a glibc host, then the
  distroless image.
- **`ts-http`** — no host build at all: Node runs the sources
  directly, so the pipeline goes straight to `docker build` (the
  image installs production dependencies).
- **`web-components`** — builds the Vite bundle with the workspace's
  package manager, then the **assets image** (see the
  [SPA serving shape](containerization.md#the-spa-ships-as-an-assets-image)).

### The provider is `ci`'s dial, reused

GHCR under `github-actions` (a workflow at
`.github/workflows/release-image.yml`, pushing with the built-in
`GITHUB_TOKEN`), the GitLab Container Registry under `gitlab-ci`
(release jobs appended to `.gitlab-ci.yml`, gated on
`$CI_COMMIT_TAG =~ /^v/`, pushing to `$CI_REGISTRY_IMAGE`). The
question is the **same sticky question the [`ci`](ci.md) vertical
asks**, and when `ci` already recorded its choice (its `ci.*` tag),
that answer wins silently — the two verticals can never emit for
different hosts.

### The deployment flavor is a sticky dial

`compose` (default) or `helm` — one template subtree each, exactly
like the ci provider:

- **Compose** — a production `deploy/compose.yaml` running the
  pushed image. Every knob is a `${VAR:-default}` (or a required
  `${VAR:?…}` where no default makes sense, like `IMAGE` and
  `DB_URL`).
- **Helm** — a minimal `deploy/chart/`: `values.yaml` supplies the
  image reference and an `env` map that becomes container
  environment.

**12-factor, binding.** One image serves every environment — no
config baked at build time, no per-env tags. Descriptors carry config
exclusively via environment, and only variables the scaffolded
service actually reads appear: the datasource knobs
(`DB_URL`, plus `DB_USERNAME`/`DB_PASSWORD` on the JVM) when
[`persistence`](persistence.md) is installed, the standard `OTEL_*`
variables when [`observability`](observability.md) is. Backing
services are attached resources, referenced by env-configured URL.

**The SPA descriptor** is the init-container shape: the assets image
populates a shared volume (compose: `restart: 'no'` gated by
`service_completed_successfully`; Helm: a real `initContainers` entry
over an `emptyDir`), and an unmodified official nginx serves it. The
API base URL is injected at deploy time — the init container
templates `env.js` from the environment — so a frontend release is an
image tag bump, and an environment change is an env change. Never a
rebuild.

**Docker Swarm is deliberately not a flavor** — see the
[roadmap entry](../roadmap.md#e--distribution-for-the-server-shaped-stacks-)
for the reasons on record. A compose user who wants Swarm can
`docker stack deploy` the emitted file themselves.

Every container adapter promotes `dist.container-image` — the tag a
future IaC or deploy vertical keys on.

## The CLI shape

`distribution/quarkus-cli-native` is unchanged: GitHub Actions
workflows that cross-compile the CLI to native binaries
(`linux-amd64`, `linux-arm64`, `darwin-arm64`; a sticky question
tunes the set) and attach them to a GitHub Release on tag push,
promoting `runtime.graalvm-native`.

## Prerequisites

| Requirement                           | When                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `containerization` installed          | Server-shaped projects — the pipeline builds that Dockerfile.          |
| A GitHub or GitLab repository         | Per the chosen provider; GHCR/GitLab registry use the built-in tokens. |
| nothing locally                       | Toolchains (GraalVM included) run **in CI**, not on your machine.      |
| Docker + Compose, or Helm + a cluster | To run the emitted `deploy/` descriptor where you deploy.              |

## Current limits

- Go/Rust/TS **CLIs**: only the Quarkus CLI has a distribution
  adapter today; siblings covering the same dimensions under their
  own predicates are the intended growth path.

## Related

- [`containerization`](containerization.md) · [`ci`](ci.md) ·
  [Verticals catalog](README.md) · [Roadmap](../roadmap.md)
