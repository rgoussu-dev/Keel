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

The CLI asks one question at a time and prints the plan at the end.
The page shows the whole form at once and the plan **while you are
still choosing** — flip Gradle to Maven, or `basic` to `modulith`, and
the file tree redraws before anything is written. That is the whole
argument for it: on a stack you have not used before, the tree is the
documentation.

It also reads what your project already is. Point it at a directory
holding a keel manifest and it becomes the brownfield page: verticals
already installed are offered for re-render rather than a second
install, and "add a bounded context" appears only where
`keel add module` would actually be accepted.

## The page

| Region                | What it does                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project directory** | A path field and a folder browser. A directory that does not exist yet is fine — it is marked _will be created_.                            |
| **Stack + dials**     | The stack, its build system, its module layout, the repository layout of a composite, and `--with-peer-context`. Rendered from the catalog. |
| **Questions**         | Everything the composition adapters ask. Conditional, so the list changes as you choose. Each field names the adapter that asked.           |
| **Plan**              | The file tree the install would write (`+` new, `~` modified, `-` removed), the deferred actions, and the Generate button.                  |

After a successful generate the page re-reads the directory and turns
into the brownfield one, so layering `ci` onto what you just scaffolded
is the next click.

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
(`keel.preview`), so the form can never offer a question the install
does not ask, or hide one it does.

Two consequences worth knowing:

- **The plan is paths, not contents.** An answer that only changes what
  is _inside_ a file leaves the tree identical. The answer is still the
  one the install uses.
- **A brownfield answer already recorded is not asked again.** On
  `keel add`, sticky answers in the manifest win, exactly as they do on
  the command line. Those questions are absent from the form because
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

| Route               | Body / query               | Dispatches                                  |
| ------------------- | -------------------------- | ------------------------------------------- |
| `GET  /api/catalog` | —                          | `keel.catalog` — stacks, verticals, dials   |
| `GET  /api/project` | `?path=<abs>`              | `keel.project-status`                       |
| `GET  /api/browse`  | `?path=<abs>`              | directory listing for the picker            |
| `POST /api/preview` | `{ cwd, target, answers }` | `keel.preview` — writes nothing             |
| `POST /api/install` | the identical body         | `keel new` / `keel add` / `keel add module` |

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

A malformed request is a **400**, a missing or wrong token a **401**,
and a failed `Host`/`Origin` guard a **403**.

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
