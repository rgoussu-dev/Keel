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

| Stack                       | Adapter                | Image                                                     |
| --------------------------- | ---------------------- | --------------------------------------------------------- |
| `quarkus-rest` (+ Kotlin)   | `quarkus-rest-image`   | Quarkus fast-jar layout onto `eclipse-temurin:25-jre`     |
| `spring-rest` (+ Kotlin)    | `spring-rest-image`    | Spring boot jar onto `eclipse-temurin:25-jre`             |
| `micronaut-rest` (+ Kotlin) | `micronaut-rest-image` | Micronaut shadow/shaded jar onto `eclipse-temurin:25-jre` |
| `go-http`                   | `go-http-image`        | Static binary onto a distroless base                      |
| `rust-http`                 | `rust-http-image`      | Release binary onto a distroless base                     |
| `ts-http`                   | `ts-http-image`        | The sources onto `node:22-alpine` — still no build step   |
| `web-components`            | `wc-spa-image`         | The Vite bundle onto nginx with a history-API fallback    |

All cover the single `image` dimension; artifact paths follow the
Gradle-or-Maven choice recorded in the manifest. Every image adapter
adds the `deploy.container-image` tag.

## The JVM native flavor

Every JVM backend asks a **sticky JVM-vs-native question**. Opting in
promotes `runtime.graalvm-native`:

- **Quarkus and Micronaut** already produce the GraalVM binary with no
  build-file changes.
- **Spring** gets the Native Build Tools wiring patched in — the
  Gradle plugin, or a `native` Maven profile mirroring the starter
  parent's.

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
  patterns, orchestrated at the root.
- [`distribution`](distribution.md) — the CLI shipping story.
- [Verticals catalog](README.md)
