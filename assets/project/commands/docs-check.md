---
description: Audit the project's public API for missing or low-quality doc comments.
---

Check every public symbol in the repository for a doc comment in the
language's idiomatic format. Report only the violations — a clean project
produces an empty list.

## What "public" means per language

| Language   | Public surface                                                  |
| ---------- | --------------------------------------------------------------- |
| Java       | `public` (and `protected`) classes, interfaces, methods, fields |
| Kotlin     | `public` / `internal` classes, functions, properties            |
| TypeScript | symbols exported from a module (including re-exports)           |
| Rust       | `pub` items (not `pub(crate)` unless re-exported)               |
| Go         | capitalised identifiers (package-exported)                      |

## Steps

1. Detect the languages in the project via `.claude/conventions/languages.json`
   markers (pom, gradle files, package.json, Cargo.toml, go.mod).
2. For each detected language, locate the source roots and walk them.
3. For each public symbol, check:
   - A doc comment is present immediately above, in the correct format.
   - The comment has at least one sentence of content beyond restating the
     symbol name.
   - Parameters, returns, and error conditions are documented when they
     affect caller code.
4. Skip: test files (unit/integration test directories), generated code
   (marked with generator banners or under `build/`, `dist/`, `target/`),
   deprecated symbols with a `@deprecated` / `#[deprecated]` tag.
5. Produce a report:

```
MISSING DOCS
  path/to/File.java:42  MyClass.myMethod  (no javadoc)
  src/domain/user.ts:12  createUser       (exported, no tsdoc)

LOW QUALITY
  path/to/File.java:88  MyClass.other     (doc only repeats method name)
  src/lib.rs:30         pub fn foo        (doc missing # Arguments for params)

TOTAL: <n> issues across <m> files
```

If there are no issues, output `OK — public API fully documented`.

Do not attempt to fix the issues in this command — only report. Fixing
belongs in a separate edit so the user can review what you propose.
