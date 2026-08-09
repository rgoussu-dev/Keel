# domain/contract

The domain's contract face — the system's public surface everything
depends on:

- `commands.ts` — the concrete `Command` subtypes naming each
  operation (`keel.new-project`, `keel.add-vertical`) and the
  `InstallReport` DTO.
- `composition.ts` — the composition vocabulary keel's own domain
  content is written against (`Adapter`, `Vertical`, `Contribution`,
  `Predicate`, `Question`, `Ctx`, `DeferredAction`).
- `manifest.ts` — the keel state file: domain types, zod schemas for
  the on-disk shape, v1 → v2 migration.
- `ports/` — every driven-port interface: `Tree`, `Prompt`, `Logger`,
  `Clock`, `ManifestStore`, `TemplateSource`, `ProcessRunner`.
- `tags.ts` / `files.ts` — leaf modules shared by the above (kept
  separate so the contract's import graph stays acyclic).

Depends only on `domain/kernel` (plus zod, a pure validation
library). Naming note: a composition **Adapter** (git-init, the
Quarkus bootstrap, …) is keel _domain content_ — a unit that
contributes files to a scaffolded project. It is not a hexagonal
adapter of keel-the-application; those live in `src/infrastructure/`
and implement the interfaces in `ports/`.
