# Composition model

The bootstrap is composition, not a template dump. This page defines
the primitives the engine works with and how they combine — it is the
conceptual companion to the [stack catalog](stacks/README.md) and the
[verticals catalog](verticals/README.md).

## The primitives

### Tags

Flat strings with hierarchical-dot naming — `lang.java`,
`framework.quarkus`, `arch.cli`, `pkg.gradle`, `layout.modulith`,
`runtime.graalvm-native`, `arch.hexagonal`. Tags are **facts about the
project**, captured in the manifest at install time and grown by
adapters that promote new capabilities (via `tagsAdd` — e.g. every
image adapter adds `deploy.container-image`).

### Adapters

The single composable unit. Each adapter declares:

- the tags it **requires** and **excludes** (its `predicate`),
- the **dimensions** of its parent vertical it covers,
- any user **choice points** (`questions`),
- ordering hints (`after`),
- a `contribute()` function returning files, patches, deferred
  actions, [skills](#harness-contributions), and tags to add.

A question's **choices** may carry a `predicate` of their own, in the
same grammar, when only some projects can take them: the persistence
engine's `mariadb` requires `runtime.jvm`, and the migrations tool's
`liquibase` excludes it. A choice is offered exactly where its
predicate matches the tags of the project being asked — the terminal
prompt and `keel.preview` list only those, and a `--set` or an install
body naming another is refused as outside the question's choices
(`keel.invalid-answer`) before anything is written. One function
computes that list (`offeredIn`, in `domain/core/answers.ts`), so what
is offered and what is taken cannot disagree. A choice without a
predicate is offered wherever its adapter runs.

> Naming note: a _composition adapter_ (`git-init`,
> `quarkus-cli-bootstrap`, …) is keel **domain content** — a unit
> contributing files to a scaffolded project — not a hexagonal adapter
> of keel itself. Those implement `src/domain/contract/ports/` and
> live under `src/infrastructure/`.

### Verticals

Bundles of adapters under one umbrella (`vcs`, `walking-skeleton`,
`observability`, …), each declaring the **dimensions** a valid install
must cover. The resolver verifies every entry in
`vertical.dimensions` is covered by at least one predicate-matching
adapter; an uncovered dimension **hard-fails the install with a
message naming the gap** — that is why `keel add observability` on a
CLI project refuses to half-install (no probe surface to cover).

The refusal also says what would close the gap, in the words the
project was picked in rather than the engine's. `coverageGap` picks
the adapter _nearest_ to matching and reports its unmet `requires`;
[`refusals.ts`](../src/domain/core/refusals.ts) writes the sentence
from them, naming the vertical by its title:

- an entrypoint the project lacks is named by the label the stack
  finder offers it under — _"Observability needs an entrypoint this
  project does not have: HTTP server — a REST endpoint"_;
- a tag the preset fixes at `keel new` (`lang.*`, `framework.*`,
  `runtime.*`, `pkg.*`, `layout.*`, an `arch.*` that is not an
  entrypoint) is never offered as a remedy, since no command adds
  one — the vertical _"has no adapter for this project's stack"_;
- anything else is a capability another install adds, and is named
  as one the project does not have yet.

The tags still travel, in `ResolutionError.detail.enablers`, for a
front end or an adapter author that wants the engine's view.
`resolveVertical` throws from that same gap, so the refusal a user
runs into and the one a front door shows ahead of time cannot say
different things. At a composite product's root `keel add` reports no
gap at all: a root carries almost no tags, so its nearest adapter is
advice for some other product, and a vertical the root cannot carry is
refused naming the service directories to run it in instead.

A vertical also declares **`promotes`**: every tag installing it may
add, the union over its adapters' `tagsAdd` including the ones only
some answers produce (either container-image flavor, every SQL
engine, either CI provider). It exists because a tag promoted at
install time is invisible to anything reasoning _before_ the install,
and something has to: `keel new --with containerization,distribution,iac`
is a legal composition only because `distribution` promotes the
`dist.container-image` tag `iac` is keyed on, so a front door that
checked coverage flatly would refuse the very composition `--with`
exists for (see [`keel new --with`](cli.md#keel-new)). Over-declaring
is safe — it only defers a refusal to the resolver. Under-declaring
would refuse a legal composition, so the installer checks each
contribution's `tagsAdd` against the declaration and throws on a tag
no vertical claims.

### Stacks

A stack preset (`keel new --stack=<id>`) is **sugar over a list of
tags + verticals**. Pick `quarkus-cli` and the engine seeds
`lang.java`, `runtime.jvm`, `framework.quarkus`, `arch.hexagonal`,
`arch.cli` (plus the `pkg.*` tag of your build-system choice), then
composes the `vcs` and `walking-skeleton` verticals. `quarkus-rest`
swaps `arch.cli` for `arch.server-http` and the same verticals compose
the REST shape.

Nothing in a preset is code — `tags` and `projects` are strings, and
every other field references something registered under an id — so the
presets are **data**, in
[`src/domain/core/stack-presets.json`](../src/domain/core/stack-presets.json).
Adding a stack is an entry there.
[`src/domain/core/stacks.ts`](../src/domain/core/stacks.ts) holds the
zod schema that file must satisfy, resolves each id against the
vertical / build-system / module-layout registries at load, and is
where the resolved `Stack` type lives. A malformed document throws; a
preset naming a piece this build does not carry is dropped with a
`PresetProblem` naming it — which is a load-time error for keel's own
file, and will be the ordinary answer once presets can arrive from a
plugin.

### Conflicts

A `predicate` says when a piece **applies**. A `Conflict` says when an
assembly is **illegal** — a combination of tags that must never be
built, and why:

```ts
{
  id: 'walking-skeleton/peer-context-needs-modulith',
  when: ['modules.peer-context'],
  unless: ['layout.modulith'],
  reason: 'a second bounded context needs the modulith layout: …',
}
```

Two shapes cover what pieces need to say. `{ when: ['a', 'b'] }` is a
**mutual exclusion** — legal apart, illegal together.
`{ when: ['a'], unless: ['b'] }` is a **requirement spelled as its
violation** — `a` is illegal unless `b` is there, and more than one
`unless` reads as "unless any of these".

The evaluation is a predicate's, exactly: all of `when` present, none
of `unless`. Same grammar (trailing `*` globs, no bare `*`), same
matcher, opposite polarity.

**Declared by the piece that owns the rule** — the vertical whose
capability is constrained, or the stack whose combination of dials is
— never in a central table. That is what lets a preset or vertical
arriving from outside this repository bring its own rules with it, and
it is why an assembly reads the declarations of every piece coming
together: neither piece alone knows the whole of it.

**Read three times, which is the point.** The engine refuses an
assembly that violates a rule, naming the rule, its reason and the
tags that matched; it filters the same rule out of every menu and
control, so the choice is never offered in the first place; and it
answers `keel.dials` with the values each dial may still take given
the others, which is the same filtering for a front end that has no
question order to hang it on. A rule stated once cannot have those
answers disagree, which is exactly what a hand-written check kept
failing at: `--with-peer-context` used to be offered against the flat
layout and _then_ rejected.

The third reading exists because a form is not a wizard. `keel new`
settles one dial before offering the next, so every menu it draws is
filtered against a complete tag set. `keel ui` shows every dial at
once from a catalog that describes a preset's dials without knowing
which combination the user is on — so the moment a rule names two
dials together, the page would offer a body the install refuses.
`keel.dials` is what closes that: the page posts the target it holds,
gets back one menu per dial plus the target snapped to them, and
renders from that. See [`keel ui`](ui.md#the-dials-are-narrowed-by-the-same-rules).

Concretely, the menus that narrow as answers land. The first five are
the same functions behind both front ends, in `domain/core/dials.ts`;
the last is brownfield and lives with the project status:

| menu                       | filtered by                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| build system               | some module layout must still complete it legally                                  |
| module layout              | exact — the build system is already settled                                        |
| peer context               | offered only where switching it on stays legal                                     |
| extra verticals (`--with`) | coverage (`coversFor`) **and** the vertical's own rules                            |
| the stack drill-down       | presets no setting of their dials can build are absent from all four steps at once |
| `keel add module`          | `canAddModule` — the control is greyed out where adding a context would be illegal |

A preset is hidden only when **every** setting of its dials is
refused. Anything stricter would take away a preset reachable by
moving a dial.

The last row is brownfield rather than a menu, and the shape is the
same: `ProjectStatusHandler` answers `canAddModule` for a project
already on disk, and a form greys the control out by it. Two rules
say the same sentence about two doors, because two different pieces
own them — `walking-skeleton/peer-context-needs-modulith` for the
second context `keel new --with-peer-context` scaffolds, and
`bounded-context/context-needs-modulith` for the one `keel add module`
adds later.

#### Three kinds of refusal, and only one of them is a conflict

A `Conflict` is about **tags**. That is the whole test, and it is
narrower than "the command said no" — most of what keel refuses is
not a capability sitting badly with another capability. The three
kinds, so the next reader does not re-run the audit:

| kind                 | reads as                                     | lives in                            |
| -------------------- | -------------------------------------------- | ----------------------------------- |
| **tag conflict**     | "capability X cannot sit with capability Y"  | a `Conflict` on the piece owning it |
| **structural fact**  | "this preset/project is not shaped for that" | a check where the shape is known    |
| **capability probe** | "no adapter here would emit anything"        | `coversFor` / `emitsFor`            |

**Structural facts** are the ones that look like conflicts and are
not, because the thing they turn on is not a tag:

- `stack.services` being non-empty is what makes a preset composite,
  and it is why `keel new` refuses `--module-layout`,
  `--with-peer-context` and `--with` on one. Those are refusals about
  _flags that do not apply at a product root_, not about capabilities
  — a composite's services can perfectly well each be a modulith.
- `manifest.services` being non-empty is the same fact brownfield, and
  why `keel add module` sends the user into a service directory — and
  `keel add` too, for any vertical the root's own tags cannot cover.
- `manifest.modules` already holding the name, or holding a
  `--consumes` target with no seam, is manifest **state**: it takes a
  name to check, and a name is not a tag.
- An unknown stack or vertical id, `--layout` that is neither
  `monorepo` nor `polyrepo`, a build system the stack does not list,
  `--with` naming the same vertical twice — input validation against
  what the registry declares.

**Capability probes** ask the adapter set a question no tag answers:
would anything actually be emitted here? `coversFor` and
`coverageGap` ask it of a vertical's dimensions
(`keel.uncoverable-vertical`, `keel.extra-verticals-order`);
`emitsFor` asks it where a dimension cannot speak, because a context
adapter declares `covers: []` (`--with-peer-context` and
`keel add module` both, see [context-support.ts](../src/domain/core/adapters/context-support.ts)).
A probe is not a conflict even where it sits right beside one: after
the layout rule refuses a context on the flat layout, the probe still
has to ask whether this project's _language_ has a context adapter at
all, and that answer changes when an adapter lands, not when a tag
does.

The rule to hold to: **do not invent a tag so a check can become a
declaration.** A tag exists to select adapters and describe a
project's capabilities; one minted to give a conflict something to
match on describes nothing, and the declaration it enables buys no
second reading — which is the only thing that makes moving a rule
worth doing.

### Module layout

A second structural dial beside the build system, carried by a
`layout.*` tag and offered by every stack family except Rust:

| Tag                      | Shape                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.basic` (default) | the flat trisection — one `domain/` (kernel + contract + core) and one `application/` per entrypoint                                                            |
| `layout.modulith`        | one hexagon per bounded context under `modules/<context>/`, shared plumbing under `platform/`, one runnable assembly per delivery typology under `application/` |

Pick it with [`keel new --module-layout=<id>`](cli.md#keel-new) or
answer the prompt. It is **not** a second set of adapters: the same
adapter id renders a different shape, so the manifest answers, the
`after` ordering and every downstream vertical are unchanged. Adapters
that write outside their own template tree read the paths from
`jvmLayout(tags)` in
[`src/domain/core/adapters/jvm-module-layout.ts`](../src/domain/core/adapters/jvm-module-layout.ts)
rather than naming a directory — that helper is the one place the two
layouts are described.

The dial itself is language-neutral and lives in
[`src/domain/core/adapters/module-layout.ts`](../src/domain/core/adapters/module-layout.ts):
the two layout names, the tags that seed them, and the selectable
options a stack lists in `moduleLayouts`. `jvmLayout` is the first of
its per-language **resolvers** — one per stack family, each owning the
paths and the _name_ derivations (packages, artifact ids, import
prefixes) that its language spells differently from the directory
path. `goLayout` is the second, and the one where names matter most:
Go has no relative imports, so every import line is the module path
concatenated with layout depth and context name, and `goLayout` is the
only place that concatenation happens.

A manifest carrying neither tag resolves to `basic`, so brownfield
`keel add` on a project scaffolded before the dial existed keeps
working unchanged.

> Not to be confused with the composite-stack **repository** layout
> (`--layout=monorepo|polyrepo`) below, which decides how sibling
> _services_ live in version control. Module layout is about bounded
> contexts inside one service; repository layout is about
> repositories.

The modulith's whole point is the **`user-side/service` seam**: a
module that needs a peer declares a driven port in its own vocabulary
and implements it in its own `infra/` over the peer's in-process
service adapter. That is the only dependency edge allowed between
modules, and it is what turns "extract this context into its own
service" into a wiring change. See
[the JVM stack page](stacks/jvm.md#module-layout) for the generated
tree.

## Harness contributions

How a piece ships **agent-harness elements** — the `.claude/` workflow
kit and the agent-facing documents — with the code it contributes.
These rules are normative for every harness seam; the skill, hook and
owned-region seams below are live.

**Harness elements ride typed, declarative contribution fields — never
bare `files:` entries or ad-hoc patches.** The engine can only refuse,
report, or gate an element it can identify; a skill hidden inside a
`files:` entry is invisible to all three.

Three ownership patterns, with different reapply semantics:

1. **Adapter-owned whole files.** Exactly one adapter of the resolved
   set owns each file; a second claim is a hard refusal naming both
   origins, and `--reapply` rewrites the file pristine. Skills are
   this class.
2. **Owned regions in shared text.** A sentinel-delimited section of a
   document several parties write — the stack section in `AGENTS.md`
   is the standing example. Reapply replaces the owner's own region
   and never touches the user's prose around it. The patch
   _declares_ the region and the engine verifies the claim — see
   [Owned regions](#owned-regions).
3. **Key-addressed settings merges.** JSON settings composed entry by
   entry, each addressed by what it runs — so a reapply finds keel's
   entries where it left them, adds only what is missing, and never
   rewrites the project's own keys. `.claude/settings.json` is this
   class, and the engine writes it for every hook contributor alike.

Whatever the class, a contribution is **owned by exactly one adapter**
(grouped under its vertical). Tags select and parameterize adapters;
they never own content.

### Activation and final realization

`agent-harness` owns the root document, shims and family kit; its baseline
promotes `agentic.harness`. Every single-service preset installs it after
`walking-skeleton`. `keel new --no-agent-harness` removes that membership.
An opted-out assembly refuses plugin stack tags or other verticals that
would activate `agentic.harness`, before staging files.

Every adapter's `skills`, `hooks` and interim `harnessPatches` are collected across
the whole install run. Only the final, local tag set decides whether they
are realized; a peer's tag never activates this project's harness. Without
the tag, one diagnostic reports the total skipped elements, also carried
by install/preview reports for the graphical plan. Domain files,
patches and formatter configurations still install.

`Contribution.harnessPatches` is the interim region-confined patch seam for
code-style's hook format step. Each patch must declare nonempty `regions`,
verified through the same ownership and confinement rules below. Skills,
hooks and patches retain contributor provenance when realized. The pass
stages every whole file first — skills and hook scripts, across all
contributors — then merges the settings, then runs harness patches, so
code-style's format step lands in the family kit's hook whichever
resolved first. Doc sections land after the harness patches, then
the pointers and the root map rows.

Brownfield `keel add agent-harness` re-renders recorded contributors
non-interactively, including the recorded values of repeat questions,
collecting only their harness declarations. Domain files
and deferred actions are untouched. The transient `bounded-context`
vertical is replayed once per manifest module with synthetic add-module
inputs, which are never persisted. The module record retains its `consumes`
peer so replay preserves the context's dependency; older records without
that optional field replay without a consumer. An unavailable plugin contributor
refuses the adoption before anything is committed.

See the [per-contributor catalog](verticals/agent-harness.md#per-contributor-catalog)
for ownership, currently shipped elements and planned seams.

### Skills

An adapter ships a skill as a `SkillSpec` on its contribution —
**content-carrying** (`name`, `description`, optional
`userInvocable`, `body`, optional `supporting` files), a string
literal or something read through `ctx.templates`, never a path for
the engine to resolve later:

```ts
skills: [
  {
    name: 'run',
    description: 'Launch this service in dev mode and probe it end to end. …',
    body: '# Run the service\n\n…',
  },
];
```

The applier validates each spec against its zod schema (refusing a
malformed one naming the adapter), renders it with the one shared
`renderSkill` serializer, and stages it to
`.claude/skills/<name>/SKILL.md` — plus its `supporting` files beside
it — as an adapter-owned whole file. Each staged file gets a
provenance record in the manifest's `entries`: the owning adapter as
`source`, the target path, and the pristine content hashes.

Two rules the seam enforces:

- **The description is the whole trigger.** `renderSkill` emits
  `name` and `description` frontmatter (and `user-invocable` only
  when the spec sets it) and **never `paths:`** — upstream Claude
  Code discovery mismatches path-scoped skills, so description
  matching is what activates a skill. Write the description as the
  trigger, in at most two sentences.
- **`Vertical.skills` declares the complete set.** Every skill name a
  vertical's adapters may stage, including the ones only some answers
  or tag sets produce — the mirror of `promotes`, for the same
  reason: a skill staged at install time is invisible to anything
  reasoning before the install, and a front end reporting what an
  assembly ships needs the static answer. The installer checks each
  contribution's names against the declaration and refuses an
  undeclared one.

**A component ships a skill only for a procedure its own files make
real** — the no-fiction rule, and the reason the `release` skill was
never emitted. What that produces today:

| Skill                 | Owner                                              | Emitted when             |
| --------------------- | -------------------------------------------------- | ------------------------ |
| `run`                 | the family kit                                     | always                   |
| `add-module`          | the family kit                                     | `layout.modulith`        |
| `promote-to-modulith` | the family kit                                     | the flat layout          |
| `migrate`             | `persistence` (the migrations adapter of the dial) | persistence is installed |
| `deploy`              | `iac`                                              | iac is installed         |

The first pair is exhaustive and exclusive: a project has one layout,
so exactly one of the two ships, and a scaffold carrying both would
read as two contradictory procedures. `migrate` and `deploy` are
absent until the vertical that makes them real is layered, and the
tests assert the absence as well as the presence — a rule with no
negative is an intention.

A plugin's verticals ship skills through exactly this seam — same
schema, same serializer, same collision refusal and provenance, no
special case. See [Plugins](plugins.md#skills).

### Hooks

An adapter ships a Claude Code hook as a `HookSpec` on its
contribution — content-carrying like a skill: the script, the event it
runs on, the reminders it may feed back into the agent's context, and
the **slots** other contributors own inside it:

```ts
hooks: [
  {
    name: 'pre-commit-format',
    event: 'PreToolUse',
    matcher: 'Bash',
    script: renderPreCommitHook(family),
    reminders: [`pre-commit-format: '${verify}' failed. Fix it before committing.`],
    slots: [FORMAT_STEP_REGION],
  },
];
```

The engine validates the spec (`HookSpecSchema`, refusing a malformed
one naming the adapter), stages the script to
`.claude/hooks/<name>.sh` as an executable adapter-owned whole file,
and wires it into `.claude/settings.json` itself — one entry per hook,
running `<shell> .claude/hooks/<name>.sh`. The rules the seam enforces:

- **One owner per name, declared on the vertical.** A hook name two
  adapters of a run contribute is refused (`hook-collision`) naming
  both; `Vertical.hooks` lists every name the vertical may stage and
  the installer refuses an undeclared one — the mirror of `skills`.
- **A hook is a shell script and assumes no runtime.** The script's
  first line is a `sh` or `bash` shebang, and it invokes no Node,
  `npx`, `jq`, Python, Deno or Bun: a scaffolded Go, Rust or JVM
  project cannot count on any of them. keel's own hooks parse as
  POSIX `sh` too.
- **Reminders are a budget.** A project realizes at most five across
  all of its hooks (`HOOK_REMINDER_BUDGET`); a run over it is refused
  (`reminder-budget`) before anything is staged, naming each
  contributor's share. keel's own hooks spend at most three, leaving
  two for plugins — a guard test holds every stack to it. Two are
  spent today: the pre-commit gate's refusal, and the diff-size
  habit hook's nudge.
- **A gate refuses; a habit hook reminds.** The two shipped hooks are
  one of each, and the distinction is the seam's. `pre-commit-format`
  is a gate: it stops a `git commit` that would not be green.
  `diff-size` is a **habit** hook: after an edit it counts what is
  uncommitted and, once per threshold crossed, says so — reinforcing
  the Chain-of-Small-Steps working agreement mechanically, because
  prose in a root document does not survive context rot. A habit hook
  fires once per band rather than once per edit, and stays silent
  wherever it cannot honestly answer; one that breaks a session is
  worse than no habit hook at all.
- **Slots survive a reapply.** `--reapply` rewrites the script
  pristine around what each declared slot holds on disk, so the
  format step `code-style` wired in stays; a harness patch declaring
  that region is what writes it.
- **The settings file is the project's.** The engine merges keel's
  entries into whatever the file holds, returns it byte for byte when
  nothing is missing, and attributes the file's provenance to
  `keel:engine`. Each hook is its own entry, so it can be turned off
  on its own: list its name under `env.KEEL_DISABLED_HOOKS`
  (comma-separated) and every later apply leaves it unwired and
  removes keel's entry for it. The script itself stays staged, so the
  slots other verticals patch keep a target.

A plugin's verticals ship hooks through exactly this seam. See
[Plugins](plugins.md#hooks).

### Per-directory docs

The context that belongs to one directory lives in that directory: a
short `AGENTS.md` beside the code it is about, and a one-line
`CLAUDE.md` pointer (`@AGENTS.md`) beside it. An adapter contributes a
**section** of such a doc as a `DocSection` on `Contribution.docs`:

```ts
docs: [
  {
    directory: 'domain',
    section: 'layer',
    description: 'the contract face — commands, ports, the Clock port and its fake',
    body: '## domain/\n\n…the commands, the wiring file, the silent failure…',
  },
];
```

The engine validates the spec (`DocSectionSchema`: a relative
directory that is not the root, a kebab-case section, a one-line
description), then:

- **lands the section as an owned region** of `<directory>/AGENTS.md`
  (`<!-- keel:<section>:begin -->`), seeded with `docSeed(directory)` —
  a function of the directory alone, so contributors compose one doc
  in any order and a reapply re-renders each section in place. The
  one-owner rule of [owned regions](#owned-regions) holds: a section
  two adapters of a run declare on one directory is refused naming
  both, and no transform may touch another's section or the project's
  notes around them;
- **writes the pointer** beside every doc that has none, attributed to
  `keel:engine`; a pointer the project already has is left as it is.
  Claude Code lazy-loads only nested `CLAUDE.md` files and resolves an
  import relative to the importing file, so the pointer pulls its
  sibling in exactly when files in that directory are touched; the
  agents that read nested `AGENTS.md` natively need no pointer;
- **projects a row per doc into the root `keel:map` slot**, under the
  engine's own identity, so an agent that never auto-loads nested
  files (Codex, Gemini CLI, Zed, opencode) still reaches every doc
  from the root — see [the navigation index](#the-navigation-index)
  below. A section may also declare `indexes: 'modules'`, marking the
  directory the project's bounded contexts live in so the index
  projects a row per context beneath it; the family kit owns that
  layout, and the projection reads the declaration rather than
  carrying five path prefixes of its own.

Docs realize in the same final harness pass as skills and hooks, after
the harness patches, and only under `agentic.harness`. What a section
may carry is held to one rule, **noise cancellation**: the real
commands, the wiring file's path, the silent failure the layer is known
for — anything an agent could derive from the tree does not ship.

### The navigation index

The rows an agent orients by are a **projection**, not a document
anyone maintains: `keel docs sync|check` (and every install, in its
own apply) recomputes them from the manifest and the resolved
registry and writes them into three engine-owned regions —
`keel:map` and `keel:skills-index` in the root `AGENTS.md`,
`keel:children` in a nested one that has documents beneath it — whose
rows are relative to that document, since that is how markdown
resolves a link. Every
row reads `- [Title](href) — description`.

The map's rows come from three declarations, never from a walk of the
tree: a contributor's `DocSection` (a documented directory), the
manifest's `modules[]` beneath the directory a section declared
`indexes: 'modules'` (a bounded context), and the manifest's
`services[]` (a service of a composite product, pointing at that
service's own root document). A single-service project records no
services, so the third contributes nothing there — which is what keeps
the product root a declaration rather than a branch. See
[`fullstack`](verticals/fullstack.md#the-product-roots-harness).

Three rules the projection holds to:

- **Only what has architectural identity is indexed.** Directories
  with a document, bounded contexts, a composite product's services,
  skills — things keel or an
  architectural action creates and names. The long tail (function
  bodies, call sites, literals) is not, and will not be: it has no
  stable identity, so a shipped index of it would lie within days.
- **A skill's row is its own description, verbatim.** The row and the
  frontmatter come from one `SkillSpec.description`, and a sweep over
  every emitted stack holds them byte-identical — two spellings of one
  trigger is exactly the drift the index exists to prevent.
- **An install merges, a sync replaces.** An install realizes only the
  contributors that ran, so it lays its rows over the ones already
  there and drops none; a row several contributors may describe (a
  directory's) keeps the description the first section gave it. `keel
docs sync` recomputes the set outright, which is what prunes a row
  whose subject is gone.

Full reference, including what `check` reports and how it is wired
into CI: [`keel docs`](cli.md#keel-docs).

### Owned regions

A patch on a file several parties write owns one or more **regions**
of it — each a sentinel pair, `keel:<owner>` between the comment
delimiters of the file's syntax — and says so on
`ContributionPatch.regions`. The usual patch owns exactly one; build
it with `regionPatch`, which takes the region, the body that goes
between the markers and, for a shared file no one may have created
yet, the `seed`:

```ts
import { hashRegion, regionPatch } from '@rgoussu.dev/keel/plugin';

patches: [
  regionPatch({
    target: '.editorconfig',
    seed: 'root = true\n',
    region: hashRegion('code-style'),
    body: '[*.acme]\nindent_size = 2',
  }),
];
```

`upsertRegion` is the transform behind it — replace the section
between the markers when both are present, land a fresh one (after
the content by default, `prepend` for a block that reads first,
`keep` for a slot that must already exist) when neither is, and
refuse with the fix when one marker survives without the other. It is
its own fixed point, which is what lets `--reapply` re-render a region
in place. The stack section of `AGENTS.md`, the format step of the
pre-commit hook, the `code-style` blocks of `.editorconfig` and
`.gitattributes` and the two verticals' regions of `.gitlab-ci.yml`
all run through it.

Declaring a region is a claim, and **the engine verifies it on every
apply** rather than trusting the adapter:

- **Confinement.** The transform may change nothing outside its
  declared regions. One that did is refused (`region-escape`) naming
  the adapter, the file and the region. A region the file already
  carries is compared in place, so whitespace beside it is content
  like any other; the file's own edges are forgiven only when the
  transform landed a fresh region, since that moves the last newline.
  A region the file carried must survive: a transform that removes
  it is an escape, while a `whenAbsent: 'keep'` patch leaving a
  markerless file markerless is not.
- **One owner per region of a file.** A region two adapters of the
  run both declare on the same target is refused (`region-collision`)
  naming both; the same markers on two different files are two
  regions, and two spellings of one path (`AGENTS.md`, `./AGENTS.md`)
  are one file, as the Tree takes them. An adapter declaring one twice
  is refused too, and a transform that leaves one of its own markers
  missing is an escape as well.
- **The engine's own regions are claimed first.** The `keel:map` and
  `keel:skills-index` slots the binding spec ships empty, and the
  `keel:children` slot the projection lands in a nested document that
  needs one, belong to the engine — attributed to the reserved contributor identity
  `keel:engine` (`ENGINE_CONTRIBUTOR_ID`), which no adapter may
  register under and which manifest `entries` name as `source` for
  content the engine writes without an adapter. An adapter claiming
  one is refused naming the engine; the engine itself, contributing
  under that identity, re-renders each of its own slots through the
  same seam once a run — a second claim is a region declared twice.

A patch declaring no region is an ordinary chained transform with no
ownership claim; on `--reapply` it may still change its file only
when it is its own fixed point, as before. A region-owning patch
satisfies that by construction.

## One install, end to end

```mermaid
flowchart TD
  U["keel new --stack=quarkus-rest"] --> S["stack preset"]
  S --> T["tags seeded<br/>lang.java · runtime.jvm · framework.quarkus<br/>arch.hexagonal · arch.server-http · pkg.gradle"]
  S --> V["verticals, in order<br/>vcs → walking-skeleton → dev-env → observability → dev-container"]
  T --> R{"resolver:<br/>predicate filter per vertical"}
  V --> R
  R -->|"dimension uncovered"| X["hard fail,<br/>names the gap"]
  R --> Q["questions asked<br/>(or --set / --yes)"]
  Q --> A["adapters contribute"]
  A --> F["files + patches<br/>(the project tree)"]
  A --> D["deferred actions<br/>git init · gradle wrapper · npm install"]
  A --> M["manifest written<br/>tags ∪ tagsAdd · answers · verticals"]
  M --> N["later: keel add a vertical —<br/>resolves against the recorded tags"]
```

The **manifest** is what makes brownfield growth work: `keel add`
re-runs the same resolution against the tags and answers recorded at
bootstrap, so a vertical added months later composes exactly as it
would have on day one.

## Peer tags and products

Two more primitives compose services into **products**:

### Peer tags

A stack declares the tags it _projects_ onto sibling services —
`quarkus-rest` (like every HTTP backend) projects `peer.api.rest`,
`web-components` projects `peer.ui.spa`. Each project's manifest
records its siblings' projections as `peers`, and adapter resolution
runs against **tags ∪ peer tags**. Cross-service elements are
therefore ordinary predicate-selected adapters: the same
[gateway](verticals/gateway.md) adapter fires for any backend
projecting `peer.api.rest`, whatever its language or framework.

```mermaid
flowchart LR
  subgraph frontend["frontend (web-components)"]
    FG["gateway/wc-gateway-rest<br/>requires peer.api.rest"]
  end
  subgraph backend["backend (any HTTP stack)"]
    BC["gateway/*-cors + rest-api-contract<br/>require peer.ui.spa"]
  end
  backend -- "projects peer.api.rest" --> frontend
  frontend -- "projects peer.ui.spa" --> backend
  BC -. "OpenAPI contract<br/>contract/greet.openapi.yaml" .-> FG
```

Brownfield, the projection is recorded with
[`keel link`](cli.md#keel-link).

### Composite stacks

A stack may declare `services` instead of scaffolding in place; each
service is a **full stack installed into its own directory** (own
tree, own manifest) with its siblings' projections in scope. The
repository layout (`monorepo`/`polyrepo`) is the user's choice and is
deliberately **not a tag**: no adapter behaves differently by topology
— what varies (where git runs, whether
[product-root glue](verticals/fullstack.md) exists) belongs to the
orchestrator.

## The toolchain block

The manifest may carry a `toolchain` block — the project's declared
toolchain _needs_, and the contract between keel and the provisioning
engine (roadmap item N): keel records **what** the project requires,
the engine decides **how** to satisfy it.

```json
{
  "toolchain": {
    "schemaVersion": 1,
    "needs": [
      { "tool": "jdk", "version": "25", "source": "jvm-jdk" },
      { "tool": "gradle", "version": "9.4.1", "source": "jvm-gradle-wrapper" }
    ],
    "provider": "mise"
  }
}
```

- **`schemaVersion`** versions the block independently of the
  manifest that carries it. The block is destined to be consumed by
  an external tool once the provisioning engine extracts to its own
  package, so its schema evolves on its own clock; a block written by
  an unknown schema version is rejected loudly, never half-read.
- **`needs`** lists the tools the project requires, one entry per
  tool. `tool` is a **closed vocabulary** covering what the stacks
  require today — `jdk`, `gradle`, `maven`, `go`, `node`, `npm`,
  `pnpm`, `rust` — and growing it is a contract change. `version` is
  spelled the way the project's own files pin it; the optional
  `source` cites the `assets/composition/version-pins.json` entry the
  pin came from, so a registry bump can find every block it should
  touch.
- **`provider`** records the manager choice the provisioning engine
  resolved — one field, even when it names a _combination_
  (`nvm+corepack`): the dial asks one question, so it records one
  answer. Absent until `keel toolchain install` has run once, and
  written by the engine rather than by the vertical, which is why a
  `keel add toolchain --reapply` after a pin bump refreshes versions
  and leaves the choice alone. It is re-validated against the needs
  on every run: a choice the project has outgrown is a loud refusal,
  never a half-install.

An **absent** block means nothing was declared — distinct from a
written block with an empty needs list. The
[`toolchain` vertical](verticals/toolchain.md) writes the block
(`keel add toolchain`, opt-in; `--reapply` refreshes it after a pin
bump — needs upsert by tool, so nothing duplicates), and
[`keel toolchain install`](cli.md#keel-toolchain) consumes it: the
provisioning engine, a bounded context of its own under
`src/domain/toolchain/` that meets the rest of keel only at this
block and the shared ports.

## Further reading

- [Stack catalog](stacks/README.md) — every preset and the tags it
  seeds.
- [Verticals catalog](verticals/README.md) — every vertical, its
  dimensions, its adapters.
- [Binding spec](../assets/project/AGENTS.md) — the conventions the
  composed projects carry.
