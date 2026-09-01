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
runtime; JavaScript authors need nothing.

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

### Conflicts

A plugin's `Conflict` is read exactly as a shipped piece's:
[once to refuse an assembly, once to keep the choice off the
menu](composition.md#conflicts). Declare it on the piece whose
capability is constrained — the vertical, or the stack whose
combination of dials is — never centrally.

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
| An id keel already ships                    | `plugin 'x' registers vertical 'y', which is already registered by keel`            |
| An id another plugin already claimed        | `plugin 'x' registers stack 'y', which is already registered by plugin 'z'`         |

The dimension check is the static half of the resolver's. `coversFor`
asks whether a dimension is covered _for a tag set_ and answers "no"
both for a typo and for a legitimate miss; asking it without tags
separates them, so a typo fails at load naming the plugin rather than
eight questions later as `no adapter covers dimension 'boostrap'`.

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
