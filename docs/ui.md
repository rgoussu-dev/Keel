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

It also reads what your project already is, and it is **one page for
both phases**: the directory decides the flow. Point it at a directory
holding a keel manifest and the preset steps collapse into one
read-only **Project** step — what the project is, settled — and
Options shows the same **Also scaffold** group a new project gets, with
what the project has ticked and locked, each installed vertical with a
**Re-render** of its own; every vertical it has not installed sorted by
what `keel add` would do with it — ready, ready once something else is,
or not for this project and why — to tick several of at once; and "add
a bounded context", disabled with the reason wherever `keel add module`
would refuse it. Generate runs `keel add` of what the ticks add. The
commands stay two: `keel new` on an empty directory, `keel add` on a
project.

## The page

A rail of steps across the top, the open step on the left, and the
plan on the right — live, from the first step to the last.

It is an **application shell**, not a document: the step column and
the plan column scroll independently, so the plan holds its own screen
however long the step beside it runs. Under 62rem the two collapse
into one and the page scrolls as an ordinary document.

| Step              | What it asks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Directory**     | A path field and a folder browser. A directory that does not exist yet is fine — it is marked _will be created_. What is there decides the rest of the rail: an empty directory is a new project (`keel new`), one holding a keel manifest a project to add to (`keel add`).                                                                                                                                                                                                                                                                               |
| **What to build** | _(new project)_ Fullstack, backend or frontend. The widest question there is, and the first one — same as the terminal wizard's.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Language**      | _(new project)_ The languages that shape reaches. On a fullstack product, the backend's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Framework**     | _(new project)_ Quarkus, Spring or Micronaut — only where the shape and language leave more than one.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Adapters**      | _(new project)_ CLI, HTTP server, SPA. Picking more than one gives the **composed** preset, never two services.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Project**       | _(keel project)_ Where the four steps above would be, nothing to ask: what the project already is, read back from its manifest — the preset it reads as, what it builds, its language, framework and adapters, its build system and module layout, a product's services, its bounded contexts, and what it has installed. In words, never tags. See [Options on a keel project](#options-on-a-keel-project).                                                                                                                                               |
| **Options**       | On a new project, the stack's dials: build system, module layout, the repository layout of a composite, and `--with-peer-context` — and **Also scaffold**: the verticals to install alongside (`--with`), on a product one group per service (`--with backend:persistence`), and on a single project the agent harness to leave out (`--no-agent-harness`). Which controls exist comes from the catalog; what may be on them comes from `keel.dials`. On a keel project, the same **Also scaffold** group over what it has — or a bounded context instead. |
| **Questions**     | Everything the composition adapters ask, grouped under **Details** by the adapter that asked. Conditional, so the list changes as you choose.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Review**        | Every choice the run will make — the extras among them — each with a _change_ link back to its step, how many questions you answered rather than left on their defaults, and the Generate button. Nothing is written before you press it.                                                                                                                                                                                                                                                                                                                  |

Two things sit outside the rail because they are true at every step:
the **Preset** picker under it, which names the id the answers so far
have landed on — and is also the flat list of every preset, the
browser half of the terminal's "Other — pick a preset by id" — and the
**Plan**, which is the whole reason this page beats a flag. On a keel
project there is no picker: its preset is settled, and the **Project**
step says which.

**Every step on the rail is clickable, not just the ones behind you.**
There is nothing for a locked rail to protect: every dial has a
default, and `keel.dials` snaps an illegal combination back, so the
run is never in a state that cannot be generated. The rail is a map,
not a gate — "just show me the plan" is one click, not four screens.

**A step with one answer is not a step.** A language reaching one
framework has no framework step; a fullstack product has no adapters
step; the frontend shape reaches one preset, so it has neither. That
is the same rule the terminal wizard skips a question under, run over
the same tree. Options is never one of them: a preset that pins its
build system and layout still has its extras to offer, and what
already comes with it to show.

The tree is the plan as a reader wants it rather than as the report
lists it: a chain of single-child directories is one row
(`src/main/java/com/example`, not five levels of indent), directories
fold away and stay folded as the steps move, and each carries the
number of files under it.

**Under the plan is the command line equivalent to it** — `keel new
--stack quarkus-cli --build-system maven --set
vcs/git-init:defaultBranch=trunk --yes`, flags highlighted, one
`--set` per answer you changed, values quoted only where a shell would
need it, with a button that copies it. Paste it into a README or a CI
job. It is derived from the identical body the review step's Generate
posts, so it can never describe a different install than the one that
runs. While the run is refused the line stays, dimmed, and says the
terminal would refuse it too — it is still what the choices on screen
spell, and at full strength beside a refusal it read as a way round it.

