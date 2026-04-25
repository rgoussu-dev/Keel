---
name: format
description: Auto-format Java sources with Spotless + Google Java Format.
---

# format

Spotless wraps Google Java Format, plus trailing-whitespace and
end-of-file fixes. Configured by `keel.java-conventions.gradle.kts`
under `build-logic/`.

## Auto-fix

```sh
./gradlew spotlessApply
```

Rewrites every staged Java source so it conforms. Safe: it only
changes formatting, never semantics.

## Verify only (CI-style)

```sh
./gradlew spotlessCheck
```

Run as part of `check` / `build`. A failure prints the offending file
and a hint to run `spotlessApply`.

## Per-module

```sh
./gradlew :domain:core:spotlessApply
./gradlew :application:rest:executable:spotlessCheck
```

## When to use

- After non-trivial editing, before staging the change.
- When `build` fails on `spotlessCheck` (run the apply task, re-stage,
  re-build).
- A Claude `PreToolUse` hook may already run this for staged files —
  don't double-apply blindly, but `spotlessApply` is idempotent so a
  second run is harmless.

## Gotchas

- Spotless reformats **only** files configured under its `target` glob
  (`src/**/*.java` by default). Generated sources under `build/` are
  ignored.
- Don't disable rules ad-hoc; the configuration is centralised in
  `build-logic/` so a change is global by design.
- Spotless does not handle Kotlin scripts (`*.gradle.kts`) — those use
  the IDE's formatter or `ktfmt` if you wire one in.
