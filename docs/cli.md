# CLI reference

All commands operate on the **current working directory**. There is no
`--global` flag and no path under `$HOME` is ever touched — keel is
[project-scoped by design](../README.md).

```sh
npx @rgoussu.dev/keel <command>   # one-shot
```

The examples below use the short `keel <command>` form. Run them as
`npx @rgoussu.dev/keel <command>`, or install the binary once with
`npm install -g @rgoussu.dev/keel` to have `keel` on PATH.

## `keel new`

Bootstrap a greenfield project from a [stack preset](stacks/README.md).

```sh
keel new --stack=<id> [options]
```

| Option                    | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --stack <id>`        | Stack preset id (see the [stack catalog](stacks/README.md)). Omitted interactively, the wizard **drills down to it** — what you are building → language → framework → user-side adapters (see below) — instead of asking for an id. Defaults to `quarkus-cli` non-interactively.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--layout <layout>`       | Composite stacks only: `monorepo` (default) or `polyrepo`. Prompted when interactive and omitted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--build-system <choice>` | Stacks offering a choice: `gradle` (default) or `maven` on the JVM stacks, `npm` (default) or `pnpm` on the TypeScript stacks. On composite stacks the choice is per service, named as `path=id` pairs, comma-separated: `--build-system backend=maven,frontend=pnpm`. Services left unnamed are prompted when interactive and take their stack's default otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--module-layout <id>`    | Every single-service stack: `basic` (default, the flat trisection) or `modulith` (one hexagon per bounded context). Prompted when interactive and omitted. Distinct from `--layout`, which is about repositories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--with-peer-context`     | Every stack offering `--module-layout=modulith`, which is every single-service stack: also scaffold a second bounded context reaching the first only through its peer seam. On a stack composing both entrypoints the peer is wired into **both** assemblies. Rejected, with the stack named, on a stack whose modulith has no peer context. Prompted, interactively, the moment `--module-layout` resolves to `modulith` on a stack that actually has a peer-context adapter — passing the flag on the command line always suppresses that question.                                                                                                                                                                                                                                                                                       |
| `--with <ids>`            | Verticals to install on top of the stack's own, comma-separated and in any order (`--with containerization,distribution,iac`) — the greenfield equivalent of running `keel add` once per vertical straight after `keel new`, except they resolve against one another's tags in the same run, install in the order they depend on one another, and the review step shows one plan. What one of them needs installed first is added to the set, and the plan's first note names it. Prompted when interactive and omitted; none otherwise. On a composite stack name each service's as `path:id` pairs (`--with backend:persistence,frontend:dev-env`), planned in that service as on a single stack; an id named without a service goes to the one service that can take it, and is refused, naming the services, where none or several can. |
| `-y, --yes`               | Non-interactive — use defaults for unanswered questions. Skips the wizard and the review step entirely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--no-agent-harness`      | Single-service stacks: omit agent documents, cross-tool shims, skills and hooks; retain the project manifest and formatter configuration. Adopt later with `keel add agent-harness`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--dry-run`               | Print the plan without writing any file. Interactively, the review step still runs (see below) but nothing is committed regardless of the choice made there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--list`                  | List every stack id with its one-line description, then exit — nothing is scaffolded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--set <k=v>`             | Preset an answer as `adapterId:questionId=value` (repeatable). Only for an adapter this run resolves — see [Answers](#answers-stickiness-and---set).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Examples:

```sh
keel new --list                                     # every stack id + description
keel new                                            # interactive: the wizard drills down to a stack
keel new --stack=quarkus-rest                       # interactive, stack already decided
keel new --stack=spring-rest --build-system maven   # pin the build system
keel new --stack=fullstack --layout polyrepo        # one repo per service
keel new --stack=fullstack --build-system backend=maven,frontend=pnpm  # per-service build systems
keel new --stack=quarkus-rest --module-layout modulith  # modules/ + platform/ + application/
keel new --stack=go-http --yes                      # all defaults, no prompts
keel new --stack=rust-cli --dry-run                 # inspect the plan first
keel new --stack=quarkus-cli-rest                   # one hexagon, a CLI and a REST entrypoint both
keel new --stack=quarkus-rest --with persistence,ci # layer extra verticals in the same run
```

**An id keel does not know.** An unknown `--stack` is refused as
`keel.unknown-stack` with every id there is — and, first, the one it
most likely meant: _"unknown stack 'quarkus-cli-http' — did you mean
'quarkus-cli-rest'? Available: …"_. Preset ids grew family by family,
so the guess is usually a real facet in the family's other word: the
JVM presets say `rest` where Go, Rust and TypeScript say `http`, and
the Quarkus product is plain `fullstack`. So the nearest id is read by
**facet words first** — what an id spells, then what its tags and the
entrypoint's words say (`go-rest` finds `go-http`), then what a
product's services say (`fullstack-quarkus` finds `fullstack`) — and
by edit distance only where no word matches (`quarkuscli`). An id
near nothing is refused with the list alone. An unknown vertical, in
`--with` or `keel add`, is answered the same way under
`keel.unknown-vertical`, read by its id and its title's words
(`container` finds `containerization`, the Container image;
`persistance` finds `persistence`).

**A directory that is not empty.** `keel new` needs only that no keel
project holds the directory — no manifest there, and none above it
(see _A directory inside a keel project_, below) — and it never
overwrites a file it did not write. Two files are adopted instead, on
every stack keel ships, because a repository created on a hosting
service and cloned usually holds them:

- a `README.md` keeps its content, title included, and gains keel's
  own README after it, less keel's title, with the entrypoints'
  sections — unless it already has every one of those sections'
  headings;
- a `.gitignore` keeps every line and gains each of keel's entries it
  lacks, in keel's groups, under keel's comments.

An empty one is written as it would be in an empty directory. Each
is adopted once: running the adoption again adds nothing. A
composite's services adopt their own the same way. Any other file of
yours in the way is refused as `keel.path-conflict`, naming it, from
where you ran the command, so a file in a composite's service reads
`backend/go.mod`. The hint under the refusal says the way past it:
move it aside, or start in an empty directory. Nothing is written
before the refusal, not even the adoption.

**A directory inside a keel project.** A directory that holds no
project of its own but sits inside one, at any depth, is refused
before anything is asked, naming the nearest project above it:

- **Inside a project** — `keel new` in `my-app/tools/` or
  `my-app/tools/scripts/`, in a directory keel wrote there such as
  `my-app/domain/`, or in a directory inside one of a product's
  services, such as `my-product/backend/scripts/` — as
  `keel.inside-project`: _"this directory is inside the keel project
  at ../; scaffolding a project inside another is not supported —
  scaffold it elsewhere and move it here"_. A project scaffolded there
  would be a second repository's history, hooks and harness inside the
  first's. A project whose manifest keel cannot read is one all the
  same. Moved in whole, a project is one of its own: `keel add` runs in
  it, and `keel new` there is refused as `keel.already-initialised`
  before anything is asked, as in any project's own directory.
- **Inside a monorepo product** — in a directory the product root does
  not list as a service, `keel new --stack=go-http` in
  `my-product/worker/` or in `my-product/docs/notes/` — as
  `keel.inside-product`: _"this directory is inside the product at ../,
  which lists no service here; adding a service to a product is not
  supported yet"_. A project scaffolded there would be neither a service
  of the product nor a repository of its own. So is a service the
  product does list that no longer holds its project — `backend/`
  emptied — whatever stack is named: _"this directory is backend/ of the
  product at ../, recorded as quarkus-rest; re-scaffolding a service is
  not supported yet"_. Scaffolded, it would be a second repository's
  hooks and changelog inside the product's.

Looking up, keel stops at your home directory without reading it, so
a `~/.claude/.keel-manifest.json` left by 0.1.0-alpha's `keel install
--global` makes no project of it. A polyrepo product's own directory
holds no manifest and sits inside no project, so `keel new` there is
not refused yet.

**A product's extras are its services'.** On a composite stack each
service is a project of its own, so `--with` names the service an
extra goes in, as `path:id` pairs — `--with backend:persistence`, the
form `--build-system backend=maven` takes. Each service's extras are
planned in that service's scope exactly as a single stack's are,
after its build system and the repository layout are settled: what
it needs first is added, and the plan says so under the service's
name (`note: backend: added Container image, Distribution — needed by
Infrastructure as code`); what the service already has — from its
preset, or from the product (`backend: Container image already comes
with fullstack`, under the monorepo layout) — is set aside with a
note; and what it cannot take is refused in the words `keel add` in
that service would use, going on to name another service of the
product that can take it, or has it — the hint under it naming the
pair to drop, and the one to type instead, rather than another stack
to scaffold, which would be another product:

```
$ keel new --stack=fullstack --with frontend:persistence --yes
Persistence has no adapter for this project's stack; backend/ can take it
  hint: drop 'frontend:persistence' from --with, or name backend/:
  '--with backend:persistence'
