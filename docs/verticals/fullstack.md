# `fullstack` — product-root glue

Root-level glue for **composite monorepos**. Orchestrated by
[composite stacks](../stacks/fullstack.md) — **not user-addable** via
`keel add`, and skipped entirely under the polyrepo layout (there is
no shared root to glue).

## Dimensions & adapters

| Dimension         | Adapter           | What it emits                                                                                                                                                                                                                       |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product-docs`    | `product-docs`    | The product README: service map, run order, root housekeeping.                                                                                                                                                                      |
| `product-compose` | `product-compose` | `compose.yaml` at the root + a Dockerfile (and `.dockerignore`) beside each deployment unit, built with the build system recorded per service (Gradle/Maven builder stage and artifact path on the JVM, npm/pnpm installs on Node). |
| `product-harness` | `product-harness` | The product root's agent harness: `AGENTS.md` + the `CLAUDE.md` pointer + the `.gemini` / `.aider` shims, with a `keel:map` region the engine projects `manifest.services[]` into.                                                  |

The result:

```sh
docker compose up --build
```

brings the whole product up — backend and frontend — from one command
at the root. The SPA follows the
[assets-image shape](containerization.md#the-spa-ships-as-an-assets-image):
its image populates a named volume as an init container, and an
unmodified official nginx serves the volume, proxying `/api` to the
backend through an env-configured URL
(`BACKEND_URL`, defaulting to the sibling service) — a frontend
release rebuilds and re-runs only the assets image, and per-environment
config (`API_BASE_URL` → `env.js`) rides the environment, never a
rebuild.

## The product root's harness

Until #142 a product root received **no** harness at all. An agent
launched at the monorepo root had nothing: nested service documents
auto-load in only some tools, and no tool hoists a service's
`.claude/` to the root. The `product-harness` adapter closes that.

What lands is thin by design — what the product is, how to run the
composed environment, the service index, and one rule:

> **Work inside a service, under that service's own harness.**

The service rows are not written by the adapter. They are the engine's
[navigation index](../composition.md#the-navigation-index) projecting
`manifest.services[]`, the same seam that projects a row per bounded
context:

```markdown
<!-- keel:map:begin -->

**Map** — every directory with notes of its own; read the one for the directory you work in.

- [`backend/`](backend/AGENTS.md) — a `quarkus-rest` service; work inside it, under its own harness
- [`frontend/`](frontend/AGENTS.md) — a `web-components` service; work inside it, under its own harness
<!-- keel:map:end -->
```

So `keel docs sync|check` recomputes and drift-guards those rows like
every other row, and a service added to the manifest later needs no
change to the adapter. Every row resolves: `keel new` refuses
`--no-agent-harness` on a composite stack, so every service of a
product keel scaffolded carries its own document.

**Nothing is hoisted to the root** — no `.claude/settings.json`, no
hooks, no skills, and no `keel:skills-index` slot either. A hook at the
root would run the wrong gate for whichever service a change is
actually in, and a skill there would describe a build only one service
has. The services' own harnesses are the whole harness; the root only
makes them findable, and the emitted document says so, because a reader
who does not find that reason will reasonably conclude the root was
forgotten.

The root activates the harness itself: `agent-harness` is a
single-service vertical and refuses to install at a product root
(`keel add agent-harness` names the service directories to run it in,
as `keel add` does for every vertical the root cannot carry), so the
`agentic.harness` tag that opens the engine's final pass is promoted by
the `fullstack` vertical.

## Prerequisites

| Requirement      | When                               |
| ---------------- | ---------------------------------- |
| Docker + Compose | To run the compose story it emits. |

## Related

- [Fullstack products](../stacks/fullstack.md) — the composite stacks
  that orchestrate this vertical.
- [`containerization`](containerization.md) — the standalone-service
  image story (same Dockerfile patterns).
- [`agent-harness`](agent-harness.md) — the per-service harness the
  product root indexes and never replaces.
- [Verticals catalog](README.md)
