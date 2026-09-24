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

**A directory that is not empty.** `keel new` needs only the absence
of a keel manifest, and it never overwrites a file it did not write.
Two files are adopted instead, on every stack keel ships, because a
repository created on a hosting service and cloned usually holds
them:

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

**A directory inside a product.** `keel new` in a subdirectory of a
monorepo product root that the product does not list as a service —
`keel new --stack=go-http` in `my-product/worker/` — is refused as
`keel.inside-product` before anything is asked: _"this directory is
inside the product at ../, which lists no service here; adding a
service to a product is not supported yet"_. A project scaffolded there
would be neither a service of the product nor a repository of its own.
So is a service the product does list that no longer holds its
project — `backend/` emptied — whatever stack is named: _"this
directory is backend/ of the product at ../, recorded as quarkus-rest;
re-scaffolding a service is not supported yet"_. Scaffolded, it would
be a second repository's hooks and changelog inside the product's.

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
that service would use, the hint under it naming the pair to drop
(`hint: drop 'frontend:persistence' from --with`) rather than another
stack to scaffold, which would be another product. A pipeline or a
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
runs on a single preset runs on a product. Where two services could
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
it (_"quarkus-cli-rest carries both this project's entrypoints and
persistence"_). At the root of a composite product, a vertical the
root cannot carry is refused under `keel.wrong-scope`, naming the
services that can take it, read from each service's own manifest, and
the hint says where to `cd` (`cd backend && keel add persistence`).

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

| Option            | Meaning                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `-y, --yes`       | Non-interactive — defaults for every question.                                                                                               |
| `--dry-run`       | Print the plan; write nothing.                                                                                                               |
| `--list`          | List the verticals and what `keel add` would do with each here — ready, with what it needs first, or why not — then exit.                    |
| `--reapply`       | Re-render installed verticals from their recorded answers.                                                                                   |
| `--refresh <ids>` | Installed verticals to re-render in the same run, comma-separated — the ones the run proposes refreshing. See below.                         |
| `--set <k=v>`     | Preset an answer for a vertical being added (same shape as `keel new`). A re-rendered adapter's recorded answers cannot be changed this way. |

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
`Also installed, which 'keel add' does not re-render: fullstack`. In a
monorepo service, what the product gives it is listed apart, under
`From the product, nothing to add:`, each with where it comes from.

A refusal is printed in the words `keel add <id>` would refuse it
with. A vertical that two sets of prerequisites would each serve is
refused until you name one, but it is listed with the verticals that
need something first, in the sentence that names the choice. A project
from another harness generation — which `keel add` refuses everything
but `agent-harness` on until it is brought forward — is said once,
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
inside the keel project at ../; run 'keel add' there"_); in a polyrepo
product's directory, which holds no manifest of its own, the services
below (_"backend/ and frontend/ below hold keel projects; run 'keel
add' in one of them"_); only where neither is, `keel new`.

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
keel's own; so is a build file keel patches that lacks the block keel
adds its line to. (What a composite product root writes into a service
— its image files — is declared by the root, so `keel add
containerization` there reads it as already there rather than meeting
the files.) A file keel patches that has
been deleted — a `README.md`, a `build.gradle.kts` — is refused as
`keel.path-missing`: restore it, then re-run. Either way nothing is
written.

**A project from another harness generation is refused.** Every
manifest keel creates records the generation of the agent harness it
wrote (`harnessGeneration`). `keel add <vertical>` — with or without
`--reapply` — and `keel add module` refuse a project stamped with an
older generation, or with none, with `keel.harness-generation`, before
a file moves: its sentinels and agent documents live where this keel
no longer looks, and a half-patch would corrupt them. The message names
the way forward — move `AGENTS.md`, `CLAUDE.md` and `.claude/` aside
(keeping `.claude/.keel-manifest.json`), run `keel add agent-harness`
(`--reapply` when it is installed), which re-renders the harness and
restamps the marker, then re-run the command — or pin the keel that
scaffolded the project. `keel add agent-harness` is the one command
the gate lets through. A newer marker asks for a newer keel.

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
gives it (the repository's version control, the image the product
root builds) is refused under that code saying the product root has
it and re-renders it there, and one only a repository root reads (a
pipeline, a release) as `keel add` of it there is
(`keel.wrong-scope`) — neither with advice to install it here, which
would change nothing, or be refused in turn. `--refresh` of either
reads the same. Tags the original install promoted are
re-promoted idempotently (they never double), and the vertical keeps
its original `installedAt`. A three-way merge that preserves your
edits to template-owned files is on the [roadmap](roadmap.md) —
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
languages; there is no keel project here; the project uses the flat
`basic` layout, which has no seam for a second context to meet the
first at (the rule's own reason, as a sentence — _"A bounded context
needs the modulith layout: …"_ — with its id,
`bounded-context/context-needs-modulith`, in the refusal's data); this is a composite product root rather than one service;
the name is already taken; `--consumes` names something that does not
exist, is the context being added, or publishes no seam; or the
project's stack has no bounded-context adapter, in which case the
command would otherwise scaffold nothing at all and report success.

Supported on every stack that ships a modulith: the twelve JVM stacks,
`go-cli`/`go-http`/`go-cli-http`, `rust-cli`/`rust-http`/`rust-cli-http`,
`ts-cli`/`ts-http` and `web-components`.

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
`keel add module`: the preset steps collapse into one read-only
**Project** step saying what the project is, and Options shows the same
**Also scaffold** group a new project gets, with what is installed
ticked and locked, a **Re-render** (`--reapply`) beside each installed
vertical, and every vertical not installed in the parts
`keel add --list` prints — ready, ready once something else is, and not
for this project with the refusal's own sentence, collapsed — several
ticked into one run. Generate runs `keel add` of what the ticks add.

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

`keel new`, `keel add <vertical>` and `keel add module` run the
projection **inside their own apply**, so keel-driven structural
change can never drift: the row for a bounded context lands in the
same commit as the context. An install projects what it realized over
the rows already there — it never saw the contributors it did not run
— while `sync` recomputes the set outright, which is what prunes a row
whose subject is gone. `keel new` runs every contributor, so the two
agree on a fresh scaffold.

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
(`keel.not-initialised`), the manifest declares no toolchain block
(`keel.toolchain-not-declared` — run `keel add toolchain` first),
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
  one is not supported yet — `keel add module` holds its answers to
  the same rules. So is an answer an older keel recorded for a
  vertical this project never installed (it merged every `--set` into
  the manifest): the recorded one is what is read, so a different one
  supplied is refused under `keel.frozen-answer`, saying so — remove
  the stale key from `.claude/.keel-manifest.json` to answer anew;
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
