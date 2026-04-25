---
name: troubleshoot
description: Common failure modes — port conflicts, toolchain issues, native-image, ArchUnit.
---

# troubleshoot

Diagnostic playbook for the Quarkus / Gradle / Java 25 stack. Each
entry: symptom → likely cause → fix.

## "Address already in use" / port 8080 occupied

```
java.net.BindException: Address already in use
```

Another process is on 8080.

```sh
# find the offender
lsof -i :8080            # macOS / Linux
netstat -ano | findstr 8080   # Windows

# or just pick a different port
./gradlew quarkusDev -Dquarkus.http.port=8081
```

## "Could not find a tool chain" / wrong JDK

```
Could not find a Java toolchain matching ...
```

Gradle resolves Java 25 via toolchains. If Gradle can't find one, it
provisions automatically on first build. To use a JDK you already
have, set `org.gradle.java.installations.auto-download=true` in
`gradle.properties` (default), or point at a local install:

```sh
./gradlew build -Dorg.gradle.java.installations.paths=/path/to/jdk-25
```

## ArchUnit failure: "module X must not depend on Y"

The dependency rule was violated — see CLAUDE.md §1. Common offenders:

- `domain/core` importing from `application/...` — never allowed.
- `domain/contract` importing from `domain/core` — never allowed.
- `application/<channel>/contract` importing handlers — should
  dispatch via the mediator, not call handlers directly.

Fix the import. Don't suppress the rule.

## Native build: "Error: Could not find executable: native-image"

GraalVM CE 25 not installed (or `native-image` not on PATH).

```sh
# macOS via Homebrew
brew install --cask graalvm-ce-jdk25
gu install native-image     # `gu` ships with GraalVM

# Linux / Windows: download from https://www.graalvm.org/downloads/
```

Then:

```sh
export GRAALVM_HOME=/path/to/graalvm-ce-25
export PATH="$GRAALVM_HOME/bin:$PATH"
./gradlew build -Dquarkus.package.type=native
```

Native build is **slow** (5–10 minutes on a laptop) — that's expected.

## Hot reload not picking up a change

- Java source edit: should reload automatically. If not, press `s` in
  the Quarkus console for a full restart.
- `application.properties` edit: dev mode picks it up; if not, `s`.
- Classpath change (added/removed dependency in `build.gradle.kts`):
  requires a full restart.
- Gradle convention plugin edit (`build-logic/`): stop dev mode and
  re-run.

## "Could not resolve io.quarkus:..." — dependency download failure

Network or Maven Central availability issue.

```sh
./gradlew --refresh-dependencies build
# or check the cache
ls ~/.gradle/caches/modules-2/files-2.1/io.quarkus/
```

If behind a corporate proxy, configure `~/.gradle/gradle.properties`
with `systemProp.https.proxyHost=...`.

## OpenAPI spec changes not reflected

The spec served at `/q/openapi` is generated from JAX-RS / SmallRye
annotations at runtime. The file under
`application/rest/contract/src/main/resources/openapi/` is a checked-in
**source of truth** for clients but does not drive the runtime — keep
both in sync, or regenerate one from the other in CI.

## Pitest "mutation score below threshold"

A handler grew, the tests didn't catch the new path. Look at the
Pitest report (`<module>/build/reports/pitest/`) for surviving
mutations and add tests targeting them. Don't lower the threshold.

## "Spotless violations" on `build`

Run `format` (`./gradlew spotlessApply`), re-stage, re-build.

## Quarkus `@QuarkusTest` "Failed to start" with cryptic stacktrace

Usually a misconfigured CDI bean or a port conflict inside the test.
Look near the *bottom* of the trace for the actual cause; Quarkus
boot wraps a lot of frames around it.
