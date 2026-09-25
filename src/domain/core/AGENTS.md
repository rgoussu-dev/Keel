# Agent conventions — domain/core

<!-- keel:purpose: the engine, the composition adapters and verticals, the stack presets, the handlers -->

What lives here: the engine (`predicate`, `resolver`, `refusals`,
`nearest-id`, `compatibility`, `planner`, `plan-refusal`, `scope`, `add-readiness`, `profile`, `dials`, `answers`,
`supplied-answers`, `apply`, `install`, `actions`, `docs-index`, `hook-settings`), the composition
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
- A bootstrap writes the root `README.md` and `.gitignore` through
  `adapters/adopted-files.ts`, never whole: `keel new` adopts a user's
  own (their content kept, keel's part added once) and refuses any
  other file in the way. The grid's seeded `keel new` cells hold
  every stack to it.
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
wizard's words — the page's read-only Project step — and no front end
reads a tag to say it. See `docs/cli.md` → Finding a stack.

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
