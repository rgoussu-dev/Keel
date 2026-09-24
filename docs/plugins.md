# Plugins — stacks and verticals keel did not ship

A **plugin** lets a project bring its own stack or vertical. The pieces
are written against the same composition vocabulary keel's own use —
a stack is a manifest of tags, dials and verticals; a vertical is
dimensions and adapters, each with a `predicate`, `questions` and a
`contribute()` — and the engine reads them through no special case. A
piece that moved from a plugin into keel, or the other way, would not
change a line.

> **Status.** The registration seam and project-scoped discovery are
> in. What is deliberately not in yet is listed under
> [Not yet](#not-yet).

---

## Where plugins are found

```
<project>/
  .keel/
    plugins/
      acme-stacks/
        keel-plugin.js        # the entry module
        assets/               # this plugin's template trees
      one-file-plugin.js      # a plugin can also be a single module
```

keel scans **`<cwd>/.keel/plugins`** — the directory keel is invoked
in — and loads every entry it finds, in name order. An entry is either:

- a **directory** containing `keel-plugin.js` (or `keel-plugin.mjs`), or
- a **`.js` / `.mjs` module** directly.

Nothing else is searched. Not `~`, not an ancestor directory, not
`node_modules`, not the network.

### Two environment switches

| Variable          | Effect                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEEL_PLUGINS`    | Extra plugin paths (file or directory), separated by the platform's path delimiter (`:` on POSIX, `;` on Windows) — for a plugin under development. |
| `KEEL_NO_PLUGINS` | Set to anything: discovery is skipped entirely and only keel's own pieces are registered.                                                           |

### Why a directory and not an npm dependency

A `keel-plugin-*` convention over the project's `package.json` is the
obvious alternative, and it cannot serve the case that matters most.

- **`keel new` runs in an empty directory.** There is no
  `package.json`, no lockfile and no `node_modules` to resolve a name
  against — so the greenfield flow, the whole reason a _stack_ plugin
  exists, would be the one flow plugins could not reach.
- **keel is not a Node tool for Node projects.** It scaffolds JVM, Go
  and Rust repositories that have no reason to carry a `package.json`
  at all, and asking them to add one to register a stack puts a Node
  toolchain in the way of a Gradle project.

A directory is available to every project on day zero, in every
language. So what a keel-scaffolded project can rely on is exactly
this: **a plugin in `.keel/plugins/` of the directory keel is invoked
in is loaded — every language family, greenfield and brownfield
alike.**

`.keel/` rather than `.claude/` because `.claude/` is what keel
_writes_: `keel add --reapply` rewrites files there. A plugin is input,
not output.

---

## Writing one

```js
// .keel/plugins/acme-stacks/keel-plugin.js
const greetingAdapter = {
  id: 'acme-greeting/file',
  vertical: 'acme-greeting',
  covers: ['greeting'],
  predicate: { requires: ['lang.acme'] },
  questions: [{ id: 'who', prompt: 'Greet whom?', doc: '…', default: 'world', memory: 'sticky' }],
  async contribute(ctx) {
    return {
      files: await ctx.templates.render('plugin:acme-stacks/greeting/templates', '', {
        who: ctx.answer('who'),
      }),
      tagsAdd: ['acme.greeting'],
    };
  },
};

export const greetingVertical = {
  id: 'acme-greeting',
  description: 'A greeting, in the acme house style.',
  dimensions: ['greeting'],
  adapters: [greetingAdapter],
  promotes: ['acme.greeting'],
  conflicts: [
    {
      id: 'acme/fancy-needs-modulith',
      when: ['acme.build.fancy', 'layout.basic'],
      reason: "acme's fancy build needs a module boundary — use --module-layout=modulith",
    },
  ],
};

export default {
  name: 'acme-stacks',
  stacks: [
    /* … */
  ],
  verticals: [greetingVertical],
  assets: 'assets',
};
```

The module exports the plugin as its **default** export (a named
`plugin` export also works). Fields:

| Field       | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `name`      | Quoted in every message about this plugin; also its template namespace.    |
| `stacks`    | Stacks to register.                                                        |
| `verticals` | Verticals to register.                                                     |
| `assets`    | Template-tree root, relative to the entry module. Omit if it renders none. |

**A plugin has no runtime dependency on keel.** It is a module
exporting plain data. TypeScript authors get the types (and
`pluginTemplateId`) from `@rgoussu.dev/keel/plugin`, which is erased at
runtime; JavaScript authors need nothing. (The one exception is
refusing a file from inside a patch — see
[A file in the way](#a-file-in-the-way).)

### Templates

Adapters render trees through the `TemplateSource` port, whose ids are
paths under keel's own `assets/`. A plugin's trees are not there, so
its ids carry a namespace:

```
plugin:<plugin name>/<path under the plugin's assets dir>
```

`pluginTemplateId('acme-stacks', 'greeting/templates')` builds that
string; the format is stable, so a dependency-free plugin may spell it
directly. An id naming a plugin that declared no `assets` fails saying
so — it never falls through to keel's own assets.

### Deferred actions

An adapter may emit `actions` beside its files — shell-outs and
anything else that touches state outside the `Tree`. A plugin's are
run exactly like a shipped adapter's:

- **after `tree.commit()`**, so an action may rely on the files the
  adapter wrote already being on disk;
- **through the `ProcessRunner` port** it is handed, never by
  spawning directly, so a dry run and a test can see what it would do;
- **in adapter resolution order**, and within an adapter in
  declaration order;
- **not at all under `--dry-run`** — `keel new` stops before the
  commit, so the action's `description` is all a user sees. Write that
  description as the one line it will be: it is the only declaration
  of a side effect the user gets before it happens.

An action that throws fails the run, naming the action id.

### Skills

An adapter may contribute Claude Code skills beside its files — as
**content-carrying `SkillSpec`s**, never as paths for the engine to
resolve:

```js
skills: [
  {
    name: 'greet',
    description: 'Read the acme greeting aloud. Use when asked to greet.',
    body: '# Greet\n\nRead GREETING.md and greet the user.',
  },
],
```

The engine validates the spec, renders the frontmatter with its own
serializer, and stages `.claude/skills/greet/SKILL.md` with a
provenance record in the manifest — exactly as it does for a shipped
adapter's skills, no special case. Two things to hold to:

- **Declare every name on the vertical**: `skills: ['greet']` beside
  `promotes`. The installer refuses a staged skill the owning
  vertical does not declare.
- **One owner per name.** A skill name two adapters of a run both
  contribute is a hard refusal naming both origins — same posture as
  a registration collision.

The full rules live in
[Composition → Harness contributions](composition.md#harness-contributions).

### Hooks

A Claude Code hook ships the same way — a **content-carrying
`HookSpec`**, never a `files:` entry or a hand-edited
`.claude/settings.json`:

```js
hooks: [
  {
    name: 'acme-lint-reminder',
    event: 'PostToolUse',
    matcher: 'Edit',
    script: '#!/bin/sh\necho "acme: run acme lint before committing." >&2\n',
    reminders: ['acme: run acme lint before committing.'],
  },
],
```

The engine stages `.claude/hooks/acme-lint-reminder.sh` executable,
wires one settings entry for it, and records its provenance. What to
hold to:

- **Declare every name on the vertical**: `hooks: ['acme-lint-reminder']`.
- **Shell only.** A `sh` or `bash` shebang, and no `node`, `npx`,
  `jq`, `python`, `deno` or `bun` in the script — the project it lands
  in may have none of them.
- **Declare every reminder.** Each message the hook can feed back into
  the agent counts against a budget of five per project, and keel's
  own hooks leave two of those for plugins. A run over the budget is
  refused before anything is staged.
- **One owner per name**, as for skills.

A project turns one hook off by listing its name under
`env.KEEL_DISABLED_HOOKS` in `.claude/settings.json`. The full rules
live in [Composition → Hooks](composition.md#hooks).

### Per-directory docs

A note that belongs to one directory of the project ships as a
`DocSection` — a section of that directory's `AGENTS.md`, which keel's
own verticals may be writing too:

```js
docs: [
  {
    directory: 'infrastructure/acme',
    section: 'acme-client',
    description: 'the acme API client and its fake',
    body: '## Acme client\n\nRun `acme mock` before the contract tests.',
  },
],
```

The engine lands it as an owned region of
`infrastructure/acme/AGENTS.md` (seeded with `docSeed`, exported from
`@rgoussu.dev/keel/plugin`, so it composes with any other contributor's
section), writes the `CLAUDE.md` pointer beside it, and adds a row for
the doc to the root map. Pick a section name no other vertical uses on
that directory — a second claim is refused — and carry only what an
agent cannot read off the tree. The full rules live in
[Composition → Per-directory docs](composition.md#per-directory-docs).

### Owned regions

A patch on a file the project (or another vertical) also writes owns
**one or more regions** of it — usually one — and declares them so the
engine can hold the patch to them:

```js
patches: [
  {
    target: 'AGENTS.md',
    regions: [{ begin: '<!-- keel:acme-notes:begin -->', end: '<!-- keel:acme-notes:end -->' }],
    apply: (existing) => /* replace what lies between the markers, nothing else */,
  },
],
```

TypeScript authors write the same thing as
`regionPatch({ target, region: markdownRegion('acme-notes'), body })`
from `@rgoussu.dev/keel/plugin`, which also supplies the transform
(`upsertRegion`) — replace between the markers, land a fresh region
when there are none, refuse a broken pair. A plain-JavaScript plugin
spells the two marker strings and its own replace; what the engine
checks is the declaration, not how the transform was written.

Two things to hold to:

- **Stay inside.** A transform that changed anything outside its
  declared regions — whitespace beside a region included — or removed
  a region the file already carried is refused naming the adapter, on
  install and on `--reapply` alike.
- **One owner per region of a file.** The same region declared by two
  adapters of a run on one target is a hard refusal naming both, and
  the `keel:map` / `keel:skills-index` slots of `AGENTS.md` are the
  engine's — declaring one is refused naming the engine.

### Conflicts

A plugin's `Conflict` is read exactly as a shipped piece's:
[once to refuse an assembly, once to keep the choice off the
menu](composition.md#conflicts). Declare it on the piece whose
capability is constrained — the vertical, or the stack whose
combination of dials is — never centrally. It binds whatever comes
after its piece, too: a vertical whose tags would break a rule an
installed vertical declares is read as unavailable on that project's
card, refused by `keel add` in the rule's own sentence, and — should a
tag slip past the plan — refused by the install loop once it is
folded in, before anything is written.

### Answer choices

A choice only some projects can take says where it applies with a
`predicate` of its own — the shape an adapter's is, matched against
the tags of the project being asked:

```js
choices: [
  { value: 'sqlite', label: 'SQLite', doc: '…' },
  { value: 'duckdb', label: 'DuckDB', doc: '…', predicate: { requires: ['runtime.jvm'] } },
],
```

Where the predicate does not match, the choice is not offered: the
terminal prompt and `keel ui` leave it out, and a `--set` naming it is
refused as outside the question's choices (`keel.invalid-answer`)
before anything is written. That is the whole of the check — do not
refuse the choice again inside `contribute()`, where it would reach a
user who picked it from the list. Two things to hold to:

- **A choice without a predicate is offered everywhere** its adapter
  runs, as every choice was before the field existed.
- **The `default` must be offered wherever the adapter runs**: `--yes`
  resolves to it, and a default the project is not offered is reported
  as the plugin's bug, not the user's.

### A file in the way

A file keel will not overwrite is refused as `keel.path-conflict`, and
a patch target the project no longer holds as `keel.path-missing`, each
naming the file. The files and patches your `contribute()` returns are
held to that for you — one already on disk that a file would
overwrite, one a patch targets that is gone — so a plugin writes
nothing for either.

The one case keel cannot see is your own patch transform finding that
the file is not one it can patch, because it lacks the block your lines
go inside. For that, `PathConflictError` (and `PathMissingError`) come
from `@rgoussu.dev/keel/plugin`:

```js
import { PathConflictError } from '@rgoussu.dev/keel/plugin';

if (!existing.includes('plugins {')) {
  throw new PathConflictError('build.gradle.kts', 'acme/format', "'plugins {' block");
}
```

The user then gets `keel.path-conflict` naming the file, in the
sentence keel uses for its own. Unlike the helpers beside them these
are classes, and keel knows them by identity: a helper works as well
bundled into the plugin, but these hold only when imported from the
very copy of keel that runs it — a project that depends on keel and
runs that copy. A bundled copy is an `Error` of your own to keel,
printed by the terminal as its message and answered by `keel ui` as a
500; and where there is no keel to import at all — `keel new` into an
empty directory — the import fails and the plugin does not load.

### What an adapter promotes, and what a vertical reads

Two optional fields tell keel's planner how your pieces relate to the
rest, so that what it offers ahead of an install and the order it
installs in are right. A plugin declaring neither keeps working
exactly as before.

```js
const nativeAdapter = {
  id: 'acme-release/native',
  // …
  promotes: ['acme.native'], // its own share of the vertical's promotes
};

export const releaseVertical = {
  id: 'acme-release',
  promotes: ['acme.native', 'acme.image'],
  reads: ['persistence', 'acme-metrics'],
  // …
};
```

- **`Adapter.promotes`** — the tags this adapter may add: a subset of
  its vertical's `promotes`, which stays the union over all of them.
  Declare it where the adapters of one vertical add different things,
  so a project whose matching adapter adds only `acme.native` is not
  offered what `acme.image` would enable. Absent, the adapter is read
  as promoting the whole union — which may offer your vertical where
  it cannot deliver; the install still refuses such a project
  truthfully, only later. A `tagsAdd` outside a declared list fails
  the install as the plugin's bug.
- **`Vertical.reads`** — verticals whose presence your `contribute()`
  reads (`ctx.manifest.verticals`), so that in one run yours installs
  after them. It orders; it does not require. An id no one has
  registered is ignored — reading another plugin that is not installed
  is fine — but a cycle of reads is refused at load. Once yours is
  installed, a `keel add` of a vertical it reads proposes re-rendering
  yours (`--refresh`), since it was rendered without it.

Name only what you really read. A pair that reads each other is a
cycle keel refuses; if each side already adapts to the other either
way round, declare neither.

**A prerequisite is a `requires` entry.** When your adapter needs
another vertical installed first, require a tag that vertical
promotes, in the adapter's own predicate — never check for it inside
`contribute()`. The planner reads the predicate, so the extras menu
offers your vertical as _needs …_ naming the other, `keel ui` ticks it
for the user, and `keel new --with` and `keel add` install it first
when the user names yours alone, saying so in the plan's first note.
A check inside `contribute()` is seen by none of them: your vertical
is offered where it cannot install, and refused only once the install
reaches it. keel's own `distribution` works this way — its container
adapters require the `deploy.container-image` tag `containerization`
promotes. When two verticals would each supply what yours requires,
the planner does not choose between them: the set is refused as
`keel.missing-prerequisites`, naming both, and the user names one.

### Where a vertical goes in a product

Two more optional declarations, for pieces that meet a composite
product. Both are read by keel itself — never re-checked in your
`contribute()` — and neither is a tag.

```js
export const pipelineVertical = {
  id: 'acme-pipeline',
  placement: {
    scope: 'repository',
    because:
      'its workflow is read only at the repository root, which in a monorepo is the product root',
  },
  // …
};

const productGlueAdapter = {
  id: 'acme-product/compose',
  // …
  providesInServices: { vertical: 'containerization', stacks: ['acme-http', 'web-components'] },
};
```

- **A vertical that writes repository-root files declares
  `placement`.** Git's own directory and hooks, a CI provider's
  workflows, a release pipeline: written inside a monorepo product's
  service, none of it is ever read. With a `placement` of scope
  `'repository'` and a `because`, `keel new` leaves your vertical out of a
  monorepo product's services — the product root carries the
  repository — and `keel add` in such a service reads it as there
  already when the product root has it, and refuses it otherwise, as
  `keel.wrong-scope`, in the words of your `because` (which finishes
  _"… cannot go in a monorepo service:"_). A vertical needing yours is
  refused there too, naming it. A polyrepo service is a repository of
  its own and takes it. Registration refuses a blank `because`, or a
  `scope` other than `repository`.
- **Product glue that builds something inside its services declares
  `providesInServices`** on the adapter that writes it: the vertical
  whose part it builds, and the service stacks it builds it for — and
  it writes exactly those, reading its own declaration, so the two
  cannot disagree. In a monorepo service whose stack is listed, that
  vertical then reads as already there, and `keel add` of it adds
  nothing rather than meeting your files as `keel.path-conflict`; in
  one whose stack is not listed it stays to add, and the product's
  `keel new` report says so.

---

## Trust — read this

**Loading a plugin runs its code.** An `import` evaluates the module's
top level, and `contribute()` then writes to your filesystem through
the `Tree` port. keel does not sandbox any of that and cannot: a
composition adapter's entire job is to produce files, and a deferred
action's is to run commands.

What this step does about it:

- **Discovery never leaves the project.** Only `<cwd>/.keel/plugins`
  and paths you name in `KEEL_PLUGINS`. keel never reads `~`, never
  resolves a package by name, and never fetches. A plugin therefore
  arrives through the same review your project's own code gets — it is
  a file in your repository.
- **Loading is never silent.** Every run prints one line per plugin,
  naming it and the module it was loaded from, before anything else
  happens.
- **There is an off switch.** `KEEL_NO_PLUGINS=1` skips discovery
  entirely — for running keel over a repository you have not read.
- **Nothing is shadowed by accident.** A plugin claiming an id keel
  already ships is refused, naming both claimants, rather than
  silently replacing the shipped piece.

What it does **not** do: sandbox execution, prompt for permission,
verify a signature, or restrict what a plugin's deferred actions may
run — and a deferred action is a shell command, so that last one is
not a small gap. Treat a keel plugin exactly as you would treat a
build script committed to the repository, because that is what it is.

---

## When a plugin is wrong

Every failure names the plugin, never the engine. Before the module
loads there is no name to quote, so those messages name the path.

| What went wrong                             | What you see                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| The module throws at load                   | `keel plugin '<path>' failed to load: <the original error>`                         |
| The directory has no entry module           | `keel plugin '<path>' has no entry module — expected keel-plugin.js …`              |
| No plugin exported                          | `keel plugin '<path>' exports no plugin — export it as 'default' …`                 |
| A malformed `Conflict`                      | `plugin 'x' vertical 'y' declares a malformed conflict: …`                          |
| A dimension none of its own adapters covers | `plugin 'x' vertical 'y' declares dimension 'z', which none of its adapters covers` |
| An adapter promoting beyond its vertical    | `plugin 'x' vertical 'y' adapter 'y/a' promotes 't', which the vertical does not …` |
| A cycle of `reads`                          | `plugin 'x' vertical 'y' reads in a cycle: 'y' → 'z' → 'y' — …`                     |
| A `placement` with no reason                | `plugin 'x' vertical 'y' declares a placement with no 'because' — …`                |
| An id keel already ships                    | `plugin 'x' registers vertical 'y', which is already registered by keel`            |
| An id another plugin already claimed        | `plugin 'x' registers stack 'y', which is already registered by plugin 'z'`         |

The dimension check is the static half of the resolver's. `coversFor`
asks whether a dimension is covered _for a tag set_ and answers "no"
both for a typo and for a legitimate miss; asking it without tags
separates them, so a typo fails at load naming the plugin rather than
eight questions later as a coverage refusal that cannot tell a typo
from a project of the wrong shape.

Registration failures **throw** rather than returning a `Result`: they
happen at the composition root, before there is a command to answer.
The CLI turns the throw into stderr and exit 1.

---

## How it works inside

`STACKS` and `VERTICALS` used to be module-level constants that
handlers imported directly, which made the catalog a property of the
_build_. They are now reached through the
[`Registry` port](../src/domain/contract/ports/registry.ts):

```
application/cli/executable/main.ts     ← the only place that decides what is registered
  infrastructure/registry/plugin-loader.ts   finds and imports plugins  (I/O)
  domain/core/registry.ts                    registryOf([shipped, …plugins])  (checks)
  infrastructure/template/routing-template-source.ts   routes plugin: ids
        ↓ InstallDeps.registry
  domain/core/handlers/*                     read the port, import no registry
```

**A port, not a mutable registry with a load step.** Both would let a
plugin in; only one keeps the rest of the engine testable. A mutable
registry is process-wide state with an ordering requirement — every
read bets the load already happened, two runs in one process cannot
see different catalogs, and a test registering a fixture piece leaks
it into whatever runs next. An injected port has none of that:
`InstallDeps` already carries every other collaborator the same way.

It also puts plugin loading where it belongs. Reading a directory and
importing a module is I/O, so the loader is an infrastructure adapter,
and `.dependency-cruiser.cjs` forbids `domain/core` from importing
`infrastructure/` — the engine cannot acquire a filesystem habit by
accident. `domain/contract` may not import `domain/core` either, which
is why the `Stack` vocabulary moved to
[`domain/contract/stack.ts`](../src/domain/contract/stack.ts), beside
`Vertical`'s.

`keel.catalog` reads the same port, so a plugin's stack renders in
[`keel ui`](ui.md) with no change to `keel ui`.

---

## Not yet

Deliberately out of this step, in rough order of likely usefulness:

- **An ancestor walk.** Only `<cwd>/.keel/plugins` is scanned, so a
  monorepo root's plugins do not serve a subdirectory unless
  `KEEL_PLUGINS` names them.
- **A published-package convention.** Sharing a plugin across
  repositories means vendoring the directory today. Whatever replaces
  that has to work for a Gradle project with no `package.json`; see
  above.
- **Explicit shadowing.** Replacing a shipped stack with your own is
  refused rather than opt-in.
- **A `keel plugins` command** listing what is registered and from
  where. `keel new --list` shows the pieces; nothing shows their
  origin but the load line.
