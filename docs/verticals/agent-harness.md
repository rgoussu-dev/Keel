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

Opting out emits no agent documents, loading shims, skills, settings or
hooks. The project manifest under `.claude/` remains machinery, and
`code-style` still installs formatter configuration. Adding the harness
later re-renders installed contributors from their recorded answers,
non-interactively, realizing only their declared harness elements.
Every recorded bounded context is replayed with its transient module
selector so a grown project gains its per-module declarations too.

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
it is refused for composite products. Product roots do not install this
family-based vertical; their service-membership activation rule belongs to #142.

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
3. Empty `keel:map` and `keel:skills-index` slots, reserved for the
   index projection (`keel docs sync`, a later wave).
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
  The format step sits between sentinels the `code-style` vertical
  fills when it wires a formatter in; a reapply of the agent
  harness re-renders the hook around that step, never over it. The
  `.claude/settings.json` that wires the hook is the project's file:
  keel adds its one `PreToolUse` entry and leaves permissions, env
  and any other hooks as they are, on scaffold and on reapply alike.
- **A `run` skill** (`.claude/skills/run/SKILL.md`): the
  launch-and-probe loop for the scaffolded shape — dev mode + `curl`
  for the HTTP services, the sample invocation for the CLIs, the Vite
  dev server for the SPA. Contributed as a `SkillSpec` through the
  [skill seam](../composition.md#skills) — the vertical declares the
  name in `skills: ['run']`, and the engine stages the file with its
  provenance recorded in the manifest.

## Per-contributor catalog (normative)

This catalog is the ownership contract from #132. The root documents,
cross-tool shims, stack runbook, `run` skill, pre-commit hook and its
settings wiring described above are shipped. The final-pass gate and
brownfield replay are shipped here. All other elements below are
planned work under their named issues; catalog membership does not mean
those files or commands are emitted today. In particular, the declarative
per-directory document and hook/settings seams remain pending #135 and
#136, and engine projections remain pending #138.

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

The generation marker is manifest machinery, not a harness element;
it remains unconditional when #137 lands, and its remediation is
`keel add agent-harness`.

**agent-harness (the vertical itself: claude-core + family kits' shared surface)**

- Root `AGENTS.md` ≤120 lines + `CLAUDE.md` pointer + `.gemini`/`.aider` shims (#134); empty `keel:map` / `keel:skills-index` slots (#134); base `.claude/settings.json` incl. per-hook disables (#136); root sentinel-discipline line — _never edit inside `keel:_` markers; user content goes outside; a broken pair is refused with the fix named* — the one genuinely cross-contributor doctrine, homed once in the root doc *(decided here, for #134)\*.

**Family claude-kits (jvm/go/rust/ts/wc — inside agent-harness; parameterized by framework × build system × language × layout × shape)**

- Stack-runbook region (shipped through the owned-region seam); `run` skill (shipped through SkillSpec); `pre-commit-format.sh` + settings wiring (shipped; typed hook/settings seam pending #136), optionally carrying #138's guarded `keel docs check` step (hook content via #136, sourced from #138); per-layer docs `domain/ application/ infrastructure/ tests/` + pointers (#135); `add-module` skill on modulith layouts / `promote-to-modulith` on flat (#139) — single owner; the skill body _covers_ `keel add module`'s assembly-patch/registration behavior, bounded-context stages nothing for it; diff-size hook _(decided here, for #140: kit-owned, all five families)_; `code-index` skill (gated, #146); rtk wrapper when opted in _(decided here, for #144: opt-in dial on the kit)_.
- **→ #150 (owner: walking-skeleton, below):** the family kits do _not_ own `new-port` — the port exemplars are walking-skeleton files.

**walking-skeleton (after extraction: bootstraps, port examples, peer contexts, build tools)**

- Peer-context seam rules composed into `modules/` docs (#135).
- **→ #150:** `new-port` skill — the port-example dimension as a procedure (contract port + canonical fake beside the real adapter + Scenario/Factory test, pointing at the shipped exemplar). First non-harness client of #148's final-pass realization.

**bounded-context + the `layout.modulith` axis**

- `modules/` + `platform/` docs on modulith only (#135). (No skill: `add-module` is family-kit-owned, #139.)
- **→ #150:** per-context `modules/<name>/` doc emitted with each `keel add module` (the context's local law: peers meet only at the seam; per-language consequences — Go's facade factory, Rust's infra-crate dependency wall). New work — #135 owns only the directory-level docs.

**code-style**

- The format-step patch is shipped through the owned-region seam and gated as a harness element. Its typed hook contribution remains pending #136.
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

- `migrate` skill (#139); Testcontainers note composed into the `tests/` doc (#135).
- **→ #151:** `add-repository` skill (replicate the GreetingLog slice end-to-end: port + SQL adapter + Testcontainers contract test + fake + unit-of-work demarcation, with per-layout/per-language placement); `migrations/` nested doc carrying the persistence doctrine (env-only config; the service never migrates in production — migrations are their own deployment unit; the `UnitOfWork` port is the transaction boundary); Docker-skip caveat in the `tests/` doc (a green suite on a Docker-less host has not proven the SQL adapter — say so before claiming done).

**observability**

- **→ #150:** conventions in the observability package's nested doc (liveness stays dependency-free — a dead database must not restart-storm the fleet; new real dependencies hang on the template readiness check; new propagated fields join the request-context type); `verify-telemetry` skill (monitoring stack up → hit the service → correlation id on response and in logs → find the trace and the counter in Grafana).

**gateway**

- **→ #150:** `add-endpoint` skill, **side-resolved** from the peer tags the vertical already reads: backend variant (extend the resource + the backend-owned OpenAPI contract in the same change — the contract is the pin the peer mirrors), frontend variant (mirror the gateway adapter _and its fake_ from the contract); the full cross-repo procedure appears verbatim only on the monorepo/fullstack shape. Peer-seam facts (contract ownership, CORS covers the dev origin only, API base resolution order) live in the skill body.

**distribution**

- The `deploy` skill is **iac-owned** (#139's AC: "deploy only with iac"); distribution's pipeline facts are body content there, not a second staging.
- **→ #152:** `release` skill (tag `vX.Y.Z` → what the pipeline then does for this family, and where to check the result); `deploy/` nested doc (the 12-factor descriptor invariants: one image for every environment, config rides environment only, only variables the service reads; the shipping doctrine — release on tag push, the pipeline builds the containerization Dockerfile, never a second build definition; CI provider / deploy flavor / image flavor are recorded dials).

**iac**

- `iac/AGENTS.md` nested doc (#135's stated location); `deploy` skill (#139).
- **→ #152:** the secrets doctrine as that doc's content (no secret ever lands in a file; credentials ride the environment; one workspace per environment) — a refinement of #135's row; confirm-gate settings entry for `tofu apply`/`tofu destroy` (the only commands in the kit that mutate billable, stateful infrastructure — force a human gate).

**vcs**

- `commit-msg` Conventional-Commits hook (Claude-settings half is harness, gated; git-hook half is domain content) + changelog convention + runbook release note (#143).
- **→ #152:** root trunk-branch doctrine line (the user-named `defaultBranch` surfaced to the agent — nothing else exposes it; one line; may fold into #143).

**fullstack (product root)**

- Root pair + `keel:map` over `manifest.services[]` (#142), gated on the services' harness membership (above); no hooks/settings/skills hoisted to the root _(decided here, confirming #142's "likely")_.
- **→ #152:** `run-product` skill (the one-command compose story; the two env knobs `BACKEND_URL` / `API_BASE_URL`; a frontend change rebuilds only the assets image — may fold into #142).

**Engine (reserved identity, #133)**

- `keel:map` / `keel:skills-index` / child-index rows via `keel docs sync` (#138). Nothing else: the generation marker is machinery (#137), and the docs-check hook step is family-kit hook content.

**Plugins**

- Any class above, through their own verticals, gated identically.

## Related

- [Walking skeleton](walking-skeleton.md) · [Verticals catalog](README.md)
- [Composition model](../composition.md#harness-contributions) · [CLI](../cli.md)
