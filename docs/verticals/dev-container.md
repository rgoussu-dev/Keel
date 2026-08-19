# `dev-container` — the Dev Container definition

`.devcontainer/` — a reproducible containerized development
environment for the stack, openable with VS Code ("Dev Containers:
Reopen in Container"), the [`devcontainer` CLI](https://containers.dev/),
or GitHub Codespaces. Installed by default on **every stack**; also
addable:

```sh
keel add dev-container
```

## What it does

Writes `.devcontainer/devcontainer.json` with the stack's toolchain
provisioned as [Dev Container features](https://containers.dev/features)
— the host needs nothing but Docker. The definition has two shapes,
picked at install time by whether the [`dev-env`](dev-env.md)
vertical is on the manifest:

- **Attached** (dev-env installed — every REST/HTTP stack by
  default): Compose-based. `devcontainer.json` lists
  `../dev/compose.yaml` plus a local `.devcontainer/compose.yaml`
  overlay declaring the `workspace` service, so opening the dev
  container **joins the dev environment's own Compose project**:
  same network, its services (a database, the monitoring stack)
  reachable by their service names, and a dev env already running on
  the host attached to rather than restarted.
  `docker-outside-of-docker` is provisioned so the dev env can be
  driven (`docker compose -f dev/compose.yaml …`) from inside the
  workspace.
- **Standalone** (no dev-env — CLI stacks, `web-components`):
  image-based on `mcr.microsoft.com/devcontainers/base:ubuntu`; the
  toolchain still comes from features.

**Install order does not matter brownfield**: installed after
`dev-env`, the definition lands attached; installed before it,
[`dev-env`](dev-env.md) upgrades the standalone definition to the
attached shape when it arrives (adding the compose overlay and the
`docker-outside-of-docker` feature). The one exception is a
definition you have customized away from the scaffolded shape (e.g.
a different base image) — the upgrade then refuses to rewrite it and
names the manual recipe instead of silently losing your changes.

## Dimensions & adapters

| Dimension    | Adapter                           | Predicate         | Toolchain provisioned                                                                            |
| ------------ | --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| `definition` | `dev-container/jvm-devcontainer`  | `runtime.jvm`     | the pinned JDK (Temurin) + the build system the manifest's `pkg.*` tag names (Gradle or Maven)   |
| `definition` | `dev-container/go-devcontainer`   | `lang.go`         | the pinned Go minor — the same one `go.mod` directs                                              |
| `definition` | `dev-container/rust-devcontainer` | `lang.rust`       | latest stable Rust (clippy, rustfmt)                                                             |
| `definition` | `dev-container/node-devcontainer` | `lang.typescript` | the pinned Node major; `postCreateCommand` installs dependencies with the tagged package manager |

### Single-source versions

The feature versions above are **not stated by these adapters**.
They resolve through the shared pin source
([`src/domain/core/adapters/version-pins.ts`](../../src/domain/core/adapters/version-pins.ts)),
which names the
[`version-pins.json`](../../assets/composition/version-pins.json)
entry each tool's version comes from — the same entry the
[`toolchain`](toolchain.md) block records the need from and the
[`ci`](ci.md) pipeline provisions. One registry edit moves all three;
`tests/toolchain-pins.test.ts` runs in `verify` and fails if a
scaffolded project's dev container and its recorded needs disagree,
so a dev container cannot provision a JDK the project does not
declare.

Rust is the one family whose feature is deliberately versionless: its
pin is a major-only tag that tracks latest stable by construction, so
every Rust surface takes the current stable rather than naming a
version.

## Prerequisites

| Requirement            | When                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| none at install time   | keel only writes the files.                                           |
| Docker                 | To open the dev container (plus Compose in the attached shape).       |
| a Dev Container client | VS Code Dev Containers, the `devcontainer` CLI, or GitHub Codespaces. |

## Related

- [`dev-env`](dev-env.md) — the Compose project the attached shape
  joins, in either install order.
- [Verticals catalog](README.md)
