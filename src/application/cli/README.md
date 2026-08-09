# application/cli

keel's single deployment unit — the `keel` npm binary — split per the
binding spec (§1):

- `contract/` — the dumb interface adapter. commander parsing →
  concrete commands → `mediator.dispatch` → `Result` mapped back to
  transport (rendered plan on stdout-adjacent stderr, thrown error →
  exit code 1). Zero business logic.
- `executable/` — the composition root. Instantiates the concrete
  infrastructure adapters, the handlers, and the `RegistryMediator`,
  hands the wired graph to `contract/`, owns process exit. No logic.

`bin/keel.js` loads `dist/application/cli/executable/main.js`. The
containerisation equivalent for a CLI is npm packaging — `package.json`
`files`/`bin` are this unit's Dockerfile.