```

A service that has it already is named as having it (_"…; backend/
has it already"_), with nothing more to type. A pipeline or a
release in a monorepo
service is the wrong scope there (`keel.wrong-scope`), as `keel add
ci` inside it is. `fullstack --with backend:persistence` writes what
`keel new` and then `keel add persistence` in `backend/` would.

An id named without a service goes where it can: a vertical the
product installs of its own (`vcs`) is set aside with a note, as on a
single preset, and any other goes to the one service that can take
it, with a note saying where (`note: Persistence goes in backend/,
the one service of fullstack that can take it`). One the services
that could have it have already is set aside too, naming what each
has it with (`note: Code style already comes with quarkus-rest in
backend/ and web-components in frontend/`), so a `--with` list that
runs on a single preset runs on a product — and `keel add` of it at
the product root, later, is the same Ok that adds nothing. Where two services could
each take it — a toolchain — or none can, it is refused as belonging
to a service (`keel.wrong-scope`), in the words `keel add` gives it at
the product root, and the hint names the pairs to type instead:

```
$ keel new --stack=fullstack --with toolchain --yes
Toolchain belongs to a service, not to the product root — it goes in
backend/ or frontend/
  hint: name the service it goes in: '--with backend:toolchain' or
  '--with frontend:toolchain'
```

A pipeline or a release named without a service on a monorepo
product has no service to go to at all: its place is the repository's
root, which the product root is, and keel installs it at no monorepo
product's root yet (`keel.uncoverable-vertical`) — per-service
pipelines and releases need the polyrepo layout. One command names its extras
one way — each with its service or none with one: the two forms mixed
are refused, and so are a path the product lists no service at, an id
named twice for one service, and a `path:id` pair on a single-service
stack (`keel.invalid-extra-verticals`).

Every scope of a product stages into a tree of its own, and a file
two of them would write — a preset installing an image in a monorepo
service whose image the product root already builds — is refused
before the plan is shown (`keel.cross-scope-write`, naming both
adapters and where each runs), so `--dry-run`, `keel ui`'s preview
and the install refuse it alike, rather than the scope committed last
silently replacing the other's file.

`--no-agent-harness` is an explicit opt-out; the harness otherwise stays on without an extra prompt. It cannot be combined with `--with agent-harness` or a plugin stack/vertical that activates `agentic.harness` — or a vertical that needs the harness installed first, which the flag refuses rather than bring the harness back as its prerequisite — and the interactive extras question leaves such a vertical off its menu. It is refused on a composite stack: every service of a product keel scaffolds carries the harness. In `keel ui` it is the **Agent harness** chip under the Options step's _Comes with_ list, pressed off ([docs/ui.md](ui.md)), and the command line the page shows carries the flag.

### The interactive wizard

The structural selection flags double as questions: pass it and its question is
skipped, omit it interactively and the wizard asks. The order is
designed rather than incidental — the stack first (the most
consequential choice), then the repository layout or build system,
then the module layout, then the peer context when the modulith
supports one, then each installed adapter's own questions in the
order they resolve.

#### Finding a stack: the drill-down

There are 34 presets. Knowing you want "a backend, in Kotlin, on
Spring, with a CLI and an HTTP endpoint" is easy; knowing that is
spelled `spring-cli-rest-kotlin` is not. So with no `--stack`, the
wizard asks for the stack in **up to four narrowing questions**
instead of one wide one, widest first, and it says so before it
starts:

1. **What are you building?** — a **fullstack** product (a backend
   and a browser front end, scaffolded side by side), a **backend or
   tool** with no front end — a command line, an HTTP service, or both
   in one project — or a **frontend** app. This is
   read off the presets themselves: which end each `arch.*`
   entrypoint is driven from decides where a preset lands, so a stack
   is never listed under a shape by hand. The last entry, _Other —
   pick a preset by id_, falls through to the flat list for someone
   who already knows the id they want.
2. **Language** — Java, Kotlin, Go, Rust, TypeScript. Each choice
   names the presets it leads to. On the fullstack shape this is the
   **backend's** language: the front end is the browser either way.
   Skipped where the shape reaches only one, as the frontend does.
3. **Framework** — Quarkus, Spring or Micronaut. Asked only where the
   shape and language chosen leave more than one open, which today
   means the JVM: Go, Rust and TypeScript are never asked.
4. **User-side adapters** — a **multi-select**: CLI, HTTP server, or
   (in the browser) a SPA. Picking more than one resolves to the
   **composed** preset — one project, one domain, both entrypoints
   (`quarkus-cli-rest`, `go-cli-http`, `ts-cli-http`, …) — and never
   to two services; two services is the fullstack shape, which was
   the first question. Skipped where the answers above reach only one
   combination, as a fullstack product does.

**Why shape comes first, and why the adapters come last.** Shape is
the widest cut there is and it is the one a newcomer already knows
the answer to. The adapters are the one axis that narrows nothing
else — a backend reaches the same ways in whichever language and
framework it is on — so asking them last costs nothing and keeps the
three questions that _do_ narrow next to each other. It also gave the
[fullstack products](stacks/README.md) a branch to sit on: a
two-service product carries no language tag of its own, so before
there was a shape axis it was reachable only by typing its id. It
places perfectly well through its services — the union of their
entrypoints gives the shape, and its one back-side service gives the
language and framework.

Every menu is derived from the tags of the presets still reachable
from the answers already given, so a combination no preset covers is
never on offer — the wizard cannot walk you into a dead end and
announce it at the bottom. The answer is always a registered stack
id, which is why `--stack` and the drill-down resolve through exactly
the same code from there on.

Taking every default lands on `quarkus-cli`, the same preset an
omitted `--stack` has always meant non-interactively. The run prints
the preset it resolved to before staging it:

```
keel new: no --stack, so let us find one — what you are building, then the language, the framework, and the way in. Each answer narrows the next, and a step with one answer is skipped.
? Step 1 · What are you building? Backend or tool — no front end (command line, HTTP service, or both)
? Step 2 · Language Java
? Step 3 · Framework Quarkus
? Step 4 · User-side adapters (Java) CLI, HTTP server
keel new: Backend or tool · Java · Quarkus · CLI + HTTP server → quarkus-cli-rest
```

The step numbers count what is actually asked, not what the four axes
are: pick the frontend shape and there is exactly one preset under
it, so the run is one question long.

Passing `--stack` skips all four questions; `--yes` skips every
question there is.

#### Adding verticals in the same run

The last stack-level question is a **multi-select of extra
[verticals](verticals/README.md)** — `persistence`, `distribution`,
`ci`, `iac`, … — installed on top of what the stack already brings.
It defaults to none: a stack's own list is a coherent starting point
by construction.

Two things are off the menu, and neither is a judgement call:

- **What the stack already installs.** It is in the plan either way,
  so there is nothing to tick; `--with` naming it anyway is noted and
  dropped, below.
- **What nothing keel can add makes installable here.** `persistence`
  on a CLI-only preset has no datasource adapter, so it would resolve
  to nothing; a service gateway with no linked project would install
  nothing at all. The menu is read against the tag set the build
  system, module layout and peer-context answers settle, which is why
  this question comes after them.

What stays is either ready, or ready once other verticals are
installed first — and those say so in their label, by name:
`Infrastructure as code — needs Container image, Distribution`. Ticked
on its own, such a choice brings what it names with it, and the plan
opens with a note saying so (in `keel ui` they are ticked for you).

Layering here is not the same as running `keel add` once per extra
afterwards: in one run the extras resolve against one another's tags
(`--with containerization,distribution,iac`), and the review step
shows one plan instead of three. `--with` is the flag half and
suppresses the question, `--with ''` included — that is how you say
"none" explicitly.

`--with` is checked rather than pruned, at the front door — before
the first adapter question, never eight questions later:

- an id that is not a registered vertical is refused with the list of
  what is available here, and one named twice is refused as well;
- so is one this stack cannot carry, saying what it lacks — the same
  fact the menu's pruning states by omission, in the sentence `keel
add` would refuse it with on the scaffolded project (see
  [Refusals](composition.md#refusals)). An entrypoint is named by the
  label the finder offers it under; a language, framework or build
  system is never offered as a remedy, since no command changes one,
  and the refusal says the vertical has no adapter for this project's
  stack instead, naming the nearest stacks of the same shape that carry
  it on these dials — never the preset being scaffolded, and never a
  back end for a front end. Where only the build system differs, it
  names the build system instead (_"Distribution has no adapter for
  this project's build system; it needs Gradle — …"_ on `quarkus-cli`
  with Maven), and the hint points at `--build-system`. What only
  `--with` can do about it is the hint under the refusal:

  ```
  $ keel new --stack=quarkus-cli --with persistence
  Persistence needs an entrypoint this project does not have: HTTP
  server — a REST endpoint
    hint: drop 'persistence' from --with, or scaffold quarkus-cli-rest,
    which carries it: 'keel new --stack=quarkus-cli-rest --with persistence'
  ```

  Where that stack comes with the vertical — its preset installs it of
  its own, as every HTTP preset does observability — the hint names
  nothing more to add, since `--with` of it there would only be set
  aside as already there: _"…, or scaffold quarkus-cli-rest, which
  comes with it: 'keel new --stack=quarkus-cli-rest'"_. With several
  nearest stacks, the hint names the first, and is worded by it.

- and so is a set whose extras need a capability that two verticals
  each supply, equally well — a tie only you can settle, by naming the
  one you want (`keel.missing-prerequisites`, naming both). None of
  keel's own verticals ties; two plugins can.

One the stack already installs is not refused: asking for what the
plan has has one sensible reading. It is dropped, the rest of the set
installs as it would without it, and the plan says so in a note —
`note: Development environment already comes with quarkus-rest`.

A set that leaves out what one of its extras needs installed first is
completed rather than refused: the planner adds the missing verticals,
in the order they install, and the plan opens with a note naming them
— before any note of what was already there, since it is the one that
changes what is written.

```
$ keel new --stack=quarkus-rest --with iac --dry-run --yes
keel new quarkus-rest: planned changes
  note: added Container image, Distribution — needed by Infrastructure as code
  …
