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
| Module layout   | `basic` (default) or `modulith`; pin with `--module-layout`.   |
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

## Module layout

`--module-layout=modulith` carves the same skeleton one bounded
context at a time. The pull toward it is strongest on this stack — a
browser app is usually multi-context before its first release, and a
micro-frontend _is_ a carved-out module — but a single-purpose widget,
an admin panel or a demo SPA has one context and does not need the
`modules/<ctx>/` level, so `basic` stays the default.

```
my-app/
  design-system/         # NOT a context: domain-blind, consumed by every
                         # context, and the package the import map dedupes
  platform/
    context/             # the WCCG Context protocol primitives, owned by
                         # no context
  modules/
    greeting/            # ONE package for the whole hexagon
      src/
        index.ts         # THE FACADE: contract, factories, context keys
        elements.ts      # THE REGISTRATION: defineGreetingElements() + tags
        service.ts       # THE PEER SEAM: what another context may call
        domain/
          contract/      # ports, commands, read models; DOM-less
          core/internal/ # services and stores; unreachable from outside
        user-side/
          elements/      # port-bound custom elements (driving adapters)
        infra/           # driven adapters wrapping browser capabilities
      tests/
  application/
    web-app/             # index.html + main.ts, the assembly point
  .dependency-cruiser.cjs
```

**One package per context**, for the same reason as
[`ts-http`](ts-http.md#module-layout): the package graph enforces
nothing on its own, and the `exports` map enforces everything. This
context publishes three entry points rather than two —

| Specifier                  | Reaches                    |
| -------------------------- | -------------------------- |
| `@scope/greeting`          | the facade                 |
| `@scope/greeting/elements` | `defineGreetingElements()` |
| `@scope/greeting/service`  | the peer seam              |

— because registration is a _side effect_. Behind its own entry point,
importing the facade from a DOM-less program defines nothing, and the
assembly can order the definition after the context provider is
listening (a definition upgrades parsed markup and fires
`connectedCallback` synchronously).

### The element tag prefix

`<scope>-<context>-<element>`, e.g. `<acme-greeting-view>`.

This is the one string in the layout nothing checks. Not a type, not a
module specifier, not a path: get the prefix wrong and the build,
typecheck and tests are all green while the page renders an unknown
element as an empty inline box. `wcLayout()` derives it, and the
emitted context carries `tests/element-tags.test.ts`, which re-derives
the prefix from the package's own name so a typo fails instead of
disappearing.

### The import map

`index.html` carries a `<script type="importmap">` pointing
`@scope/design-system` at `/vendor/design-system.js`, and the app's
Vite build leaves it **external**.

This is correctness, not optimisation. A package that defines custom
elements must exist exactly once per page: two bundles each inlining a
copy throw `NotSupportedError: <tag> has already been used with this
registry` on the second registration, and that throw aborts the rest of
that bundle's registrations — half the page silently stops upgrading,
with nothing anyone sees. With one context there is one bundle and
nothing to collide; the map is there so that splitting a context into
its own bundle stays a wiring change. The root `build` script builds
the design system first and the app's Vite plugin copies its output
into `dist/vendor/`, failing loudly if it is missing.

### The lint

```sh
npm run lint      # depcruise design-system platform modules application
```

Three rules are outside what module resolution can see: a relative
path into another package's tree, an import crossing layers inside one
package, and a design-system module reaching for a context. The
emitted `.dependency-cruiser.cjs` holds all three, and its
`enhancedResolveOptions` block is load-bearing — with default options
dependency-cruiser resolves every `@scope/*` import to a bare
specifier, records no edge, and reports zero violations over a tree in
violation.

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
