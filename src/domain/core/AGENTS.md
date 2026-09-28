# Agent conventions — domain/core

<!-- keel:purpose: the engine, the composition adapters and verticals, the stack presets, the handlers -->

What lives here: the engine (`predicate`, `resolver`, `refusals`,
`nearest-id`, `compatibility`, `planner`, `plan-refusal`, `scope`, `add-readiness`, `profile`, `growth`, `contexts`, `converge`, `converge-run`, `dials`, `answers`,
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
since R.3c, the JVM's since R.3d, so every back-end family keel
ships; the refusal stands for a plugin's family whose context adapter
still picks its assemblies as it renders (`tests/support/unsplit-peer.ts`
makes one of Quarkus' peer for the suites that hold its words).
`handlers/add-entrypoint.ts` keeps what is its own — the gates (the
scope, the harness generation, the word, the entrypoint already
there), growth's refusals in their words, the old manifest's check that
reads the files, and the linked-project note — and hands the rest to
the converge run: `convergeOf`'s reading of the entrypoint, which
`converge-run.ts` stages (below). That plan installs only the adapters
that newly match (`installVerticals`' `only`), wires each added context
into the new assembly by a run of `bounded-context` of its own
(`GrowthPlan.modules`, in recorded order, after every vertical the twin
lists, as `keel add module` ran it — on Rust, where each wiring
prepends to the new crate's `Cargo.toml` as observability does, and on
TypeScript, where each splices its handler into the new `main.ts`'s
mediator array, and on the JVM, where each adds its modules after the
kernel (on Maven, after the skeleton's seam) in the new assembly's
build file and its entry to the lists its container reads, that order
is in the bytes; TypeScript's and the JVM's peer wiring must run
first, since it rewrites the one-line form the bootstrap rendered, and
it does, installed beside the bootstrap by `walking-skeleton`),
replays the twin's other verticals for their deferred actions alone
(`actionsOnly`), and records what is new where the twin records it
(its `twin` placement) — so the grid can hold the grown project to the
twin byte for byte, manifest included (I10), with and without a module
history. What a manifest cannot say the handler reads off the files:
a context recorded consuming none that holds the gateway its vertical
writes for a consumer (a `--consumes` from before #164 recorded it) is
refused, the gateway found where `install.ts`' `contributedPaths` says
the vertical's own render puts it — no family's layout in the handler.
The command's pointer from below a project reads it too; the status
and a refusal's action read no files, so they offer the entrypoint
there. A vertical installed in part counts as run, so no harness
replay reaches the adapters it leaves out: the install replays their
harness elements into the buffer itself. So does each context's
replay, and the skeleton and the peer are `walking-skeleton`'s, so the
handler asks the run's retrofit to replay no context — nor does the
twin's order rank a `bounded-context` row — and a registry's is read
nowhere in the run, as `growthOf` reads none. The run realizes the
buffer in the twin's order, and places a harness entry it records anew
by that realization (`finalizeHarness`' `realized`, which counts a
directory pointer the pass kept where it would have written it), as
the twin records it.
A rule the entrypoint's tag breaks is `growthOf`'s to refuse
(`keel.incompatible`): `installVerticals` takes every rule the manifest
it is handed breaks as standing, and the handler hands the run the
grown one (`from`). The same reading gives a refusal its action:
`add-readiness.ts`' `addScopeOf` — the scope both the cards and the
add front door plan on
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

`converge.ts` reads the drill-down once more, for the one operation
every path that installs or re-renders verticals is to call (roadmap
S): pure as `planner.ts` and `growth.ts` are. Its reading
(`compositionOf`, `referenceOrder`, `convergeOf`) is
`keel add entrypoint`'s since S.3, `keel add`'s — `--refresh` and
`--reapply` with it — since S.4, `keel add module`'s since S.5 and
`keel new`'s since S.6, run by `converge-run.ts` (below).
`compositionOf` reads
what a manifest already says `keel new` was given, with no field
recorded for it (DS2): the preset the drill-down places it on, on the
setting of its dials the tags record — `growth.ts`' `settingOf`, how
growth reads a twin — the harness by whether it is recorded, the
extras as what is recorded beyond the preset, and the contexts
`keel add module` added (`contexts.ts`' `addedContextsOf`, the one
reading of them, a leaf both modules and the harness retrofit import,
since `converge.ts` imports `growth.ts` and never the reverse). A monorepo service is read by its
preset's repository-placed verticals it does not record; a product's
service by the links `keel new` of the product made (`peers`, by path)
and what the product gives it of its own accord (`given`,
`StackService.extraVerticals`), which it records. `referenceOrder` is
the order one run of `keel new` of it records — the preset's
verticals, then what the product gives the service in the product's
order, then the other extras in `admit`'s order on the scope `keel new`
plans them on (`presetScope`, or `scope.ts`' `presetServiceScope` for
a service), then `bounded-context` — or the recorded one where no
preset reads back. `convergeOf` takes a request that can
name nothing to take away (DS5) — `add` with the scope and siblings
the caller plans on, `reapply`, `entrypoint` (growth's reading, and
growth's refusals), `module`, `new` from a seed manifest, naming the
product and the service's path where it is one — and returns
the target composition, the run (each step installed, installed in
part, re-rendered or settled), the contexts to wire, and the caller's
placement as it is today: growth's at its twin's rank, every other
appended, until S.8. Growth's plan is read there with the handler's
own pure pieces, moved out of `handlers/add-entrypoint.ts` in S.2:
`placed`, which the run records growth by, and `grownManifest`,
`admitGrowth` and `incomingOf`, which the handler imports back.
`tests/domain/core/converge.golden.test.ts` records the reading on
every cell of the paths golden.

`converge-run.ts` is the one run of that reading, and commits nothing
(S.3). `converge` stages a plan onto a Tree: one `installVerticals`
pass over its steps, each in its posture, then each context it wires
(`wireModules`); the caller's exact answer check (`check`), after the
run and before the harness pass, where both install handlers ran it,
so the same refusal wins; where the harness runs, the retrofit of what
did not run — under the caller's command line, the contexts `keel add
module` added replayed, by keel's own `bounded-context`, or none — and
the restamp; one `finalizeHarness`, the buffer
realized in the placement's order (the twin's for growth, where each
adapter ranks by where it runs in the twin, whose preset is the
target's); the record at the placement (`twinOrder`, `atRank`,
`inPlace`); a `ContributionConflictError` read as
`keel.reapply-conflict` over the re-rendered ids, named in the order
the project records them, where anything re-rendered, and rethrown
otherwise; the refresh proposals, over the steps it installs in run
order, each worded as a later run takes it up (`proposeForLater`) or
as this one could; and the report, the caller's notes before and
after the proposals, and the diffs where anything re-rendered.
`commitConverged` is the one commit after it: the tree, then the
manifest, then the deferred actions. `handlers/add-vertical.ts` keeps
what is its own — naming the verticals, the scope and a product
root's reading of its services, the generation gate and
`bringsHarness`, D4's notes (installed, provided, in the services),
the refusals of a re-render (not installed, or against its own rules)
and the early answer check — and hands `convergeOf`'s `add` or
`reapply` plan to the run, appended and realized in run order, the
recorded contexts replayed where the harness runs, adopted or
re-rendered, and its admission and D4 notes before the proposals,
worded as this run could take them up under `--dry-run`
(`proposeForLater: !dryRun`). `tests/domain/core/converge-run.test.ts`
holds each part on a fixture family.

`keel add module` is the run's caller since S.5. `handlers/add-module.ts`
keeps the name, the seven refusals (`moduleRefusal` among them),
`--consumes` and the generation gate, and hands `convergeOf`'s reading
of one context to the run. `wireModules`, the replay that wires a grown
assembly's contexts, wires it too: every adapter of keel's
`bounded-context` the tags match, and, as the context the run adds
(`ConvergeModule.adds` — the manifest records it only after the run),
consuming what the request names and reading the answers supplied, in
the command's mode. One Tree, one ownership, one harness buffer,
finalized once; the vertical's row appended the first time; no
proposal, since a context installs no vertical and promotes no tag.
The handler then records the context after the others, re-indexes the
root map (the full projection, merged, over the manifest the run
leaves), rehashes what that rewrote, and commits through
`commitConverged`. `contexts.ts`' `addedContextsOf` is the one reading
of the added contexts — growth's, the reading's and the harness
retrofit's: `harness-retrofit.ts` replays each context `keel add
module` added through keel's own `bounded-context`, never one a
registry lists, and neither the skeleton nor the peer, whose harness
elements are `walking-skeleton`'s. No adapter of keel's
`bounded-context` declares a harness element, so today that replay
writes nothing and no suite can see it run.

`keel new` is the run's caller since S.6, once per scope, from the
scope's seed manifest — the empty manifest with the identity no
vertical makes: the preset's and the dials' tags, `projects`, `peers`,
`services`, the scaffolded modules and the harness generation — and
`convergeOf`'s `new` request: the preset's verticals in its order,
never admitted, then what a product gives its service, then the extras
the handler admitted, less what a monorepo service's product root
carries. The run takes the `scaffold` posture (`apply`), the preset's
own rules (`rules`) and the handler's ownership (`owners`), and
realizes the harness once, where the engine used to realize its own
buffer. `handlers/new-project.ts` keeps what is `keel new`'s: the
drill-down and the review, the dials and their gates, D13's adoption,
the directory gates, a product's scopes and the routing of its extras,
the supplied answers held across every scope at once (each run's
`adapters` and `reads`), `crossScopeWrite` (each run's `owners`),
`underService`, and the commit across scopes — every tree, then every
manifest, then each scope's deferred actions.

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