```

`--with` names a **set**, not a sequence: the extras install in the
order they depend on one another, whatever order they are named in.
`--with containerization,distribution,iac` and `--with
iac,distribution,containerization` plan the same install on a REST
stack — `distribution` builds the image `containerization` emits, and
`iac` deploys the one `distribution` publishes — and `persistence`
goes ahead of the `distribution` whose deploy descriptor reads it, so
`DB_URL` is there whichever comes first on the line. Extras nothing
ties together go in by id, so no order you type moves a byte of the
result. When the order named puts one ahead of a vertical it needs or
reads, the report opens with a note saying which order it used. The
planner behind this (`domain/core/planner.ts`) is the one the menu
above and `keel add` read, so the three cannot disagree.

Once everything is answered, the wizard shows the same plan
`--dry-run` prints — every file that would be created or changed,
every deferred action that would run — and asks what to do next:

- **Proceed** — commit the plan as shown (or, under `--dry-run`,
  report it without committing).
- **Change: …** — jump back to any question already answered
  (language, adapters, layout, an adapter's base package, …) and
  re-answer it.
  Everything asked after that question is re-resolved, since a later
  choice may depend on it — picking a different stack, for instance,
  changes which adapters run at all.
- **Cancel** — abort with `keel.cancelled`; nothing is written.

`-y, --yes` bypasses the wizard and the review step entirely — every
question resolves to its default and the plan commits immediately,
which is what scripts and the e2e harness rely on.

## `keel add`

`keel add agent-harness` adopts the agent kit in a harness-free scaffold.
It also reconstructs declared harness elements from every installed vertical
and recorded module, using stored answers without prompting or re-running
domain writes and deferred actions. `--reapply` refreshes this same set.
See the [harness catalog](verticals/agent-harness.md).

Install [verticals](verticals/README.md) onto an existing keel
project (one that carries a keel manifest — i.e. was scaffolded by
`keel new`) — one, or several in one run.

```sh
keel add <vertical>... [options]
keel add containerization distribution iac    # one plan, one run
keel add containerization,distribution,iac    # the same, as --with spells it
```

Available verticals: `vcs`, `walking-skeleton`, `agent-harness`,
`code-style`, `dev-env`, `dev-container`, `observability`,
`persistence`, `gateway`, `containerization`, `ci`, `distribution`,
`iac`, `toolchain`. See
the [compatibility matrix](verticals/README.md#compatibility-matrix)
for which vertical applies to which stack — a vertical whose declared
dimensions cannot be covered on your project **is refused, saying what
the project lacks** (e.g. `observability` on a CLI project needs an
HTTP server entrypoint); a service gateway with no linked project is
refused pointing at `keel link <path>`. Both are read from the same
planner `keel new --with` and its menu read, before a file moves, and
the refusal is the same sentence `keel new --with` gives, under the
same code — the remedy only `keel add` has is the `hint:` line under
it. Where what stops the vertical is an entrypoint the project can
grow, the refusal carries that command as its action, and the hint
spells it:

```
$ keel add persistence      # in a go-cli project
Persistence needs an entrypoint this project does not have: HTTP
server — a REST endpoint
  hint: 'keel add entrypoint http', then 'keel add persistence'
```

— _"'keel add entrypoint http' brings observability with it"_ for a
vertical the preset with both entrypoints comes with, and for a
service gateway, which also needs a linked project, _"'keel add
entrypoint http', then 'keel link <path>' a project it can wire, then
'keel add gateway'"_. The action is offered only where
[`keel add entrypoint`](#keel-add-entrypoint) would run, as far as the
manifest says (the command reads one refusal off the files), and the
grown project would take the vertical, or would once linked where a
linked project is missing too — never in a monorepo product or on a
front end. On a project growth refuses (a modulith whose contexts are
wired into its one entrypoint, on the JVM families for now), or where
growing would still leave the vertical refused (iac beside a
distribution taken as an extra, which would need a re-render), the
hint names the stack that carries both instead: _"quarkus-cli-rest
carries both this project's entrypoints and persistence"_, or, for a
vertical that stack comes with, _"…has this project's entrypoints and
comes with observability"_. In a monorepo product's service, a
vertical it cannot carry is refused naming another service of the
product that can take it, or has it (_"Persistence has no adapter for
this project's stack; backend/ can take it"_), read from the
product root's list of services — the card in `keel add --list`
and the page say the same; a polyrepo service has no product root to
read them from, and is refused as a project of its own. At the root of a
composite product, a vertical the root cannot carry is refused under
`keel.wrong-scope`, naming the services that can take it, read from each
service's own manifest, and the hint says where to `cd` (`cd backend &&
keel add persistence`). One no service could take and the services that
could have it have already — code style, the agent harness, the image
the root builds for each, observability in the one service that carries
it — is there, as `keel new --with` of it on the product sets it
aside: the add is an Ok that writes nothing, exits 0, and says where it
is:

```
$ keel add code-style      # at a fullstack monorepo root
keel add code-style: planned changes
  note: Code style is already there: backend/ and frontend/ have it
```

Named beside a vertical the root does carry (`keel add code-style
dev-env`), it is set aside with that note and the rest install; beside
one the root refuses, the refusal still wins. Where one service could
take it and another has it, it is still refused, naming the one that
can.

In a **monorepo product's service**, a directory of the product's
repository, two things differ from a project of its own. What the
product gives the service is already there — the repository's version
control, and the image the product root's `compose.yaml` builds for
it — so `keel add vcs` or `keel add containerization` there is an Ok
that writes nothing, its note saying where it comes from. And what
only a repository root reads — a CI pipeline, a release — is refused
there under `keel.wrong-scope`, and so is what needs it:
`keel add iac` reads _"Infrastructure as code needs Distribution,
which cannot go in a monorepo service: its release workflows are read
only at the repository root, which in a monorepo is the product root —
per-service releases need the polyrepo layout"_. At the product root
the same vertical is refused as belonging to a service, with that
reason and the same way forward: _"Infrastructure as code belongs to a
service, not to the product root — none of its services can carry it,
since it needs Distribution, which cannot go in a monorepo service:
…"_. A polyrepo product's services are repositories of their own, and
take all of them.

The verticals named are a **set**, planned exactly as `--with` plans
one: closed over what they need, and installed in one run in the order
they depend on one another, whatever order they are named in. One that
installs only once another has brings it along — `keel add iac` on a
REST project with no image installs Container image and Distribution
first, and the plan opens with
`note: added Container image, Distribution — needed by Infrastructure as code`.
`keel add containerization distribution iac`, `keel add iac` and the
three added one after another write the same files. Naming one twice
is refused (`keel.invalid-verticals`), and so is a tie between two
verticals that would each supply what one needs
(`keel.missing-prerequisites`, naming both).

A section an add writes into the project's `README.md` goes where one
run would have put it. keel's sections keep one order — the
entrypoints, then the dev environment, monitoring and the dev
container in the order keel's presets install them, then persistence,
then the toolchain — so `keel add persistence` on a project scaffolded
`--with toolchain` puts `### Persistence` above `### Toolchain`, as
`keel new --with toolchain,persistence` does, and `--reapply` puts a
section you deleted back in its place. Two sections that share a
place — `### Observability` and `### Monitoring stack`, `### Database`
and `### Persistence` — keep the order they arrive in, so one put back
alone follows the other. A section already there never moves.

keel reads as its own sections only the `### ` headings after the
README's last `## ` heading, outside code blocks and HTML comments. So
a heading of yours above that `## ` heading never decides where keel's
sections go, and neither does a section of keel's you commented out.
A `## ` section of your own added below keel's — a `## License` —
leaves none of them after the last `## `, so a section keel adds after
that is appended at the end, as before. A heading named like keel's —
a `### Dev container` of yours — still stands in for keel's own, which
is then not added.

