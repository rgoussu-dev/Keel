# Agent conventions — domain/core

<!-- keel:purpose: the engine, the composition adapters and verticals, the stack presets, the handlers -->

What lives here: the engine (`predicate`, `resolver`, `refusals`,
`nearest-id`, `compatibility`, `planner`, `plan-refusal`, `scope`, `add-readiness`, `profile`, `growth`, `dials`, `answers`,
`supplied-answers`, `apply`, `install`, `actions`, `docs-index`, `hook-settings`, `rank`), the composition
`adapters/` and `verticals/`, the stack presets as data (`stack-presets.json`) with
the schema and id resolution over them (`stacks.ts`), `handlers/` (new-project,
add-vertical, docs-sync, docs-check), `registry.ts` (`registryOf` and
the shipped source, every refusal naming its origin) and
`RegistryMediator`.

- Never import `application/` or `infrastructure/` — reach the world
  through the ports in `domain/contract/ports/` only. `node:path` is
  acceptable (pure string computation); `node:fs`, `child_process`,
  and template/terminal libraries are not.
- New business operations follow the pattern: command in
  `domain/contract/commands.ts` → handler here with `supports()` →
  wired in `application/cli/executable`.
- Composition adapters render templates via `ctx.templates` and probe
  tools via `ctx.processes`; deferred actions use their env's
  `processes`. No direct `spawn`/`fs` anywhere.
- Where a directory sits is one walk up, `scope.ts`'s `projectAbove`:
  `scopeOf` bounds it at the deepest service path a registered product
  declares — the product a project is part of, for `keel add` and the
  status, and in a monorepo service the product's other services, read
  once from the root's list, which a refusal of what this one cannot
  carry names (`siblingsOf`; `keel new` hands a product's service the
  same, `dials.ts` `siblingScopes`) — while `nearbyProjects` (which
  `keel add`, `keel add module`, `keel add entrypoint`, `keel link` and
  `keel toolchain` word through the contract's `notInitialisedSentence`,
  `keel add module` asking each project it names, off the manifest
  read, whether it takes a context, and `keel add entrypoint` whether
  it sits in a monorepo product) and `keel new` walk to the
  filesystem's root and stop at a manifest keel cannot read. Every walk
  ends at the user's home directory unread (`home`, which the
  composition root passes): 0.1.0-alpha's `keel install --global` left
  a manifest in `~/.claude` that still parses. `keel new` refuses a
  directory holding no manifest inside a project at any depth
  (`keel.inside-project`, or `keel.inside-product` at a product root,
  `productAround`), so it never reads the bounded walk, which stops
  short of `<product>/docs/notes/`; one that holds a manifest, even
  one keel cannot read, is its own, whatever holds it.
