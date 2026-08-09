# Agent conventions — domain/contract

- Imports: `domain/kernel` and pure libraries (zod) only. Never
  `domain/core`, `application/`, or `infrastructure/`.
- Keep the import graph acyclic — shared vocabulary goes in a leaf
  module (`tags.ts`, `files.ts`), never in a two-way import.
- A new port earns its place here only when domain code needs it;
  ship its real adapter _and_ its fake in `src/infrastructure/<port>/`
  in the same change.
- The manifest schema is a public, persisted contract — any shape
  change needs a migration path and a CHANGELOG entry.