An entrypoint's entries in the lists its build files share go in the
same way: the JVM's `settings.gradle.kts` includes and root `pom.xml`
modules — the seed's, then the CLI's, then REST's, each entrypoint's
in its own order, then everything after them, such as the port fake,
the peer context or persistence — the TypeScript root `package.json`
scripts, in the order the formatter sorts them, and the basic Rust
crate's CLI `[[bin]]`, above the HTTP unit's tables. So
`keel add walking-skeleton --reapply` puts an include, a module or a
script you deleted back where it was, one of an entrypoint's several
included, and an entry already there never moves. Only the lines keel
reads as entries rank: an include or a module on a line of its own,
outside a comment, and in `pom.xml` only the root's own `<modules>`,
never a profile's; in `Cargo.toml`, a table header on a line of its
own. Where none ranks, the entry goes at the end of its list, as
before.

| Option            | Meaning                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-y, --yes`       | Non-interactive — defaults for every question.                                                                                                                      |
| `--dry-run`       | Print the plan; write nothing.                                                                                                                                      |
| `--list`          | List the verticals and what `keel add` would do with each here — ready, with what it needs first, after an entrypoint the project can grow, or why not — then exit. |
| `--reapply`       | Re-render installed verticals from their recorded answers.                                                                                                          |
| `--refresh <ids>` | Installed verticals to re-render in the same run, comma-separated — the ones the run proposes refreshing. See below.                                                |
| `--set <k=v>`     | Preset an answer for a vertical being added (same shape as `keel new`). A re-rendered adapter's recorded answers cannot be changed this way.                        |

`keel add --list` reads the project it runs in and says, for every
vertical not installed, what `keel add <id>` would do — before you run
it. It asks the same question the add itself asks
(`keel.project-status`, one dispatch), so the list and the command
cannot disagree:

```
$ keel add --list          # in a go-http project
Ready to add here:
  ci                Continuous integration — The pipeline every push has to pass: …
  containerization  Container image — A runtime image for the service: …
Ready, with what each needs installed first:
  distribution      Distribution, after containerization — The release path on a tag push: …
  iac               Infrastructure as code, after containerization, distribution — Where this project runs — …
Not for this project:
  gateway           Service gateway wires linked projects, and no linked project serves it here — link one that does first
Installed: vcs, walking-skeleton, agent-harness, … — 'keel add <id> --reapply' re-renders one
```

At a product root the list ends with what is recorded as installed
and no `keel add` names — the product's glue, `fullstack` — and a
project with a bounded context lists `bounded-context` there too:
`Also installed, which 'keel add' does not re-render: fullstack`; what
its services have is listed apart, under `In its services, nothing to
add:`, each naming them. In a monorepo service, what the product gives
it is listed apart the same way, under
`From the product, nothing to add:`, each with where it comes from.

On a project that can grow the entrypoint it lacks, what only that
entrypoint stops is not "not for this project" — it is one command
away, and listed under it, each saying whether it comes with the
entrypoint or needs a linked project too:

```
$ keel add --list          # in a go-cli project
Ready to add here:
  ci                Continuous integration — The pipeline every push has to pass: …
  dev-env           Development environment — Local development environment: …
  toolchain         Toolchain — Records the project's toolchain needs …
After 'keel add entrypoint http':
  containerization  Container image — A runtime image for the service: …
  distribution      Distribution — The release path on a tag push: …
  gateway           Service gateway, once 'keel link <path>' links a project it can wire — …
  iac               Infrastructure as code — Where this project runs — …
  observability     Observability, which comes with it — Health probes, …
  persistence       Persistence — SQL persistence: …
Installed: vcs, walking-skeleton, agent-harness, code-style, dev-container — 'keel add <id> --reapply' re-renders one
```

A refusal is printed in the words `keel add <id>` would refuse it
with. A vertical that two sets of prerequisites would each serve is
refused until you name one, but it is listed with the verticals that
need something first, in the sentence that names the choice. A project
from another harness generation — which `keel add` refuses everything
but `agent-harness` on until it is brought forward, and at a monorepo
product root that too, where nothing brings it forward: there what is
not for the root is refused as the list says, what it or its services
have already as nothing to run, and anything else naming the keel to
pin — is said once,
first, rather than on every line. Outside a keel project there is
nothing to ask about, and it prints the catalog: every id with its
one-line description.

Adding a vertical that is already installed is not an error: there
is nothing to install, so the plan is empty, the project is left as
it is, and the run exits 0 with a note naming what does re-render it:

```
$ keel add ci
keel add ci: planned changes
  note: Continuous integration is already installed; 'keel add ci --reapply' re-renders it
```

Named beside others, it is noted the same way and the rest install —
so a script can name what it needs, and run twice. Named with
`--refresh` as well, it is re-rendered in the run instead.

Run where there is no keel project, `keel add` is refused as
`keel.not-initialised`, and the sentence says where one is: in a
subdirectory of a project, the project above (_"this directory is
inside the keel project at ../; run 'keel add' there"_), even one
whose manifest keel cannot read, where `keel add` reports the broken
file; in a polyrepo product's directory, which holds no manifest of
its own, the services below (_"backend/ and frontend/ below hold keel
projects; run 'keel add' in one of them"_); only where neither is,
`keel new`. `keel add module`, `keel add entrypoint`, `keel link` and
`keel toolchain` say the same, each naming itself (_"…; run 'keel add
module' there"_) — but inside a monorepo product root, which takes no
bounded context, declares no toolchain and grows no entrypoint, `keel
add module`, `keel add entrypoint` and `keel toolchain` name its
services instead (_"this directory is inside the keel product at ../,
whose services are ../backend/ and ../frontend/; run 'keel toolchain
install' in one of them"_). Where every project it would name takes no
bounded context either — the flat layout, which scaffolds default to —
`keel add module` says so, and why, rather than sending you there to be
refused: _"this directory is inside the keel project at ../, which
refuses 'keel add module' too, since a bounded context needs the
modulith layout: …"_. `keel add entrypoint` does the same inside a
monorepo product, whose services refuse it as its root does, and inside
a project that refuses to grow — a JVM modulith with a peer context,
say: _"… which refuses 'keel add entrypoint http' too, since HTTP
server cannot be added here yet: …"_ — or one whose files refuse it
(see [`keel add entrypoint`](#keel-add-entrypoint)).

### `--refresh`: what an add changes

Installing a vertical can change what an installed one would render,
without touching it. `distribution` writes `DB_URL` into its deploy
descriptor only when `persistence` is there; on `quarkus-cli-rest`,
a native-only distribution resolves to the container image's release
pipeline once `containerization` builds a JVM image. keel never
re-renders on its own — a re-render overwrites what the vertical owns —
so the run **proposes** it: the report lists each such vertical
(`refreshProposals`) with a note saying why and how to take it up.

```
$ keel add persistence --dry-run
keel add persistence: planned changes
  note: refresh proposed: Distribution reads Persistence, which it was rendered without — re-render it in this run with --refresh distribution, or afterwards with 'keel add distribution --reapply'
  + …
```

Once a run has written its files, what it installed is there, and
naming it again would only be noted as already installed — so its note
offers the plain re-render:
`re-render it with 'keel add distribution --reapply'`.

`--refresh <ids>` takes it up in the same run: each named installed
vertical is re-rendered after whatever it reads or whatever decides its
adapters, under `--reapply`'s posture (template-owned files rewritten,
each with a diff; a diverging patch refuses the run). Its recorded
answers are frozen, but an adapter it now resolves to has none — the
container image's release pipeline above — so that adapter's questions
are asked (and shown in `keel ui`'s preview), and `--set` reaches it.
A re-render onto another adapter writes the new adapter's files and
removes none of the old one's: on `quarkus-cli-rest`, the native
release's `native-build.yml` and `release.yml` stay beside the image
pipeline — its `release.yml` releasing on each `v*` tag as the image's
does — until you delete them ([distribution](verticals/distribution.md)).
Refreshing a vertical that is not installed is refused as
`keel.vertical-not-installed`.

Where an installed vertical, as it was rendered, is all that stands in
the way of one you ask for, the add is refused as `keel.needs-refresh`,
naming the re-render, and the hint spells the run that takes it — on
`quarkus-cli-rest` whose distribution shipped native binaries:

```
$ keel add iac
err  Infrastructure as code needs Container image, then Distribution re-rendered — as it was rendered, Distribution does not add what Infrastructure as code needs
  hint: re-render it in the same run: 'keel add iac --refresh distribution'
