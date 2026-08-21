# `code-style` — the layout contract, wired so nobody configures it

Code style is the convention teams most agree they should have and
least often get around to, because setting it up is fiddly in every
ecosystem and the fiddliness is different in each one. This vertical
does it once, from one model, for every stack keel emits — the layout
contract (`editor-baseline` + `formatter`) and a free-tier slice of
static checks (`linter`): naming case, wildcard imports, and doc
comments on public API.

Installed by every stack, and addable later:

```sh
keel add code-style
```

## Dimensions

| Dimension         | Covered by                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `editor-baseline` | `editor-baseline` — `.editorconfig` + `.gitattributes`, unconditionally                                         |
| `formatter`       | one adapter per family — `jvm-format`, `go-format`, `rust-format`, `web-format` (the latter serves the SPA too) |
| `linter`          | one adapter per family — `jvm-lint`, `go-lint`, `rust-lint`, `web-lint` (see [below](#the-linter-dimension))    |

## The one thing to understand

**There is no runtime "one config to rule them all", and pretending
otherwise is the trap.** `.editorconfig` is the closest thing to a
universal standard, but it reaches the _formatter_ in only two of the
five families keel emits:

| Family    | Does the formatter read `.editorconfig`?                                                   |
| --------- | ------------------------------------------------------------------------------------------ |
| Kotlin    | **Yes, natively** — ktlint treats it as its _primary_ configuration                        |
| Web (TS…) | **Yes** — Prettier reads `end_of_line`, `indent_style`, `indent_size`, `max_line_length`   |
| Java      | No — google-java-format and palantir-java-format are unconfigurable by design              |
| Go        | No — `gofmt` has never had a style option; the `-tabs` flags were removed                  |
| Rust      | No — [rustfmt#2938](https://github.com/rust-lang/rustfmt/issues/2938) closed unimplemented |

So `.editorconfig` is the **editor** contract, not the formatting
contract. Shipping it alone would be a placebo; shipping one that
_disagreed_ with the formatters would be worse than nothing.

**keel resolves this at generation time instead.** One style model
lives in
[`src/domain/core/adapters/code-style.ts`](../../src/domain/core/adapters/code-style.ts)
and is fanned out into every dialect that matters — `.editorconfig`
for the editors, plus each family's own formatter config carrying the
same numbers. The scaffolded project gets a genuine single source of
truth with **no extra runtime dependency** and **no added CI time**:
no `treefmt`, no `dprint`, no meta-formatter.

The consequence, stated plainly because it is the thing readers get
wrong:

- For **Kotlin**, the emitted `.editorconfig` is **live input**.
  Editing it moves the formatter.
- For **Java, Go and Rust**, it is a **co-render**. The same numbers
  reach the formatter through its own config; hand-editing
  `.editorconfig` alone drifts the two apart.
  `keel add code-style --reapply` re-syncs them.

The emitted file says so in its own header.

One deliberate consequence: the `.editorconfig` carries **every**
language section, not only the ones the project uses — a Rust
scaffold still has a `[*.go]` block. That is intentional. The web and
shell sections apply everywhere anyway (every project has CI YAML,
JSON manifests and the hook script), the layout contract then reads
identically across a polyglot product's repositories, and a file
added later already has a rule waiting. The alternative — pruning per
stack — buys a few lines and costs that uniformity.

## What lands, per family

| Family     | Config emitted                        | Format (hook)             | Check (CI)                |
| ---------- | ------------------------------------- | ------------------------- | ------------------------- |
| JVM/Gradle | Spotless block in `build.gradle.kts`  | `./gradlew spotlessApply` | `./gradlew spotlessCheck` |
| JVM/Maven  | Spotless plugin in `pom.xml`          | `./mvnw … spotless:apply` | `./mvnw … spotless:check` |
| Go         | **none** — `gofmt` has no options     | `gofmt -w .`              | `test -z "$(gofmt -l .)"` |
| Rust       | `rustfmt.toml`                        | `cargo fmt --all`         | `cargo fmt --all --check` |
| Web / SPA  | `.prettierrc.json`, `.prettierignore` | `<pm> run format`         | `<pm> run format:check`   |

Go and Rust cost the project **nothing**: both formatters ship with
the toolchain the project already requires. Only the JVM and web
families gain a dependency.

### The JVM: why prince-of-space

Java is the one ecosystem where the formatter choice is genuinely
open, and the mainstream options are deliberately unconfigurable —
google-java-format is 2-space/100, palantir is 4-space/120, neither
negotiable. Either would make a shared style model impossible to
honour on Java.

[prince-of-space](https://github.com/agustafson/prince-of-space)
exposes exactly the knobs EditorConfig speaks (`indentStyle`,
`indentSize`, `lineLength`), so keel renders Java's formatter config
from the same model that produced `.editorconfig`. Kotlin uses
ktlint, which reads the file directly. Both run through Spotless, so
there is one plugin and one pair of commands whatever the language.

## The linter dimension

A narrower, deliberately smaller scope than "static analysis": naming
case, wildcard imports, and doc comments on public interfaces, methods
and DTOs — exactly enough to back the `/docs-check` audit the binding
spec (`assets/project/AGENTS.md` §8) promises, which no command in
this repository actually performed before this dimension existed.
Checkstyle, detekt and golangci-lint would extend this further into
general bug-finding; that stays a separately-argued follow-up (see
`docs/roadmap.md` item O), not shipped here.

| Family    | Naming case                               | Wildcard imports                                                                | Public doc comments                          | New dependency?                           |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Rust      | ✅ rustc, warn-by-default                 | ✅ `clippy::wildcard_imports`                                                   | ✅ rustc `missing_docs`                      | none — clippy ships with the toolchain    |
| Go        | — (`golangci-lint`, not shipped)          | n/a — no wildcard-import syntax                                                 | — (`golangci-lint`, not shipped)             | none — `go vet` ships with the toolchain  |
| JVM       | — (Checkstyle/detekt, not shipped)        | ✅ ktlint (Kotlin, free since #103) / Spotless `forbidWildcardImports()` (Java) | — (Checkstyle/detekt, not shipped)           | none — rides the existing Spotless plugin |
| Web (TS…) | ✅ `@typescript-eslint/naming-convention` | n/a — no wildcard-import syntax                                                 | ✅ `eslint-plugin-jsdoc`, `publicOnly: true` | ESLint + two rule packages                |

Two things worth calling out because they are not obvious from the
table:

**Rust and Go get their checks for free, and neither claim was
assumed.** Naming case and wildcard imports both needed verifying
against real clippy 0.1.94 rather than a survey: rustc's naming lints
are warn-by-default, so plain `-D warnings` catches them, but
`clippy::wildcard_imports` (the pedantic group) and `missing_docs`
(also a rustc lint) are _not_ — a scratch crate with a `use x::*` and
an undocumented `pub fn` compiled clean under `-D warnings` alone. The
CI command names both explicitly:
`cargo clippy --workspace --all-targets -- -D warnings -D missing_docs -D clippy::wildcard_imports`.
Go runs `go vet ./...`; naming case and doc comments stay unenforced
there until `golangci-lint`'s `revive` lands (a paid-tier follow-up),
and Go has no wildcard-import syntax to begin with.

**The JVM's wildcard-import check lives inside `jvm-format`, not a new
command**, because Spotless allows exactly one `java`/`kotlin` block
per project. A second, lint-only format for the same language was the
first idea tried, and real Gradle and Maven both rejected it: the
aggregate `spotlessApply` task applies _every_ registered format, and
a step Spotless "cannot auto-fix" (its own message) fails that task
outright rather than being skipped — which would have turned the
pre-commit hook into something that sometimes blocks a commit, quietly
breaking the "hook auto-fixes" half of the enforcement model below.
The fix keeps the check inside the _existing_ Java Spotless block —
`forbidWildcardImports()` — and treats it as parity with Kotlin's
already-shipping behaviour (ktlint's default ruleset has forbidden
Kotlin wildcard imports, hook included, since #103) rather than a
quieter autofixing rewrite. `code-style/jvm-lint` exists only so the
`linter` dimension shows covered for the JVM family; there is no
command of its own to gate CI on.

**Web shipped now, not deferred, because the resolver leaves no other
option.** Every dimension declared on `codeStyleVertical` must be
covered for every tag set the vertical installs onto — there is no
"this family opts out" in `resolveVertical`. TypeScript also has no
zero-dependency subset of this scope at all (no wildcard-import
syntax, and `tsc` alone checks neither naming case nor doc comments),
so ESLint could not be deferred with the rest of the paid tier without
breaking every TypeScript and web-components install. It runs as
`<pm> exec eslint .` rather than a `package.json` script: the modulith
layouts already define `"lint"` for `depcruise` (an architecture rule,
not a style one), and the vertical's own never-overwrite-a-script
convention would have made a same-named script silently never run
ESLint there.

### Enforcement: CI-only, no hook

Deliberately **not** the formatter's "hook fixes, CI gates" model.
Most lint findings — a naming violation, a missing doc comment —
cannot be mechanically repaired, and the one kind that can
(`eslint --fix`, `clippy --fix`) is the same hazard the JVM formatter
already has to guard against: a fixer rewriting `.ejs`-templated or
regex-anchored source that `keel add module` expects to find verbatim
later. So `linterCommandsFor` returns a `check`-only command — no
`format` half — and the pre-commit hook is never touched. `ciLintCheck`
in `ci-pipeline.ts` (mirroring `ciFormatCheck`) is the command's only
caller, gated on the `style.lint-managed` tag the same way the format
gate is gated on `style.managed`: a project scaffolded before this
dimension existed gets no lint step rather than one calling a command
its build cannot answer.

## Enforcement: the hook fixes, CI gates

```
format-on-save  →  pre-commit hook (auto-fix)  →  CI (the gate)
    editors            fast, staged files          the only blocker
```

This is deliberate, and each layer earns its place:

- **The hook auto-fixes** rather than verifying. It runs the
  formatter, re-stages exactly the paths that were already staged,
  then runs the project's existing fast gate. Every abandoned
  pre-commit setup traces back to latency; a formatter on staged files
  stays inside the budget where a full lint does not.
- **CI is the gate**, because a hook can be `--no-verify`'d and is
  opt-in per clone. The check step is keyed on the `style.managed`
  tag, so a project that never installed this vertical gets a pipeline
  with no format step at all rather than one calling a command its
  build cannot answer.
- **The check deliberately does not ride in the build.**
  `isEnforceCheck = false` on Gradle and no lifecycle binding on
  Maven, so `./gradlew build` and `mvnw verify` never fail for
  formatting alone. Without that, a formatter disagreement would break
  a freshly scaffolded project's very first build.

## Why the scaffold formats itself once

The JVM adapter emits a deferred `spotlessApply` that runs at scaffold
time. keel's templates are `.ejs` files full of placeholders, so no
Java formatter can be run over them and keel cannot mechanically keep
the _rendered_ output format-clean. Formatting once at scaffold makes
the tree clean **by construction** instead — which is what keeps the
project's first CI run green. It costs one extra build-tool
invocation.

If the formatter cannot run, the install warns rather than fails: an
unformatted tree is still valid and still builds, since the check is
out of `check`.

## Brownfield

Every config file is contributed as a **sentinel-delimited patch with
a seed**, so installing onto a project that already has an
`.editorconfig` layers keel's rules _after_ the user's — the half
EditorConfig resolution lets win — rather than clobbering them. A
re-apply rewrites only the managed section. An existing `format`
script in `package.json` is never overwritten.

One caveat: `keel add code-style` patches the pre-commit hook in
place, so the project must still have it (every keel project does —
`walking-skeleton` makes it a required dimension). A project whose
hook was deleted fails loudly naming the file.

## Prerequisites

None beyond the stack's own toolchain, except that the JVM and web
families resolve a plugin/dependency on first use (Spotless +
prince-of-space or ktlint; Prettier, plus ESLint and its two rule
packages for the `linter` dimension). Go and Rust add nothing for
either dimension — `gofmt`/`go vet` and `rustfmt`/`clippy` all ship
with the toolchain the project already requires.

## Related

- [Verticals catalog](README.md) · [Composition model](../composition.md)
- [`ci`](ci.md) — where the format check and the lint check both run
- [`walking-skeleton`](walking-skeleton.md) — emits the hook this
  vertical wires a formatter into
- [Roadmap item O](../roadmap.md#o--code-style-the-layout-contract-m)
  — the design history, including why `linter` is CI-only and why the
  paid tier (Checkstyle, detekt, golangci-lint) is a separate follow-up
