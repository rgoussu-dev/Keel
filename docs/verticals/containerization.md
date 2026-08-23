# `containerization` — running as a container image

A **thin Dockerfile** (plus `.dockerignore`) beside the deployment
unit of every HTTP-shaped stack and the SPA:

```sh
keel add containerization
```

**No build stage anywhere**: the image copies the artifact the host
build already produced and documents the build command instead of
running it. Your CI builds; the Dockerfile packages.

CLI-shaped projects hard-fail with the uncovered `image` dimension — a
CLI ships through [`distribution`](distribution.md).

## Dimensions & adapters

| Stack                       | Adapter                | Image                                                                             |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `quarkus-rest` (+ Kotlin)   | `quarkus-rest-image`   | Quarkus fast-jar layout onto `eclipse-temurin:25-jre`                             |
| `spring-rest` (+ Kotlin)    | `spring-rest-image`    | Spring boot jar onto `eclipse-temurin:25-jre`                                     |
| `micronaut-rest` (+ Kotlin) | `micronaut-rest-image` | Micronaut shadow/shaded jar onto `eclipse-temurin:25-jre`                         |
| `go-http`                   | `go-http-image`        | Static binary onto a distroless base                                              |
| `rust-http`                 | `rust-http-image`      | Release binary onto a distroless base                                             |
| `ts-http`                   | `ts-http-image`        | The sources onto `node:24-alpine` — still no build step                           |
| `web-components`            | `wc-spa-image`         | An **assets image**: the Vite bundle + a volume-populating entrypoint (see below) |

All cover the single `image` dimension; artifact paths follow the
Gradle-or-Maven choice recorded in the manifest. Every image adapter
adds the `deploy.container-image` tag.

## The SPA ships as an assets image

The SPA's deployable is a bundle, not a server, and its image says
so: `wc-spa-image` emits an image that **contains only the built
bundle**, plus an entrypoint that populates a mounted volume and
exits — **clear first** (stale files from the previous release must
not survive), then copy, then template `env.js` from the
environment. Serving is nginx's job at deploy time, not the image's:

- a **named volume** holds the bundle;
- the assets image runs as an **init container** — in the emitted
  `compose.yaml`, `restart: 'no'` with nginx gated on
  `condition: service_completed_successfully`;
- an **unmodified official nginx** serves the volume with the SPA's
  history-API-fallback `nginx.conf` mounted read-only.

Why: the bundle's lifecycle decouples from the server's. A frontend
release replaces the assets image and re-runs it; nginx never
rebuilds. And because a static bundle cannot read env at runtime,
per-environment config is **injected at deploy time**: the entrypoint
writes `env.js` (`window.__ENV__`, e.g. `API_BASE_URL`) from the
init container's environment, and the app reads it at boot — one
bundle serves every environment, never a rebuild per environment.
The [`gateway`](gateway.md) vertical wires the app side: a
`public/env.js` dev default, the `index.html` loader, and the
assembly reading `window.__ENV__` before the Vite-baked fallback.

The emitted `compose.yaml` is the runnable local story
(`npm run build && docker compose up --build` →
http://localhost:8080); the production twin — the same shape running
the registry-pushed image — comes from
[`distribution`](distribution.md).

## The JVM native flavor

Every JVM backend asks a **sticky JVM-vs-native question**. Opting in
promotes `runtime.graalvm-native`:

- **Quarkus and Micronaut** already produce the GraalVM binary with no
  build-file changes.
- **Spring** gets the Native Build Tools wiring patched in — the
  Gradle plugin, or a `native` Maven profile mirroring the starter
  parent's.

**The answer is recorded either way** — `runtime.graalvm-native` for
native, `runtime.jvm-image` for JVM — so this is the whole project's
GraalVM dial, not just this Dockerfile's. That matters on a composed
`arch.cli + arch.server-http` stack, where
[`distribution`](distribution.md) has both a container shape and a
native-binary shape to choose from: with only the native tag on the
manifest, an absent tag meant either "this project declined GraalVM"
or "this project has no image at all", and the native-binary shape
asked for build targets on top of a `jvm` answer. It now stands down
where the flavor already said no.

## Module layout

The Dockerfile copies the artifact of whichever module runs, so on a
[`layout.modulith`](../stacks/jvm.md#module-layout) project the JVM
images point at `application/api` instead of
`application/rest/executable`, and the build command they document
names the matching Gradle project. The image content is unchanged.

## Prerequisites

| Requirement             | When                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| none at install time    | keel only writes the Dockerfile + `.dockerignore`.                                             |
| Docker                  | To build the image.                                                                            |
| The host build first    | The image copies your built artifact — run the documented build command before `docker build`. |
| GraalVM (native flavor) | Only if you opted into the native flavor and build the native binary locally.                  |

## Related

- Monorepo products get their compose story from the
  [`fullstack`](fullstack.md) root glue instead — same Dockerfile
  patterns (the SPA's assets-image shape included), orchestrated at
  the root.
- [`distribution`](distribution.md) — the CLI shipping story.
- [Verticals catalog](README.md)