```

**keel does not overwrite your files, nor recreate its own.** A file
the vertical would write that the project already holds — your own
`Dockerfile` before `keel add containerization`, a
`.github/workflows/ci.yml` before `keel add ci` — is refused as
`keel.path-conflict`, naming it, in the sentence `keel new` uses —
with no advice to move it, since under `keel add` the file may be
keel's own; so is a file keel patches that lacks what keel adds its
lines inside — a build file's block, or the list a composition root
registers its handlers in, in a shape keel can read back — naming what
it lacks. (What a composite
product root writes into a service — its image files — is declared by
the root, so `keel add containerization` there reads it as already
there rather than meeting the files.) A file keel patches that has
been deleted — a `README.md`, a `build.gradle.kts` — is refused as
`keel.path-missing`: restore it, then re-run. Either way nothing is
written.

**A project from another harness generation is refused.** Every
manifest keel creates records the generation of the agent harness it
wrote (`harnessGeneration`). `keel add <vertical>` — with or without
`--reapply` — `keel add module` and `keel add entrypoint` refuse a
project stamped with an older generation, or with none, with
`keel.harness-generation`, before a file moves: its sentinels and
agent documents live where this keel no longer looks, and a
half-patch would corrupt them. The message names the way forward —
move `AGENTS.md`, `CLAUDE.md` and `.claude/` aside
(keeping `.claude/.keel-manifest.json`), run `keel add agent-harness`
(`--reapply` when it is installed), which re-renders the harness and
restamps the marker, then re-run the command — or pin the keel that
scaffolded the project. It names no pin for `keel add entrypoint` on a
project with no marker: the marker and that command arrived in one
release, so no keel that writes no marker has the command.
`keel add agent-harness` is the one command
the gate lets through — but not at a monorepo product root, whose
services have the harness: it installs nothing there, so the gate
refuses it too. A product root's harness is the product glue's own,
which no `keel add` names, so nothing brings it forward, and the
refusal says so: for what the root runs itself the way forward is the
pin, which it names (_"… so pin keel@0.4.0-alpha, the keel that
scaffolded it, to run 'keel add dev-env' here"_), and each service's
harness is brought forward in that service. An add naming only what
is there already — what the services have, `keel add agent-harness`
itself or code style, or what the root has installed, unless
`--reapply` or `--refresh` re-renders it — names no pin, since no keel
runs anything for it at the root, and says who has it: _"… and its
services have what 'keel add agent-harness' names already, so there is
nothing to run here"_, _"… and this root has what 'keel add vcs' names
already, …"_. What the root cannot carry at all is
refused as in any generation, before the gate — pointing into a
service where one can take it (`keel add persistence`), or saying keel
installs it at no monorepo product's root yet (`ci`, `distribution`) —
and `keel add module` as at any product root. `keel add --list` and
`keel ui` say the same at such a root, once. A newer marker asks for a
newer keel.

### `--reapply`: the update path

`keel add <vertical>... --reapply` re-renders **installed** verticals
from the answers the manifest recorded, which is how a template fix in
keel reaches a project scaffolded before the fix. The posture is
deliberately conservative:

- **Template-owned files** (whole-file contributions) are rewritten to
  the pristine re-render. A byte-identical render is skipped, so the
  plan lists only real changes — and every rewrite is reported as a
  unified diff against your working tree. `--dry-run` shows the same
  diff without writing anything.
- **Patched files** (shared files like build files, `README.md` and
  `.gitignore`, which you own) are never rewritten whole. A patch
  whose re-application changes nothing — the guarded style keel's
  adapters use — passes silently. One that
  owns a region of the file — a sentinel-delimited section, a guarded
  insert: applying it to its own result changes nothing more — re-renders
  that region and reports the diff, the way a template-owned file is
  rewritten; the rest of the file is untouched. One that _would_ keep
  changing the file refuses the whole run with `keel.reapply-conflict`
  before anything is committed, because without a recorded base a
  changed result cannot be told apart from a double application.
  Resolve that file by hand, then re-run.
- **Answers are frozen.** An adapter the manifest records answers for
  resolves from them without asking; a `--set` for one errors with
  `keel.reapply-frozen-answers`. A question the vertical grew since
  the original install resolves to its default and is recorded like
  any first ask. An adapter the vertical newly resolves to — the
  project gained a tag since — has nothing recorded, so it is asked,
  and takes `--set`, as on a first install.

Reapplying a vertical that is not installed errors with
`keel.vertical-not-installed`. In a monorepo service, one the product
gives it is refused under that code saying where it comes from — the
repository's version control, which the product root has and
re-renders there; the image the product root builds for it, _"… the
product root builds it for this service: nothing to reapply here"_ —
and one only a repository root reads (a pipeline, a release) as
`keel add` of it there is (`keel.wrong-scope`) — neither with advice
to install it here, which would change nothing, or be refused in
turn. `--refresh` of either reads the same. At a composite product's
root, a vertical the root does not carry is refused as `keel add` of
it there is — and one its services have, which `keel add` answers as
there already, saying where each has it from (`keel.wrong-scope`):
one they installed is re-rendered there, _"Code style belongs to a
service, not to the product root — backend/ and frontend/ have it
already, and it is re-rendered there"_, the hint naming the re-render
in each (`cd backend && keel add code-style --reapply`); the image the
root builds for each of them is neither theirs to re-render nor an
install of the root's, _"Container image is not installed at the
product root, which builds it for backend/ and frontend/: nothing to
re-render here"_, with no hint. Tags the original install promoted
are re-promoted idempotently (they never double), and the vertical
keeps its original `installedAt`. A three-way merge that preserves
your edits to template-owned files is on the [roadmap](roadmap.md) —
today the diff tells you exactly what an overwrite would replace.

## `keel add module`

Add a **named bounded context** to an existing modulith project.

```sh
keel add module <name> [--consumes <other>] [options]
```

A bounded context is not a vertical, which is why it has a command of
its own: `keel add persistence` names a capability the project either
has or lacks, while a context is a thing with a _name_, and
`keel add bounded-context` would have nowhere to put one.

What lands is a structural shell in the layout your stack already
uses — a contract face, a core with one handler, and a
`user-side/service` seam of its own:

```sh
keel add module ordering                     # a context that consumes nothing
keel add module ordering --consumes greeting # …and a gateway to greeting's seam
keel add module shipping --consumes ordering # contexts compose: any context with a seam
```

**The use case inside is a placeholder and says so.** keel knows the
context's name and nothing about its purpose, so it emits
`<Name>Command` / `<Name>Result` with a doc comment telling you that
renaming it is the first thing to do. What is not a placeholder is
everything around it: the driving port, the rejection this context
owns, the seam's own vocabulary, and the fact that no file in the new
context names another context except through that context's seam.

**`--consumes <other>` is opt-in, and its argument must publish a
seam.** Every context added this way does, from the start — that is
what makes `keel add module shipping --consumes ordering` work without
you building the seam by hand first. The one context that does not is
the one `keel new --with-peer-context` scaffolds: it is a pure
consumer, so it is a legal name and an impossible target, and keel
says so rather than emitting a gateway to nothing.

| Option           | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `--consumes <c>` | Also emit a driven port and a gateway over `<c>`'s seam. |
| `-y, --yes`      | Non-interactive — defaults for every question.           |
| `--dry-run`      | Print the plan; write nothing.                           |

The front door refuses, with a reason, when: the name is not a
lowercase word `[a-z][a-z0-9]*` or is a keyword in one of the target
languages; there is no keel project here (in a directory inside one,
naming it, as `keel add` does, or, inside a product root, which takes
no bounded context, its services — or, where each project it would
name is on the flat layout too, saying so, and why — and
`keel.project-status`'s `moduleRefusal` there is the same sentence);
the project uses the flat
`basic` layout, which has no seam for a second context to meet the
first at (the rule's own reason, as a sentence — _"A bounded context
needs the modulith layout: …"_ — with its id,
`bounded-context/context-needs-modulith`, in the refusal's data); this is a composite product root rather than one service;
the name is already taken; `--consumes` names something that does not
exist, is the context being added, or publishes no seam; or the
project's stack has no bounded-context adapter, in which case the
command would otherwise scaffold nothing at all and report success.

On Micronaut and on `ts-cli`, `ts-http` and `ts-cli-http`, keel adds
the context to the list its assembly's composition root registers
handlers in — `@Import(packages = …)` or the hand-wired `mediator(…)`
on Micronaut, `createRegistryMediator([…])` in `main.ts` — read as it
finds it, after the peer context or persistence. A root there that no
longer holds that list is refused as `keel.path-conflict`, naming the
file and what it lacks, before anything is written, as `keel add`
refuses one — and so, on Micronaut, is a list keel cannot read back
as one: a comment among its entries, or a Kotlin mediator with a block
body. (On the TypeScript stacks the entry is spliced in after the
array's last one rather than the list rewritten, so a comment there
stays where it is.) So is a Micronaut Kotlin mediator that already
takes a parameter of the context's name (`clock`, where persistence
injects its `Clock`; `welcome`, beside the peer context), naming it:
rename that parameter, or give the context another name.

Supported on every stack that ships a modulith: the twelve JVM stacks,
`go-cli`/`go-http`/`go-cli-http`, `rust-cli`/`rust-http`/`rust-cli-http`,
`ts-cli`/`ts-http` and `web-components`.

## `keel add entrypoint`

Add the **entrypoint a project lacks**: an HTTP server to a CLI
project, or a CLI to an HTTP one.

```sh
keel add entrypoint <cli|http> [options]
keel add entrypoint http        # a CLI project grows an HTTP server
keel add entrypoint cli         # an HTTP project grows a CLI
```

An entrypoint is part of what a project _is_, so no vertical adds one,
and it has a command of its own. A project with both entrypoints is
the preset that carries both — its **twin** — and growing into it
writes what `keel new` of the twin writes on the same dials: the same
build system, module layout and agent-harness setting. So

```sh
keel new --stack=quarkus-cli && keel add entrypoint http
keel new --stack=quarkus-cli-rest
```

leave the same tree, byte for byte, the manifest included but for its
timestamps, and queue the same deferred actions but the repository's
own setup (`git init`, the hooks path), which the project has
already. The composition grid holds every single-entrypoint backend
preset to it on every dial setting, both ways (invariant I10,
[`tests/AGENTS.md`](../tests/AGENTS.md)).

What it adds, and nothing else:

- **The other entrypoint's bootstrap**, and only it: on the basic
  layout a CLI project gains `application/rest/` (JVM and TypeScript),
  `cmd/http/` (Go) or `src/bin/http/` (Rust). keel never reads the
  files of the entrypoint already there, let alone writes them — an
  edited `Main` stays as you left it, but for one thing: on the JVM the
  queued formatter (`./gradlew spotlessApply`, or `./mvnw
