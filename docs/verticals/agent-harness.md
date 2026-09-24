# `agent-harness` — agent documents, skills and hooks

The agent workflow kit for a scaffolded project. All 28 single-service
presets install it immediately after `walking-skeleton` and before
`code-style`. Its six adapters own the same files the walking skeleton
previously emitted; the default project files stay byte-identical.
The manifest also records `agent-harness` and `agentic.harness`.

```sh
keel new --stack=go-cli --yes                 # harness included
keel new --stack=go-cli --no-agent-harness --yes
keel add agent-harness                       # adopt in an existing project
keel add agent-harness --reapply              # refresh an installed harness
```

In `keel ui` the opt-out is the **Agent harness** chip under the
Options step's _Comes with_ list, pressed off. Opting out emits no
agent documents, loading shims, skills, settings or hooks. The project
manifest under `.claude/` remains machinery, and `code-style` still
installs formatter configuration. Adding the harness
later re-renders installed contributors from their recorded answers,
non-interactively, realizing only their declared harness elements.
Every recorded bounded context is replayed with its transient module
selector and recorded `consumes` peer so a grown project gains its
per-module declarations too. Repeated-question answers reuse their recorded
values during adoption; ordinary installs retain their repeat behavior.
Older module records without a `consumes` field replay without a consumer.

## Dimensions and activation

| Dimension          | Covered by                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- |
| `agentic-baseline` | `agent-harness/claude-core`: root document and cross-tool shims                         |
| `agentic-kit`      | one `agent-harness/*-claude-kit` per JVM, Go, Rust, TypeScript or web-components family |

The baseline promotes `agentic.harness`; the family kit promotes
`agentic.claude-kit` and declares the `run` skill. The `harness.*`
namespace stays unclaimed. Tags select and parameterize contributors;
each element belongs to exactly one adapter.

The vertical's own adapters are selected by assembly membership.
Declared harness elements from other verticals are collected across the
run and realized in one final pass against the settled tags. A skill
contributed before the harness installs is therefore included too.
Without `agentic.harness`, the engine reports suppression once:
`skipped N harness elements — no agent-harness in this project`.
Plugins use the same declaration, ownership and activation rules.

