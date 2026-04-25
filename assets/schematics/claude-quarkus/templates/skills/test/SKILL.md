---
name: test
description: Run tests — JUnit 5, RestAssured, ArchUnit, Pitest mutation.
---

# test

Stack: JUnit 5 (Jupiter) + RestAssured + ArchUnit + Pitest, all on
Quarkus 3.33 / Gradle 9.4. Tests follow the **Scenario + Factory + port**
pattern — fakes, never mocking libraries.

## Default — run everything

```sh
./gradlew test
```

Per-module test reports under
`<module>/build/reports/tests/test/index.html`.

## Per-module

```sh
./gradlew :domain:core:test
./gradlew :application:rest:executable:test
```

## Single class

```sh
./gradlew test --tests com.example.user.PingHandlerTest
./gradlew :domain:core:test --tests "*.PingHandlerTest"
```

## Single method

```sh
./gradlew test --tests "com.example.user.PingHandlerTest.handlesPing"
```

## Re-run only failed tests

```sh
./gradlew test --rerun
```

## Quarkus integration tests

Annotated `@QuarkusTest` (full app) or `@QuarkusIntegrationTest` (built
artifact). RestAssured is auto-configured with the embedded server's
port:

```java
given().when().get("/ping").then().statusCode(200);
```

## ArchUnit boundary tests

Live under `domain/contract/src/test/java/.../arch/`. Failures point at
the violating import — fix the import (or re-think the dependency)
before suppressing the rule.

## Mutation testing (Pitest)

```sh
./gradlew pitest                            # all modules with mutation coverage
./gradlew :domain:core:pitest               # one module
```

Reports: `<module>/build/reports/pitest/`. Threshold is enforced; a
score regression fails the build.

## When to use

- User asks to "test", "run tests", "verify the change".
- Before any commit (CLAUDE.md §6 — "every commit passes tests").
- After non-trivial refactor, run mutation tests to confirm coverage
  didn't paper-over a regression.

## Gotchas

- `@QuarkusTest` triggers a full app boot — slow on cold cache. Prefer
  unit tests against handlers directly with fake ports for fast
  feedback.
- Tests must not depend on concrete adapters or mocking libraries —
  see CLAUDE.md §3.
- A new public symbol without a corresponding test is a CLAUDE.md
  violation, not a stylistic preference.