spotless:apply` on Maven) formats the whole project, as the
  pre-commit hook does, so an edit the formatter would change comes
  out formatted (commit before growing to see it). A file of yours
  where the new one goes stops the run before anything is written
  (`keel.path-conflict`, naming it). On a project that took extras,
  the part of an extra that applies to the new entrypoint comes with
  it, as in `keel new` of the twin with that extra: a Quarkus REST
  project on Gradle with a native image and
  [distribution](verticals/distribution.md) that grows the CLI gains
  the native CLI's release workflows
  (`.github/workflows/native-build.yml` and `release.yml`).
- **The twin's verticals the project lacks** — adding HTTP brings the
  [dev environment](verticals/dev-env.md) and
  [observability](verticals/observability.md) with it; adding the CLI
  brings none. Of a project with no extras it asks one question, the
  monitoring stack's shape (`observability/monitoring-compose:stack`,
  `granular` by default); an extra's part that comes with the
  entrypoint asks its own, as the twin would — the native release
  above, its `targets`. Every other answer is the project's, and one
  supplied for the new bootstrap's identity (`basePackage`,
  `projectName`) is held to what its sibling recorded
  (`keel.frozen-answer`), as one for the entrypoint already there is.
  `--set` is held to the rules
  [`keel add`'s answers](#answers-stickiness-and---set) are.
- **Its bounded contexts' wiring**, on a Go, Rust or TypeScript
  modulith: the peer context `--with-peer-context` scaffolded, and each
  context [`keel add module`](#keel-add-module) added, are wired into
  the new assembly — on Go `cmd/http/<context>.go` and its test, or
  `cmd/cli/`; on Rust `application/http/src/<context>.rs`, its `mod`
  line in that crate's `main.rs` and the context's crates in its
  `Cargo.toml`, or `application/cli/`; on TypeScript
  `application/rest/src/<context>.ts` (the peer's with its wiring
  test), the context on that assembly's `package.json` and its handler
  on the mediator in its `main.ts`, or `application/cli/` — as the twin
  given the same `keel add module` history has them, in the order they
  were added, a consumer's wiring calling the one it consumes. The
  wiring already there is never read, and an edit to it stays. On the
  JVM families such a modulith is refused, for now (below).
- **The agent harness, re-rendered** where the project has it: the
  runbook, the `run` skill, the layer docs and the lifecycle skill
  speak of the entrypoints, so they are rendered for both — reverting
  an edit to a template-owned harness file, as `keel add agent-harness
--reapply` would, and showing the diffs in the report. It re-renders
  as `--reapply` does, so a patched file that would keep changing
  refuses the run as `keel.reapply-conflict`, before anything is
  written.
- **The shared files**, each entry where one run puts it: the README's
  sections, `settings.gradle.kts` includes and `pom.xml` modules, the
  root `package.json` scripts, the basic Rust crate's `[[bin]]`
  tables. The dev container's definition is attached to the new dev
  environment in the shape the twin's has.
- **The manifest**: the entrypoint's tag, and what the project now
  offers a linked one (`projects`: `peer.api.rest` once it serves
  HTTP), with each new vertical, answer and harness file recorded
  where the twin records it. Nothing already recorded moves.
- **The deferred actions** that make it build: on the JVM the build
  wrapper and the formatter (`gradle wrapper` and `./gradlew
spotlessApply`, or `mvn -N wrapper:wrapper` and `./mvnw
spotless:apply` on Maven), `go mod tidy`, `pnpm install` or
  `npm install`, `cargo check` — the twin's, run again, since the new
  entrypoint's dependencies are not fetched yet.

The word is `cli` or `http`; `server-http`, as the stack finder prints
it, is taken too. It takes one word, and refuses `--reapply`,
`--refresh` and `--consumes` before anything runs.

| Option        | Meaning                                        |
| ------------- | ---------------------------------------------- |
| `-y, --yes`   | Non-interactive — defaults for every question. |
| `--dry-run`   | Print the plan; write nothing.                 |
| `--set <k=v>` | Preset an answer, as `keel add` takes one.     |

An entrypoint the project has is no refusal: the command writes
nothing, exits 0, and says so (_"HTTP server is already an entrypoint
of this project"_). With nothing to run, an answer `--set` for it is
refused, as `keel add` refuses one where everything it names is there
already. It is refused, before a file moves, when:

- there is no keel project here (`keel.not-initialised`, as `keel add`
  words it — but inside a monorepo product, whose root and services
  refuse this command too, or inside a project that refuses to grow,
  it says why the projects it names refuse it, rather than sending you
  there);
- this is a product's root, or a service of a monorepo product
  (`keel.wrong-scope`): the product records each service by the stack
  it was made from, and a service grown in place would no longer be
  that stack. A polyrepo product's service is a repository of its own,
  with no product to record it, and grows as any project does;
- another keel generation scaffolded the project
  (`keel.harness-generation`, as every `keel add` is), naming no keel
  to pin where the project carries no marker, since the keel that
  scaffolded it has no `keel add entrypoint`;
- the word names no entrypoint (`keel.unknown-entrypoint`, naming the
  two it takes);
- no preset is the project with the entrypoint as well
  (`keel.uncoverable-entrypoint`): a browser SPA, which is a product's
  other service rather than an entrypoint of this one; a front end
  such as `web-components`; a plugin's preset with no twin on the
  project's build system and module layout; verticals the project has
  part of which would stop applying, since keel removes nothing it
  installed;
- the entrypoint would break a rule a vertical the project has
  declares (`keel.incompatible`, the rule's own sentence and id), as
  `keel new` of the twin with that vertical is refused — no shipped
  rule mentions an entrypoint, but a plugin's may;
- on the JVM families, a bounded context other than the skeleton's —
  the peer context `--with-peer-context` scaffolds, or one
  `keel add module` added — is wired into the entrypoints already
  there (`keel.contexts-need-rewiring`, naming the contexts): each
  chooses the assemblies it wires into when it is rendered, and keel
  does not yet wire that family's contexts into a new entrypoint. A
  modulith with the skeleton's context alone grows on every family;
- a context the manifest records as consuming none holds the gateway
  keel writes for one consuming another (`keel.contexts-need-rewiring`,
  naming both): `keel add module --consumes` has recorded what a
  context consumes only since #164, so one added before reads as
  standalone, and its wiring in the new entrypoint would not build.
  If it does consume that context, record it —
  `"consumes": "<context>"` on its entry under `"modules"` in
  `.claude/.keel-manifest.json` — and run the command again. This is
  read off the files: the command's pointer from a directory below the
  project names it, but `keel.project-status`, `keel ui` and a
  refusal's action read no files, so they still offer the entrypoint
  there, and its preview refuses it.

A refusal that only this command would lift carries it as its
action: `keel add observability` on a CLI project is refused in the
sentence `keel new --with` gives it, and its hint is _'keel add
entrypoint http' brings observability with it_ (see
[`keel add`](#keel-add)); `keel add --list` lists such verticals under
_After 'keel add entrypoint http':_, `keel.project-status` reports
each back entrypoint, what the command would install, and why it would
refuse where it would (`entrypoints`), and [`keel ui`](ui.md) offers
the command wherever those do.

Two things stay as they are, knowingly. A project linked to another
(`keel link`) that starts serving HTTP now offers that project what it
did not: the other project's record of it is left alone, and the
report says so, naming the `keel link <path>` that brings it up to
date. And a CLI project that took the dev environment as an extra
(`--with dev-env`) keeps the order that extra gave it: the dev
container definition in the shape its attach wrote (`"name"` above
the Compose note, the docker feature first), `### Dev environment`
below `### Dev container` in its README, and its manifest's verticals
as they were recorded. Such a project is not byte for byte `keel new`
of the twin with the same extra; the grid's I10 covers no extras.

