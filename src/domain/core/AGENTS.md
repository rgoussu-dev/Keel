# Agent conventions — domain/core

- Never import `application/` or `infrastructure/` — reach the world
  through the ports in `domain/contract/ports/` only. `node:path` is
  acceptable (pure string computation); `node:fs`, `child_process`,
  and template/terminal libraries are not.
- New business operations follow the pattern: command in
  `domain/contract/commands.ts` → handler here with `supports()` →
  wired in `application/cli/executable`.
- Composition adapters render templates via `ctx.templates` and probe
  tools via `ctx.processes`; deferred actions use their env's
  `processes`. No direct `spawn`/`fs` anywhere.
- Tests follow Scenario + Factory + port (`tests/support/factory.ts`)
  with the shipped fakes — no mocking libraries.