After a successful generate the page re-reads the directory, turns
into a keel project's page and opens on **Options**, the report beside
it and what the run installed now ticked and locked — so layering `ci`
onto what you just scaffolded is the next click, not four. `keel ui`
run inside a keel project opens there too; in an empty directory it
opens on **Directory**, where a new project starts. A plan that would
write nothing and run nothing cannot be generated: committing it would
record a vertical as installed that put nothing on disk, and the review
says so instead.

**A refusal is shown where the plan would be.** When the engine refuses
the run as it stands, the plan column says why — the refusal's own
sentence and its code, as an alert, so a screen reader announces it
the moment it lands — rather than pointing at a banner above a step
you may have scrolled away from. It is headed by what kind of failure
it is: _keel refuses this run_ is a verdict on the choices on screen,
and changing one clears it; _keel hit a bug, not a refusal_ is keel's
to fix, and worth reporting; _keel gave no answer on this run_ means
the run never reached the engine — the server is gone, or turned the
request away unread, as it does a page reloaded without the token its
URL carried (open the URL `keel ui` printed again). Only a refusal
dims the command line under the plan. The review step leads its reason
with the same words.

## Options on a keel project

A keel project's rail has no preset steps: `keel new` answered them,
and the manifest remembers. They collapse into one read-only
**Project** step, which says what the project is in the words the
wizard asked it in — _Preset ts-http · Building Backend · Language
TypeScript (Node) · Adapters HTTP server · Build system npm · Module
layout basic_, a product root's services, the bounded contexts — and
lists what it has installed. The manifest records tags, not a preset
id; the drill-down is a reading of those very tags, so read back they
give the answers `keel new` was given and the preset they lead to, and
the page never sees a tag.

Options then holds the same **Also scaffold** group a new project's
Options step does — one control for both phases, where the page used to
have a _What to add_ step of its own — read from the project status
before anything is clicked: the planner's reading, the one `keel add`
plans by and `keel add --list` prints, so a card and the click cannot
disagree. Where a new project's group lists what its preset comes with
as chips, a keel project's lists what it has **ticked and locked**, and
Generate posts only what the ticks add — the delta — as `keel add`:

- **Ready** and **Needs another capability first** are checkboxes,
  several at a time: one plan, one Generate, `keel add a b c` on the
  command line under it. A "needs" card's badge names what it needs by
  title — Infrastructure as code _needs Container image, Distribution_
  — and **ticking it ticks them**, since the add installs them with it
  either way; unticking one unticks every ticked card that needs it.
- **Installed** — every vertical the project has, its box ticked and
  disabled: an add cannot take one back, and nothing ticked there joins
  the run. Each one `keel add` names has a **Re-render** button beside
  it: `keel add <id> --reapply`, a run of its own rather than a box in the
  add's set, since it rewrites what the vertical owns from the answers
  the manifest recorded. Ticking a card lets it go. A product's glue
  (`fullstack`) and a bounded context are recorded as installed too,
  and no `keel add` names them, so they are locked with no button. In a
  monorepo service, what the product gives it — its repository's
  version control, the image the product root builds — is locked the
  same way, saying where it comes from; a CI pipeline or a release,
  which only a repository root reads, is under _Not for this project_,
  saying so.
- **Not for this project** — collapsed, one line each: the sentence
  `keel add <id>` would refuse it with, word for word. _Observability
  needs an entrypoint this project does not have: HTTP server — a REST
  endpoint._ Kept rather than hidden, because an absent option answers
  "why can I not have observability?" with nothing.
- **Belongs in a service** — at a composite product's root, an
  **Open backend/ (quarkus-rest · Gradle)** button per service, which
  points the page at that directory and opens its Options; then what
  goes in one of the services, each saying which — Container image and
  the agent harness read as there already in both.

An add can change what an installed vertical would render —
Persistence arriving where Distribution's deploy descriptor was written
without a database. Once the preview has said so, the vertical appears
in the group as a **proposed re-render**: ticked, it is re-rendered
in the same run (`--refresh`); left, the report says how to take it up
later. A project another harness generation wrote is said once, above
the group, rather than on each card it refuses.