- A bootstrap writes the root `README.md` and `.gitignore` through
  `adapters/adopted-files.ts`, never whole: `keel new` adopts a user's
  own (their content kept, keel's part added once) and refuses any
  other file in the way. The grid's seeded `keel new` cells hold
  every stack to it.
- A patch that adds a `### ` section to the root `README.md` places it
  with `rank.ts`'s `placeReadmeSection`: a heading keel writes has a
  rank in `readmeSectionRank`, chosen so that one run of a keel preset
  does not move (`tests/domain/core/shared-files.golden.test.ts` holds
  every scaffold to it), and a section arriving in a later run — a
  `keel add`, or a `--reapply` putting back one the user deleted —
  lands where one run puts it (`rank-arrival.test.ts` holds each
  writer to it). Equal ranks keep their arrival order, so of two
  sections that share one, the one put back alone follows the other.
  The marker guard in front reads the marker in the file's own line
  endings (`eolAware`, or `withEol` over `eolOf`): the rule writes in
  them, so a guard looking for an LF marker in a CRLF README misses
  its own section on every application, and a reapply is refused as a
  divergence (`keel.reapply-conflict`); the CRLF cells of
  `new-project-adoption.test.ts` hold every writer to it.
- The lists the entrypoints share in the build files take the same
  rule, each read in its own syntax into `rank.ts`'s `rankedIndex`:
  `jvm-shared-root.ts`'s `placeIncludes` (through `util.ts`'s
  `codeOnly`, so no comment, not even a `//` holding `/*`, hides an
  include) and `placeModules` (the seed's modules, then the CLI's,
  then REST's, then any other — each module at its own place, so one
  put back alone lands beside its siblings),
  `ts-shared-root.ts`'s root scripts (by name, the order `web-format`
  sorts them into), and `rust-cli-bootstrap.ts`'s basic `[[bin]]`
  (above the HTTP unit's tables). Every other writer of those lists —
  the port fake, the peer context, persistence, an added context — runs
  after the entrypoints and appends, so its entries rank last; a writer
  whose entries must precede an entrypoint's needs a rank of its own.
  The dev container's in-place attach (`dev-container.ts`) is ranked by
  the tags as its README section is: the template's shape on
  `arch.server-http`, the shape an extra dev environment has always
  written elsewhere. The template's shape lists the docker feature
  last, so the entry before it takes a comma: the features are read
  through `codeOnly`, the comma goes where that entry's code ends,
  ahead of a comment trailing it, which JSONC allows, and the feature
  on the first line after it that no comment holds, so a block comment
  the entry's line opens stays whole. The object ends at the brace
  that matches its opener, counted over that code, never at the next
  `  }` line: a features object that closes anywhere else would hand
  its feature to the object after it, a multi-line `"customizations"`,
  and the file would still parse. `shared-files.golden.test.ts`
  holds every scaffold to it; `rank-arrival.test.ts` and each writer's
  own suite hold the writers to going through the rule.
- A patch that adds to a list in source another command may have grown
  — a composition root's handlers — reads the list as it finds it, its
  brackets and commas found in `util.ts`'s `codeOnly` (comments and
  literals blanked), and refuses what it cannot write back as it was as
  `keel.path-conflict` with an `anchor`, never a plain throw
  (`adapters/micronaut-root.ts`, `ts-persistence.ts`, `ts-context.ts`).
- Tests follow Scenario + Factory + port (`tests/support/factory.ts`)
  with the shipped fakes — no mocking libraries.

## Five standing notes

**Registration.** Which stacks and verticals a run may compose from is a
value, not an import. `domain/contract/ports/registry.ts` is the port;
`registry.ts` here builds one from sources and refuses a malformed piece
_naming its origin_; the composition root is the only place that decides
what goes in — keel's own pieces, plus whatever `infrastructure/registry/`
loaded from `<cwd>/.keel/plugins`. A handler that imports `STACKS` or
`SHIPPED_VERTICALS` directly has re-made the catalog a property of the
build, which is exactly what a plugin cannot extend. See
`docs/plugins.md`.

