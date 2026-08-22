# Agent conventions — application/web

- `contract/` may import `domain/kernel` and `domain/contract` only
  (enforced by dependency-cruiser, same rule as the CLI adapter).
  `node:http`, `node:fs` and anything else with a syscall behind it
  belong in `executable/`.
- The CLI and this adapter are siblings, not layers: neither imports
  the other. The single exception is `contract/server.ts`, a
  types-only module the CLI names so `keel ui` can be injected —
  also enforced by dependency-cruiser.
- **Never widen the guards in `contract/router.ts` without saying why
  in the same change.** The token check, the `Host` allowlist and the
  `Origin` allowlist each close a different door on a server that
  writes files to disk on request. A CORS header added "so the dev
  build can call it" undoes all three.
- A new route = a command or query in `domain/contract`, a handler in
  `domain/core`, one `case` in `contract/api.ts`, and a client call in
  `assets/web/src/api.js`. If a route needs logic that is not a
  dispatch, it belongs in a handler.
- The page is plain ESM under `assets/web/`, served as-is. Keep it
  that way: no TypeScript, no build step, no dependency that is not
  already a dependency of the package.
