# `web-components` — framework-free SPA

The browser and the DOM API as the framework: custom elements, no
React/Vue/Angular, a hexagonal layout where the domain never sees the
DOM.

## How to

```sh
mkdir my-app && cd my-app
npx @rgoussu.dev/keel new --stack=web-components
```

## Prerequisites

| Requirement             | Why                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `git` on PATH           | The [`vcs`](../verticals/vcs.md) vertical initialises the repository.                          |
| Node 22+                | Vite dev server and the workspace tooling.                                                     |
| `npm` or `pnpm` on PATH | keel runs the workspace install at scaffold time (your choice; `--build-system pnpm` pins it). |

## What you'll be asked

| Question        | Notes                                                          |
| --------------- | -------------------------------------------------------------- |
| npm scope       | e.g. `@acme` — workspace package naming.                       |
| Project name    | Workspace + package naming.                                    |
| Package manager | `npm` (default) or `pnpm`; pin with `--build-system`.          |
| `origin` remote | Optional; registered by [`vcs`](../verticals/vcs.md) if given. |

## What gets generated

```
my-app/
  domain/
    domain-api/          # ports, commands, read models — compiled WITHOUT the
                         # DOM lib, so the domain cannot touch the browser
    domain-core/         # factories only, via its exports map
  application/
    web-app/             # Vite deployment unit: main.ts wires ports to custom
                         # elements over the WCCG Context protocol
  design-system/         # atomic design on planks layout primitives + tokens;
                         # domain-blind by construction
  infrastructure/
    commons/             # Clock port: real adapter + canonical fake
  AGENTS.md              # the binding spec; CLAUDE.md is a pointer to it
```

Dependencies are installed at scaffold time — it is ready to run.

The design system builds on
[planks](https://github.com/rgoussu-dev/planks); ports reach the
components over the
[WCCG Context protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md),
so components stay portable and the wiring stays in `main.ts`.

## Verify it runs

```sh
npm run dev       # or pnpm dev
```

## Add next

| Goal              | Command                                    | Notes                                                                                                               |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Talk to a backend | `keel link ../backend && keel add gateway` | Adds `infrastructure/gateway-rest` (fetch adapter + fake, Vite dev proxy) — see [gateway](../verticals/gateway.md). |
| Container image   | `keel add containerization`                | SPA bundle onto nginx with a history-API fallback.                                                                  |

## Related

- [Stack catalog](README.md) · [CLI reference](../cli.md) ·
  [Composition model](../composition.md)
- This SPA is the frontend of every [fullstack product](fullstack.md).
