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
- The page's **logic lives in `assets/web/src/*.js` and its elements
  stay thin.** `tree.js`, `finder.js` and `command.js` are pure
  functions over data the domain produced, tested from
  `tests/application/web/` without a DOM; an element that grows an
  answer worth being wrong about should hand it to a module there
  rather than keep it. `dom.js` is the shared builder — no
  `innerHTML` on anything that came off the wire.
- **Build the shell and the elements once, update them through
  properties.** Replacing a subtree on every preview takes the caret
  out of the field being typed in and resets the plan tree's scroll
  position. `<keel-app>` keeps its children and swaps only when the
  greenfield/brownfield mode changes.