"Add a bounded context" is always there, and disabled — with the
refusal `keel add module` would give — on the flat layout and at a
product root.

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
- **Language** — Java, Kotlin, Go, Rust or TypeScript for a backend.
  On the fullstack shape it is the backend service's, and only Java,
  Go, Rust and TypeScript have a product; the frontend shape has one
  language, TypeScript in the browser.
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

Where the new shape does not have your language at all, the move lands
on its nearest kin rather than on whichever language sorts first: one
with the same framework (Kotlin + Spring moved to fullstack is Java +
Spring, `fullstack-spring`), then one on the same runtime, then the
default preset's (the browser front end moved to a backend lands on
`quarkus-cli`, where a blank page opens). A line under the **Preset**
picker says so — _Kotlin has no fullstack preset, so the language is
now Java._ — rather than let the language change without a word.

**A new preset keeps your choices.** Every move that lands on another
preset — an adapter ticked, a framework switched, a shape moved —
carries the build system, the module layout, the peer context, a
product's repository layout, the **Also scaffold** extras and a harness
left out along, and `keel.dials` snaps whichever the new preset cannot
take. Maven, the modulith and a pipeline picked on `quarkus-rest`
survive ticking the CLI adapter, since `quarkus-cli-rest` takes all
three. Moved to
`ts-cli`, Maven becomes npm, and the same line says so: _Moving to
ts-cli did not keep build system maven._ Only a value you had moved off
its default is named — a product's build systems service by service,
_build system maven for backend_ — and the next change retires the
line. An extra the new preset cannot carry is named with the reason
`keel.dials` dropped it — a Container image ticked on `quarkus-rest`,
moved to `quarkus-cli`, reads _Container image dropped: Container
image needs an entrypoint this project does not have: HTTP server — a
REST endpoint._ — and one the new preset comes with is not named at
all: it is kept, by the preset now rather than by the box. Onto a
product, an extra goes to the one service that can take it —
Persistence ticked on `quarkus-rest` is ticked in the backend's group
of `fullstack` — and one no service can take, or two could, is named
with the reason, as `keel new --with` refuses it; off a product, each
service's extras are the single preset's. A product puts a harness
left out back — every one of its services carries one — and says so:
_Moving to fullstack-go did not keep the agent harness off._

The answers go along too. Most are asked by the same adapter on every
preset — `vcs/git-init`'s default branch, a database engine — and
land back on their question; the project's identity (its name,
package, module path or npm scope), which each family's bootstrap asks
under its own id, lands on the question of the same name the new
preset's bootstrap asks. So the package typed on `quarkus-cli` is
still `org.acme` once HTTP is ticked, and the name typed on a Quarkus
preset is still the name on Go, where the package has no question to
go to. The page holds them until the first preview of the new preset
has said which questions it asks and which choices it offers, then
previews again with them in place: an answer is kept only where its
question is asked and offers it — a MariaDB chosen on a JVM preset is
let go on Go, which offers PostgreSQL alone — so a move never turns
into a refusal with no question on screen to change it at.

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

The extras are the planner's (`domain/core/planner.ts`), the same
reading `keel new --with` and `keel add` refuse by. `keel.dials`
reports every registered vertical (`verticals`): the preset's own,
_included_; the ones that install here on their own, _ready_; the
ones that install once others have, _needs_, with what they need
(`requires`, in install order) — Infrastructure as code needs Container
image, then Distribution; and the rest, _unavailable_, each with the
`refusal` `keel new --with` would give it.

The Options step draws that list as its **Also scaffold** group, in
the parts a keel project's group is drawn in: _Ready_, _Needs another
capability first_ — each card naming what it needs, by title — _Comes
with quarkus-rest_ (or whichever preset), its own, as chips with
nothing to untick, and _Not for this project_, collapsed, each with its
sentence. A box is a gesture, not a field: **ticking one that needs
others ticks them too**, and **unticking one unticks every ticked
vertical that needs it**, so tick Infrastructure as code and Container
image and Distribution tick with it; untick Container image and all
three go. The group stays on screen however many you tick. It used to
be a question the preview asked, and the install stops asking a
question once it is answered — so the list vanished after the first
tick, and the page could post one extra and never take it back.

**One chip of _Comes with_ is a switch: Agent harness**, on every
single-service preset. It is pressed while the harness is on. Press it
and the target carries `agentHarness: false`, the plan loses the agent
documents, skills and hooks, the command under it gains
`--no-agent-harness`, the review says _Agent harness: left out_, and
the line under the chips says how to put it back — on this page, or
later with `keel add agent-harness`. `keel.dials` says where the switch
exists (`agentHarness`): never on a product, whose every service
carries the harness, and which the install refuses the flag on. With
the harness left out, a vertical that would switch it back on — a
plugin's, since keel ships none, whether it promotes the harness
itself or needs it installed first — is under _Not for this project_,
in the sentence `keel new` refuses the pair with, and is dropped from
a selection that held it, as the terminal's extras question leaves it
off and `--with` refuses it.

