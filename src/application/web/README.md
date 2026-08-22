# application/web

The local scaffolding UI — a **second primary adapter** over the same
mediator the CLI drives, started by `keel ui` and reached from a
browser on loopback. Split per the binding spec (§1):

- `contract/` — the dumb interface adapter. `UiRequest` →
  concrete commands/queries → `mediator.dispatch` → `Result` mapped
  back to a `UiResponse` (JSON, 422 on a domain error). Also the
  router, which holds the three guards standing between a loopback
  port and every page in the user's browser. `node:http` never
  appears here: the whole path is a function from request to
  response, tested by calling it.
- `executable/` — the composition root. Binds the socket, mints the
  per-run token, adapts `node:http` to the DTOs, serves
  `assets/web/` and the vendored design system. No logic.

The page it serves lives in [`assets/web/`](../../../assets/web) —
framework-free custom elements on `@rgoussu.dev/planks`, the same
design system keel emits for its `web-components` stack. There is no
bundler: planks ships one ESM file, the page is native custom
elements, and the browser loads both directly.

## Why a whole adapter and not a flag

The CLI discovers the composition one prompt at a time and prints the
plan once at the end. A form has to show every field at once, before
anything is committed, and re-show it as answers change — and keel's
question set is a function of the answers already given, because an
adapter is only asked once its predicate matched. That is what
`keel.catalog`, `keel.preview` and `keel.project-status` exist for
(`domain/contract/queries.ts`), and what this adapter puts on a wire.
