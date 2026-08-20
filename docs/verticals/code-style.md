# `code-style` — the layout contract, wired so nobody configures it

Code style is the convention teams most agree they should have and
least often get around to, because setting it up is fiddly in every
ecosystem and the fiddliness is different in each one. This vertical
does it once, from one model, for every stack keel emits.

Installed by every stack, and addable later:

```sh
keel add code-style
```

## Dimensions

| Dimension         | Covered by                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `editor-baseline` | `editor-baseline` — `.editorconfig` + `.gitattributes`, unconditionally                                         |
| `formatter`       | one adapter per family — `jvm-format`, `go-format`, `rust-format`, `web-format` (the latter serves the SPA too) |

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
prince-of-space or ktlint; Prettier). Go and Rust add nothing.

## Related

- [Verticals catalog](README.md) · [Composition model](../composition.md)
- [`ci`](ci.md) — where the format check runs
- [`walking-skeleton`](walking-skeleton.md) — emits the hook this
  vertical wires a formatter into