**A product has an Also scaffold per service** — _Also scaffold in
backend/_, _Also scaffold in frontend/_ — since each service is a
project of its own and its extras go in it. `keel.dials` reads each
service's menu (`services[].verticals`) over the scope the product
scaffolds it in: its build system, its preset's verticals and the
product's extras for it (the service gateway) as _Comes with backend/_
chips, and under the monorepo layout what the product root gives it —
its version control, the image the root builds — as well; a pipeline
or a release, whose place is the repository root, is under _Not for
backend/_, in the sentence `keel add ci` there refuses it with. Ticks
move that service's selection (`target.services`, keyed by path) and
nothing else; the command under the plan spells them as `path:id`
pairs (`--with backend:persistence,frontend:dev-env`), the review row
_Also scaffold_ as _Persistence in backend/; Development environment
in frontend/_, and each group's line says what `keel.dials` changed in
that service (`adjustments` naming it by `service`). The top-level
`extraVerticals` and `verticals` of a product's reply read what an id
named without a service does there: the one service that takes it, or
the refusal.

`keel.dials` **pins `extraVerticals` on every target it settles**,
to `[]` when none are named, exactly as it pins every other dial — so
the preview never asks the extras question of a page that already
draws them. Named extras come back **snapped to their closure**, in the
order the install runs them — the page posts `containerization,
distribution, iac` for the tick above, the plan the command line runs
for `--with iac` — and `adjustments` says what the snap changed: each
vertical `added` or `dropped`, with the reason as one sentence, shown
under the group as one line. The page's own gestures leave it nothing
to add; a dial move that rules an extra out is what it reports.
Nothing joins or leaves a selection silently.

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

Three consequences worth knowing:

- **The plan is paths, not contents.** An answer that only changes what
  is _inside_ a file leaves the tree identical. The answer is still the
  one the install uses: the preview reads the answers it is sent by the
  install's own precedence — an adapter's own id, then each sibling it
  shares the question with — and is asked exactly where the install
  would read them, so a Quarkus REST bootstrap's package sent to
  `quarkus-cli-rest`, whose CLI bootstrap asks first, previews as the
  `org/acme` tree the install writes. The composition grid holds every
  preset to that (I9): one body, previewed and installed as a dry run,
  stages the same bytes.
- **A brownfield answer already recorded is not asked again.** On
  `keel add`, sticky answers in the manifest win, exactly as they do on
  the command line. Those questions are absent from the step because
  they are absent from the run — changing one is what `--reapply` is
  deliberately conservative about. A re-render asks only what it has
  nothing recorded for: an adapter the vertical newly resolves to, on
  tags the project gained since it was installed.
