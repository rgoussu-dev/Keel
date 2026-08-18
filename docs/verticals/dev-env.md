# `dev-env` — the local development environment

One Compose file — `dev/compose.yaml` — for everything the service
needs on a laptop **but does not own**. Installed by default on every
REST/HTTP stack; addable anywhere, anytime:

```sh
keel add dev-env
```

## What it does

Seeds the empty Compose base. **Supplementing verticals patch their
services in**: the [`observability`](observability.md) vertical's
monitoring stack and the [`persistence`](persistence.md) vertical's
database + migrations one-shot today; a cache, a broker tomorrow.
Ad-hoc local infra goes in the same file.

Design points:

- **Dev-only by design** — production infrastructure belongs to IaC.
- **No install-order coupling** — contributors carry the shared base
  as a patch seed, so each vertical stands alone and whichever runs
  first creates the file.

## Dimensions & adapters

| Dimension      | Adapter                | Predicate                 |
| -------------- | ---------------------- | ------------------------- |
| `compose-base` | `dev-env/compose-base` | none — applies everywhere |

## Prerequisites

| Requirement          | When                                                     |
| -------------------- | -------------------------------------------------------- |
| none at install time | keel only writes the file.                               |
| Docker + Compose     | To actually run `docker compose -f dev/compose.yaml up`. |

## Related

- [`observability`](observability.md) — supplements this file with the
  monitoring stack.
- [`persistence`](persistence.md) — supplements this file with the
  dev database and the migrations one-shot.
- [`dev-container`](dev-container.md) — joins this file's Compose
  project so the workspace shares the dev environment's network.
- [Verticals catalog](README.md)
