# Agent conventions — domain/contract

<!-- keel:purpose: commands, composition and stack vocabulary, harness seams, manifest schemas, the ports -->

What lives here: the commands and `InstallReport`; the composition
vocabulary (`Adapter`, `Vertical`, …); the `Stack` vocabulary
(`stack.ts`) and the plugin contract (`plugin.ts`); the harness seams
(`skill.ts`, `hook.ts`, `doc.ts`, `region.ts`); the refusal vocabulary
(`refusal.ts`); the manifest types and their zod schemas; and `ports/`
— `Tree`, `Prompt`, `Logger`, `Clock`, `ManifestStore`,
`TemplateSource`, `ProcessRunner`, `Registry`.

- Imports: `domain/kernel` and pure libraries (zod) only. Never
  `domain/core`, `application/`, or `infrastructure/`.
- Keep the import graph acyclic — shared vocabulary goes in a leaf
  module (`tags.ts`, `files.ts`), never in a two-way import.
- A new port earns its place here only when domain code needs it;
  ship its real adapter _and_ its fake in `src/infrastructure/<port>/`
  in the same change.
- The manifest schema is a public, persisted contract — any shape
  change needs a migration path and a CHANGELOG entry.
- **A refusal is data.** `refusal.ts` holds the `Refusal` union
  (`needs`, `unavailable`, `elsewhere`, `incompatible`,
  `path-conflict`, `path-missing`) and `RefusalError extends
DomainError`, which carries one beside its code and sentence. It
  lives here, not in the kernel (frozen): the contract may import the
  kernel. The primary adapters read the fields — `keel ui` forwards
  them in the 422 body, the CLI builds its `hint:` from them — so a new
  refusal of a vertical or a file is a new field or kind here, never a
  new sentence to parse. Tags travel only in these fields. The sentences
  are `domain/core/refusals.ts`'s, except the two about files, spelled
  here (`pathSentence`) because an adapter raises `PathConflictError`
  and `PathMissingError` — a plugin's too, through `plugin.ts`.
