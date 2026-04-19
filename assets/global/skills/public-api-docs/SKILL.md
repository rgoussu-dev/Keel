---
name: public-api-docs
description: |
  Use when creating or modifying exported / public symbols in any language.
  Ensures a doc comment in the language's idiomatic format is present and
  useful. TRIGGER on edits that introduce public classes, interfaces,
  methods, functions, traits, types. SKIP for private/internal code.
---

# public-api-docs

A public symbol is one consumed by another module, another project, or an
external caller. Every public symbol must carry a doc comment that
describes *what* it does and *why* a caller would use it.

## Language format

| Language | Format | Applies to |
|---|---|---|
| Java | JavaDoc `/** … */` | public and protected types, methods, fields |
| Kotlin | KDoc `/** … */` | public and internal types, functions, properties |
| TypeScript | TSDoc `/** … */` | exported types, functions, classes, consts |
| Rust | rustdoc `///` (or `//!` for module-level) | `pub` items |
| Go | doc comment `// Name …` | exported identifiers (capitalised) |

## Content rules

A good doc comment:

- Opens with a one-sentence summary that would be sensible in a doc index.
- States *why* a caller would use this symbol, not just what it does.
- Documents parameters, returns, and error conditions that affect caller
  code (`@param`, `@return`, `@throws` in JavaDoc/KDoc; `@param`, `@returns`,
  `@throws` in TSDoc; `# Arguments`, `# Returns`, `# Errors` in rustdoc;
  plain prose listing in Go).
- Notes invariants a caller must uphold (e.g. thread-safety, null tolerance,
  idempotency).
- Never restates what a well-named signature already says.
- Never references task IDs, PR numbers, or author names.

## Red flags

- A public method with no doc comment.
- A one-line doc that only repeats the method name in prose.
- Copy-pasted doc comments across overloads (each must say something useful
  about its specific form, or they should be merged).
- Implementation detail leaking into a public doc (thread-pool names,
  specific dependency versions) — document behaviour, not implementation.

## Workflow

1. When you add a public symbol, write the doc comment **in the same edit**.
   Claude should not leave undocumented public API behind for a follow-up.
2. When you modify a public symbol's signature, update the doc comment if
   the change affects the contract.
3. When you make a private symbol public, add a doc comment as part of that
   change.
4. Before commit, run `/docs-check` (or trust the pre-commit hook) to
   verify the full public surface is documented.