- **An answer belongs to the run it was given for.** Ticking and
  unticking a keel project's **Also scaffold** boxes keeps the answers, and the next
  preview drops the ones no adapter of the new set asks — exactly as
  unticking an extra does — so a provider chosen for `ci` never rides
  along once `ci` is unticked. A **Re-render** is a run of its own and
  starts its questions afresh, and ticking a card after it starts the
  add afresh too. A change also supersedes whatever the page was still
  waiting on, so a late reply cannot undo a newer pick.

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
{ "kind": "new-project", "stack": "go-cli", "extraVerticals": ["ci"], "agentHarness": false }
{ "kind": "new-project", "stack": "fullstack", "layout": "monorepo",
  "services": { "backend": { "extraVerticals": ["persistence"] } } }
{ "kind": "add-vertical", "verticals": ["persistence", "ci"], "refresh": ["distribution"] }
{ "kind": "add-vertical", "vertical": "ci", "reapply": false }
{ "kind": "add-module", "module": "billing", "consumes": "greeting" }
```

`GET /api/project` is what the brownfield half reads before it offers
anything — the answer each brownfield command's own front door would
give, asked before it is run:

```jsonc
{
  "initialised": true,
  "profile": {
    "preset": "go-http",
    "facts": [
      { "label": "Building", "value": "Backend" },
      { "label": "Language", "value": "Go" },
      { "label": "Adapters", "value": "HTTP server" },
      { "label": "Module layout", "value": "basic" }
    ]
  },
  "installed": [
    { "id": "vcs", "title": "Version control", "installedAt": "…", "reapplicable": true, … }
  ],
  "available": [
    { "id": "ci", "readiness": "ready", "requires": [], … },
    { "id": "iac", "readiness": "needs", "requires": ["containerization", "distribution"], … },
    {
      "id": "gateway",
      "readiness": "unavailable",
      "requires": [],
      "refusal": {
        "code": "keel.uncoverable-vertical",
        "message": "Service gateway wires linked projects, and no linked project serves it here — link one that does first",
        "refusal": { "kind": "unavailable", "vertical": "gateway", "missing": { "peer": ["peer.ui.spa"] }, "carriedBy": [] }
      }
    }
  ],
  "canAddModule": false,
  "moduleRefusal": { "code": "keel.incompatible", "message": "cannot add a bounded context here: …" },
  "harnessGeneration": { "found": 1, "expected": 1 }
}
```

`profile` is the project in words, for the **Project** step: the
preset it reads as — the one the drill-down's answers read back off the
manifest's tags lead to, or at a product root the product with exactly
those services; null where none does — and the choices that made it,
as `label`/`value` lines: what it builds, its language, its framework
where it has one, its adapters, then a single project's build system
and module layout. No line is a tag, and a directory that is not a keel
project has `{ "preset": null, "facts": [] }`.

`available` is every registered vertical not installed, the ones this
project cannot carry included, each with the planner's readiness — the
reading `keel.dials` offers extras by and `keel add` plans by: `ready`
installs on its own; `needs` installs with `requires` first, in that
order; `unavailable` carries the `refusal` the add would answer with,
code, sentence and data exactly as its 422 body would (a `needs` whose
prerequisites two verticals tie on carries one too). `moduleRefusal`
is why `keel add module` would be refused before it reads a name,
present exactly when `canAddModule` is false. `harnessGeneration` is
the marker the manifest carries (`found`, null when none) beside the
generation this keel writes: where they differ, every add but
`agent-harness` is refused until the harness is brought forward — one
fact, reported once rather than on every card. An installed entry is
`reapplicable` where `keel add <id> --reapply` can re-render it — not a
product's glue (`fullstack`) nor a bounded context, which the manifest
records and no `keel add` names. At a composite product's root,
`services` lists each service as the product recorded it (`path`,
`stack`, `buildSystem`) with the `directory` to open it at and a
`label` for its button (`quarkus-rest · Gradle`); in a monorepo
service, `provided` lists what the product gives it — its
repository's version control, the image the product root builds —
each with the `note` `keel add <id>` answers there, an Ok that stages
nothing. Both are empty anywhere else. `keel add --list` prints the
same status.

`add-vertical` names its verticals as `verticals` — a set, planned
and installed in one run with what it needs, exactly as `keel add a b`
is, and what the page posts — or one of them as `vertical`, kept as an
alias for a list of one. Exactly one of the two; `refresh` names
installed verticals to re-render in the same run (`keel add
--refresh`). The install's report lists the re-renders it proposes
and did not do as `refreshProposals`, each with why, and its `notes`
say what the run decided that was not asked for; a preview carries
both too, which is how the page offers each proposal before Generate.

`answers` is keyed the way the manifest keys them —
`{ "<adapterId>": { "<questionId>": "<value>" } }`, the same pair
`--set adapterId:questionId=value` names. Each question a preview
returns carries a `binding` saying where its answer goes, so a client
never needs a table of question ids of its own. For an adapter's
question the binding names the id the answer was read under — the
adapter's own, or a sibling's it shares the question with when the
answer came under that one — so an answer sent back under its binding
is the one read again. A question about the project's identity (its
name, package, module path or npm scope) carries `shared: "project"`:
the marker a client moving from one preset to another reads to carry
the answer onto the new preset's bootstrap. In a product each
service's bootstrap asks its own, so two services keep two names.

An install holds its body's `answers` to the plan exactly as it holds
`--set`: a key no adapter of the plan reads is refused
(`keel.unknown-answer`), so is a second, different answer to a
question two siblings share, so is one for a vertical already installed
or a question one has settled (`keel.frozen-answer`) or for an answer a
re-render reads as recorded (`keel.reapply-frozen-answers`), and so is
a value outside its question's choices (`keel.invalid-answer`) — none of
them is written into a manifest, and none is a 500. A preview does not
refuse an answer the run does not read: it lists it in
`unusedAnswers`, each entry `{ adapter, question, code, message }`
with the refusal an install of the same body gives — the first is the
one it gives — and previews the body without them. A value outside its
question's choices is read, and a preview refuses it as the install
does. The page sends only the answers its latest preview asked for —
an extra or a card unticked after its question was answered takes that
answer with it, and Generate waits for the preview of the run as it
now stands — and starts them over whenever the page moves between
adding and re-rendering. When the stack changes it sends none until a
preview of the new one has reported its questions, then sends each
answer whose question is still asked and still offers it, under that
question's binding — one marked `shared: "project"` moved onto the new
bootstrap's question of the same id.

A refusal comes back as **422** with the domain's own error code:

```json
{ "error": { "code": "keel.unknown-stack", "message": "unknown stack 'nope'; available: …" } }
```

A refusal the engine raises as data — a vertical this project cannot
carry, one that belongs in a service, a tie, a file in the way — also
carries that data as `error.refusal`, beside the sentence written from
it: the same fields the CLI builds its `hint:` line from
([Refusals](composition.md#refusals)).

```json
{
  "error": {
    "code": "keel.uncoverable-vertical",
    "message": "Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint",
    "refusal": {
      "kind": "unavailable",
      "vertical": "persistence",
      "missing": { "entrypoint": ["arch.server-http"] },
      "carriedBy": ["go-cli-http"]
    }
  }
}
```

The sentence is the same whichever phase met the fact: the extra
refused on the new-project form and the card refused on the project it
scaffolds read word for word alike.

**Every refusal, including the ones raised at the bottom of the
install.** Most are decided at a handler's front door and were always
an `Err`; one was not. The resolver hard-fails when no adapter covers
a dimension a vertical declares — `keel add containerization` on a CLI
project, which has nothing to serve an image from — and it does so by
throwing, from inside `installVertical`, past every menu. A throw is
the one thing an HTTP layer can only read as a crash, so that answered
**500 with a bare string**. It now carries a code
(`keel.uncoverable-vertical`) and the mediator puts it back on the
`Err` rail — and both front doors ask the planner first, so it is
refused before anything runs, in the same code. It arrives here as a
422 like any other, and the page no longer waits for one: the project
status carries the same refusal on the card, so Container image sits
under _Not for this project_ before any click, in the words the finder
uses — _"Container image needs an entrypoint this project does not
have: HTTP server — a REST endpoint"_ — never a tag no command can
add. Pointed at a composite product's root, a vertical the root cannot
carry is refused naming the services that can take it
(`keel.wrong-scope`), and listed under _Belongs in a service_ beside a
button into each service.

A vertical that installs only once another has is no longer refused
at all: distribution on a project with no container image yet
installs Container image with it, first — the plan the page previews
lists both. Only a tie between two verticals that would each supply
what one needs is refused, naming both (`keel.missing-prerequisites`).
The refusals an adapter raises while it runs travel the same way too: an
answer that is none of the choices its question offers this project,
sent to a preview or an install (`keel.invalid-answer`). A choice declares where it applies,
so the preview never lists one the stack cannot serve — `mariadb` is
not among `go-http`'s engines, nor `liquibase` among a JVM stack's
migrations tools — and the same list is what a posted answer is held
to. So do the ones about the directory itself: a file keel would write
that is already there (`keel.path-conflict`) — your own `go.mod`
before a new Go project, your own `Dockerfile` before
containerization, though never a `README.md` or `.gitignore`, which a
new project adopts ([cli.md](cli.md#keel-new)) — and a file keel
patches that has been deleted (`keel.path-missing`). Each names the
file, so the live preview shows what is in the way before Review. Each
used to be a plain throw, and so a 500.

A malformed request is a **400**, a missing or wrong token a **401**,
and a failed `Host`/`Origin` guard a **403**.

A **500** means a throw nothing turned into a refusal — by the kernel's
rule, a bug. It carries the same envelope, with the code
`keel.internal` and the exception's own message:

```json
{
  "error": {
    "code": "keel.internal",
    "message": "fullstack/product-compose: product manifest declares no services"
  }
}
```

The page shows that sentence, headed as a bug rather than a refusal,
and labelled as one to report. It used to
answer with a bare string the page could not read, so a 500 showed as
`POST /api/preview failed with 500` — and some of those throws are
refusals nobody has coded yet, whose sentence names the fix. The page
reads every body once, as text, and keeps one that is not the envelope
verbatim, under `keel.web.http-<status>`.

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
