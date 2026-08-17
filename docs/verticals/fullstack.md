# `fullstack` — product-root glue

Root-level glue for **composite monorepos**. Orchestrated by
[composite stacks](../stacks/fullstack.md) — **not user-addable** via
`keel add`, and skipped entirely under the polyrepo layout (there is
no shared root to glue).

## Dimensions & adapters

| Dimension         | Adapter           | What it emits                                                                                |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `product-docs`    | `product-docs`    | The product README: service map, run order, root housekeeping.                               |
| `product-compose` | `product-compose` | `compose.yaml` at the root + a Dockerfile (and `.dockerignore`) beside each deployment unit. |

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

## Prerequisites

| Requirement      | When                               |
| ---------------- | ---------------------------------- |
| Docker + Compose | To run the compose story it emits. |

## Related

- [Fullstack products](../stacks/fullstack.md) — the composite stacks
  that orchestrate this vertical.
- [`containerization`](containerization.md) — the standalone-service
  image story (same Dockerfile patterns).
- [Verticals catalog](README.md)