Supported on every single-entrypoint backend preset: the twelve JVM
stacks (Quarkus, Spring and Micronaut, in Java and Kotlin, CLI and
REST), `go-cli`/`go-http`, `rust-cli`/`rust-http` and `ts-cli`/`ts-http`
— on the modulith with bounded contexts beyond the skeleton's, Go's,
Rust's and TypeScript's alone for now. The grid holds each modulith
again after `keel add module orders --consumes greeting` and `keel add
module shipping --consumes orders` to the twin given the same history.

## `keel link`

Record a sibling keel project as a **peer** (both ways), so
peer-conditional adapters — the [gateway seam](verticals/gateway.md) —
resolve on both sides.

```sh
cd my-frontend && keel link ../my-backend
keel add gateway                          # frontend half of the seam
cd ../my-backend && keel add gateway      # backend half (CORS + OpenAPI contract)
```

Each project's manifest records the other's projected tags
(`peer.api.rest`, `peer.ui.spa`); see
[peers in the composition model](composition.md#peer-tags-and-products).
Run where there is no keel project, it is refused as
`keel.not-initialised`, pointing at the project the directory is
inside, or the services below it, as `keel add` does.

## `keel ui`

Serve the local scaffolder — the same stacks, verticals and questions
as the commands above, as a form with a live file-tree preview. Runs
entirely on your machine; nothing is uploaded.

```sh
keel ui                 # prints http://127.0.0.1:7420/?token=… and blocks
keel ui --port 0        # let the OS pick a free port
```

| Option              | Meaning                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `-p, --port <port>` | Port to bind. Defaults to `7420`; `0` asks the OS for a free one. |
| `--host <host>`     | Loopback interface to bind. Defaults to `127.0.0.1`.              |

Open the printed URL — **the token in it is what authorises the page**
— and stop the server with Ctrl-C. It is one page for both phases, and
the directory decides the flow. Point it at an empty directory and it
is `keel new`; point it at an existing keel project and it opens on
that project's **Options**, where it becomes `keel add` /
`keel add module` / `keel add entrypoint`: the preset steps collapse
into one **Project** step saying what the project is — read-only, but
for the back entrypoint it can grow — and Options shows the same
**Also scaffold** group a new project gets, with what is installed
ticked and locked, a **Re-render** (`--reapply`) beside each installed
vertical, and every vertical not installed in the parts
`keel add --list` prints — ready, ready once something else is, after
the entrypoint the project can grow with its **Add HTTP server**, and
not for this project with the refusal's own sentence, collapsed —
several ticked into one run. Generate runs `keel add` of what the
ticks add.

Full reference, including the JSON API and how the loopback port is
protected: [the local scaffolder](ui.md).

## `keel docs`

Project the **navigation index** — the rows an agent orients by —
from what keel already knows about this project, and hold the
documents to it.

```sh
keel docs sync [--dry-run]   # recompute the rows and write them
keel docs check              # report drift; exit 1 when there is any
```

### What is indexed, and what is deliberately not

Truth is the manifest plus the resolved registry, never a walk of the
tree. Three regions carry the result, all
[engine-owned](composition.md#owned-regions):

| Region              | In                   | Rows                                                                                                                                 |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `keel:map`          | root `AGENTS.md`     | every documented directory at the top of its chain, plus one per bounded context — and, at a composite product root, one per service |
| `keel:skills-index` | root `AGENTS.md`     | one per staged skill, its description **verbatim** from the skill's frontmatter                                                      |
| `keel:children`     | a nested `AGENTS.md` | the documents immediately beneath it, where there are any                                                                            |

Every row reads `- [Title](href) — description`.

**Indexed** is what has architectural identity and a name keel or an
architectural action creates or renames: directories with a document,
bounded contexts, a composite product's services, skills. **The long tail is not**: function bodies,
call sites, usages, literals. Those churn every commit and have no
stable identity, so any index of them would lie within days — grep is
the right tool there, and the root document says so. _Orient by map,
look up by index, grep the long tail._

### `keel docs sync`

Replays every recorded contributor from the answers the manifest
holds — the motion [`--reapply`](#--reapply-the-update-path) already
performs — recomputes every row, and rewrites **only** the regions
above. Prose, user-authored rows and other contributors' sections
outside those markers come back untouched, and a document keel did
not write is listed as not indexed rather than silently adopted or
deleted. Running it twice writes nothing the second time.

A document that carries no slot is left alone rather than given one;
`check` reports the missing pair instead, since the projection fills
a slot and never invents one in a file it did not write. A slot the
projection has no rows for is the exception: its absence is not drift,
which is why a
[product root](verticals/fullstack.md#the-product-roots-harness) ships
no `keel:skills-index` pair at all — nothing is hoisted there, so a
slot that could only ever be empty would be a promise the root does
not make.

Both work at a **composite product root**, where the rows are services
rather than documented directories. Nothing about the command changes:
the same projection reads the same manifest, so a reworded service
description is the same drift as a reworded directory one.

### `keel docs check`

The same computation, zero writes, and a non-zero exit listing what
it found:

```
keel docs check:
    AGENTS.md <!-- keel:map:begin --> — 5 rows
    AGENTS.md <!-- keel:skills-index:begin --> — 1 row
  ✗ AGENTS.md <!-- keel:map:begin -->: row 'cmd/AGENTS.md' reads 'reworded' where the declaration says 'one directory per deployment unit, one wiring file per context'
  ✗ AGENTS.md <!-- keel:map:begin -->: row '`platform/`' points at 'platform/AGENTS.md', which this project does not have
```

Three drifts it names, each with a different fix: a row's text no
longer matching its declaration, a row pointing at something that is
gone, and a region edited by hand. Because it writes nothing, it is
safe in a pipeline and behind a `command -v keel` probe in the
pre-commit hook.

### The same-commit rule, as machinery

`keel new`, `keel add <vertical>`, `keel add module` and `keel add
entrypoint` run the projection **inside their own apply**, so
keel-driven structural change can never drift: the row for a bounded
context lands in the same commit as the context. An install projects
what it realized over the rows already there — it never saw the
contributors it did not run — while `sync` recomputes the set
outright, which is what prunes a row whose subject is gone. `keel new`
runs every contributor, so the two agree on a fresh scaffold.

What is left for the net is a **human or agent** structural edit:
that is what `check` is for.

## `keel toolchain`

Provision the project's **declared toolchain** — the manifest's
[`toolchain` block](composition.md#the-toolchain-block), written by
[`keel add toolchain`](verticals/toolchain.md). keel is an
orchestrator, never an installer: it renders the chosen provider's
_native_ config file and delegates the installing to that provider's
own idempotent command.

#### The manager dial

Which manager provisions the project is a **choice**, and the choice
list is computed from what the project declared. Every option covers
the whole needs set — a single provider that covers everything, or a
curated **combination** of providers that together do. A partial
choice is never offered (the _coverage invariant_): the persistence
vertical's "no half-installs" rule, applied to choices.

| Provider       | Native file                        | Covers                                  |
| -------------- | ---------------------------------- | --------------------------------------- |
| `mise`         | `mise.toml`                        | every tool in the vocabulary            |
| `asdf`         | `.tool-versions`                   | every tool in the vocabulary            |
| `nvm`          | `.nvmrc`                           | `node` (and `npm`, which ships with it) |
| `corepack`     | `packageManager` in `package.json` | `pnpm`                                  |
| `sdkman`       | `.sdkmanrc`                        | `jdk`, `gradle`, `maven`                |
| `rustup`       | `rust-toolchain.toml`              | `rust`                                  |
| `go-native`    | `toolchain` directive in `go.mod`  | `go`                                    |
| `nvm+corepack` | both of their two files            | the union of theirs                     |

So a JVM project is offered **mise · asdf · sdkman**; a Go project
**mise · asdf · go-native**; a Rust project **mise · asdf · rustup**;
an npm-tagged TypeScript project **mise · asdf · nvm**; a pnpm-tagged
one **mise · asdf · nvm+corepack** — nvm alone cannot reach pnpm, so
it is offered there only inside the combination. The same provider
appearing as a single on one profile and inside a combination on
another is the invariant working as intended, and so is an ecosystem
manager vanishing from a list: sdkman covers the JVM whole and
nothing else, so a project that also declares Node or Go is simply
never offered it.

Three of those records are worth a word each:

- **`sdkman`** is the JVM classic, and `sdk` is a shell function
  rather than a binary — keel reaches it through a login shell that
  sources `sdkman-init.sh`, which is SDKMAN!'s own documented usage.
  `.sdkmanrc` names candidate identifiers (`java=25.0.4-tem`), and
  `sdk env install` installs exactly what it names.
- **`rustup`** needs no activation story at all: `rust-toolchain.toml`
  is honored natively by every `cargo` and `rustc` invocation in the
  directory. The Rust need is pinned as a bare major, because the
  scaffolds track latest stable by construction — and rustup has no
  "series" channel, so keel spells it `channel = "stable"`.
- **`go-native`** is the honest "no manager needed" answer. Since Go
  1.21 the `toolchain` directive in `go.mod` makes any installed Go
  auto-provision the toolchain the module asks for, so keel merges
  that directive in place (the corepack situation — the file belongs
  to the project) and runs nothing at all. That merge is the choice's
  consistency check: `check` reports `go.mod` out of date the moment
  its directive and the block disagree, and `install` writes it back.
  The directive is a _floor_, not a pin — a newer local Go is used as
  is, and only an older one triggers a download.

On a fullstack composite nothing special is needed: each service
answers its own profile's dial through its own manifest, so "sdkman
for the backend, nvm for the frontend" is just two per-service
answers.

The answer is **sticky**: it is recorded in the toolchain block as
one field (a combination is one answer, not two) and followed on
later runs without re-asking. `keel add toolchain --reapply`
refreshes versions and leaves the choice alone. mise is the default
— it heads every list.

#### Prefixes, and the two files that will not take one

The block pins a **major** for the JDK and for Node (`jdk 25`,
`node 22`) — a series, not a release. Most managers take that as it
stands: mise's resolver reads a prefix natively, rustup's `stable` is
a channel, and nvm and corepack are handed something concrete
already. Two do not. asdf documents `.tool-versions` as a **lockfile**
that wants exact versions and forbids `latest`; SDKMAN!'s candidate
identifiers always carry a patch, so `java=25-tem` names nothing
installable.

For those two, keel resolves the prefix **before** it renders, and in
lockfile order:

1. whatever the config already names wins, while it still answers the
   prefix. A lockfile resolves once and then stays put — so `check` is
   not made to flap the day a patch ships upstream, a re-run writes
   nothing, and the steady state costs no process at all;
2. otherwise the **manager** is asked its own way — `asdf latest java
temurin-25`, `sdk list java` — on a first install, or after a pin
   bump moved the series out from under the recorded value;
3. failing both, the prefix renders as it stands and the command says
   so: `Could not resolve a concrete version for: …`. The declaration
   still lands (that is the guarantee), but the manager's own
   installer may refuse the line, and `check` counts it unsatisfied.

keel never invents the patch half — it either reuses what is on disk
or asks the tool that knows. So `.tool-versions` ends up with
`java temurin-25.0.4+7` where the block says `jdk 25`, and `.sdkmanrc`
with `java=25.0.4-tem`.

Bumping the pin from `25` to `26` invalidates the recorded value —
`temurin-25.0.4+7` does not answer `temurin-26` — so the next install
asks the manager again and the lockfile moves once, deliberately.

### `keel toolchain install`

```sh
keel toolchain install                     # asks the dial the first time
keel toolchain install --yes               # takes the default (mise) instead of asking
keel toolchain install --provider=asdf     # pins the answer, replacing any recorded one
```

Renders every member's native file at the project root — plain
ecosystem files that IDEs, images, and colleagues without keel
already understand (the JDK need `jdk@25` is spelled
`java = "temurin-25"` for mise, and `java temurin-25.0.4+7` for asdf,
whose lockfile format is resolved to an exact version first — see
[prefixes](#prefixes-and-the-two-files-that-will-not-take-one); most
tools keep their name and version verbatim) — then runs each
member's own install (`mise trust` + `mise install`;
`asdf plugin add …` + `asdf install`; `nvm install`;
`corepack enable` + `corepack install`; `sdk env install`;
`rustup toolchain install`; and nothing at all for `go-native`,
whose rendered directive _is_ the provisioning). Re-runnable at any
point in the project's life: new laptop, teammate clone, CI runner, pin bump.
An unchanged render writes nothing, and every install invocation is
idempotent by construction.

keel owns those files once you use this command: hand edits are
overwritten on the next run, because the block is the source of
truth. Switching managers later renders the new choice's files and
leaves the old one's where they are — a `.nvmrc` is still a valid
`.nvmrc` — so delete them yourself if you want them gone. (corepack
and `go-native` are the exception in kind, not in rule — they merge
one field into a file the project already owns, `packageManager` in
`package.json` and the `toolchain` directive in `go.mod`, and touch
nothing else in it.) After a keel upgrade,
`keel add toolchain --reapply` refreshes the block to the new pins —
then install again.

When a **manager is absent**, the configs are still rendered and the
command says so loudly — the bootstrap one-liner plus the manual
tool list — and exits 0: the declaration is in place, and the
message tells you how to finish satisfying it. On a combination this
is all-or-nothing: one absent member means no member installs, for
the same reason a partial choice is never offered. Use `check` when
you need an exit code.

Refused with a reason when there is no keel project here
(`keel.not-initialised` — in a directory inside one, naming it, as
`keel add` does, or inside a product root its services), the manifest
declares no toolchain block
(`keel.toolchain-not-declared` — run `keel add toolchain` first; at a
monorepo product root, which declares none and where `keel add
toolchain` is refused, it names the services, where a toolchain goes),
nothing on the dial covers the declaration whole
(`keel.toolchain-uncovered-need`), or the requested (or recorded)
choice does not — `keel.toolchain-choice-unavailable`, naming what
does. That last one is what a project that grew a pnpm need after
choosing nvm gets: a re-choice, never a half-install. A failing
provider invocation surfaces as `keel.toolchain-install-failed`,
carrying the manager's own stderr.

### `keel toolchain check`

```sh
keel toolchain check
```

Reports, without touching anything, whether the declaration is
satisfied: one line per need — `✓` installed, `✗` missing, `?`
unverifiable because its manager is absent — plus whether each
on-disk config still matches a fresh render of the block. A stale
render satisfies yesterday's declaration, so drift counts as
unsatisfied even when every tool it names is installed. Exits 0 when
satisfied, 1 otherwise — the CI-friendly half of the pair.

`check` reads the recorded choice (the default when none is
recorded) and never asks or records one of its own: a query that
prompted would not be one.

## Answers, stickiness, and `--set`

Adapters ask only the questions they need (base package, project name,
git remote, …). Answers are recorded in the manifest — **sticky**
questions (e.g. the vcs answers, the JVM-vs-native image flavor) are
not re-asked on later runs. Any answer can be pre-seeded
non-interactively:

```sh
keel new --stack=quarkus-cli --yes \
  --set walking-skeleton/quarkus-cli-bootstrap:basePackage=com.acme.tool
```

The key format is `adapterId:questionId`; `--dry-run` prints the
questions a plan would ask.

**An answer reaches only the adapter it is keyed to** — or one that
shares the question with it (`Adapter.sharesAnswersWith`: a
framework's CLI and REST bootstraps, the CI provider `ci` and
`distribution` both ask), which reads it as its own — and only the
adapter that read it records it. On a product, each service's manifest records the
answers of the adapters that ran in that service. An adapter reads a
question's answer from what the project records first, and only then
from what was supplied — in both, under its own id before a
sibling's — so a question one of two siblings has settled is settled
for both: `--set walking-skeleton/quarkus-rest-bootstrap:basePackage=org.acme`
on `quarkus-cli-rest` gives both bootstraps `org.acme`, whichever asks
first, and the same value sent under both ids is taken once. `keel ui`
previews an answer by the same precedence, so what it shows is what
the install writes. Before anything is written, and under `--dry-run`
alike, a run refuses:

- a key no adapter of its plan reads — another stack's bootstrap, a
  vertical that is not part of the run, a question its adapter does
  not ask — with `keel.unknown-answer`, naming the adapters that do
  take answers (or the questions the adapter does ask);
- a second, different answer to a question two siblings share, sent
  under the other's id, with `keel.unknown-answer` naming the one read
  first — one project, one package;
- under `keel add`, a key for a vertical already installed, or an
  answer to a question one has settled already (the CI provider, once
  `ci` is installed, for `distribution`), with `keel.frozen-answer`,
  and one for a re-rendered adapter's recorded answers with
  `keel.reapply-frozen-answers`: they are frozen, and reconfiguring
  one is not supported yet — `keel add module` and
  `keel add entrypoint` hold their answers to the same rules. So is an
  answer an older keel recorded for a vertical this project never
  installed (it merged every `--set` into the manifest): the recorded
  one is what is read, so a different one supplied is refused under
  `keel.frozen-answer`, saying so — remove the stale key from
  `.claude/.keel-manifest.json` to answer anew;
- a value outside its question's choices with `keel.invalid-answer` —
  the choices it offers this project, since a choice may declare where
  it applies: `persistence/database-compose:engine=mariadb` is taken on
  a JVM stack and refused on `go-http`, whose driver speaks only
  PostgreSQL. The prompt offers the same list.

Answers already recorded in a manifest are never held to today's
choices, so `--reapply` keeps working after a choice is renamed.

## Environment

| Variable          | Effect                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEEL_PLUGINS`    | Extra [plugin](plugins.md) paths (file or directory), separated by the platform's path delimiter (`:` on POSIX, `;` on Windows), loaded after `<cwd>/.keel/plugins`.             |
| `KEEL_NO_PLUGINS` | Set to anything: plugin discovery is skipped and only keel's own stacks and verticals are registered. Loading a plugin runs its code — see [Trust](plugins.md#trust--read-this). |

Every plugin that loads prints one line naming it and the module it
came from, before any command runs.
