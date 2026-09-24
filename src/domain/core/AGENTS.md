# Agent conventions — domain/core

<!-- keel:purpose: the engine, the composition adapters and verticals, the stack presets, the handlers -->

What lives here: the engine (`predicate`, `resolver`, `refusals`,
`compatibility`, `dials`, `answers`, `supplied-answers`, `apply`,
`install`, `actions`, `docs-index`, `hook-settings`), the composition
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
- Tests follow Scenario + Factory + port (`tests/support/factory.ts`)
  with the shipped fakes — no mocking libraries.

## Four standing notes

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
live in `dials.ts` and both front ends call them; a copy in a page is
the same defect one layer out. See `docs/composition.md` → Conflicts and
`docs/ui.md`.

**Drill-down.** The stack finder is **shape → language → framework →
user-side adapters**, widest first, and both front ends walk the same
tree: `stack-wizard.ts` derives it, the terminal wizard asks it as
questions and `keel ui` as steps, and a step whose answer is already
settled is skipped in both. A shape is not a fourth tag to keep in step:
it is which end each registered entrypoint is driven from
(`ENTRYPOINTS[].side`), counted. That is what put the composite products
on the guided path — they carry no `lang.*` tag, but their services do.
See `docs/cli.md` → Finding a stack.

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

## Naming

A _composition adapter_ (git-init, quarkus-cli-bootstrap, …) is keel
**domain content** — a unit contributing files to a scaffolded project —
and lives in `adapters/` here. It is not a hexagonal adapter of keel
itself; those implement `domain/contract/ports/` and live under
`src/infrastructure/`. The `Tree` port is the composition substrate;
`infrastructure/tree/fs-tree.ts` is its default adapter, and alternative
substrates (e.g. backed by a Yjs CRDT or a remote VFS) would ship as
separate packages implementing the same port.