**Compatibility is a declaration, never a hand-written check.** A
`Conflict` on the vertical or stack that owns the rule is read three
times by the engine — to refuse an assembly, to keep the choice off the
terminal's menus, and to answer `keel.dials` for a front end that shows
every dial at once — so the three answers cannot disagree. A branch in a
handler gets only the first, which is how `--with-peer-context` came to
be offered under the flat layout and then rejected. The menu filters
live in `dials.ts` and both front ends call them — `--no-agent-harness`'s
too (`harnessOptional`, `harnessLeftOut`, `switchesHarnessOn`); a copy in
a page is the same defect one layer out. An adapter question's choice
follows the same rule one level down: it carries its own `predicate`, and
`offeredIn` (`answers.ts`) is the one list the prompt, the preview and
the supplied-answer check read — never a guard in `contribute()`. An
answer's source is one precedence too, `answerUnder` over `answerKeys`
(recorded before supplied, an adapter's own id before its siblings'),
read by the install and the preview's prompt alike, and what neither
read is `unusedAnswers` (`supplied-answers.ts`) — refused by every
install front door, reported by the preview; a reader downstream of a
bootstrap finds the project's identity by its tags
(`adapters/project-identity.ts`), never by the first id with answers.
Readiness follows it: `planner.ts` is **the single reading of
readiness**. It reads `Adapter.promotes` and `Vertical.reads` into one
answer — included, ready, needs, unavailable — and an ordered closure,
and every surface asks it: the extras menu (`dials.ts`, both front
ends), `keel.dials`' snap of a page's extras to their closure, and both
front doors through `plan-refusal.ts` (both set a vertical already
there aside with a note — never a refusal — install the rest closed
over its prerequisites, in plan order, and refuse an unavailable
vertical or a tie, before a file moves), and the brownfield cards
(`keel.project-status`, `keel add --list`) through `add-readiness.ts`,
which composes the add front door's own pieces — the product-root
redirect, then the planner over the project's tags, installed
verticals and their rules — so a card carries the refusal the click
would get, word for word (grid I4); where a directory sits in a
product is read once, by `scope.ts` (`scopeOf`, through the
`ManifestStore` port), and handed to the planner as a value — a
product root's services, and for a monorepo service what the product
gives it (`Vertical.placement` on `vcs`/`ci`/`distribution`,
`Adapter.providesInServices` on the product glue) and that it is no
repository root (`PlanScope.member`) — never a list of ids in a
handler: `keel new` reads the same placement to leave those verticals
out of a monorepo service (grid I7), and before it writes anything a
product's service is one scope too, `presetServiceScope` — read by that
service's extras menu (`keel.dials`), by a bare `--with`'s routing to
the one service that takes it — or aside, with a note, where the
services that could have it have it already (`routeExtra`) — and by the install of its
`--with path:id` extras alike; what a product makes of a vertical its
root does not carry, once `--with` has sent one only one service takes
there, is one function both phases read
(`plan-refusal.ts`'s `amongServices`: there already, or refused), so
`keel add` at a product root answers what `--with` sets aside as there
too — an Ok, listed in the status as `provided`
(`add-readiness.ts`'s `productRootReading`); after a `keel add`,
`refreshProposals` names the installed verticals the run changed and
did not re-render — proposed, never done; and where re-rendering one
is all that stands in the way of a vertical asked for, its gap names it
(`ReadinessGap.refresh`, `keel.needs-refresh`) rather than reading as a
capability nothing can add. A new surface asks it too, rather
than re-deriving readiness from `coversFor` or a `promotes` union —
that is how the extras menu came to hide `iac`. A prerequisite
belongs in a predicate the planner can read — a `requires` tag another
vertical promotes, as distribution's container adapters require
`deploy.container-image` — never in a throw inside `contribute()`. See
`docs/composition.md` → Conflicts and `docs/ui.md`.

**Drill-down.** The stack finder is **shape → language → framework →
user-side adapters**, widest first, and both front ends walk the same
tree: `stack-wizard.ts` derives it, the terminal wizard asks it as
questions and `keel ui` as steps, and a step whose answer is already
settled is skipped in both. A shape is not a fourth tag to keep in step:
it is which end each registered entrypoint is driven from
(`ENTRYPOINTS[].side`), counted. That is what put the composite products
on the guided path — they carry no `lang.*` tag, but their services do.
The tree reads backwards too: `profile.ts` places a scaffolded project
on it from its manifest's tags (`axesOf`, the reading a preset is
placed by), so `keel.project-status` says what a project is in the
wizard's words — the page's Project step — and no front end
reads a tag to say it. `growth.ts` reads it with one entrypoint more:
the preset a project would be with it is its **twin**, what adding
that entrypoint must leave byte for byte, and `growthOf` is the one
reading of what that adds, or why it cannot. Its refusal of a bounded
context is structural — no adapter growing runs requires the context's
marker and the entrypoint's tag: for the peer, an installed vertical's,
which newly matches; for a context `keel add module` added, one of
keel's own `bounded-context` — the vertical that command runs, never a
registry's — which growing replays — and
`tests/domain/core/growth-render.test.ts` holds it to what the adapters
render: an adapter that matched before the entrypoint and renders
otherwise after it must be one growth re-renders or one whose context
it refuses. A family lifts it by splitting its context adapters into a
shell and one wiring adapter per entrypoint, each writing only its
assembly's files — Go's since R.3a, Rust's since R.3b, TypeScript's
since R.3c. `handlers/add-entrypoint.ts` runs that reading and nothing
else: it installs only the adapters that newly match
(`installVerticals`' `only`), wires each added context into the new
assembly by a run of `bounded-context` of its own
(`GrowthPlan.modules`, in recorded order, after every vertical the twin
lists, as `keel add module` ran it — on Rust, where each wiring
prepends to the new crate's `Cargo.toml` as observability does, and on
TypeScript, where each splices its handler into the new `main.ts`'s
mediator array, that order is in the bytes; TypeScript's peer wiring
must run first, since it rewrites the mediator line the bootstrap
rendered, and it does, installed beside the bootstrap by
`walking-skeleton`), replays the twin's other verticals for their
deferred actions alone (`actionsOnly`), and records what is new where
the twin records it — so the grid can hold the grown project to the
twin byte for byte, manifest included (I10), with and without a module
history. What a manifest cannot say it reads off the files: a context
recorded consuming none that holds the gateway its vertical writes for
a consumer (a `--consumes` from before #164 recorded it) is refused,
the gateway found where `install.ts`' `contributedPaths` says the
vertical's own render puts it — no family's layout in the handler.
The command's pointer from below a project reads it too; the status
and a refusal's action read no files, so they offer the entrypoint
there. A vertical installed in part counts as run, so no harness
replay reaches the adapters it leaves out: the install replays their
harness elements into the buffer itself. So does each context's
replay, and the skeleton and the peer are `walking-skeleton`'s, so the
run's retrofit replays no context — nor does the twin's order rank a
`bounded-context` row — and a registry's is read nowhere in the run,
as `growthOf` reads none. The handler realizes the
buffer in the twin's order, and places a harness entry it records anew
by that realization (`finalizeHarness`' `realized`, which counts a
directory pointer the pass kept where it would have written it), as
the twin records it.
A rule the entrypoint's tag breaks is `growthOf`'s to refuse
(`keel.incompatible`): `installVerticals` takes every rule the manifest
it is handed breaks as standing, and the handler hands it the grown
one. The same reading gives a refusal its action: `add-readiness.ts`'
`addScopeOf` — the scope both the cards and the add front door plan on
— hands the planner, for each back entrypoint the project could grow
there, the scope `growthOf`'s `grownScope` reads the grown project as
(`PlanScope.grown`), and a gap that is that entrypoint, alone or with a
link, is read again over it (`ReadinessGap.grow`, which
`unavailableRefusal` carries as data, never in the sentence). That
scope's tags carry what the run promotes — the adapters that newly
match, then what it installs, folded by `planner.ts`' `tagsAfter` as a
plan is — or a vertical a plugin's twin feeds, or excludes, would be
read otherwise than the grown project reads it. It is handed in, not
computed where it is read, because `growth.ts` imports the planner and
`scope.ts`: either reading growth itself is an import cycle, which
dependency-cruiser refuses. The status's `entrypoints` reads the
command's own answer, what it would install or why it would refuse
(`handlers/add-entrypoint.ts`' `entrypointReading`). See `docs/cli.md`
→ Finding a stack, and → `keel add entrypoint`.

**The stack presets are data.** `stack-presets.json`, because nothing in
a `Stack` is code — `tags` and `projects` are strings and every other
field names something registered under an id. `stacks.ts` holds the zod
schema for that file, resolves the ids against the registries at load,
and keeps `Stack` as the resolved in-memory shape. It is a JSON _module
import_ rather than a file read: `getStack`/`listStacks` are synchronous
everywhere, so the registry has to resolve at load, and a module import
gets that without `node:fs` or a port in the domain.
`tests/domain/core/stack-registry.golden.json` freezes what the registry
projects onto, the way `version-pins.json` and its test do one level up —
edit a preset, edit the golden.

**Refusals are data, worded once.** A refusal of a vertical or a file is
a `RefusalError` (`domain/contract/refusal.ts`), and `refusals.ts` is the
only place one is put into words: phase-neutral — never `--with` or
`keel add`, since `keel new --with v` and `keel add v` must say one
sentence (grid I5) — and never a tag (I6, hard). A new refusal adds a
kind or a field there and a case to `refusalSentence`, not a string in a
handler; the remedy one command has is its front end's, built from the
fields.

## Naming

A _composition adapter_ (git-init, quarkus-cli-bootstrap, …) is keel
**domain content** — a unit contributing files to a scaffolded project —
and lives in `adapters/` here. It is not a hexagonal adapter of keel
itself; those implement `domain/contract/ports/` and live under
`src/infrastructure/`. The `Tree` port is the composition substrate;
`infrastructure/tree/fs-tree.ts` is its default adapter, and alternative
substrates (e.g. backed by a Yjs CRDT or a remote VFS) would ship as
separate packages implementing the same port.