Composite services inherit their single-service presets and their default
harness. `--no-agent-harness` applies to standalone single-service installs;
it is refused for composite products — which is what makes every service of a
keel-scaffolded product carry the pair. Product roots do not install this
family-based vertical: the root's own harness is
[`fullstack/product-harness`](fullstack.md#the-product-roots-harness), a thin
index over the services with nothing hoisted to it.

## The emitted `AGENTS.md`

One content file, read by every agent. `AGENTS.md` is the open
convention (Codex, Copilot, Cursor, Gemini CLI, aider and most others
read it natively or through one setting); the shims exist for the
tools that do not, and carry no rules of their own:

- `CLAUDE.md` — one line, `@AGENTS.md`. Claude Code imports the
  spec through it.
- `.gemini/settings.json` — names `AGENTS.md` first in Gemini CLI's
  `context.fileName` list.
- `.aider.conf.yml` — `read: [AGENTS.md]`, loaded read-only on start.

The root is **terse by design — 120 lines at most, keel's regions
included** — because an agent carries it on every turn. What it
holds, in reading order:

1. **Identity and precedence** — what the file is, and that the
   stack section is keel's to maintain.
2. **The stack section** (`<!-- keel:stack-runbook:… -->`), filled by
   the family kit below: commands, dispatch stance, layout map.
3. The `keel:map` slot, which the engine fills with a row per
   [per-directory doc](#per-directory-docs) and per bounded context,
   and the `keel:skills-index` slot, a row per staged skill — both
   written by the index projection
   ([`keel docs sync`](../cli.md#keel-docs), and every install in its
   own apply).
4. **Architecture** — the dependency rule, the dispatch-seam opening
   rule ("commands as data through one seam"; _which_ seam is the
   stack section's business), error→transport, fakes beside adapters,
   IaC.
5. **Tests**, **Workflow**, comments — the universal conventions,
   deduplicated.
6. **Working agreements** in the vocabulary of the
   [augmented-coding-patterns catalog](https://lexler.github.io/augmented-coding-patterns/)
   (Lada Kesseler et al.): orient by map, look up by index, grep the
   long tail; Active Partner; Chain of Small Steps; No Perfect
   Recall; the Sunk Cost tripwire; Offload Deterministic; Noise
   Cancellation; Extract Knowledge; the Canary signal; the Answer
   Injection guard. Mechanical rules — formatting, sizes, comment
   shape — are deliberately absent: they belong to hooks and linters,
   which an agent cannot selectively ignore.

What left the root and why: the dispatch stances of the four
languages a project does not use (a JVM project never needed the Go
stance), the modulith essay (a modulith project gets its own map
instead), "walking skeleton first" (keel just built it), the
principles list, a `/docs-check` command that never existed,
decision dates and the CLI plug. A guard test
(`tests/domain/core/verticals/harness-budget.test.ts`) holds every
non-composite stack, on every layout, under the line and byte budget
and refuses any other family's stance in the file.

## The Claude kit

Beyond the universal conventions, the default scaffold ships the stack's
own agent affordances, resolved from the manifest tags (build system,
framework, entrypoint shape, module layout) — one adapter per stack
**family**, never per `pkg.*` tag:

- **The stack section of `AGENTS.md`**, under sentinel markers
  (`<!-- keel:stack-runbook:begin/end -->`) that the binding spec
  ships empty right under its preamble, so the section lands where an
  agent reads first. Three parts, one shape for all five families:
  - the **command table** — build, test, the commit gate, run and
    probe for exactly the shape that was scaffolded;
  - the **dispatch stance** of this project's language — registry
    Mediator on the JVM and server-side TypeScript, per-use-case
    driving ports on Go, Rust and the frontend — and of no other;
  - the **layout map** — the path grammar of the emitted tree, as
    `<ctx>` / `<peer>` placeholders rather than a listing of today's
    modules (which `keel add module` would date): where a context's
    domain, its peer seam, its `<peer>-gateway`, the assembly's
    per-context wiring file and the migrations live. This is what
    "orient by map" points at: the orientation questions the harness
    evals probe resolve from it without a search.

  The patch replaces its own region and never touches edits around
  it. That is the ownership rule the spec states — keel maintains its
  sentinel regions, the project keeps its notes outside them — and
  `keel add agent-harness --reapply` honours it: the section is
  re-rendered in place, the rest of `AGENTS.md` is left as the
  project has it, and the shims come back pristine. The pre-commit
  hook below follows the same rule around its format step.

- **The pre-commit format hook** keel itself uses
  (`.claude/hooks/pre-commit-format.sh`, wired via
  `.claude/settings.json`): before a Claude-issued `git commit`, it
  auto-formats where the toolchain ships a formatter (`gofmt -w .`,
  `cargo fmt`) and runs the family's fast gate — the same commands
  the `ci` vertical's pipeline runs — so every commit lands green.
  It ships through the [hook seam](../composition.md#hooks): a
  `HookSpec` whose format step is a slot the `code-style` vertical
  fills when it wires a formatter in, so a reapply of the agent
  harness re-renders the hook around that step, never over it. The
  engine wires it into `.claude/settings.json`, which stays the
  project's file: keel adds its one `PreToolUse` entry and leaves
  permissions, env and any other hooks as they are, on scaffold and on
  reapply alike. Its one reminder is the gate's refusal. To turn it
  off, list `pre-commit-format` under `env.KEEL_DISABLED_HOOKS`; later
  applies leave it unwired.
- **A `run` skill** (`.claude/skills/run/SKILL.md`): the
  launch-and-probe loop for the scaffolded shape — dev mode + `curl`
  for the HTTP services, the sample invocation for the CLIs, the Vite
  dev server for the SPA. Contributed as a `SkillSpec` through the
  [skill seam](../composition.md#skills) — the vertical declares the
  name in `skills`, and the engine stages the file with its
  provenance recorded in the manifest.
- **A `diff-size` habit hook** (`.claude/hooks/diff-size.sh`,
  `PostToolUse` on `Edit|Write`): after Claude edits a file it counts
  the uncommitted change — the diff against `HEAD` plus the lines of
  new files — and, once per threshold crossed, says so and names this
  stack's gate to run before committing the part that already works.
  A **reminder, never a gate**: it reinforces the Chain-of-Small-Steps
  working agreement mechanically, because prose in a root document
  does not survive context rot (the catalog's Selective Hearing
  obstacle), and a working agreement nothing enforces stops holding
  around the third hour.

  It is the first Habit Hook because it is the one such check that is
  genuinely language-agnostic — pure `git`, POSIX `sh`, no
  per-language parser — so one script serves all five families.
  Function-size, comment-removal and duplication detectors need real
  tooling per family to avoid regex slop across Java, Kotlin, Go, Rust
  and TypeScript; they are deferred until the evals can price them.

  Two things keep it from becoming noise. It fires **once per band**,
  not once per edit — the last band it spoke at is remembered in
  `.git/`, outside the tree it is measuring — and it exits silently
  wherever it cannot honestly answer: no `git`, no repository, no
  commits yet, `KEEL_DIFF_SIZE_LIMIT=0`. The threshold is that
  variable, defaulting to 400 changed lines and documented at the top
  of the emitted script; to turn the hook off entirely, list
  `diff-size` under `env.KEEL_DISABLED_HOOKS`.

- **One layout lifecycle skill**, and never both of the pair:
  - `add-module` on `layout.modulith` — the procedure `keel add
module` _is_, plus what fails quietly in this family around it:
    the build registration the command performs (and a hand-copied
    directory does not), the per-context wiring class, how this
    framework's container discovers a handler (a `@ComponentScan`
    list that stopped growing compiles and starts perfectly), and the
    dependency scope that keeps the peer's domain off your compile
    classpath. Those are the failures the 24-cell `add-module` e2e
    grid exists to catch, written down where an agent about to add a
    context reads them.
  - `promote-to-modulith` on the flat layout — where each directory
    lands under `modules/<ctx>/`, in this family's own paths, and the
    three rules the shape then carries. `keel` chooses the layout at
    `keel new` and moves no project between them, so the procedure is
    the agent's; the essay that used to sit in the root document is
    now a skill that loads when it is needed and costs nothing when
    it is not.

## Per-directory docs

The context that left the root lands where it binds. Each family kit
ships a short `AGENTS.md` in every layer directory the scaffolded
layout actually has — and only there — with a one-line `CLAUDE.md`
(`@AGENTS.md`) beside it, through the
[per-directory doc seam](../composition.md#per-directory-docs):

| Family         | `basic`                                                | `modulith`                                        |
| -------------- | ------------------------------------------------------ | ------------------------------------------------- |
| JVM            | `domain/`, `application/`, `infrastructure/`           | `platform/`, `modules/`, `application/`           |
| Go             | `internal/domain/`, `internal/app/`, `internal/infra/` | `internal/platform/`, `internal/modules/`, `cmd/` |
| Rust           | `src/domain/`, `src/infra/`, `tests/`                  | `platform/`, `modules/`, `application/`           |
| TypeScript     | `domain/`, `application/`, `infrastructure/`           | `platform/`, `modules/`, `application/`           |
| web-components | `domain/`, `application/`, `infrastructure/`           | `platform/`, `modules/`, `application/`           |

A doc carries only what an agent cannot read off the tree, in this
project's language alone: the recipe for the layer's usual change
naming the real files and ports (`Clock`, `NewGreeter()`,
`registry-mediator.ts`), the wiring it needs, and the silent failure
it is known for — a JVM handler the container never discovered
compiles and starts perfectly; a Go import past `internal/` fails to
build; a TypeScript peer import typechecks clean and only `lint` goes
red; an element-defining package inlined twice kills its bundle's
registrations. Each stays under 30 lines. `persistence` composes its
own section into the family's driven-adapter doc (`tests/` on a basic
Rust crate): the `GreetingLog` and `UnitOfWork` ports, where the
Testcontainers test lives, and that a run without Docker has not
proven the SQL adapter.

Every doc gains a row in the root `keel:map` slot — recomputed by
[`keel docs sync`](../cli.md#keel-docs) — so Codex, Gemini
CLI and the other agents that never auto-load nested files reach it
from the root. The context-budget guard holds each nested doc to its
ceiling, the root plus every nested chain under Codex's 32 KiB
default, and every doc free of the other families' stances.

## Per-contributor catalog (normative)

This catalog is the ownership contract from #132. The root documents,
cross-tool shims, stack runbook, `run` skill, pre-commit hook and its
settings wiring described above are shipped. The final-pass gate and
brownfield replay are shipped here. All other elements below are
planned work under their named issues; catalog membership does not mean
those files or commands are emitted today. The hook seam is shipped
(#136), and so are the per-directory document seam and the family
kits' layer docs (#135). The engine's navigation index is shipped
(#138): `keel docs sync|check` and the same projection inside every
install.

Each row is grounded in the contributor's own artifacts. Prefer skills,
then nested documents, then root doctrine. Root doctrine admits only
sentinel discipline, CI gates, containerization's host-build rule,
code-style co-rendering and VCS trunk discipline: at most two content
lines each, within the 120-line root budget on a maxed assembly.
Skill descriptions stay within two sentences; injected hook reminders
stay at most five, preserving at least two slots for plugins. Whole
files have one owner and reapply pristine; owned regions preserve
surrounding text; future settings merges preserve unowned keys. Every
realized element carries contributor provenance. See the
[contribution model](../composition.md#harness-contributions).

The generation marker is manifest machinery, not a harness element
(#137, shipped): every manifest keel creates carries
`harnessGeneration`, whether or not the project installs the harness.
`keel add` and `keel add module` refuse a project stamped with another
generation, or with none, before a file moves; the remediation is
`keel add agent-harness` (`--reapply` when it is installed), which
re-renders the harness and restamps the marker. See
[`keel add`](../cli.md#keel-add).

**agent-harness (the vertical itself: claude-core + family kits' shared surface)**

- Root `AGENTS.md` ≤120 lines + `CLAUDE.md` pointer + `.gemini`/`.aider` shims (#134); empty `keel:map` / `keel:skills-index` slots (#134); base `.claude/settings.json` incl. per-hook disables (shipped: engine-merged, one entry per hook, `env.KEEL_DISABLED_HOOKS`); root sentinel-discipline line — _never edit inside `keel:_` markers; user content goes outside; a broken pair is refused with the fix named* — the one genuinely cross-contributor doctrine, homed once in the root doc *(decided here, for #134)\*.

**Family claude-kits (jvm/go/rust/ts/wc — inside agent-harness; parameterized by framework × build system × language × layout × shape)**

- Stack-runbook region (shipped through the owned-region seam); `run` skill (shipped through SkillSpec); `pre-commit-format.sh` + settings wiring (shipped through the hook seam, #136), optionally carrying #138's guarded `keel docs check` step (hook content, sourced from #138); per-layer docs + pointers in the layer directories each layout has (shipped through the doc seam, #135); `add-module` skill on modulith layouts / `promote-to-modulith` on flat (shipped, #139) — single owner, exactly one of the two per scaffold; the `add-module` body _covers_ `keel add module`'s assembly-patch/registration behavior and the family's silent failures (container discovery, the `@ComponentScan` list, the seam scope, the `internal/` wall), and bounded-context stages nothing for it; `diff-size.sh` habit hook (shipped, #140: kit-owned, all five families, pure `git` and POSIX `sh`, one reminder); `code-index` skill (gated, #146); rtk wrapper when opted in _(decided here, for #144: opt-in dial on the kit)_.
- **→ #150 (owner: walking-skeleton, below):** the family kits do _not_ own `new-port` — the port exemplars are walking-skeleton files.

**walking-skeleton (after extraction: bootstraps, port examples, peer contexts, build tools)**

- Peer-context seam rules composed into `modules/` docs (seam shipped, #135; content pending).
- **→ #150:** `new-port` skill — the port-example dimension as a procedure (contract port + canonical fake beside the real adapter + Scenario/Factory test, pointing at the shipped exemplar). First non-harness client of #148's final-pass realization.

**bounded-context + the `layout.modulith` axis**

- `modules/` + `platform/` docs on modulith only (shipped by the family kits, #135). (No skill: `add-module` is family-kit-owned, #139.)
- **→ #150:** per-context `modules/<name>/` doc emitted with each `keel add module` (the context's local law: peers meet only at the seam; per-language consequences — Go's facade factory, Rust's infra-crate dependency wall). New work — #135 owns only the directory-level docs.

**code-style**

- The format-step patch is shipped through the owned-region seam and gated as a harness element; it fills the family kit hook's declared slot in the same final pass that stages the hook.
- **→ #150:** `fix-lint` skill (reproduce the CI-only lint gate locally: the exact per-family commands, the scope, why there is deliberately no autofix — the single home for those invocations); root co-render doctrine line (`.editorconfig` is live formatter input on Kotlin/web, a co-render on Java/Go/Rust — editing it alone silently changes nothing; re-sync with `keel add code-style --reapply`).

**ci**

- **→ #149:** `read-ci-failure` skill (fetch the failing run, map each job to its verbatim local command — the pipeline runs the project's own build; lockfile drift as the family gotcha; a red lint step delegates by name to `fix-lint`, never restates its commands); root gates doctrine line (push-only pipeline is a decision, not a missing PR trigger; GitLab flavor: shared `.gitlab-ci.yml` region discipline).

**containerization**

- **→ #149:** `rebuild-image` skill (host build first — the Dockerfile packages, never builds; the exact per-build-system/layout command; on wc stacks the assets-image invariants: entrypoint clears the volume, then copies, then templates `env.js`; nginx stays unmodified); root no-build-stage doctrine line.

**dev-env**

- **→ #149:** `dev-env` skill (compose up/down/inspect what is actually in `dev/compose.yaml` — contents vary with installed verticals); `dev/` nested doc (#135 seam) with the extension rules (`:ro,z` on every bind-mounted config; no second compose file; production infra never goes here).

**dev-container**

- **→ #149:** `.devcontainer/` nested doc (#135 seam) — attached-shape networking (inside the container, dev-env services resolve by Compose service name, not localhost; the dev env is drivable from inside via docker-outside-of-docker); customization caveat (a hand-customized definition blocks the automatic standalone→attached upgrade).

**toolchain**

- **→ #149:** SessionStart hook running `keel toolchain check` (a declared-vs-host gap surfaces before the first cryptic build failure; output is session context, not an injected reminder); `toolchain` skill (the check / install / `--reapply`-after-upgrade triangle).

**persistence**

- `migrate` skill (shipped, #139: one shape over both halves of the `migrations` dial, spelled for the tool the project recorded); Testcontainers note composed into the family kit's driven-adapter doc — `tests/` on a basic Rust crate (shipped, #135).
- **→ #151:** `add-repository` skill (replicate the GreetingLog slice end-to-end: port + SQL adapter + Testcontainers contract test + fake + unit-of-work demarcation, with per-layout/per-language placement); `migrations/` nested doc carrying the persistence doctrine (env-only config; the service never migrates in production — migrations are their own deployment unit; the `UnitOfWork` port is the transaction boundary); Docker-skip caveat in the `tests/` doc (a green suite on a Docker-less host has not proven the SQL adapter — say so before claiming done).

**observability**

- **→ #150:** conventions in the observability package's nested doc (liveness stays dependency-free — a dead database must not restart-storm the fleet; new real dependencies hang on the template readiness check; new propagated fields join the request-context type); `verify-telemetry` skill (monitoring stack up → hit the service → correlation id on response and in logs → find the trace and the counter in Grafana).

**gateway**

- **→ #150:** `add-endpoint` skill, **side-resolved** from the peer tags the vertical already reads: backend variant (extend the resource + the backend-owned OpenAPI contract in the same change — the contract is the pin the peer mirrors), frontend variant (mirror the gateway adapter _and its fake_ from the contract); the full cross-repo procedure appears verbatim only on the monorepo/fullstack shape. Peer-seam facts (contract ownership, CORS covers the dev origin only, API base resolution order) live in the skill body.

**distribution**

- The `deploy` skill is **iac-owned** (#139's AC: "deploy only with iac"); distribution's pipeline facts are body content there, not a second staging.
- **→ #152:** `release` skill (tag `vX.Y.Z` → what the pipeline then does for this family, and where to check the result); `deploy/` nested doc (the 12-factor descriptor invariants: one image for every environment, config rides environment only, only variables the service reads; the shipping doctrine — release on tag push, the pipeline builds the containerization Dockerfile, never a second build definition; CI provider / deploy flavor / image flavor are recorded dials).

**iac**

- `iac/AGENTS.md` nested doc (seam shipped, #135; content pending); `deploy` skill (shipped, #139: the OpenTofu loop over the recorded cloud and flavor, with the workspace-is-the-environment rule and the apply/destroy gate).
- **→ #152:** the secrets doctrine as that doc's content (no secret ever lands in a file; credentials ride the environment; one workspace per environment) — a refinement of #135's row; confirm-gate settings entry for `tofu apply`/`tofu destroy` (the only commands in the kit that mutate billable, stateful infrastructure — force a human gate).

**vcs**

- `commit-msg` Conventional-Commits hook + changelog convention (shipped, #143: `vcs/commit-conventions` and `vcs/changelog`, both domain content, both declinable). **Neither has a harness half, and that is the decision #143 left open.** git already refuses the commit and puts the reason on stderr, where an agent reads it, so a `PreToolUse` gate would spend a reminder slot restating what the agent is about to be told; what the harness half would have bought is bought instead by the rejection message, which names the grammar, the legal types and two examples. A project that installed no harness still gets both conventions.
- **→ #152:** root trunk-branch doctrine line (the user-named `defaultBranch` surfaced to the agent — nothing else exposes it; one line; may fold into #143).

**fullstack (product root)**

- Root pair + shims + `keel:map` over `manifest.services[]` (shipped, #142: `fullstack/product-harness`, which promotes `agentic.harness` at the root because `agent-harness` refuses to install there). Every row resolves without a membership gate, because `keel new` refuses `--no-agent-harness` on a composite stack — every service of a product keel scaffolded carries the pair. No hooks/settings/skills hoisted to the root, and no `keel:skills-index` slot either _(decided here, confirming #142's "likely"; the emitted document states the reason, since a reader who does not find it will conclude the root was forgotten)_.
- **→ #152:** `run-product` skill (the one-command compose story; the two env knobs `BACKEND_URL` / `API_BASE_URL`; a frontend change rebuilds only the assets image — may fold into #142).

**Engine (reserved identity, #133)**

- `keel:map` / `keel:skills-index` / `keel:children` rows via `keel docs sync` (shipped, #138), and the same projection inside every install — a bounded context's row lands in the apply that scaffolds it. The directory the contexts live in is the family kit's `DocSection.indexes` declaration; the engine carries no per-family path. Nothing else: the generation marker is machinery (#137), and the docs-check hook step is family-kit hook content.

**Plugins**

- Any class above, through their own verticals, gated identically.

## Related

- [Walking skeleton](walking-skeleton.md) · [Verticals catalog](README.md)
- [Composition model](../composition.md#harness-contributions) · [CLI](../cli.md)
