---
name: build
description: Build the project — Quarkus on Gradle 9.4 / Java 25.
---

# build

Stack: Quarkus 3.33 LTS + Gradle 9.4 + Java 25 toolchain. Build outputs
land under `<module>/build/`.

## Default — produce a JVM build

```sh
./gradlew build
```

Compiles every module, runs unit tests, ArchUnit boundary checks,
Spotless verification, and Pitest mutation tests (per the `check`
aggregate). Runnable jar at:

```
application/rest/executable/build/quarkus-app/quarkus-run.jar
```

## Single module

```sh
./gradlew :application:rest:executable:build
./gradlew :domain:core:build
```

## Skip slow tasks while iterating

```sh
./gradlew assemble                 # compile + package, no tests
./gradlew build -x pitest          # unit tests yes, mutation tests no
./gradlew build -x test -x pitest  # compile + lint only
```

## Native build (GraalVM CE 25 required)

```sh
./gradlew build -Dquarkus.package.type=native
```

If `native-image` is missing, `troubleshoot` covers the install path.
The native binary lands at:

```
application/rest/executable/build/<projectName>-<version>-runner
```

## What `check` wraps

Set up by the convention plugins in `build-logic/`:

- `spotlessCheck` — formatting verification (Google Java Format).
- `test` — JUnit 5 unit + Quarkus integration tests.
- ArchUnit rules (run as JUnit tests under `domain/contract`).
- `pitest` — mutation testing on `domain/core` and `domain/contract`.

A failing build means one of these tripped — the report path is in the
console output. For Spotless failures, run `format` to auto-fix.

## When to use

- User asks to "build", "compile", "package".
- Verifying the project still builds before a commit.
- Producing the artifact for `iac-cloudrun` to deploy.

## Gotchas

- The first `./gradlew` invocation downloads the wrapper distribution
  and any toolchain JDKs Gradle decides to provision; expect a longer
  cold start.
- Don't pass `--no-daemon` unless debugging — the daemon is what makes
  incremental builds fast.
- `gradle clean build` is rarely needed; trust incremental builds and
  let the build cache do its job.
