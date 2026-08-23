# `keel ui` — the local scaffolder

A Spring-Initializr-shaped front end for the same engine `keel new` and
`keel add` drive, served from a loopback port on your own machine.

```sh
keel ui                 # http://127.0.0.1:7420/?token=…
keel ui --port 0        # let the OS pick a free port
```

The command prints a URL and blocks. Open it, scaffold, and stop the
server with Ctrl-C. **The token in that URL is what authorises the
page** — see [Security](#security).

Nothing is uploaded and nothing is generated remotely: the server is
your `keel` install, the files land in the directory you pick, and the
deferred actions (`git init`, `gradle wrapper`, `npm install`) run on
your machine exactly as they do from the CLI.

## What it adds over the CLI

`keel new` is already a guided wizard: it asks one question at a time,
then shows the staged plan and lets you jump back and change an answer
before committing. The page asks **the same questions in the same
order** — it is a stepper, not a form — and adds the one thing a
terminal cannot: it shows you the plan _while you are still choosing_.
Flip Gradle to Maven, or `basic` to `modulith`, and the file tree
redraws before anything is written, without a round trip through the
review step. On a stack you have not used before, that tree is the
documentation.

The two share everything below the transport: the same stacks, the
same adapters, the same questions in the same order, and the same
plan. Neither is a subset of the other's capabilities — pick the one
that suits how you are working.

It also reads what your project already is. Point it at a directory
holding a keel manifest and it becomes the brownfield page: verticals
already installed are offered for re-render rather than a second
install, and "add a bounded context" appears only where
`keel add module` would actually be accepted.

## The page

A rail of steps across the top, the open step on the left, and the
plan on the right — live, from the first step to the last.

| Step              | What it asks                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Directory**     | A path field and a folder browser. A directory that does not exist yet is fine — it is marked _will be created_.                                                                                           |
| **What to build** | Fullstack, backend or frontend. The widest question there is, and the first one — same as the terminal wizard's.                                                                                           |
| **Language**      | The languages that shape reaches. On a fullstack product, the backend's.                                                                                                                                   |
| **Framework**     | Quarkus, Spring or Micronaut — only where the shape and language leave more than one.                                                                                                                      |
| **Adapters**      | CLI, HTTP server, SPA. Picking more than one gives the **composed** preset, never two services.                                                                                                            |
| **Options**       | The stack's dials: build system, module layout, the repository layout of a composite, and `--with-peer-context`. Which controls exist comes from the catalog; what may be on them comes from `keel.dials`. |
| **What to add**   | _(brownfield only)_ A vertical to layer on, or a bounded context. Verticals already installed are offered for re-render rather than a second install.                                                      |
| **Questions**     | Everything the composition adapters ask. Conditional, so the list changes as you choose. Each field names the adapter that asked.                                                                          |
| **Review**        | Every choice the run will make, each with a _change_ link back to its step, and the Generate button. Nothing is written before you press it.                                                               |

Two things sit outside the rail because they are true at every step:
the **Preset** picker under it, which names the id the answers so far
have landed on — and is also the flat list of every preset, the
browser half of the terminal's "Other — pick a preset by id" — and the
**Plan**, which is the whole reason this page beats a flag.

**Every step on the rail is clickable, not just the ones behind you.**
There is nothing for a locked rail to protect: every dial has a
default, and `keel.dials` snaps an illegal combination back, so the
run is never in a state that cannot be generated. The rail is a map,
not a gate — "just show me the plan" is one click, not four screens.

**A step with one answer is not a step.** A language reaching one
framework has no framework step; a fullstack product has no adapters
step; the frontend shape reaches one preset, so it has neither. That
is the same rule the terminal wizard skips a question under, run over
the same tree.

After a successful generate the page re-reads the directory and turns
into the brownfield one, so layering `ci` onto what you just
scaffolded is the next click.

## Finding a stack: the same drill-down, step for step

`keel new` asks for the stack as up to four narrowing questions —
[what you are building → language → framework → user-side
adapters](cli.md#finding-a-stack-the-drill-down). The page asks the
same four, in the same order, one per step. They were three facets
side by side until this release; the drill-down is a tree, and a grid
of three dependent controls is a shape you have to already understand
to use.

- **What to build** — fullstack, backend, frontend. Read off the
  presets' own entrypoints: which end each is driven from decides
  where a preset lands. This is what put the [fullstack
  products](stacks/README.md) on the guided path at all — a
  two-service product names no single language, so before there was a
  shape axis it appeared on no facet and was reachable only by id.
- **Language** — Java, Kotlin, Go, Rust, TypeScript. On the fullstack
  shape, the backend's.
- **Framework** — Quarkus, Spring or Micronaut. Absent where the
  shape and language chosen leave only one, which is everywhere
  outside the JVM.
- **Adapters** — a checkbox group. Ticking both gives the **composed**
  preset (`quarkus-cli-rest`, `go-cli-http`): one project, one domain,
  both entrypoints, never two services. Emptying it is refused rather
  than resolved — the control snaps back, since no preset has no way
  in.

**Stepping back keeps what still fits.** Move the shape from backend
to fullstack with Java + Spring chosen and you land on
`fullstack-spring`, not back at square one; come out of a product into
a backend and the half of its entrypoints a backend can still take —
`server-http` of `server-http + spa` — comes with you.

The **Preset** picker under the rail stays, and it is not redundant.
It is the result of the four steps, it is the way to pick a preset by
name, and it is the only thing that can name a preset the finder could
not place — a plugin's, most likely.

The steps are rendered from `Catalog.finder`, which the engine builds
by reading the same stack tags the terminal wizard reads. The page
never sees a tag: it walks a tree of shape → language → framework →
combination and sends back the preset it lands on. That is deliberate
— a page deriving the tree from `stacks[].tags` would be a second
implementation of a vocabulary that is not its to know, and it would
drift from the terminal's the first time a tag moved. Which steps
exist is derived the same way, in `assets/web/src/steps.js`, from the
same tree.

## The dials are narrowed by the same rules

A `Conflict` can name two dials at once — "this build system cannot
carry the modulith", say. `keel new` never trips over that, because it
settles one dial before offering the next: each menu is filtered
against the tags the earlier answers left behind
([Conflicts](composition.md#conflicts)).

The Options step has no such order — every dial of the preset is on it
at once, and it is one step precisely because they are not a
drill-down. The catalog it renders from describes a preset's dials
without knowing which combination you are on, so left to itself the
page would offer a combination, post it, and get `keel.incompatible`
back.

`POST /api/dials` closes that. The page sends the target it holds and
gets back one menu per dial, plus **the target snapped to those
menus** — every dial left where you put it if the rules still allow it,
moved to the first legal value if not. That snapped target is what the
page renders from, previews with, and finally posts, so what a control
can produce is exactly what `POST /api/install` accepts.

Two consequences you can see:

- **The build-system menu is deliberately optimistic** — it drops a
  build system only where _no_ layout could complete it. Narrowing it
  against the layout as it currently stands would make a legal
  combination unreachable: with Maven illegal under the modulith, a
  user on the modulith could never select Maven, and so could never
  arrive at the perfectly legal Maven + flat. Selected, the layout
  snaps instead — which is the order `keel new` would have asked in.
- **A control never vanishes because a rule narrowed it.** Whether a
  dial exists at all is a property of the preset, so the catalog
  decides that; a dial the rules have narrowed to one value is still
  shown, with that one value on it.

With no rule declared anywhere — which is where the shipped registry
stands for everything but the peer context — the menus are the
catalog's own lists, unchanged.

## Why the questions are not one static form

keel's question set is a **function of the answers already given**. An
adapter is asked only once its predicate matched, and a predicate reads
capability tags an earlier adapter promoted — so "which questions does
`quarkus-rest` have?" has no answer independent of the choices made so
far.

The page therefore runs a loop rather than rendering a schema: it asks
the server to preview the install, renders the questions that came
back, folds a changed answer into the request, and previews again.
Each pass runs the **real** engine as a dry run
(`keel.preview`), so the Questions step can never offer a question the
install does not ask, or hide one it does. It is the same trick the CLI
wizard's own back-and-forth plays, from the other side: the wizard
replays recorded answers until one of them stops matching, the page
re-resolves from scratch each time.

One question is deliberately absent from the reported set: the
wizard's proceed / change / cancel review step. That is flow control
rather than part of the plan — the page has its own last step for it,
with its own Generate button and its own jump-back links — so it is
marked as such at the port and dropped.

Two consequences worth knowing:

- **The plan is paths, not contents.** An answer that only changes what
  is _inside_ a file leaves the tree identical. The answer is still the
  one the install uses.
- **A brownfield answer already recorded is not asked again.** On
  `keel add`, sticky answers in the manifest win, exactly as they do on
  the command line. Those questions are absent from the step because
  they are absent from the run — changing one is what `--reapply` is
  deliberately conservative about.

## Security

The server writes files anywhere you can write, and it listens on a
port every page in your browser can reach. Loopback is not a boundary:
`http://127.0.0.1:7420` is same-machine, not same-origin. Four things
close that:

1. **It binds loopback only** (`--host` defaults to `127.0.0.1`).
2. **A per-run token**, minted at startup and required in an
   `x-keel-token` header on every `/api` request. It reaches the page
   through the URL the CLI prints; the page reads it out of `location`
   and rewrites the address bar so it does not linger in history.
   Asking for a custom header also forces a CORS preflight this server
   answers for nobody, so a drive-by `fetch` from another site never
   reaches a route.
3. **A `Host` allowlist** — only the loopback names it bound. This is
   what defeats DNS rebinding, where an attacker's domain resolves to
   127.0.0.1 and the browser then treats the server as same-origin.
4. **An `Origin` allowlist** — a same-origin request from the page
   sends no `Origin`; a cross-origin one always does, and is refused
   before routing.

The static page itself is served without the token (the browser
navigates to it before any of our script runs) but still behind the
`Host` guard, and the assets are inert.

`GET /api/browse` lists directories, so the token also gates a
read-only view of your filesystem's directory names. That is the same
trust boundary the CLI already has — but it is a reason to treat the
URL as a secret and to stop the server when you are done.

## Options

| Option              | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `-p, --port <port>` | Port to bind. Defaults to `7420`; `0` asks the OS for one. |
| `--host <host>`     | Loopback interface to bind. Defaults to `127.0.0.1`.       |

## The API

The page is a client, not a privileged one — everything it can do is a
route, and every route is one dispatch through the same mediator the
CLI uses. Useful if you would rather script it than click it.

| Route               | Body / query               | Dispatches                                        |
| ------------------- | -------------------------- | ------------------------------------------------- |
| `GET  /api/catalog` | —                          | `keel.catalog` — stacks, verticals, dials, finder |
| `GET  /api/project` | `?path=<abs>`              | `keel.project-status`                             |
| `GET  /api/browse`  | `?path=<abs>`              | directory listing for the picker                  |
| `POST /api/dials`   | `{ target }`               | `keel.dials` — legal menus + the settled target   |
| `POST /api/preview` | `{ cwd, target, answers }` | `keel.preview` — writes nothing                   |
| `POST /api/install` | the identical body         | `keel new` / `keel add` / `keel add module`       |

`dials` reads only `target`, so the page posts the same object to all
three routes and nothing is re-derived between them. It never refuses:
an unknown stack, a half-filled target and a combination already
illegal all get menus back, because a menu that will not answer where
the target is broken is a menu that cannot be used to fix it.

`target` is one of:

```jsonc
{ "kind": "new-project", "stack": "quarkus-rest",
  "buildSystem": "maven", "moduleLayout": "modulith", "withPeerContext": true }
{ "kind": "add-vertical", "vertical": "ci", "reapply": false }
{ "kind": "add-module", "module": "billing", "consumes": "greeting" }
```

`answers` is keyed the way the manifest keys them —
`{ "<adapterId>": { "<questionId>": "<value>" } }`, the same pair
`--set adapterId:questionId=value` names. Each question a preview
returns carries a `binding` saying where its answer goes, so a client
never needs a table of question ids of its own.

A refusal comes back as **422** with the domain's own error code:

```json
{ "error": { "code": "keel.unknown-stack", "message": "unknown stack 'nope'; available: …" } }
```

**Every refusal, including the ones raised at the bottom of the
install.** Most are decided at a handler's front door and were always
an `Err`; one was not. The resolver hard-fails when no adapter covers
a dimension a vertical declares — `keel add containerization` on a CLI
project, which has nothing to serve an image from — and it does so by
throwing, from inside `installVertical`, past every menu. A throw is
the one thing an HTTP layer can only read as a crash, so that answered
**500 with a bare string**. It now carries a code
(`keel.uncoverable-vertical`) and the mediator puts it back on the
`Err` rail, so it arrives here as a 422 like any other and the page
shows what is missing and which tag would close it.

A malformed request is a **400**, a missing or wrong token a **401**,
and a failed `Host`/`Origin` guard a **403**. A **500** now means what
it should: a bug, not a refusal.

```sh
# scripted, against a running `keel ui`
TOKEN=…   # from the printed URL
curl -s -H "x-keel-token: $TOKEN" localhost:7420/api/catalog | jq '.stacks[].id'
curl -s -H "x-keel-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"cwd":"/tmp/demo","target":{"kind":"new-project","stack":"ts-cli"},"answers":{}}' \
  localhost:7420/api/preview | jq '.changes | length'
```

## How it is built

Framework-free custom elements on
[`@rgoussu.dev/planks`](https://github.com/rgoussu-dev/planks) — the
same design system keel emits for its `web-components` stack. There is
no bundler: planks ships one ESM file, the page is native custom
elements, and the browser loads both directly.

The page lives in [`assets/web/`](../assets/web) and ships inside the
npm package; the server is a second primary adapter under
[`src/application/web/`](../src/application/web), over the same
Mediator as the CLI. See that directory's `README.md` for the layering.
