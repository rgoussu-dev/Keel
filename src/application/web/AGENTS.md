# Agent conventions — application/web

<!-- keel:purpose: primary adapter #2, `keel ui`; the loopback guards live here -->

What lives here: primary adapter #2, `keel ui` — the local scaffolder.
`contract/` maps `UiRequest` → commands/queries → `UiResponse` (no
`node:http`) and holds the loopback guards; `executable/` owns the
socket, the per-run token and the asset roots. The page it serves is
`assets/web/`.

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
- **A change to the run is a transition in `target.js`**, never a
  field set in `<keel-app>` — which touches them itself only in the
  preview loop, to claim a generation for the request it makes.
  Adopting the `keel.dials` reply is a transition too, `settle`, and
  so is adopting a preview's, `previewed`, which drops the answers
  that preview no longer asked for — an install refuses those, and the
  preview lists them as `unusedAnswers`; one it read under a sibling's
  key is bound to that key, so it stays. The
  target, the answers, the dials, the request generation and the
  notice move together, and every brownfield state bug so far was one
  of them left behind: a whole target (what `<keel-add-form>` always
  emits) replaces rather than merges, a new subject (vertical, preset,
  kind) clears the answers and the menus — a new preset keeps its
  dials and extras, for `keel.dials` to snap, `settle` names in one
  line what it could not keep, and its answers are held for the
  preview of the new preset to place (`previewed`: the same question,
  or an identity answer's question of the same id; a placement the
  reply had not resolved moves the generation on, and the page
  previews again rather than draw it) — and every change moves the
  generation on so a reply in flight is dropped. A new control adds its transition
  there, with a case in `tests/application/web/target.test.ts` — as
  the "Also scaffold" boxes did (`toggleExtra`, a product's moving one
  service's selection) and the "What to add"
  cards (`toggleVertical`, `rerender`, `toggleRefresh`), since one tick
  can move several boxes and the element only says which one it was.
  What a card shows is read off the project status by a pure module
  too (`additions.js`), never re-derived in the element: the status
  already carries each card's readiness and refusal, word for word.
- **A response body is read once, as text, and `response.js` says
  what it means.** `api.js` claims the token out of `location` the
  moment it loads, so it cannot be imported without a DOM; what a
  status and body amount to lives beside it, pure. An uncaught throw
  leaves the executable as a 500 in the envelope a refusal uses,
  `{ error: { code, message } }`, under `keel.internal`, which the
  page labels as a bug to report; a body that is not the envelope is
  still shown verbatim rather than replaced by its status. A
  `RefusalError`'s 422 also carries `error.refusal`, the structured
  refusal (`api.ts` `unwrap`), for a control that acts on its fields
  rather than its words. The page shows a failure in the plan column,
  where the plan would be, as an alert — `failureOf` heads it as a
  refusal, a bug or no answer — never as a banner away from it.
- **Build the shell and the elements once, update them through
  properties.** Replacing a subtree on every preview takes the caret
  out of the field being typed in and resets the plan tree's scroll
  position. `<keel-app>` keeps its children and swaps only when the
  greenfield/brownfield mode changes.
