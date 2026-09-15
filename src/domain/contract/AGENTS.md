# Agent conventions — domain/contract

<!-- keel:purpose: commands, composition and stack vocabulary, harness seams, manifest schemas, the ports -->

What lives here: the commands and `InstallReport`; the composition
vocabulary (`Adapter`, `Vertical`, …); the `Stack` vocabulary
(`stack.ts`) and the plugin contract (`plugin.ts`); the harness seams
(`skill.ts`, `hook.ts`, `doc.ts`, `region.ts`); the manifest types and
their zod schemas; and `ports/` — `Tree`, `Prompt`, `Logger`, `Clock`,
`ManifestStore`, `TemplateSource`, `ProcessRunner`, `Registry`.

- Imports: `domain/kernel` and pure libraries (zod) only. Never
  `domain/core`, `application/`, or `infrastructure/`.
- Keep the import graph acyclic — shared vocabulary goes in a leaf
  module (`tags.ts`, `files.ts`), never in a two-way import.
- A new port earns its place here only when domain code needs it;
  ship its real adapter _and_ its fake in `src/infrastructure/<port>/`
  in the same change.
- The manifest schema is a public, persisted contract — any shape
  change needs a migration path and a CHANGELOG entry.
