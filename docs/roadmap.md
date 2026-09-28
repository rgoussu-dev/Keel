# Roadmap — growing the scaffold surface

Two waves have landed since this roadmap was first written. The
composition engine itself (gradle-wrapper, the `distribution`
vertical, `keel add`, legacy retirement) shipped in v0.4.0-alpha, and
the repo trisection + emitted binding spec shipped in v0.5.0-alpha.
Since then the surface widened far past the original plan — see
"Landed since v0.5.0-alpha" below and the `[Unreleased]` section of
`CHANGELOG.md` for the details.

Items are lettered continuing the old sequence. With **F** landed,
**E** followed it, leaning on the workflow-emitting pattern F
established. The rest are ordered by leverage, not by commitment.

The next wave is ordered and issue-tracked (decided 2026-08-18):
**K** (build from sources, [#67], ✅ landed) → **L** (`keel add
--reapply`, [#68], ✅ landed) → **M** (IaC, [#69], ✅ landed) →
**G** (the Claude kit, [#70], ✅ landed).
Releasing the accumulated `[Unreleased]` surface was deliberately
held until K had exercised it locally, product-shaped rather than
harness-shaped — a gate K's landing has now opened. The backlog
items below each carry an issue of their own.

**Q** (supple composition) has landed, Phases 0 to 3: proposed from
an audit of how `keel new`, `keel add`, the presets and `keel ui`
exercise the composition model, it was sliced into the steps its
section lists and landed one commit per step. Its Phase 3 — the open
ends found once it had merged — landed one step each, the last of them
the weekly composition sweep its measure had planned. Its successors —
**R**, **S**, **T** and **U** — are named there. **R** (entrypoints can
grow) has landed too, one commit per step, R.1a to R.3d, as its own
section below records: every single-entrypoint backend preset grows
the other entrypoint into its twin, byte for byte, on every dial
setting, with its bounded contexts. **S** (one converge operation) is
sliced in its own section below, from thirteen research passes over
R's merge, S.1a to S.9, one commit per step. **T** and **U** wait on
decisions of their own and are not yet sliced into issues or ordered
against the backlog.

[#67]: https://github.com/rgoussu-dev/keel/issues/67
[#68]: https://github.com/rgoussu-dev/keel/issues/68
[#69]: https://github.com/rgoussu-dev/keel/issues/69
[#70]: https://github.com/rgoussu-dev/keel/issues/70

## Landed since v0.5.0-alpha ✅

- **D — REST entrypoint.** `quarkus-rest` proved the core promise:
  the `entrypoint` dimension is selected by predicate, not
  hard-coded — a second project shape composed out of the same
  `walking-skeleton` vertical, with the earned
  `application/rest/contract` + `executable` pair and RFC 9457
  Problem Details mapping.
- **Two more languages.** Go (`go-cli`, `go-http`) and Rust
  (`rust-cli`, `rust-http`) walking skeletons realise the house
  hexagonal references — contract face over a compiler-hidden core,
  per-use-case driving ports, no mediator object — with composable
  CLI + HTTP entrypoints on one module/package.
- **The frontend.** `web-components`: a framework-free SPA as a
  TypeScript npm workspace, DOM-less domain packages, ports over the
  WCCG Context protocol, and a planks-based atomic design system.
- **Products.** Peer tags, composite stacks, `keel link`, and the
  `gateway` + `fullstack` verticals compose services into fullstack
  products (`fullstack`, `fullstack-spring`, `fullstack-micronaut`,
  `fullstack-go`, `fullstack-rust`) under a monorepo or polyrepo
  layout, with the REST seam pinned as an OpenAPI contract and
  monorepo products containerised (`compose.yaml` + Dockerfiles).
- **The JVM generalised.** Spring Boot and Micronaut join Quarkus in
  both shapes, every JVM stack has a Kotlin twin, and all twelve JVM
  bootstraps share per-language domain template trees behind one
  adapter factory.
- **H — Server-side TypeScript.** `ts-http` scaffolds the trisected
  layout with a `RegistryMediator` — keel-shaped by keel — on bare
  `node:http` with no build step (Node runs the sources directly),
  and `fullstack-ts` slots it behind the shared gateway seam.
- **Selectable build systems.** Stacks may offer a build-system
  choice (`--build-system`, or an interactive prompt): Gradle or
  Maven across all twelve JVM stacks (Java and Kotlin), npm or pnpm
  across the TypeScript stacks — the choice is just a `pkg.*` tag,
  and everything downstream is ordinary predicate machinery.
- **The `containerization` vertical.** `keel add containerization`
  puts a thin Dockerfile beside the deployment unit of every
  HTTP-shaped stack — no build stage, the image copies the artifact
  the host build produced — with an opt-in GraalVM native flavor on
  every JVM backend (Spring's opt-in patches the Native Build Tools
  wiring into its build files). This is the local container story; E
  below (CI-built images pushed to a registry) landed after it and
  builds exactly these Dockerfiles.

What that wave proved: the per-language dispatch stances of binding
spec §2 are exercised outside the JVM (Go, Rust, frontend
TypeScript), and cross-service elements resolve through the same
predicate machinery as everything else.

---

## E — Distribution for the server-shaped stacks ✅

**Goal.** `distribution`'s only adapter (`quarkus-cli-native`)
requires `arch.cli`, so `keel add distribution` on any REST project
hard-fails with uncovered dimensions. Add the server-shaped sibling
so the brownfield story holds for both shapes: CI-built images
pushed to a registry on tag push, addable to a standalone service.

**Landed — generalized across every family at once, not Quarkus
first.** The sketch above named one
`distribution/quarkus-rest-container` adapter predicated on
`pkg.gradle`; following it would have repeated the mistake `ci` had
already corrected (F). What shipped is one adapter per stack family —
`jvm-container` (all twelve JVM stacks), `go-container`,
`rust-container`, `ts-container`, `wc-container` — with the build
system read from the manifest, never minted as adapters.
`quarkus-cli-native` is untouched for CLIs. Deviations from the
sketch, on record:

- **The workflow builds the containerization Dockerfile, not the
  Quarkus container-image extension.** One image definition, no
  second build system: the pipeline runs the host build the
  Dockerfile documents (`jvmRestArtifact` is now the one shared
  derivation both verticals read, so they cannot disagree about
  where the artifact lives), then `docker build` + push. That makes
  `containerization` a hard prerequisite — the adapters refuse with
  the fix in the message when `deploy.container-image` is absent,
  rather than emitting a pipeline that fails on the host.
  _Superseded by Q1.3:_ that refusal was a throw inside
  `contribute()`, which no menu, front door or planner could see — so
  distribution was offered everywhere and refused on install. The
  requirement is now a `requires` entry in each container adapter's
  predicate, read by the planner: distribution is offered as _needs
  Container image_, and refused up front without it, naming it.
- **The provider is `ci`'s dial, reused, not a second question.**
  GHCR under `github-actions`, the GitLab Container Registry under
  `gitlab-ci` (release jobs appended to `.gitlab-ci.yml` via the
  seeded-upsert patch, gated on `v*` tags — one pipeline file per
  host). When the `ci` vertical already recorded its provider as a
  `ci.*` tag, that answer wins silently over the shared question; a
  second answer that could disagree would emit a pipeline no host
  runs.
- **The JVM flavor is read, not re-asked.** `containerization`
  already asked jvm-vs-native and rendered the Dockerfile in one
  flavor; the pipeline reads the recorded dial (the
  `runtime.graalvm-native` tag) and builds that artifact. Re-asking
  could contradict the Dockerfile and break the build.
- **The deployment flavor is a sticky dial: `compose` (default) or
  `helm`**, each one template subtree exactly like the ci provider.
  Compose emits a production `deploy/compose.yaml`; helm a minimal
  `deploy/chart/` (values → env; the SPA as `initContainers` over a
  shared `emptyDir`). 12-factor is binding: one environment-agnostic
  image, config exclusively via environment, and only variables the
  scaffolded service actually reads (`DB_URL` + the JVM's split
  login under persistence, `OTEL_*` under observability) — nothing
  invented.
- **The SPA's runtime config is solved, not skipped.** A static
  bundle cannot read env, so the assets image's entrypoint templates
  `env.js` (`window.__ENV__`) into the served volume from the
  environment at deploy time, and the gateway-wired app reads it at
  boot ahead of the Vite-baked fallback. Verified against the
  emitted app's actual gateway wiring, end to end under Docker:
  init populates the volume, stock nginx serves, a second deploy
  replaces the bundle (clear-then-copy — stale files do not
  survive), and an env change alone rewrites `env.js`. A
  rebuild-per-environment answer was ruled out as a 12-factor
  violation.
- **Docker Swarm is deliberately declined as a flavor.** Swarm
  ignores `depends_on` conditions and has no init-container
  primitive, so the SPA's assets-image ruling cannot be expressed
  honestly in a stack file; named volumes are node-local on a
  cluster; the project is in maintenance mode; and a user who wants
  Swarm can `docker stack deploy` the emitted compose file
  themselves. Re-open only if a real consumer asks.
- `tagsAdd: ['dist.container-image']` — as sketched, the tag a
  future IaC or deploy vertical keys on.

The prerequisite restructuring shipped in the same change: the SPA's
containerization target became the **assets image** (clear-then-copy
entrypoint over a named volume, unmodified official nginx serving
it), and `fullstack/product-compose` migrated to the same shape with
its `/api` proxy target env-configured (`BACKEND_URL` via the stock
image's envsubst) instead of baked. Recorded under `Changed` in the
CHANGELOG as a breaking change to an unreleased artifact shape.

What this item does **not** prove, same caveat as F: the emitted
pipelines have not run on a real GitHub or GitLab host — the suite
asserts their content, and the compose shapes were exercised under a
local Docker daemon. The first tag pushed by a consumer project is
where that evidence arrives.

**Commits.** `refactor(containerization): share the JVM REST artifact
derivation`, `feat(containerization)!: the SPA image becomes an
init-container assets image`, `feat(gateway): deploy-time runtime
config for the SPA`, `feat(fullstack): serve the product SPA from an
init-populated volume`, `feat(distribution): container distribution
for the server-shaped families`

---

## F — CI vertical (`ci/github-actions`) ✅

**Goal.** The binding spec's "done means green gates" has no scaffold
backing — projects leave `keel new` with no pipeline. A `ci` vertical
is small, applies to every stack, and is the most broadly useful
`keel add` target.

**Sketch.** Vertical `ci`, `dimensions: ['pipeline']`; first adapter
`ci/gradle-github-actions` predicated on `pkg.gradle`, emitting a
build-and-test workflow on push. Siblings for `pkg.npm`, Go, and
Cargo cover the same dimension for the other stacks.

**Landed — as four family adapters, not per-build-system ones.** The
sketch above predates the build-system dial, and following it would
have repeated the mistake the `containerization` vertical had already
corrected: a `pkg.*` tag that only changes the commands inside one
file is read from the manifest, never minted as another adapter. So
the family is `ci/jvm-pipeline` (all twelve JVM stacks; Gradle or
Maven picked per tag), `ci/go-pipeline` (toolchain pinned by the
project's own `go.mod`), `ci/rust-pipeline` (latest stable,
`--workspace`) and `ci/ts-pipeline` (both TypeScript stacks; `npm ci`
or corepack-provisioned `pnpm install --frozen-lockfile`, with
`lint`/`build` running `--if-present` because only some shapes
declare them).

**The provider is a dial, not more adapters.** GitHub Actions
(default) and GitLab CI are one sticky question shared by the family
adapters — only one fires per project, so it is asked exactly once —
for the same reason the image flavor is a question rather than a
predicate: nothing in the manifest's tag set knows where the
repository is hosted. Each adapter keeps one template subtree per
provider (`github/`, `gitlab/`) and promotes `ci.github-actions` or
`ci.gitlab-ci` accordingly. The adapters were renamed off their
original `-github-actions` suffix when the second provider arrived,
inside the same unreleased cycle.

Two decisions worth recording. The pipeline triggers on `push` alone:
the emitted binding spec (§6) mandates trunk-based development with
no PRs, so a `pull_request` trigger or merge-request pipeline would
document a flow the spec forbids. And nothing in any pipeline moves
with the module layout — the wrappers, `--workspace`, `./...` and the
root scripts each span whatever tree exists — so one template per
family and provider serves `basic` and `modulith` unchanged, with no
resolver involvement.

What this item does **not** prove: the emitted pipelines have not run
on a real GitHub or GitLab repository — the suite asserts their
content, not the host's interpretation of them. The first consumer
project wired to either is where that evidence arrives.

**Commits.** `feat(ci): add ci vertical with per-family github-actions adapters`,
`feat(ci): gitlab-ci as a selectable pipeline provider`

---

## G — The Claude kit: stack AGENTS.md addenda + emitted `.claude` content ✅

Tracked in [#70](https://github.com/rgoussu-dev/keel/issues/70). It
was sequenced **last** of the next wave (after K, L, M) — addenda and
hooks will iterate, and L is what delivers those iterations to
already-scaffolded projects — and landed in that order: the sentinel
markers make the addendum self-replacing, and L, already on `main`,
gains a consumer the day a template fix ships.

**Goal.** Named as a roadmap item in `AGENTS.md §1`: the emitted
binding spec is universal, and stack adapters should append their
runbook (build/test/run commands, layout notes) under a
sentinel-marked section of the scaffolded `AGENTS.md` — the same
sentinel-append pattern the legacy `claude-quarkus` schematic used.
Requires a patch-style contribution against the `claude-core` output,
so it exercises the patch path of the composition contract.

**Widened (2026-08-18) to the "Claude Code workflow kit" half of
keel's identity.** Beyond the addendum, scaffolded projects should
gain `.claude/` content: the pre-commit format hook keel itself uses
(adapted to the stack's own format/lint commands), a per-stack `run`
skill so "launch the app and check it" works out of the box, possibly
a release skill mirroring the stack's release flow. Two rules carry
over from the `ci` family: the addendum and hooks are per stack
**family** with commands resolved from manifest tags, never minted as
adapters per `pkg.*` tag; and sentinel markers keep re-scaffolds and a
future `--reapply` (L) idempotent — the addendum replaces its own
section, never the user's edits around it.

**Landed** as a fifth walking-skeleton dimension (`agentic-kit`)
covered by five family adapters — `jvm-claude-kit` (all twelve JVM
stacks), `go-claude-kit`, `rust-claude-kit`, `ts-claude-kit`,
`wc-claude-kit` — each ordered `after` `claude-core` and patching the
`AGENTS.md` it emitted, which is the patch-path exercise the goal
asked for. Composite roots never install the walking skeleton, so the
dimension is safe to require; a coverage test walks the stack
registry across every layout so no stack can silently lose its kit.
Deviations from the sketch, on record:

- **The hook and settings are built in code, not rendered from a
  template tree.** The template renderer only round-trips the
  executable bit on verbatim (non-`.ejs`) files, and the hook needs
  both substitution and `+x` — so the adapter emits it with an
  explicit `mode: 0o755` instead. (Teaching the renderer to preserve
  modes on rendered files is a separate, general improvement.)
- **The `git commit` detection is a substring probe, deliberately.**
  keel's own hook parses the payload with Node; a scaffolded Go,
  Rust or JVM project cannot assume Node (or jq) on the machine. A
  false positive costs one extra verify run.
- **The verify gate mirrors the family's `ci` pipeline** (`./gradlew
build` / `./mvnw --batch-mode verify`, `go build ./... && go test
./...`, `cargo test --workspace`, the TypeScript
  `lint --if-present`/`typecheck`/`test` trio), so "commit green"
  and "pipeline green" cannot drift apart. The format step exists
  only where the toolchain ships a formatter (`gofmt`, `cargo fmt`).
- **The release skill was not emitted.** The scaffolds have no
  release flow to mirror yet (that arrives with a consumer of the
  `distribution` vertical's tag-push pipeline); a skill inventing
  one would document fiction. Revisit when a real flow exists.
- **The Rust modulith addendum carries the peer-seam rule** I.4
  decided ("the seam publishes only its own DTOs"), including the
  two-line upgrade for the day `public-dependency` stabilises —
  the addendum is the enforcement surface Rust itself lacks.

**Commit.** `feat(walking-skeleton): the Claude kit — stack runbook
addenda + emitted .claude content`

---

## H — Close the JVM e2e grid, then shard CI along it ✅

**Goal.** keel emits **twelve JVM stacks** — three frameworks × two
languages × two entrypoint shapes — and `tests/e2e/` covered **four of
them**. The gap was not cosmetic: every JVM defect that reached `main`
was found by a build, never by a file assertion, and the two Maven
modulith defects were found the week a build first ran that
combination. Seven stacks shipped on the strength of unit tests over
emitted files.

All twelve are now built, booted and driven end to end:

|           | Java CLI | Java REST | Kotlin CLI | Kotlin REST |
| --------- | -------- | --------- | ---------- | ----------- |
| Quarkus   | ✅       | ✅        | ✅         | ✅          |
| Spring    | ✅       | ✅        | ✅         | ✅          |
| Micronaut | ✅       | ✅        | ✅         | ✅          |

…and the `modulith` typology, which the table above does not have an
axis for, now has an e2e on every framework rather than on Quarkus
alone.

The CI shape followed from this, not the other way round. `e2e (jvm)`
was one job because the grid was too sparse to shard along: a
framework × language matrix over the old files would have minted
`e2e (spring-kotlin)` as a green job that runs nothing, which asserts
coverage that does not exist. **Populate the grid first; shard
second** — and that constraint still binds the shape that landed, which
is why language is not an axis of it (H.3).

**Not a single new defect surfaced.** Ten new suites, every one green
as written. That is a weaker result than the item budgeted for and
worth recording plainly: the value delivered is that seven stacks and
three modulith cells stopped being assumed, not that anything was
caught.

### H.1 — The two missing REST stacks (S) ✅

`spring-rest-kotlin` and `micronaut-rest-kotlin` — the only REST cells
still empty. Cheap, because `tests/support/jvm-rest-e2e.ts` already
parameterises everything framework-specific into `JvmRestE2ESpec` —
stack id, jar path, random-port flag, the log line announcing the port,
health paths, telemetry-silencing flags. A new REST suite is a spec
object and a `describe`, on the order of fifty lines, with no harness
change. The two Java siblings are the specs to copy from.

Expect these to fail before they pass. That is the point of the item.

**Landed.** Two files, no harness change — the bet the sizing rested on
held. Both passed first time, so the expectation above was wrong; the
suites now pin Spring's `kotlin("plugin.spring")` and Micronaut's KSP
processing, neither of which a file assertion reaches.

**Commit.** `test(e2e): cover the Kotlin REST stacks end to end`

### H.1b — Modulith beyond Quarkus (S) ✅

The typology axis is sparser than the framework one. `modulith` has an
e2e on Quarkus/Gradle, on Quarkus/Maven and on Spring/Maven — and
nowhere else. **Micronaut has never had its modulith built**, in either
language or either build system, and Spring's has only ever been built
by Maven. Given that the peer-context wiring is the part that differs
per container, and that both defects it has shipped were container
wiring, this is the highest-value gap in the table.

**Landed.** `walking-skeleton-modulith-micronaut.test.ts` and
`walking-skeleton-modulith-spring.test.ts`, both on Gradle and both
with the peer bounded context — Micronaut's first modulith build in any
configuration, Spring's first on Gradle. Both green.

**Commit.** `test(e2e): build the Micronaut and Spring moduliths`

### H.2 — Extract a CLI harness, then the five CLI stacks (M) ✅

The CLI half has no shared machinery: `tests/e2e/walking-skeleton.test.ts`
carries the `quarkus-cli` flow inline — scaffold, build, then
`java -jar … hello --name E2E` and assert on stdout. Extract it to
`tests/support/jvm-cli-e2e.ts` with a `JvmCliE2ESpec` (stack, jar path,
argv, expected stdout), leaving the Quarkus suite as its first caller
and asserting the same things it asserts today. Then add
`spring-cli`, `micronaut-cli` and the three Kotlin CLI stacks.

Do the extraction as its own commit, and prove it green on the
existing Quarkus case before any new stack lands — otherwise a broken
extraction and a genuine stack defect arrive as one red build.

**Landed** as three support files rather than two. The split fell
naturally: `tests/support/jvm-e2e.ts` holds the scaffold, both build
systems, the transient-flake retries and the skip rules behind a
`JvmProjectSpec`; `jvm-rest-e2e.ts` keeps the boot-and-drive half and
`jvm-cli-e2e.ts` adds the run-and-read one. The inline copy in
`walking-skeleton.test.ts` was the second copy of that machinery; there
is now one. Extraction proved green on Quarkus CLI and on
`walking-skeleton-rest` (the REST harness moved too) before any new
stack landed.

**Commits.** `refactor(e2e): extract the JVM CLI harness` then
`test(e2e): cover the remaining JVM CLI stacks`

### H.3 — Reshard `e2e (jvm)` along the populated grid (S) ✅

Only once H.1 and H.2 are green. The axes are framework, language, and
**typology** — `basic` against `modulith`, which is the axis that has
actually shipped defects and the one no framework grouping captures.

Two facts constrain any split. A runner has 4 vCPUs and vitest runs
files in parallel but the tests inside a file in sequence, so the
longest single file is a floor no arrangement gets under. And a shard
costs about 25 seconds of setup, so shards that finish under a minute
are mostly overhead.

**Landed as four shards on two axes, not three.** `jvm-quarkus`,
`jvm-spring` and `jvm-micronaut` each hold that framework's four
`basic` stacks — CLI and REST × Java and Kotlin — and `jvm-modulith`
holds the typology axis, its five files including the Maven pair.
Language is _not_ an axis, and the reason is the rule this whole item
was ordered around: the `basic` half would split by language cleanly,
but the modulith half has no Kotlin suite, so a `jvm-kotlin` shard
would be a check name over a cell nothing populates. That axis waits
until the grid populates it.

Re-measured on the shard shape shipped (4 vCPUs, cold caches, per-file
seconds → shard wall clock):

| Shard           | Files                                       | Wall  |
| --------------- | ------------------------------------------- | ----- |
| `jvm-quarkus`   | 268.7 · 264.3 · 238.3 · 221.5               | 462.6 |
| `jvm-spring`    | 209.5 · 202.8 · 198.3 · 86.8                | 288.1 |
| `jvm-micronaut` | 280.3 · 248.9 · 184.4 · 184.4               | 371.5 |
| `jvm-modulith`  | 276.9 · 238.1 · 204.7 · 191.1 (+ Maven 119) | 398.3 |

The same files as **one** shard, measured on the same box for the
comparison: **1326.0s** (16 of them; the Maven suite skips there, for
want of a host Gradle 9). Against a slowest shard of 462.6s, the split
is worth **2.9× in wall clock** — not attribution alone.

The prediction this item shipped with was wrong in a way worth
correcting rather than quietly dropping. It modelled a shard as
`max(longest file, total ÷ 4)` and concluded that **beyond two JVM
shards you buy attribution, not speed**. The divisor is the error: 4
vCPUs do not give 4×, because each Gradle build is itself parallel and
concurrent ones contend. Measured, the divisor is **2.15–2.42 inside a
four-file shard** and **2.78 across the sixteen-file single shard** —
it climbs with the file count, since more files fill each other's idle
stretches. Nowhere near 4 either way, and either way the conclusion
inverts for today's file count: `total ÷ 2.8` sits well above the
longest-file floor, so sharding is still buying real wall clock at
four.

The old advice survives as a limit rather than a verdict: it applies
once a shard's divided total approaches its longest file, and
`jvm-spring` (288.1s wall against a 209.5s longest file) is already
close. Split that one again and you would be buying attribution.

**Commit.** `ci: shard the JVM e2e job by framework, language and layout`

---

## I — The modulith layout beyond the JVM

**Goal.** Go, Rust, `ts-http` and `web-components` ship `basic` only.
The JVM's modulith (`platform/kernel`, `modules/<ctx>/`,
`application/<typology>`) landed in #48/#49 behind
`src/domain/core/adapters/jvm-module-layout.ts`. This item brings the
same property — a bounded context carves out as a wiring change — to
the other four stacks.

The design work is done and was **stress-tested against real
compilers** (Go 1.24.7, rustc 1.94.1, Node 22 + TypeScript 5.9,
Chromium) by hand-building throwaway two-context skeletons in each
language with deliberate violation probes. Three findings change what
keel should build, and one of them changes the shape of the feature:

- **Every stack offers both layouts, `basic` default** (decided
  2026-08-14). The measurements below argue that some stacks — Go
  especially — pay almost nothing for the modulith, and an earlier
  draft of this item concluded those stacks should ship it as their
  only layout. That is not the ruling. Manifest count is not the only
  cost: the modulith also adds levels of indirection (a facade, a
  `modules/<ctx>/` level, a peer seam) that a single-context project
  may simply not want, and a scaffold should let the user decline
  them. **Optionality wins, uniformly** — the dial exists on all five
  stack families, and the per-language cost figures become guidance on
  _when to turn it_ rather than a reason to remove the choice.
- **This also removes the only breaking change in the item.** With a
  dial, `keel new --stack=go-http` and `--stack=web-components` keep
  emitting exactly today's tree by default; the modulith is additive
  everywhere. Nothing scaffolded before I lands changes shape.
- **The trap is name derivation, not just path depth.** The JVM's
  recurring bug class was hand-computed depths (`upToRoot`) and
  artifact ids (`mavenArtifact`). Outside the JVM the _name_ is the
  more dangerous half — crate names, package names, import prefixes
  and element tag prefixes are each spelled differently from the
  directory path. Every resolver below owns name derivation too.
- **Non-JVM verticals hard-code flat paths today.** Twelve adapters
  (`{go,rust,ts}-{cors,observability,persistence}`, `ts-port-fake`,
  `wc-gateway-rest`, `wc-sample-port-fake`) carry module-level path
  constants like `const MAIN_TARGET = 'application/rest/src/main.ts'`.
  Each must move to a resolver call, exactly as the JVM verticals did.

### I.0 — Generalise the layout dial (prerequisite, S) ✅

`ModuleLayoutOption.id` is typed `JvmModuleLayout` and `JVM_LAYOUTS`
is JVM-specific. Widen the option type so any stack can declare a
layout set, and keep `jvmLayout` as the first implementation of a
per-language family. Now that every stack family carries the dial,
this is used by all five rather than being a one-off generalisation —
so it is worth doing properly: one shared `ModuleLayout` vocabulary,
one `--module-layout` flag, one interactive question, five resolvers
behind it. No behaviour change on its own.

**Landed.** `adapters/module-layout.ts` owns the language-neutral
vocabulary (layout names, `layout.*` tags, `modules.peer-context`, the
context names, the selectable `ModuleLayoutOption`s); `jvmLayout` and
`goLayout` are its first two per-language resolvers.

**Commit.** `refactor(composition): generalise the module-layout dial beyond the JVM`

### I.1 — Go (M) — _dial; `basic` default_ ✅

Cheapest realization of the four, so it goes first and proves the
pattern for the other three.

- **Both layouts.** `basic` is exactly today's tree and stays the
  default; `modulith` is the additive sibling. Go pays zero manifest
  files for a context, which makes the modulith unusually cheap here —
  but "cheap in build files" is not the same as "free", and the facade
  plus the `modules/<ctx>/` level are indirection a single-context
  service can reasonably decline.
- **Brownfield is free.** `goLayout()` resolves `basic` for manifests
  with no `layout.*` tag, which is also what every existing project
  has — so `keel add` on anything scaffolded before this lands keeps
  working, and no emitted tree changes shape.
- **Resolver** `go-module-layout.ts` owns: module paths, the
  **import-path prefix** (`<modulePath>/internal/modules/<ctx>/internal/domain`
  — Go has no relative imports, so every template line concatenates
  module path × layout depth × context name), and the **import-alias
  rule** (`modules/ordering` and `modules/billing/gateway/ordering`
  are both `package ordering`; any file importing both must alias
  one, and generated code that forgets compiles until a second
  context appears).
- **Two corrections the compiler forced**, both of which the template
  tree must encode: driven adapters go at
  `internal/modules/<ctx>/infra/<tech>/` — _outside_ the context's
  `internal/`, or `cmd/` cannot construct them — and the facade
  re-exports **nothing** (no type aliases), which is what makes
  "only the consumer's own directory may implement its ports" a
  compile error rather than a lint rule.
- **Trees:** `go-bootstrap-modulith`, plus modulith siblings for
  `go-cli-bootstrap` / `go-http-bootstrap` (`cmd/<typology>/`).
- **Adapters to touch:** `go-cors`, `go-observability`,
  `go-persistence`, `go-port-fake`, `go-http-image`.

**Landed**, with the four compiled constraints encoded as predicted
and re-verified against Go 1.24.7: driven adapters at
`internal/modules/<ctx>/infra/` (driving ones at `userside/`, same
rule — inside the context directory, outside its `internal/`), a
facade re-exporting nothing, the `Clock` port moved to
`internal/platform/`, and every import path derived in `goLayout`
rather than in a template. The e2e case drops two probe files into
`cmd/` and requires the compiler to reject both — reaching into the
context's `internal/` (`use of internal package … not allowed`) and
naming what the facade returns (`undefined: greeting.Greeter`).

One defect the design work had not predicted: `go-observability`
anchored its `cmd/http/main.go` patch on the flat import path, so
under the modulith it emitted its package and left `main.go`
untouched. `go build` was green — unwired code compiles. It now
resolves both the target and the import through `goLayout`, and sorts
the two-line import block, because which of the two sorts first flips
with the layout.

**`go-persistence` closed it out.** The slice's five packages now
resolve their homes through `goLayout` like everything else, and the
move surfaced one constraint the JVM never had to answer: under the
modulith the assembly cannot import the context's `domain`, so the
factory `cmd/` wires has to live on the facade. The slice emits
`NewGreetingLogUseCases` beside `NewGreeter`, re-exporting nothing —
the e2e requires `greeting.GreetingLog` from the assembly to fail to
build, so widening the aperture did not open it. The pgx contract
test's `../../../migrations/sql` glob is derived from `upToRoot`
rather than counted, which is the JVM's recurring bug in Go's
spelling: absolute imports hide depth, a file read does not.

**Commits.** `feat(walking-skeleton): modulith module layout for the Go stacks`,
then `feat(<vertical>): …` per vertical.

### I.2 — `ts-http` (M) — _dial; modulith is one package per context_ ✅

- **Ruling: one workspace package per bounded context**, not one per
  (context × layer). `@<scope>/<ctx>` owns `src/domain/{contract,core}`,
  `src/user-side/…` and `src/infra/…` as plain directories, and its
  `exports` map publishes exactly two entry points: `"."` (the facade)
  and `"./service"` (the peer seam). Verified: both resolve, while
  `@<scope>/<ctx>/src/domain/core/internal/…` is rejected by tsc
  (`TS2307`) _and_ Node (`ERR_PACKAGE_PATH_NOT_EXPORTED`). This is Go's
  facade rule expressed in TypeScript, and it is **1 manifest per
  context instead of 3.5**.
- **Why not package-per-layer, as the JVM and Rust do.** Because in
  TypeScript the package graph enforces nothing to begin with:
  undeclared workspace dependencies resolve silently (npm hoists every
  member into the root `node_modules`) and TS project references do
  **not** restrict which projects a project may import — the same
  undeclared import builds clean under `tsc -b --force`. So splitting a
  context into four packages buys four manifests and zero enforcement.
  The `exports` map is the one real wall, and one package per context
  keeps all of it.
- **What that leaves to the linter** is the intra-context layering
  (`domain` never imports `user-side`/`infra`) and the relative-path
  bypass — both dependency-cruiser rules, both needed under any of the
  candidate shapes, so neither is a cost of this one.
- **Keep `basic` as the default anyway**, but for scope reasons rather
  than ceremony: a single-context service gains nothing from a
  `modules/<ctx>/` level. The dial is now cheap enough that switching
  is a directory move plus one `package.json`.
- **Ship the lint with the layout, and make it fail closed.**
  dependency-cruiser pointed at a TypeScript workspace with default
  options resolves every `@acme/*` import to a bare specifier and
  reports **zero** violations over a tree that is in violation. The
  emitted `.dependency-cruiser.cjs` must carry
  `enhancedResolveOptions: { extensions: ['.ts', …], exportsFields:
['exports'], conditionNames: ['import', 'default', 'types'] }`.
  Worth a test that asserts a known-bad import actually fails.
- **Resolver** `ts-module-layout.ts` owns paths, the **package name**
  (`@<scope>/<ctx>` — the scope and the context vary independently) and
  the **`exports` map**, which is now a layout decision rather than a
  per-package detail: it is the aperture, so the resolver decides which
  entry points exist.
  The workspace member list needs no special handling: nested globs
  (`modules/*/domain/*`, or `modules/**`) resolve correctly under both
  npm 10 and pnpm 10, verified.
- **The `exports` map is coupled to the build mode**, which is the
  trap easiest to get wrong across the two TypeScript stacks. With no
  build step (`ts-http` today) the map points at `./src/index.ts` and
  imports carry `.ts` specifiers; with an emitting build it must point
  at `./dist/index.js` plus a `types` condition, and every import
  specifier becomes `.js`. Mixing the two typechecks and then fails at
  runtime. Whatever the resolver emits, the map and the specifier
  convention have to be decided together.
- **Watch `erasableSyntaxOnly`**, which `ts-http` already sets: Node's
  type-stripping rejects parameter properties and enums, so any
  entity template using `constructor(readonly id: string)` fails with
  `TS1294` in exactly the stack that runs sources directly.
- **Adapters to touch:** `ts-cors`, `ts-observability`,
  `ts-persistence`, `ts-port-fake`, `ts-workspace`, `ts-http-image`.

**Landed**, with every ruling above holding as stated and one thing
the design work had not predicted.

The `exports` map, the coupling to the build mode, one package per
context, and the `enhancedResolveOptions` requirement all survived
contact with a real install on npm **and** pnpm — the second is not a
duplicate run, since npm's hoisting hides a missing dependency
declaration that pnpm's isolated store exposes. Removing the
`enhancedResolveOptions` block from the emitted config was measured
rather than assumed: the four `application/ → modules/greeting` edges
vanish from the graph and the lint passes over a violating tree.

**The unpredicted part: `"types": []` is not the wall the stack
claims it is.** `ts-http`'s domain packages set it, and both this
repo's docs and the emitted README say a domain import of `node:*` is
therefore a compile error. It is not — `types: []` suppresses the
automatic global `@types`, while an explicit
`import … from 'node:async_hooks'` still resolves and typechecks
clean. Verified under `basic` as well, so the claim was already
wrong before this item. The modulith would have made it worse (one
package per context means one `types` setting for the whole hexagon,
and its `infra/` legitimately needs Node), so the rule moves to a
`domain-knows-no-platform` dependency-cruiser rule that is required to
fail on a planted import. Correcting the claim wherever it is written
is a separate `fix(walking-skeleton)` commit against the `basic`
tree — the layout commit leaves `basic` byte-identical.

**Commits.** `feat(walking-skeleton): modulith module layout for ts-http`, then per vertical.

### I.3 — `web-components` (M) — _dial; `basic` default_ ✅

- **Both layouts.** The architectural pull toward the modulith is
  strongest here — a browser app is usually multi-context before its
  first release, and a micro-frontend _is_ a carved-out module — so
  this is the stack where the prompt's help text should most clearly
  point at `modulith`. It is still a choice: a single-purpose widget,
  an admin panel, or a demo SPA has one context and does not need the
  `modules/<ctx>/` level.
- **`basic` keeps today's tree**, `domain/domain-api` naming included.
  Renaming that to `domain/contract` is worth doing — it is the last
  pre-modulith name in the repo — but it is now a separate cosmetic
  commit against the `basic` tree rather than a side effect of this
  item.
- **Same package shape as I.2: one package per context.** The context
  is also the right code-split unit (route-level splitting is done by
  dynamic import, not by package granularity), so nothing is lost
  versus a package-per-layer split — and the `exports` map still hides
  the core. The one addition over `ts-http` is a third entry point,
  `"./elements"`, for the module's `define…Elements()` registration.
- The `design-system` package stays a **separate top-level package**,
  not a context: it is domain-blind, it is consumed by every context,
  and it is the package the import map deduplicates.
- **Ship the import map.** Browser-verified: two bundles each inlining
  an element-defining package throw
  `NotSupportedError: … has already been used with this registry`, and
  the throw kills the rest of that bundle's registrations — half the
  page silently disappears. The design system must be emitted as an
  external, deduplicated via an import map in `index.html`. This is a
  correctness requirement, not an optimisation, and it is cheap: one
  `<script type="importmap">` block plus an external marker in the
  bundler config.
- **Resolver** `wc-module-layout.ts` owns paths, package names, and
  the **element tag prefix** (`<scope>-<context>-<element>`) — a
  runtime string nothing checks, and the one place a typo survives
  every gate.
- **Adapters to touch:** `wc-gateway-rest`, `wc-sample-port-fake`,
  `wc-design-system`, `wc-spa-bootstrap`, `wc-spa-image`.

**Landed**, with every ruling above holding as stated.

One package per context with a third `"./elements"` entry point,
`design-system` as a top-level package, and the tag prefix owned by
`wcLayout()` all survived a real install and a real build. The import
map is browser-verified rather than asserted: the e2e builds the
bundle, checks the design system left the app chunk (one
`customElements.define` in the app, sixteen in the external) with the
bare specifier intact for the map to resolve, then loads the built
page in headless Chromium and requires the context's element _and_ the
design system's atoms to have upgraded.

The tag prefix got the consumer it needed. The emitted context carries
`tests/element-tags.test.ts`, which re-derives
`<scope>-<context>-<element>` from the package's own name — a
different field of the resolver than the one that produced the tag —
so a typo in `wcLayout` fails a test rather than rendering an empty
inline box.

Two things the design work had not spelled out. The peer seam's
factory takes the context's assembled ports rather than building its
own slice: a seam that constructs its use case breaks the moment a
vertical rewires the factory behind it (the `gateway` vertical does
exactly that), and a peer receives the built service anyway. And the
`gateway` vertical rewrites the app's Vite config to add its dev
proxy — which, under this layout, must keep the design system external
or it silently re-inlines an element-defining package. That is
asserted.

**Commits.** `feat(walking-skeleton): modulith module layout for web-components`, then per vertical.

### I.4 — Rust (L) — _dial; `basic` default, and it stays default longest_ ✅

Heaviest of the four; last because it is the most template surface
for the least marginal gain over what I.1–I.3 will have proven.

- **Ruling: offer both, default `basic`.** Four crates per context
  minimum, each a `Cargo.toml` and a workspace member line. Unlike
  Go there is no nearly-free modulith. Rust's walls are the strongest
  of the four once paid for, so a project that _knows_ it has two
  contexts should start at `modulith` — but that is the user's call,
  not the default.
- **Four crates is the floor, and only three of them are obvious.**
  `<ctx>-user-side-service` must be its own crate: whatever crate owns
  the peer API hands consumers everything else it exports, so folding
  it into `domain-contract` gives every gateway a legal edge to the
  peer's domain. Conversely the contract/core split is _not_ required
  for the wall (a private `mod` does that) — it is bought for
  incremental rebuild blast radius. Templates should still emit both,
  but the README should say why.
- **Resolver** `rust-module-layout.ts` owns paths, the **crate name**
  and its **three spellings** (`modules/ordering/user-side/service` →
  crate `ordering-user-side-service` → identifier
  `ordering_user_side_service`, appearing in the member list,
  `[dependencies]` keys and `use` statements respectively), and the
  relative **`path =` depth** in every dependency entry — the exact
  `upToRoot` bug, transplanted.
- **`platform-kernel` is load-bearing here** in a way it is not on the
  JVM: native `async fn` in traits is _still_ not dyn-compatible on
  rustc 1.94, so the kernel must ship the `BoxFuture` alias and every
  port template must return one. Emitting `async fn` in a port trait
  produces a walking skeleton that does not compile the moment a
  second adapter is wired as `Arc<dyn Port>`.
- **Adapters to touch:** `rust-cors`, `rust-observability`,
  `rust-persistence`, `rust-port-fake`, `rust-http-image`.

#### The peer seam leaks, and I.4 builds to this rule (decided 2026-08-14)

Compile-verified on rustc 1.94.1: Rust's crate graph prevents _naming_
a crate you do not depend on, but not domain types _flowing_ across the
peer seam. A gateway crate with no edge to `ordering-domain-contract`
held a domain value returned through the service crate's public API and
read its fields — no error, no warning. Inference supplies the type the
consumer cannot write. So "the seam carries only the service crate's
own DTOs" is a rule Rust does not hold for us, unlike the JVM (where
build scope holds it) or Go (where unnameability does).

**Ruling: option (a), reinforced structurally, with (c) staged behind
stabilisation.** Reasoning, since the three candidates are not
equally weighted:

- **(b), a custom lint, is not actually available on stable.** Checking
  "every type in the seam crate's public API is declared by that crate"
  needs the public API surface, and on stable there is no supported way
  to get it — `cargo public-api` and `cargo-semver-checks` both consume
  rustdoc JSON, which is nightly-only; `cargo-deny` bans dependency
  _edges_ and cannot see type flow at all; a clippy lint would have to
  ship as a `dylint` crate pinned to its own nightly. So (b) needs
  nightly too, and costs more than (c) for the same result. It is out.
- **(c) is exact but disproportionate.** `-Z public-dependency` with
  `public = false` and `#![deny(exported_private_dependencies)]` catches
  leaked return types _and_ constructor parameters. But enabling it pins
  the whole scaffolded project to nightly — every `rust-cli` and
  `rust-http` user, including the `basic`-layout majority who have no
  peer seam at all — to enforce one rule on one crate. That trades the
  binding spec's "always latest stable" for a wall most projects will
  never test. Not worth it today.
- **(a) is weaker than it sounds, and stronger than it reads.** The rule
  governs the `pub` items of exactly one small, rarely-edited crate per
  context, whose entire purpose is to be that seam. It is not a rule
  spread across a codebase; it is a rule about one file's public
  signatures, and `cargo tree` names the one crate a reviewer must look
  at.

So I.4 emits a `<ctx>-user-side-service` whose public API is its own
DTOs, states the rule in that crate's own module doc **at the point
where it would be violated**, and carries it into the stack's
`AGENTS.md` addendum. The upgrade path is pre-written so it is
mechanical the day `public-dependency` stabilises: add `public = false`
to the seam crate's `<ctx>-domain-contract` dependency and
`#![deny(exported_private_dependencies)]` to its crate root — two lines,
no restructuring.

**This stays partially open, and should be described that way.** The
_stance_ is decided; the _enforcement_ does not exist on stable, so
Rust's peer seam is genuinely weaker than the JVM's and Go's. The
comparison table should say so rather than imply parity. It does not
block I.4 — the failure mode is coupling that compiles, not a broken
build.

**Landed.** `rust-module-layout.ts` owns the crate name, its three
spellings and the `path =` depth (35 unit tests, written before any
template — they caught the `basic` root crate deriving an empty
package name from its empty directory). `rust-bootstrap-modulith`
emits the workspace; the entrypoints serve both layouts from one
template tree, since only the destination and the registration
differ. `platform-kernel` ships `BoxFuture`, `boxed!` and a
`block_on` for the synchronous CLI assembly, and pins
dyn-compatibility in its own tests.

Two design points moved during the work, both recorded in the PR:

- **The peer context ships on Rust**, reversing the reading that
  I.1–I.3's precedent implied otherwise. It is what makes the seam
  demonstrable, which matters more here than elsewhere given how weak
  the seam is.
- **The seam ruling was re-verified rather than assumed**, on rustc
  1.94.1: naming a crate with no edge fails (`E0432`); a domain type
  flowing through the seam is read by a consumer with no edge, no
  warning; `-Z public-dependency` is rejected by stable. All three as
  the 2026-08-14 ruling states.

`rust-cors` moved to `rustMain(tags, typology)`, the Rust `goMain`.
`rust-observability` moved to the full resolver — its hard-coded
`src/bin/http/main.rs` was the flat-path trap this item named, and it
blocked the `rust-http` cell loudly rather than emitting an unbound
file. `rust-http-image` needed no change, because the binary name
deliberately does not move with the layout.

**Commits.** `refactor(e2e): extract the Rust e2e harness`,
`feat(walking-skeleton): rust module layout resolver`,
`feat(walking-skeleton): modulith module layout for the Rust stacks`,
`feat(walking-skeleton): the Rust peer bounded context`,
`feat(gateway): resolve the rust-cors assembly through the layout`.

### I.5 — `rust-persistence` under the modulith (M) ✅

The one Rust vertical I.4 did not port, and it is a different **shape**
of job rather than a longer one. Its adapters must become a crate of
their own under `modules/<ctx>/infra/postgres` — manifest, workspace
member, assembly dependency — where the other three verticals only
needed a path resolved. That is the whole of it: a template and
adapter restructure, no new primitives, no CI work.

**Correction (2026-08-15).** I.4 recorded that the cell was also
blocked on Docker — that the contract test wants a Postgres through
Testcontainers, which the `rust` shard cannot provide. That was
written without checking the precedent and it is wrong. The JVM
already runs `tests/e2e/modulith-persistence.test.ts` in
`jvm-modulith-quarkus-java`, whose `tools:` line is `java javac gradle
mvn` and carries no `docker`: `tests/support/jvm-rest-e2e.ts` excludes
the Testcontainers _test_ tasks while still compiling them, so the run
proves the module graph wires and skips only the database assertion.
Rust needs even less than that. The emitted contract test already
probes `docker_available()` and returns early with `skipping: no
Docker daemon available`, so the skip lives in the generated code
rather than in the harness — `cargo test` compiles every crate, which
is what proves the wiring, and the one Testcontainers test skips
itself. A `modulith-rust-persistence` cell therefore belongs in the
existing `rust` shard with `tools: cargo`, unchanged. **Do not add
Docker to that shard.**

Neither Rust stack carries persistence by default, so nothing
scaffolds into this gap; only brownfield `keel add persistence` on a
modulith project reaches it, and that failed at the front door with
the reason and the workaround rather than on a missing patch target
until this item landed.

**Landed, and the correction above held.** No CI work, no Docker: the
cell runs in the existing `rust` shard with `tools: cargo` and the
emitted contract test skips its one Testcontainers case itself. One
template tree still serves both layouts — every destination and every
`use` spelling resolved through `rustLayout` — and the `basic` output
is byte-for-byte unchanged, verified by diffing the emitted tree
against the previous commit's rather than by assertion.

Three things worth recording:

- **`clock_sys` went to `platform-kernel`, deliberately.** The
  alternative was a `platform/clock` crate beside it, and the cost of
  the choice is real: the kernel stops being purely type-level
  plumbing. Kernel won on the resolver's own standing reason — one
  struct does not earn a manifest, and whatever holds it must be
  depended on by every context anyway, which the kernel already is.
  It is also where I.4 put the `Clock` port and its fake.
- **The fakes ship in the infra crate, with the adapter they stand in
  for**, which means the contract crate's integration test reaches
  them through a _dev_-dependency back onto that crate. Cargo permits
  the cycle because a dev-dependency is not part of the library's own
  graph, so no consumer of the domain inherits it.
- **The one-shard decision was re-measured and the answer moved.**
  This cell is the new floor, on the runner and not just locally:
  427.14s of test time in 180.08s wall (divisor 2.37) against a
  longest single file of 178.88s — the wall _is_ that file, where the
  five older files' longest is 91.97s. The job used to sit at ~98s.
  Unlike the old shape, where every file paid the same cold axum
  compile, peeling this one out would cut real wall clock rather than
  relabel it, so for the first time the Rust shard's split has a case.

  Not acted on, because the size of the win is estimated rather than
  measured: 178.88s is the _contended_ cost, and run alone the file
  would be faster (locally 98.99s alone against 195.29s contended), so
  a split plausibly lands the job near ~120s rather than at the ~90s a
  max-of-halves reading suggests. The missing figure is the
  uncontended runner number, and the workflow comment says so.

### I.6 — the peer context beyond the JVM and Rust (M) ✅

`--with-peer-context` existed on the twelve JVM stacks and on the two
Rust ones. Go, `ts-http` and `web-components` shipped their modulith
without it, which left their seam asserted rather than exercised — the
same hole I.4 closed for Rust. It is also the natural predecessor of
`keel add module <name>` rather than a competitor to it: a second
context emitted by flag is most of the machinery a second context
emitted by command would need.

**Landed, and four things are worth recording.**

**A silent no-op went first.** `--with-peer-context` on a stack with
no peer-context adapter was accepted, emitted nothing, and exited 0 —
verified against `main`, not inferred. The resolver could not catch
it: a peer-context adapter declares `covers: []`, so no dimension goes
uncovered and the hard-fail that catches "no adapter for this stack"
everywhere else structurally cannot fire. The gate is derived from the
adapter set rather than from a list of stack ids, so a family gaining
its adapter opens the front door by itself.

**Go needed a seam before it could have a peer, and it got its own.**
Go had no `user-side/service` at all: its facade returns
`domain.Greeter`, a type no consumer can name, so a peer could not
even _call_ it. `internal/modules/<ctx>/userside/service` now declares
the types a peer may write down. The docs state Go's wall rather than
copying Rust's prose — `internal/` is scoped to the project root, so
the seam narrows nothing; what Go enforces is _placement_, and the
peer's gateway cannot reach greeting's domain at all. On that one
point Go is **stronger** than Rust, where a domain type still flows
across the seam by inference.

One claim was checked and found false, so keel declines to make it:
unnameability does not stop a peer calling through. Verified on
go1.24 — assignability is structural for unnamed types, so
`greeting.NewGreeter().Greet(struct{ Name string }{…})` compiles from
a foreign context with both names undefined there. It buys coupling
nothing declares, to a shape that breaks on the first added field,
which is an argument for the seam rather than a hole in it.

**On both TypeScript stacks the peer wall is a lint, and the suites
say so out loud.** The `exports` map holds depth (`TS2307`); it cannot
hold the peer rule, because greeting's facade legitimately publishes
its contract face. So the gateway importing `@scope/greeting` whole
typechecks perfectly clean and only `peers-meet-at-the-service-seam`
objects. Each e2e asserts the clean `tsc` **beside** the red
`depcruise`, so the asymmetry is a fact the tests re-establish rather
than a claim in a doc that could quietly stop being true.

**The e2e premise this item was scoped on was wrong, and correcting it
shrank the work.** It was stated that these three stacks had no
modulith e2e at all. They did — Go's had been built, vetted, served
and wall-probed since the dial landed, `ts-http`'s ran on both package
managers, `web-components` had a bundle inspection plus a
headless-Chromium render. What was missing was that none of it was a
_file_: every case rode inside its stack's `walking-skeleton-*` suite,
invisible to `ls tests/e2e/` and flooring that file with its slowest
case. So the grid work was a restructure into one-file-per-cell plus
exactly two genuinely absent cells — `modulith-go-cli` (the CLI shape
had never been built under the modulith, and it does not share an
assembly with `go-http`) and `modulith-web-components-pnpm`. Both
passed on the first run; no defect was waiting in either.

**Commits.** `fix(cli): --with-peer-context on an uncovered stack is
not a no-op`, `feat(walking-skeleton): the Go modulith gains a peer
seam`, then one `feat` per stack, then `test(e2e)` for the cell
restructure and the peer-context suites.

### Not in scope for I

`keel add module <name>` — emitting a _second_ bounded context with
its peer port and gateway wiring — stays a separate backlog item. It
is what makes the seam demonstrable rather than merely present, and it
is worth far more once I.1–I.4 have settled each language's resolver.

---

## J — Close the JVM modulith grid, then put language on the CI axis ✅

**Goal.** **H** closed the `basic` grid: all twelve JVM stacks are
built, booted and driven. It did not close the **modulith** one, and
the two are not the same table. A modulith cell is a stack _and_ a
build system — the layout is where leaf project names repeat
(`contract` under both `domain/` and `user-side/api/`), where the root
build derives per-path groups to keep them apart, and where Gradle's
coordinate resolution and Maven's reactor order genuinely diverge.
Twelve stacks × two build systems is **24 cells**, and **five** of
them have ever been through a compiler:

|                | Java Gradle | Java Maven | Kotlin Gradle | Kotlin Maven |
| -------------- | ----------- | ---------- | ------------- | ------------ |
| Quarkus REST   | ✅          | ✅         | ⬜            | ⬜           |
| Spring REST    | ✅          | ✅         | ⬜            | ⬜           |
| Micronaut REST | ✅          | ⬜         | ⬜            | ⬜           |
| Quarkus CLI    | ⬜          | ⬜         | ⬜            | ⬜           |
| Spring CLI     | ⬜          | ⬜         | ⬜            | ⬜           |
| Micronaut CLI  | ⬜          | ⬜         | ⬜            | ⬜           |

**Every ⬜ above is now a ✅**, and each is a suite of its own —
`tests/e2e/modulith-<stack>-<build>.test.ts`, 24 files for 24 cells.
The table is left as this item found it, because the shape of the gap
is the part worth remembering: the empty cells came in _blocks_, and
that is what made them expensive (see "What the grid caught").

Everything in the empty cells is **written and shipped**. All twelve
stacks carry a `templates-modulith/` tree,
`walking-skeleton/jvm-build-modulith/` has `gradle/` and `maven/`
variants for all twelve, and the peer context has six adapter ids
across four files in `src/domain/core/adapters/*-peer-context.ts` —
one per (framework, language). Nothing here needs writing. What is
missing is that almost none of it has ever been compiled.

**All nineteen get built — one e2e suite per cell.** That is a
deliberate choice against the cheaper one, and it costs roughly double
the e2e runner time the JVM half spends today. The case for it is that
every alternative is an argument about which cells are _redundant_,
and such an argument is exactly what a grid exists to stop anyone
having to make. A factorised subset — "the Kotlin binding is one file
shared by both shapes, so Kotlin × CLI is the product of two covered
factors" — is a plausible independence claim about code nobody has
compiled, which is the same class of reasoning that left nineteen
cells empty in the first place. An unstated gap is the failure mode
this line of work exists to remove; a stated-but-guessed one is only
marginally better. After J, the table has no `⬜` and no paragraph
explaining why some `⬜` is fine.

The bill is stated rather than buried: 19 new suites at roughly
3–5 minutes each, which J.4 has to absorb by resharding rather than by
letting one job run 35 minutes.

_Landed as **20**, not 19._ `quarkus-rest` on Gradle was counted as
covered when this was written and was not — see J.2.

### What the grid caught

**Three shipped defects, and H's "expect green" did not hold.** H
closed its grid without surfacing one, and this item was written
expecting the same. It was wrong, and the reason is worth keeping:
H's grid was framework × language × shape, and every cell of it had a
_neighbour_ that had been built. This one had a **contiguous** hole —
no Micronaut project had ever been built by Maven, in any layout or
language, because the Maven e2e coverage added with the peer context
reached Quarkus and Spring only. Three defects were living in it:

1. **The reactor root managed no versions.** Only the assembly parents
   `micronaut-parent`; every other module parents the reactor root,
   and Maven allows one parent — so the library module holding the
   framework-facing adapter declared `io.micronaut:*` with nothing to
   resolve a version from. Maven failed while _reading the POMs_.
2. **That module never ran the annotation processor.** Micronaut
   resolves beans at compile time, per compiled module, and its Maven
   pom had no `<build>` section at all. Silent in the worst way: it
   compiled, packaged, started clean, and 404'd every route. Gradle
   was never affected — `io.micronaut.library` is exactly this.
3. **A protobuf version skew between the two build systems.**
   `micronaut-micrometer-registry-otlp` ships protoc-4.x-generated
   classes but asks for protobuf-java 4.28.3 in its Gradle module
   metadata and 3.25.8 in its POM. Gradle reads the first and resolves
   a working classpath; Maven reads the second and cannot instantiate
   the meter registry at all.

Defect 3 is **not modulith-specific** — checked rather than assumed:
`micronaut-rest --build-system=maven` fails identically under `basic`.
Its fix went into the shared observability wiring and repairs both
layouts, which means this item fixed a stack combination outside the
grid it set out to close.

The lesson generalises past Micronaut: **a grid's value is highest
where its unbuilt cells are adjacent**, because a lone unbuilt cell is
usually a translation of a built neighbour, and a block of them is
usually a capability nobody has ever exercised. Worth reading the next
table for blocks rather than for counts.

Ordering is the same rule **H** was built around and it still binds:
**populate the grid first, shard second.** Language is not a CI axis
today for exactly one reason — the modulith half has no Kotlin suite,
so `e2e (jvm-kotlin)` would be a check name over a cell nothing
populates. J.1 is what makes the reshard legal, which is why the
reshard is J.4 and not J.1.

### J.0 — One file per cell (prerequisite, S) ✅

A 24-cell grid needs its suites named after their cells, or the
invariant "every cell has a suite" is unverifiable by reading
`tests/e2e/`. Today four files hold five cells under names that
predate the grid (`walking-skeleton-modulith.test.ts` is
Quarkus/Java/Gradle; `-maven.test.ts` holds _two_ cells, Quarkus and
Spring). Rename the modulith suites to `modulith-<stack>-<build>.test.ts`
and split the Maven pair, so the grid reads off `ls` and the shard
matrix in `ci.yml` names cells rather than history.

`modulith-persistence.test.ts` keeps a name of its own: it is not a
grid cell but a vertical layered onto one.

Pure rename plus a matrix update — no new coverage, and
`tests/ci-workflow.test.ts` is what proves the matrix kept up.

**Commit.** `refactor(e2e): name the modulith suites after their grid cell`

**Landed.** Five files became seven — the Maven pair split — and the
matrix followed in the same commit. No coverage changed; both split
cells were run before and after (Spring 150s, Quarkus 181s).

### J.1 — The Kotlin REST modulith row (M) ✅

Six cells: `quarkus-rest-kotlin`, `spring-rest-kotlin`,
`micronaut-rest-kotlin`, each on Gradle and Maven, all
`--module-layout=modulith` with the peer context. Highest value in the
table, and not because it is the biggest gap — because the Kotlin peer
wiring is **different code, not a translation**. Micronaut's Kotlin
composition root wires handlers **by hand**
(`RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))` in a
`MediatorFactory`), because `@Import(annotated = …)` is Java-only and
annotation discovery would drag KSP into `domain/core`. That is the
most divergent code in any peer-context adapter and it has never been
compiled.

`tests/support/jvm-rest-e2e.ts` already parameterises everything
framework-specific, and `JvmProjectSpec` already carries
`moduleLayout`, `buildSystem` and `withPeerContext`, so a REST
modulith case is a spec object and a `describe` — no harness change.

This is also what makes J.4 legal: after it, language is populated on
both typologies.

**Commit.** `test(e2e): build the Kotlin moduliths`

**Landed, and this is where the item's expectation broke.** Five of
the six passed as written. The sixth, Micronaut on Maven, failed
before compiling anything — and behind it were **three** shipped
defects rather than one, all in a single blind spot: no Micronaut
project had ever been built by Maven, in any layout or language,
because the Maven e2e coverage added with the peer context reached
Quarkus and Spring only. See "What the grid caught" below.

Micronaut's by-hand Kotlin `MediatorFactory` — the divergent code this
phase was ordered around — compiled and wired on the first run.

### J.2 — Close the Java REST square (S) ✅

`micronaut-rest` on Maven with the peer context: the last empty Java
REST modulith cell, and the only Micronaut modulith never built by
Maven. One file.

**Commit.** `test(e2e): build the Micronaut modulith on Maven`

**Landed as two cells, not one, under**
`test(e2e): close the Java REST modulith square`. `micronaut-rest` on
Maven was the expected gap. `quarkus-rest` on **Gradle** was not: it
looked covered, because `modulith-baseline` scaffolds that exact
stack, layout and build system — but without `--with-peer-context`, so
it exercises none of the peer family. Quarkus' peer binding had only
ever been compiled by Maven; the Gradle peer patches only ever under
Spring and Micronaut. **Quarkus × Gradle × peer was the empty
intersection of two covered rows** — a gap a row-wise reading cannot
see and a grid makes obvious. Both green (155s, 94s).

### J.3 — The CLI modulith, all twelve cells (L) ✅

**No CLI modulith has ever been built, in any configuration** — twelve
empty cells, the largest contiguous block in the table, and after J.1
and J.2 the only one left. The assembly differs from REST's
(`application/cli`, not `application/api`), and the peer-context
adapter resolves it from the `arch.cli` tag rather than hard-coding
it, so the CLI half of that resolution has never run.

The coverage these can claim is stronger than it looked going in. The
open question was whether an emitted CLI modulith produces a peer
wiring test the build runs, the way the REST assembly's
`GuestbookWiringTest` does — if not, the cells would be provable only
as "compiles and packages", which is weaker and would have to be said
out loud rather than quietly accepted. It does:
`jvmPeerContextAdapter` renders
`jvm-peer-context/wiring/<framework>/<language>/` into the _resolved_
assembly, whichever shape that is, and the test injects `Mediator` and
dispatches a `SignCommand` — nothing in it is REST-specific. So a CLI
modulith cell proves container discovery and peer binding, exactly as
a REST one does, and the jar it then runs proves the picocli wiring on
top.

**Commit.** `test(e2e): build the JVM CLI moduliths`

**Landed, all twelve, all green first time.** The wiring question
resolved in the strong direction, as hoped rather than as assumed —
so no cell in this grid rests on "compiles and packages".

### J.4 — Reshard along the now-populated language axis (S) ✅

Only once J.0–J.3 are green. Language is then populated on **both**
typologies for the first time, so it becomes a legal axis — the
constraint that blocked it in H.3 is lifted by J.1, not by argument.

The scale of the reshard is set by J.3, not by taste. `jvm-modulith`
goes from 5 files to 25; at H.3's measured divisor that is over half
an hour in one job, against a 400s shard today. So the question is not
whether to split it but along which axes, and how far — and every
answer must be justified on **measured wall clock on the shape
actually shipped**, not on arithmetic. H.3's prediction failed
precisely because it assumed a divisor of 4 where the measured one is
2.15–2.42 in a four-file shard and 2.78 in a sixteen-file one.

Re-measure per shard, put the numbers here, and justify the split on
what a red X tells you as much as on seconds.

Reference, #54's four shards on real runners including setup:
`jvm-quarkus` 400s, `jvm-modulith` 399s, `jvm-micronaut` 366s,
`jvm-spring` 313s.

**Landed as nine JVM shards on a per-typology shape.** `basic` keeps
its framework split (renamed `jvm-basic-<framework>`, four stacks
each); `modulith` splits by framework × **language** —
`jvm-modulith-<framework>-<java|kotlin>`, four cells each, six on
`quarkus-java` which also carries the two non-cell variants.

Language is an axis for the first time, and J.1 rather than an
argument is what made it legal. It is deliberately _not_ an axis on
the `basic` half: those shards already sit near their longest-file
floor, so splitting them buys attribution and no seconds, at three
more JDK provisionings.

Measured per shard on the shape shipped (4 vCPUs, cold caches,
sequential total → wall; every shard green):

| Shard                           | Files | Sequential | Wall | Divisor | Longest file |
| ------------------------------- | ----- | ---------- | ---- | ------- | ------------ |
| `jvm-modulith-quarkus-java`     | 6     | 1015.3     | 415  | 2.45    | 259.7        |
| `jvm-modulith-quarkus-kotlin`   | 4     | 658.7      | 291  | 2.26    | 229.1        |
| `jvm-modulith-spring-java`      | 4     | 358.7      | 160  | 2.24    | 128.0        |
| `jvm-modulith-spring-kotlin`    | 4     | 504.9      | 227  | 2.22    | 165.2        |
| `jvm-modulith-micronaut-java`   | 4     | 457.5      | 201  | 2.28    | 162.7        |
| `jvm-modulith-micronaut-kotlin` | 4     | 743.6      | 252  | 2.95    | 248.9        |

The divisor is **2.22–2.45** — H.3's finding reproduced on a different
shard shape and a different file set, with the same cause: each Gradle
build is itself parallel, and concurrent ones contend. Nowhere near
the 4 the core count suggests.

**The before number is a real runner's, not a model's.** The commit
preceding the reshard ran all 25 modulith files as one job on CI and
took **1475s** (24m35s) — green, but inside a 60-minute timeout with
less margin than it looks, since a cold Gradle CDN adds minutes and
the retry paths exist because that happens. Against a slowest shard of
415s the split is worth roughly **3.5×** in wall clock, and the
same run put the unchanged `basic` shards at 337s / 304s / 284s, which
is the band the modulith shards now sit in too.

That run is also what confirms the 20 new suites off this box: every
one of them passed on CI, on runners, before the reshard moved them.

**Confirmed after the fact, on runners.** The reshard's own CI run put
the six modulith shards at 426 / 300 / 197 / 225 / 233 / 321s
(setup included), against local predictions of 415 / 291 / 160 / 227 /
201 / 252 — close enough that a 4-vCPU box with the same JDK and
Gradle is a usable proxy for the runner, which is worth knowing before
the next rebalance. The e2e phase as a whole went from **1475s to
426s**, a **3.46×** improvement, and all fourteen checks were green.

The slowest shard is still `jvm-modulith-quarkus-java`, on the runner
as locally — so it remains the one to split first.

**The split stops at nine on the floor, not on taste.**
`micronaut-kotlin` runs 252s against a 249s longest file — already
floor-bound, so halving it again buys attribution and no wall clock.
`quarkus-java` is the only shard with real headroom left (415s against
a 260s floor) and is where to split first if it grows. That is H.3's
"limit rather than a verdict" applied: sharding pays until a shard's
divided total approaches its longest file, and one shard here has
reached that point.

**Commit.** `ci: split the modulith shard by framework and language`

### Not in scope for J

Roadmap item **I.4** — the Rust modulith layout, the last stack family
shipping `basic` only — is a session of its own and is not made easier
or harder by this one.

---

## K — Build from sources: exercise keel locally as a user would (S) ✅

Tracked in [#67](https://github.com/rgoussu-dev/keel/issues/67).
First of the next wave, and a release gate: the `[Unreleased]`
surface gets exercised as a product before it gets tagged.

**Goal.** The e2e harness proves the emitted projects; nothing proves
the **package**. Bin wiring, the `files` list, template assets
actually shipping in the tarball, and the interactive prompt flow are
all outside what the suites exercise. The working tree needs a
documented, low-friction path to being consumed the way a user
consumes it.

**Sketch.** A loop built on `pnpm build && npm pack`, installing the
tarball into a scratch prefix and running `keel new` from there —
tarball over `pnpm link --global`, because the tarball is what npm
publishes, so packaging bugs surface here instead of on the registry.
A `pnpm keel …` convenience script for the fast inner loop where
packaging fidelity is not the question. Both documented in
`docs/development.md` under "Trying keel locally", with which to use
when. Done means: from a fresh clone, the documented commands produce
a scaffolded project whose own gates pass, with no reference back to
the keel repo left inside it.

**Landed — as sketched, with one addition the sketch implied but did
not spell out.** `docs/development.md` → "Trying keel locally"
documents both loops and when each answers the question. `pnpm keel …`
chains `pnpm build` with a small runner (`scripts/keel-local.mjs`)
that spawns `bin/keel.js` inside a playground directory — the
indirection is required, not convenience, because every keel command
operates on the current working directory and pnpm runs scripts at
the package root, so the naive script would scaffold into the keel
repo itself. `KEEL_PLAYGROUND` pins the directory across invocations
(what any `keel add` flow needs), a playground resolving inside the
repo is refused, and the tarball recipe uses
`npm install --global --prefix "$(mktemp -d)"` so the real global
prefix is never touched. Acceptance was run as specified: the packed
tarball, installed into a scratch prefix, scaffolded a `ts-http`
project whose own `npm test` and typecheck pass, with no reference
back to the checkout inside it.

---

## L — `keel add --reapply`: the update path (M) ✅

Tracked in [#68](https://github.com/rgoussu-dev/keel/issues/68).

**Goal.** A scaffolded project is a snapshot: adding an installed
vertical errors (`keel.vertical-already-installed`), so a template
fix in keel is undeliverable to existing projects. Scaffolders
without a day-2 story strand their consumers; this bites the moment
the first real consumer project exists. keel is unusually well placed
— the manifest already records the stack, the `layout.*` tags and
every sticky answer, which is everything a re-render needs.

**What shipped — the conservative v1.** `keel add <vertical>
--reapply` runs the ordinary install pipeline in a second apply mode
rather than a second pipeline: same resolution, same running
manifest, one changed posture towards files already in the Tree.
Template-owned files (whole-file contributions) are rewritten to the
pristine re-render — a byte-identical render is skipped, so the
staged plan is an honest diff, and every real rewrite is reported as
a unified diff against the working tree (`--dry-run` shows it without
writing). Patched files — the shared, user-owned ones — are never
rewritten: a patch whose re-application is a no-op (the guarded style
every in-tree adapter uses, which the reapply apply-mode tests now
pin) passes silently, and one that would change the file refuses the
whole run with `keel.reapply-conflict` before anything commits,
because without a recorded base a changed result cannot be told apart
from a double application.

**The open questions, settled for v1 rather than guessed.**

- _Which sticky answers may move on reapply:_ none. Resolution is
  non-interactive from the manifest, and `--set` with `--reapply` is
  refused (`keel.reapply-frozen-answers`). A question a vertical grew
  since the original install resolves to its default and is recorded
  like any first ask — which is exactly the template-evolution case
  reapply exists for.
- _`tagsAdd` idempotence:_ re-promoted tags fold through the
  manifest's existing set semantics, so they never double; the
  vertical record keeps its original `installedAt`. A tag the new
  render no longer promotes is left in place — orphan-removal needs
  the recorded base below, and guessing it now would delete facts.
- _Span:_ one vertical per invocation. Reapplying a whole manifest is
  a loop the caller can write today; a first-class `--all` can come
  once the per-vertical semantics have seen real consumer use.

**What remains open — the real three-way merge.** Overwriting a
template-owned file the user edited is still lossy (the diff shows
exactly what would be lost, which is the v1 safety valve). Merging
user edits needs a base, and the base is still the design question —
a recorded rendering, or a re-render pinned to the keel version that
originally installed the vertical, which the manifest would then need
to record. That is the next step of this item, not part of v1.

---

## M — IaC vertical (OpenTofu) (L) ✅

Tracked in [#69](https://github.com/rgoussu-dev/keel/issues/69).
Built in parallel with K and L — the vertical is independent of both,
so the wave's ordering was a sequencing preference, not a dependency.

**Goal.** The binding spec mandates IaC; the skeleton emits none.
**E** left the hook deliberately — `dist.container-image` is "the tag
a future IaC or deploy vertical keys on". This closes the loop from
`keel new` to running-in-an-environment.

**Landed — as sketched: one adapter (`iac/deploy-target`) keyed on
`dist.container-image`,** provisioning the deploy target the
`distribution` vertical publishes to, matching the recorded
deployment flavor: `compose` → a Docker VM (engine via cloud-init,
firewall for SSH + the service port, deploy loop over
`DOCKER_HOST=ssh://…` so image and config ride one command's
environment), `helm` → a managed Kubernetes cluster (version by
latest-stable data source per spec §7, one default pool). The flavor
is **read from the recorded distribution answer, never re-asked** —
the same rule as the JVM image flavor in E: a second question could
provision a target the emitted descriptor cannot use. Decisions on
record:

- **The cloud dial blessed DigitalOcean (default) and Scaleway, and
  deliberately not a hyperscaler.** The issue said the provider
  question is better answered by a real consumer project than a
  guess; absent one, the blessed pair is the smallest honest answer —
  each serves both flavors with a screenful of OpenTofu (droplet /
  DOKS with state in Spaces; instance / Kapsule + its required
  Private Network with state in Object Storage), which keeps the
  dial's shape proven without shipping unexercised VPC + IAM
  surface. AWS/GCP/Azure are new choices on this dial when a
  consumer drives them — subtrees, never adapters. Hetzner was
  declined for now: no GA managed Kubernetes, so it cannot honor the
  flavor mapping; re-open (as a compose-only choice with a loud
  helm refusal) if a real consumer asks.
- **Binding spec §5 shaped the tree, including the bootstrap
  chicken-and-egg.** Root `iac/<cloud>/`, remote state by default in
  the provider's S3-compatible object storage, one state per
  environment via workspaces. The state bucket itself is provisioned
  by a one-shot `bootstrap.sh` running a local-state bootstrap
  config — the bucket is the one resource that cannot live inside
  the remote state it hosts, and its tiny secretless tfstate is
  committed on purpose.
- **No credential ever lands in a file.** Provider blocks are empty
  (auth via `DIGITALOCEAN_TOKEN` / `SCW_*`, the backend via the
  `AWS_*` pair), `*.tfvars` is gitignored, and the target carries no
  service config — every knob stays in the descriptor's
  environment, so the environment-agnostic image serves every
  workspace. Asserted in the suite, not just documented.
- `tagsAdd: ['iac.opentofu', 'cloud.<choice>']` — both namespaces
  the tag vocabulary had reserved from the start.

What this item does **not** prove, same caveat as E and F: the
emitted configurations have not been applied against the real cloud
APIs — the suite asserts their content. The first consumer project's
`tofu apply` is where that evidence arrives.

**Commits.** `feat(iac): OpenTofu deploy target for the recorded
deployment flavor`

---

## N — Project toolchain provisioning (`keel toolchain`)

Sliced and issue-tracked (2026-08-18), one session per issue:
**N.0** ([#87]) → **N.1** ([#88]) → **N.2** ([#89]) → **N.3**
([#90]) → **N.4** ([#91]); **N.5** ([#92]) depends only on N.1 and
can run in parallel with N.3/N.4. **N.6** followed N.4, closing the
prefix-resolution gap N.3 opened. N.0–N.4 and N.6 have shipped; the
launch provider set is complete.

**Goal.** Every stack page ends in a "Required on PATH" table and a
you-problem: keel scaffolds a project targeting JDK 25 and leaves
installing JDK 25 to the user. The `dev-container` vertical answers
this only inside Docker; bare metal — a new laptop, a teammate's
clone, a web session whose image left `JAVA_HOME` on 21 (see
`docs/development.md`) — gets a loud error and a manual remedy. This
item makes a scaffolded project **declare** its toolchain and makes
satisfying that declaration a one-command, idempotent, re-runnable
operation: clone → `keel toolchain install` → working environment.

**Decisions on record** (design discussion, 2026-08-18):

- **Orchestrator, never installer.** keel delegates to real version
  managers (mise, asdf, sdkman, nvm, corepack, rustup). Owning
  downloads, checksums, and platform matrices is a second product
  with its own churn; keel renders declarations and shells out to
  managers whose `install` is idempotent by construction.
- **The manifest is the contract.** A versioned `toolchain` block
  records the _needs_ (tool + version), written by a vertical from
  the manifest's tags and `assets/composition/version-pins.json`;
  the provisioning engine consumes it at any later time. keel owns
  _what_, the engine owns _how_ — which is also what makes the
  engine extractable.
- **Ecosystem files remain the interface with the ecosystem.** The
  engine renders the chosen provider's _native_ files (`mise.toml`,
  `.tool-versions`, `.sdkmanrc`, `.nvmrc`, `rust-toolchain.toml`),
  so IDEs, CI images, and colleagues who have never heard of keel
  still see plain files their tools already understand. Env wiring
  (`JAVA_HOME`, `PATH`) belongs to the manager's own activation,
  never to profile files keel writes.
- **The coverage invariant.** The manager is a dial, and every
  choice on it — single provider or curated combination — covers
  the project's whole needs set. A provider that covers everything
  is offered alone (sdkman on a JVM-only project); where none does,
  a combination of providers is offered _for the same coverage_
  (nvm + corepack on the pnpm-tagged TS profiles); a partial choice
  is never offered. This is the persistence vertical's
  "no half-installs" rule applied to choices. Combinations are
  compositions of member provider records, never records of their
  own.
- **Modulith first, extraction later.** The engine is a bounded
  context inside keel — its own hexagon, meeting the rest only at
  the block schema, the seam held by dependency-cruiser. When
  provider churn starts forcing keel releases that change nothing
  else, the context extracts to its own package and the block
  schema to a shared one; keel thereby demonstrates the
  modulith-to-extraction story its own binding spec sells.
- **Providers grow demand-driven.** Each record costs a
  version-spelling column in the pins registry and a currency
  surface. Launch set: mise (default), asdf, nvm + corepack,
  sdkman (JVM-only by the invariant), rustup, and Go's native
  `go.mod` `toolchain` directive as an explicit "no manager
  needed" choice.

### N.0 — the versioned `toolchain` manifest block (S) ([#87])

The contract and nothing else: the block's zod schema + types in
`domain/contract` (`schemaVersion`, needs as tool + version over a
closed tool vocabulary), round-tripped through `ManifestStore`,
documented in `docs/composition.md`. No writer, no consumer.

### N.1 — `keel add toolchain`: the vertical records needs (M) ([#88])

Opt-in vertical, one predicate-selected adapter per family, deriving
needs from tags (`runtime.jvm` + `pkg.*` → jdk + build system; …)
with versions from the pins registry. Reapply-safe; composites
record per service.

### N.2 — the engine + `keel toolchain install`, mise walking skeleton (L) ([#89])

The new bounded context, the provider-record model, and one provider
end to end: read block → render `mise.toml` → `mise install` when
present, a loud graceful message when not. `keel toolchain check`
alongside. Real-install suite opt-in and env-gated, never in the PR
matrix.

### N.3 — the manager dial: coverage resolution (M) ([#90]) ✅

The choice list computed from the needs set per the coverage
invariant; asdf, nvm, corepack records; nvm + corepack as the first
combination; the choice sticky on the manifest; the invariant itself
a unit test.

**Shipped.** `dial.ts` computes the offered list — singles that
cover whole, then curated combinations that cover whole and whose
every member earns its place, which is what keeps `nvm+corepack` off
the npm-tagged profiles where corepack contributes nothing. The
choice is recorded as one field on the block (`provider`), written
by the engine rather than the vertical, and re-validated on every
run. The invariant is asserted against needs sets derived from the
real family adapters, not hand-written ones.

Two things the slice settled that the sketch did not anticipate:

- **nvm is a shell function, not a binary**, so its record reaches
  it through a login shell that sources `nvm.sh` — and `.nvmrc`
  carries a bare version, no header, because the format has no room
  for one.
- **corepack's "native file" is the project's own `package.json`.**
  Its record merges the `packageManager` field in place instead of
  rendering a file; keeping the block the source of truth (a pin
  bump reaches `package.json` on the next install) without keel
  reformatting a file it did not write. Its status probe is the
  `pnpm` shim, which without a TTY refuses to download rather than
  fetching — the read-only answer `check` needs.

**One fidelity gap, deliberately on record.** asdf documents
`.tool-versions` as a lockfile: concrete versions only, `latest`
explicitly forbidden there. The block pins majors for the JDK and
Node, so the rendered line is a prefix that only a plugin accepting
one will resolve. Resolving through the manager
(`asdf latest <plugin> <prefix>`) needs a resolution step that runs
_before_ rendering — and one that degrades honestly when the manager
is absent, since N.2's guarantee is that the config renders anyway.
It was sketched as N.4's business, survived it untouched (no record
N.4 added needs one — see that slice's note), and **closed in N.6**,
which built the resolution step and found sdkman needed it too. mise
stays the default regardless, its resolver taking prefixes natively.

### N.4 — sdkman, rustup, and the ecosystem-native no-ops (M) ([#91]) ✅

sdkman (offered only where it covers everything — JVM-only),
rustup via `rust-toolchain.toml`, and Go's `go.mod` `toolchain`
directive as an explicit no-op choice whose "action" is a
consistency check.

**Shipped.** Three records, and the dial needed no new machinery for
any of them: `covers` is `{jdk, gradle, maven}` for sdkman, `{rust}`
for rustup and `{go}` for go-native, and the coverage invariant does
the rest — sdkman is offered on JVM-only projects and vanishes the
moment one also declares Node, with nothing in `dial.ts` mentioning
either. The dial's own test now asserts that disappearance directly,
alongside the per-profile choice lists.

Three things the slice settled:

- **`sdk` is a shell function too**, so sdkman's record reaches it
  the way nvm's reaches nvm — a login shell sourcing
  `sdkman-init.sh`. Its read-only status is `sdk env` (which
  activates but never installs) followed by `sdk current`, so a
  candidate that is missing simply never shows up.
- **rustup is thin because the ecosystem made it thin.**
  `rust-toolchain.toml` is honored natively by every cargo
  invocation, so there is no activation story to write. The one
  decision is the spelling: the block pins a bare Rust major, since
  the scaffolds track latest stable by construction, and rustup has
  no "series" channel — `stable` is exactly what that major means,
  and it joins the pin registry as a keel-chosen spelling.
- **The no-op still renders, and that is what makes it a check.**
  go-native's native file is `go.mod`, which belongs to the project,
  so it merges the `toolchain` directive in place the way corepack
  merges `packageManager` — and the engine's existing "does the
  render match disk" comparison turns that into the consistency
  check the sketch asked for: `check` reports drift, `install`
  writes it back, and no command runs either way. The directive is a
  floor rather than a pin, so a newer local Go is used as is.

**The asdf prefix gap N.3 carried here was left open, and one of the
reasons given for that was wrong.** The slice declined to build the
resolution step because none of its three records needed one —
rustup's `stable` needs no resolving and go-native's directive is a
floor, both of which hold. But the third reason, that "sdkman spells
the JDK major as a candidate version", does not: SDKMAN! candidate
identifiers always carry a patch, so the `java=25-tem` this slice
shipped names nothing installable and `sdk env install` refuses it.
The gap was not one record's, it was two. **N.6** closes both.

### N.5 — single-source pins: dev-container and CI converge (M) ([#92]) ✅

The devcontainer features and the `ci` setup versions derive from
the same registry entries as the block, with an agreement guard in
`verify` shaped like `tests/version-pins.test.ts`. Values converge;
mechanisms stay native (CI keeps its setup actions).

**Shipped.** `src/domain/core/adapters/version-pins.ts` holds the
map — `TOOLCHAIN_PIN_SOURCE`, one registry entry id per tool — and
the block, the dev container features and both CI flavors resolve
through it. The emitted CI templates render their versions rather
than literalizing them, and `tests/toolchain-pins.test.ts` scaffolds
every family and reads the versions back out of the emitted files.

Two things the slice settled that the sketch did not anticipate:

- **The guard has to assert over emitted projects, not constants.**
  Comparing the adapters' sources to the registry is a tautology once
  they read it; the disagreement that matters is between the files a
  user ends up with. So the guard scaffolds, parses
  `devcontainer.json` / `ci.yml` / `.gitlab-ci.yml`, and compares
  what they say to the block. Hardcoding any one of them turns it
  red — which is the "demonstrably fails when one is edited alone"
  the issue asked for, and was verified by doing exactly that to each
  surface in turn.
- **Absence is a state worth pinning down.** Three surfaces
  deliberately name no version — GitHub's `go-version-file: go.mod`,
  `rustup update stable`, corepack reading `packageManager` — and a
  guard that only checks stated versions would let one grow a literal
  silently, or let another lose its version and still pass over less
  coverage. The guard therefore lists, per family, exactly which
  `surface:tool` pairs state a version, so both directions are red.
  Rust is the one family with a floating pin (`image-rust`, a
  major-only tag): `latest` counts as agreement there and nowhere
  else, which is why its devcontainer feature stays versionless.

One behavior change fell out of the convergence: the Go dev container
now asks for the pinned minor instead of `latest`, so the editor's
toolchain and `go.mod` agree by construction.

### N.6 — resolving prefixes through the manager (S) ✅

The step N.3 first asked for and N.4 left standing: a provider whose
native file is a **lockfile** gets an exact version, not the series
the block pins.

**Shipped.** An optional `resolve` on the provider record — is this
spelling a prefix, what does the manager's own lookup for it look
like, how is its answer read, and what does the config already carry
— plus one engine pass that runs before any render, in both handlers.
Records that take a prefix natively declare none and run no extra
process, so this is invisible on mise.

Three things the slice settled:

- **The obvious order is the wrong one.** Asking the manager first
  and falling back to the file reads naturally and is a bug: every
  `check` would re-query upstream and call a perfectly good lockfile
  stale the day a patch shipped, which is the opposite of what
  pinning a series means. **Lockfile order** — the file first, the
  manager only when nothing on disk still answers — makes a re-run
  write nothing, keeps the steady state free of any process at all,
  and means an absent manager can never overwrite a resolved file
  with the prefix it came from. A pin bump still moves it, exactly
  once, because the recorded value stops answering.
- **The gap was two records wide, not one.** asdf was the one on
  record; sdkman has the identical defect and N.4 shipped it —
  `java=25-tem` is not an SDKMAN! identifier. The seam was built
  generic and both wired.
- **Failing to resolve stays a report, never a refusal.** N.2's
  guarantee is that the config renders whatever happens, so an
  unresolvable prefix renders as it always did and rides both reports
  as `unresolved` — counted against `check`'s verdict, printed as a
  warning, never a guess at the patch half.

The two lookups are the managers' own (`asdf latest <plugin>
<prefix>`, `sdk list <candidate>`) and both are read-only. SDKMAN!'s
table layout is not a documented contract, so that parse is a
format-agnostic scan whose failure mode is `undefined` — which lands
on the pre-existing behaviour rather than on a wrong version.

### Not in scope for N

- Extracting the engine or the block schema to their own packages —
  the seam is built now, the split waits for the churn signal above.
- Real `mise`/`sdk` installs in the PR matrix (opt-in suite only,
  the `tests/currency/` pattern).
- Windows-native provisioning stories.
- Auto-bumping pins — bumps stay human-reviewed, proved by the e2e
  grid, per the version-currency decision.

[#87]: https://github.com/rgoussu-dev/keel/issues/87
[#88]: https://github.com/rgoussu-dev/keel/issues/88
[#89]: https://github.com/rgoussu-dev/keel/issues/89
[#90]: https://github.com/rgoussu-dev/keel/issues/90
[#91]: https://github.com/rgoussu-dev/keel/issues/91
[#92]: https://github.com/rgoussu-dev/keel/issues/92

---

## O — `code-style`: the layout contract (M) ✅

The convention teams most agree they should have and least often get
around to, because the setup is fiddly in every ecosystem and the
fiddliness is different in each one. keel does it once, from one
model, for every stack.

**The gap was total.** Scaffolded projects shipped zero style
configuration, zero format or style-lint CI steps and zero editor
settings, across all five families — while the binding spec keel emits
into every project (`assets/project/AGENTS.md §6`) claims every commit
passes "format, typecheck, lint". The only thing called `lint` was
`depcruise` on the three modulith roots, an _architecture_ rule. Go
and Rust auto-fixed in the pre-commit hook but nothing anywhere ever
_checked_, so style was enforced only on commits Claude itself made.

### The finding that shaped it

**There is no runtime "one config to rule them all", and shipping
`.editorconfig` alone would have been a placebo.** Measured against
the toolchains rather than assumed — `.editorconfig` reaches the
actual formatter in **two of five** families:

| Family | Reads `.editorconfig`?                                      |
| ------ | ----------------------------------------------------------- |
| Kotlin | **yes, natively** — ktlint treats it as _primary_ config    |
| Web    | **yes** — Prettier reads a five-property subset             |
| Java   | no — gjf and palantir are unconfigurable _by design_        |
| Go     | no — `gofmt` has no options; the `-tabs` flags were removed |
| Rust   | no — rustfmt#2938, closed unimplemented                     |

Spotless has no global `editorConfig()` either
([#734](https://github.com/diffplug/spotless/issues/734), open since
2020); it reaches only its ktlint and shfmt steps.

**A scaffolder does not need the runtime layer.** keel holds one
style model in `adapters/code-style.ts` and fans it out at generation
time into each dialect. That is a real single source of truth with
**no extra runtime dependency in the emitted project and no added CI
time** — no `treefmt`, no `dprint`, no MegaLinter. Those tools solve
this for a repo that cannot regenerate its configs; keel can.

**The asymmetry is real and is documented where it bites.** For
Kotlin the emitted `.editorconfig` is _live input_; for Java, Go and
Rust it is a _co-render_. Proved on the toolchain: with an
`.editorconfig` saying `indent_size = 2`, ktlint reformatted Kotlin to
2-space while prince-of-space held Java at 4-space from the Gradle
config. The emitted file's header says so, and `--reapply` re-syncs.

### Why prince-of-space on Java

Java is the one ecosystem where the formatter choice is genuinely
open, and both mainstream options are deliberately unconfigurable
(google-java-format 2-space/100, palantir 4-space/120). Either would
have made a shared style model impossible to honour on Java — and
google-java-format's 2-space would have reformatted every emitted
template away from keel's existing 4-space house style.

prince-of-space exposes exactly the knobs EditorConfig speaks, so
Java's config is rendered from the same model. The cost is a formatter
with far less deployment history than gjf; the benefit is the only
configuration under which "one style model" is not a lie. Registered
in the pin registry, so the currency loop tracks it.

### Enforcement: the hook fixes, CI gates

Chosen deliberately over wiring the check into the build:

- **`isEnforceCheck = false`** on Gradle and **no lifecycle binding**
  on Maven, so `./gradlew build` and `mvnw verify` never fail for
  formatting alone. Verified on the runner: with drift present,
  `gradle build` exits 0 and `gradle spotlessCheck` exits 1.
- **CI is the gate**, keyed on the `style.managed` tag so a project
  without the vertical gets no format step rather than one calling a
  command its build cannot answer.
- **The hook auto-fixes** on staged files only. Every abandoned
  pre-commit setup traces back to latency; a formatter stays inside
  the budget where a full lint does not.

Without the first of those, a formatter disagreement would break a
freshly scaffolded project's **first** build — the worst possible
first impression, and unfixable by the user without understanding
Spotless.

### The `.ejs` problem, and the escape hatch

keel's templates are `.ejs` files full of placeholders, so **no Java
formatter can be run over them** and keel cannot mechanically keep the
_rendered_ output format-clean. Template line lengths say nothing
either: most >100-column lines are `<%= basePackage %>`-style
expressions that shrink on render.

The answer is the pattern `gradle-wrapper` already established — a
deferred action running a real build tool at scaffold time. The JVM
adapter emits `spotlessApply`, making the tree clean **by
construction** rather than by keeping templates in sync. It costs one
extra build-tool invocation (~20–30s warm) and is what keeps the
project's first CI run green. If it cannot run, the install warns
rather than fails: an unformatted tree is still valid and still
builds, precisely because the check is out of `check`.

### Verified rather than assumed

Every load-bearing claim was run against the real toolchain before the
adapters were written, and one survey figure was wrong: the
prince-of-space coordinates **moved** at 2.x
(`io.github.agustafson` → `io.github.agustafson.princeofspace`), which
a version-only reading would have missed.

- Spotless 8.10.0 + prince-of-space 2.2.0 + ktlint 1.8.0 on **real
  Gradle**, and Spotless 3.10.0 on **real Maven** against keel's own
  root POM template — both reformatted Java to 4-space.
- `style_edition = "2024"` accepted by **stable** rustfmt, no
  unstable-option warning.
- The generated `.editorconfig` resolves Kotlin to 4-space: the `[*]`
  baseline's `indent_size = 2` is correctly overridden by the
  per-language section, so Java and Kotlin agree.

**And the deferred apply is load-bearing rather than belt-and-braces,
which was measured rather than assumed.** With the action disabled,
`spotlessCheck` on a fresh `quarkus-cli` scaffold **fails**: keel
writes the kernel marker as `public interface Command<R> {}` and
prince-of-space wants it split across two lines. With the action
enabled it exits 0. `tests/e2e/code-style-jvm.test.ts` is the thing
that fails if the action is ever dropped, or if a template lands in a
shape the formatter would rewrite — the `.ejs` blind spot made
visible.

It rides the existing `jvm-basic-quarkus` shard rather than taking one
of its own. That figure needs a correction rather than a restatement:
the section originally cited a local **131.42s for both cases** on a
warm home, against a matrix whose slowest shard was 371s. Neither
number describes what ships. The floor shard itself moved — **371s →
486s (+31%)** — once the scaffold-time `spotlessApply` deferred action
landed for every JVM stack, not only `quarkus-cli`; that action's cost
is real per-scaffold time, paid once per e2e case rather than once for
`code-style` specifically, and `jvm-basic-quarkus` is now measured at
**480s**, six seconds off the 486s floor rather than comfortably under
it. The `jvm-add-module-*` shards (AGENTS.md §9) run **63s–239s,
median 138s** on the shape that ships today — all still inside the
floor, so "measure the runner, not a local run" is the number worth
keeping even though the specific figures it first shipped with were
wrong. A shard of its own would have bought attribution and no wall
clock, and the second case reuses almost everything the first
resolved — so the two share one `GRADLE_USER_HOME` per the run-217
cache lesson, not one per case.

### Not in scope for O

**Static analysis, mostly.** `golangci-lint`, Checkstyle and detekt are
a different axis — bug-finding, not layout — and each is an extra
binary or an extra gate; they stay out of scope here, deserving their
own item and their own argument about what a scaffolded project should
be forced to pass. A **free-tier slice** shipped as a follow-up
instead — naming case, wildcard imports, and doc comments on public
API, exactly where the toolchain already enforces it at zero new
dependency (rustc/clippy for Rust, `go vet` for Go, the existing
Spotless block for the JVM family) or where the resolver's
universal-coverage rule left no honest alternative (ESLint for the web
family — see the `linter` dimension below). Error Prone and NullAway
remain fully out of scope; they solve a different problem (bug classes
in already-correct-looking code) than this vertical's layout-and-style
remit.

### `linter` — the free-tier slice, added after O shipped

**The gap, once O closed the format one.** `assets/project/AGENTS.md`
§8 promises `/docs-check` audits the full surface, and no such command
exists anywhere in the repository — a scaffolded project is told it
has a docs audit it does not ship. Closing that gap needed _some_
mechanical enforcement of "public API has a doc comment" before a
`/docs-check` command could honestly claim to audit anything, which is
the throughline connecting this section back to O: the `code-style`
vertical is where "a layout rule every stack agrees to" already lives,
and naming case / wildcard imports / doc comments are the same kind of
rule — cheap to state, tedious to hand-enforce, differently
implemented per ecosystem. `linter` became `code-style`'s third
dimension rather than a new vertical for that reason.

**Free first, verified rather than assumed.** Rust gets all three legs
at zero new dependency — `non_snake_case`/`non_camel_case_types` are
warn-by-default rustc lints, so plain `-D warnings` already promotes
them, but `clippy::wildcard_imports` (the pedantic group) and
`missing_docs` (also a rustc lint) are _not_ warn-by-default. A survey
reading would have missed that; running real clippy 0.1.94 against a
scratch crate did not — `-D warnings` alone let a `use x::*` and an
undocumented `pub fn` straight through, so the CI command names both
lints explicitly. Go gets `go vet` (naming case and doc comments stay
out of scope for Go until `golangci-lint`'s `revive` lands; Go has no
wildcard-import syntax at all, so that leg doesn't apply). Checkstyle,
detekt and golangci-lint's `revive`/`exported` rule are still the
separately-argued follow-up the "not in scope" note above describes.

**The JVM family's leg rides inside the _formatter_, not a new
command.** Kotlin already forbids wildcard imports for free —
ktlint's default ruleset ships `standard:no-wildcard-imports`, true
since O shipped, no change needed. Java needed one line —
`forbidWildcardImports()` in the same Spotless `java { }` block
`jvm-format` already renders — but _where_ that line lives was not
obvious and cost real verification. Spotless allows exactly one
`java`/`kotlin` format per project; a second, lint-only format was the
first idea and it does not work — the aggregate `spotlessApply` task
applies _every_ registered format, and a step Spotless "cannot
auto-fix" (its own message) fails that task rather than being skipped,
proven on real Gradle and real Maven alike. That would have broken the
pre-commit hook on any wildcard import, silently expanding the
"hook auto-fixes" contract into "hook sometimes blocks." The fix was
`forbidWildcardImports()` (check-only) over its autofixing sibling
`expandWildcardImports()`, added to the _existing_ Java block instead
of a new one — which, verified on the same real Gradle/Maven setup,
reproduces exactly Kotlin's existing behaviour: the hook already
blocks a wildcard-importing commit today for Kotlin, so Java now
matches it instead of silently rewriting around it. `code-style/jvm-lint`
exists only to satisfy the resolver's dimension-coverage check; it
contributes nothing itself.

**The design decision this item had to make explicitly: lint is
CI-only, never the hook.** The formatter model is "hook auto-fixes, CI
gates." Lint does not map onto it the same way: most findings
(a naming violation, a missing doc comment) cannot be mechanically
repaired, and the one kind that can be — `eslint --fix`,
`clippy --fix` — is the exact hazard `jvm-format`'s own module docs
already name for the formatter: a fixer reflowing `.ejs`-templated or
regex-anchored source that a later `keel add module` expects to find
verbatim. So `LinterCommands` has no `format` half at all, unlike
`FormatterCommands` — the pre-commit hook stays formatter-only, and
`ciLintCheck` in `ci-pipeline.ts` is the only caller of
`linterCommandsFor`. A project fails this check in CI, the same place
any other scaffolder's Checkstyle or ESLint finding would surface.

**Why the web family shipped now instead of waiting for the paid
tier.** `resolveVertical` requires every dimension in
`codeStyleVertical.dimensions` to be covered by some matching adapter,
for _every_ tag set — there is no "this family opts out." Adding
`linter` to that list without a web adapter would have broken every
TypeScript and web-components install outright. TypeScript also turned
out to have **no** zero-dependency subset of this scope at all: it has
no wildcard-import syntax (`import * as ns` is a namespace import, not
Java/Kotlin/Rust's bring-everything-into-scope kind), and both naming
case and doc comments need a rule engine `tsc` does not provide. So
ESLint 10.8.1 + `typescript-eslint` 8.67.0 (naming-convention) +
eslint-plugin-jsdoc 64.2.1 (`publicOnly: true`, matching the binding
spec's "public API only" comments policy) shipped now rather than
being deferred with Checkstyle/detekt/golangci-lint — verified on a
real scratch workspace, both rules firing on a violating file and
passing clean on a compliant one. The command is a direct
`eslint .` (via `<pm> exec`), not a `package.json` script: the
modulith layouts already define `"lint"` for `depcruise` (an
architecture rule, not a style one), and the established
never-overwrite-an-existing-script contract would have made a
same-named script silently never run ESLint there.

**Ratcheting** (`ratchetFrom`, `--new-from-merge-base`) is for
brownfield adoption on a codebase that is already dirty. keel's
scaffolds start clean, so it would be machinery for a problem that
does not exist here; it belongs with a future `keel add code-style`
onto a large existing project.

---

## P — `keel ui`: the local scaffolder ✅

A Spring-Initializr-shaped front end for the engine the CLI already
drives, served on loopback by `keel ui`. Shipped whole: greenfield and
brownfield, composites included.

**What it is for, stated precisely, because "a GUI for the CLI" is not
a reason.** The CLI asks one question at a time and prints the plan
once, at the end. That is the right shape for someone who knows what
`--module-layout=modulith` does to a Quarkus tree. It is the wrong
shape for someone finding out — and keel now has 34 stacks, two module
layouts, two build systems on most of them, and a peer-context flag,
which is a space nobody holds in their head. The page shows the plan
**while the choices are still moving**: flip Gradle to Maven and the
file tree redraws before anything is written. On an unfamiliar stack
the tree is the documentation, and `--dry-run` is the same information
delivered too late and as a scroll of paths.

### The finding that shaped it

**keel has no static form to render, and that is not an
implementation detail — it is the composition model.** An adapter is
asked its questions only once its predicate matched, and a predicate
reads capability tags an earlier adapter promoted. So "which questions
does `quarkus-rest` have?" has no answer independent of the answers
already given. Walking the registry to build a schema would produce a
superset at best and a wrong set in practice, and the wrongness would
be invisible: a form offering a question the install never asks looks
exactly like a form that works.

The answer is to stop enumerating and start **discovering**.
`keel.preview` runs the _real_ install as a dry run with a prompt that
answers from a supplied map instead of blocking, and records what it
was asked. The page loops: preview, render, fold a changed answer in,
preview again. It converges because each pass resolves exactly the way
a commit would, and it cannot drift from the engine because it _is_
the engine — the alternative was a second implementation of adapter
resolution, which is the kind of copy that goes wrong quietly.

Measured: a full preview of `quarkus-rest` under the modulith is
~60ms in-process, so a 120ms debounce makes the loop feel like a form
rather than a request.

**It landed alongside the `keel new` wizard**, which shipped from the
other direction in the same window and asks the same questions through
the same port. They are complements rather than rivals: the wizard
stages, reviews and lets you jump back; the page shows the plan while
the choices are still moving. Merging them cost one real reconciliation
— the wizard's review step is a question the engine asks that is _not_
part of the plan, and a prompt collecting answers instead of blocking
cannot tell the two apart from the question alone. `Asker` already
existed for the neighbouring problem, so it grew a `control` kind and
`WizardPrompt.askDirect` carries it; the preview takes its default and
drops it. A preview also runs with no logger, since the wizard prints
its whole staged plan before reviewing and `keel ui` re-previews on
every change.

### Three things that came out of it that were not obvious going in

- **The Prompt port needed to say who was asking.** A question id is
  unique within its asker and nowhere else, and the two kinds of asker
  record their answers in completely different places: an adapter's
  answer is sticky memory under `manifest.answers[adapterId]`, while
  `buildSystem` belongs to no adapter at all and is a field of
  `NewProjectCommand`. Without attribution a recorded answer cannot be
  routed back. `ask(question, asker)` is the whole change, and six
  call sites.

- **Preset answers must travel through the prompt, not the manifest.**
  The obvious implementation seeds `command.answers` with what the
  form has gathered. It is wrong in a way that only a form notices: a
  sticky answer in the manifest short-circuits its question _before_
  the prompt sees it, so the field would vanish from the form the
  moment it was used. Routing every answer through the recording
  prompt keeps the set whole and resolves to identical values.

- **A stack-level dial is the mirror image, and belongs on the
  catalog.** Set `buildSystem` on the command and the install stops
  asking about it — so a control driven by the preview would disappear
  on first use, for the opposite reason. Those controls render from
  `keel.catalog` instead, which describes them statically because that
  is what they are. The split is exact: catalog for the dials, preview
  for everything conditional.

### What shipped

- **A second primary adapter, not a second engine**
  (`src/application/web/`), under the same dependency rule as the CLI
  and enforced the same way. `contract/` is `UiRequest` → command or
  query → `UiResponse` with no `node:http` anywhere in it, so the
  whole request path — guards, routing, mapping, error translation —
  is tested by calling a function. `executable/` owns the socket.
  Two new dependency-cruiser rules hold the seam: the web contract may
  not reach `domain/core` or `infrastructure`, and the two primary
  adapters may not import each other (bar the types-only
  `contract/server.ts` the CLI names to inject `keel ui`, and
  `cli/executable`, which is the process composition root and wires
  both).

- **Three queries** (`domain/contract/queries.ts`): `keel.catalog`,
  `keel.preview`, `keel.project-status`. The last is the brownfield
  half, and every field on it mirrors a refusal a handler would issue
  — `canAddModule` runs the same `emitsFor` probe `keel add module`'s
  front door runs, so a family with no context adapter greys the
  control out instead of being told no after typing a name. (`available`
  listed every vertical not installed, readiness unconsulted, until
  Q1.8 gave each card the planner's readiness and the refusal the add
  would give.)

- **The page** (`assets/web/`): framework-free custom elements on
  `@rgoussu.dev/planks`, the design system keel already emits for its
  `web-components` stack. **No bundler** — planks ships one 28KB ESM
  file, the page is native custom elements, and the browser loads both
  directly; a build step would put keel's release on a bundler and let
  the shipped UI drift from the source beside it. `pnpm lint` grew to
  cover `assets/web`, since shipped code nothing checks is the hazard
  this repo guards everywhere else.

- **Three guards on the loopback port**, because loopback is not a
  boundary — `http://127.0.0.1:7420` is same-machine, not same-origin,
  and this server writes files on request. A per-run token in a custom
  header (which also forces a preflight nobody answers), a `Host`
  allowlist against DNS rebinding, and an `Origin` allowlist. No CORS
  header is ever sent. They are unit-tested as a function of a
  request, which is the only way each door gets its own case.

### Deliberately not in scope

- **A hosted Initializr.** keel's value is a tree on disk with `git
init` and a resolved toolchain, not a zip. A remote service would
  have to give up the deferred actions, which are half the "sixty
  seconds later" claim.
- **Editing an answer on `--reapply`.** The page shows what the run
  asks, and a reapply asks nothing — its answers are frozen by design
  (item **L**). Changing one stays out of scope in both front ends at
  once, which is the right way for that to stay consistent.
- **An e2e suite of its own.** The server is exercised over a real
  socket in `verify` (`tests/application/web/server.test.ts` previews
  and then scaffolds a `ts-cli` project), and the page was driven in a
  real browser during development. A shard that boots Chromium to
  re-assert what the API tests already assert would buy a screenshot
  and cost a browser download; the day the page grows logic worth
  testing through the DOM, that changes. _Since changed:_ the page
  grew that logic — a stepper, preset moves that keep the dials, a
  refusal shown where it lands, extras that tick what they need — and
  four browser suites (`tests/e2e/ui-*.test.ts`) ride the `web` shard,
  which already had a browser. The latest, `ui-compose`, landed with
  epic Q's Q1.5, where this decision is recorded as replaced.

---

## Q — Supple composition: one answer, asked everywhere ✅

**Proposed 2026-09-23 from an audit, and landed** — Phase 0 to Phase 3
below, one commit per step, every decision taken as recommended
(_Decisions on record_); Phase 3 held the open ends found once it had
merged (#169), one step each, and landed too. **R**, **S**, **T** and
**U** were named at the end of this section, not part of Q; **R** has
landed since, in its own section, and **S**, **T** and **U** remain.
Anchored on [#117] ("one declaration, read twice"), which it extends
from the stack drill-down to every vertical, in both phases.

[#117]: https://github.com/rgoussu-dev/keel/issues/117

**Goal.** `keel ui`, `keel new` and `keel add` should feel like one
supple tool: every choice on screen either works or says, _before_
it is picked and in the user's words, what it needs. At the audit the
model answered correctly but late, in engine vocabulary, and sometimes
as a crash: "vertical 'observability': no adapter covers dimension(s):
health, request-context, telemetry, monitoring-stack — would need
arch.server-http", or, in the page, `keel.web.http-500 POST
/api/preview failed with 500`.

### How the audit was run

Every stack (34) × every vertical (14), greenfield (`keel.dials` +
`keel.preview` with `extraVerticals: [v]`) and brownfield (scaffold,
then `keel.project-status` + a preview of `keel add v`), through the
real mediator with a fake `ProcessRunner` — plus the fullstack
service directories under both repository layouts, a sweep of every
choice of every question, and a walk of `keel ui` in headless
Chromium. Every finding was re-checked by a second, adversarial pass.
The prototype of that grid runs in ~6 s, which is why Q0.1 below
lands it as a test.

### What was actually wrong, at the audit

**The engine agreed with itself.** Greenfield and brownfield gave the
same verdict on all 392 single-service cells, and `keel new --with
A,B` wrote a tree byte-identical to `keel new; keel add A; keel add
B`. The shipped catalog held exactly one real dependency chain
(containerization → distribution → iac) and one soft read
(distribution reads whether persistence and observability are
installed). The crankiness was around the engine, in five places —
each below in the present of the audit, and each closed by the steps
that follow:

1. **Dependencies between verticals are not declared, so every reader
   guesses.** Distribution's need for a container image is a plain
   `throw` inside `contribute()` (`distribution-container.ts`
   `requireContainerImage`), invisible to the menus, the `--with`
   preflight and coverage. Distribution is offered on 21 stacks and
   throws on 19, in both phases. The menu asks a flat question per
   vertical while the `--with` gate walks the extras in order, so iac
   is offered on **0 of 34** stacks and `keel.dials` silently cuts
   `[containerization, distribution, iac]` down to two; of the six
   orderings of those three, one is accepted and two throw. The page
   posts extras in alphabetical order, which installs distribution
   before persistence: `deploy/compose.yaml` then silently lacks
   `DB_URL`.
2. **Refusals fall off the `Err` rail, and the ones that stay on it
   speak engine.** 62 stack × vertical cells throw something that is
   not a `DomainError` (19 greenfield, 19 brownfield, 24 in fullstack
   service directories), as do `keel new` into a directory holding a
   `README.md` (13 of 34 stacks), a user-authored `Dockerfile` or
   `ci.yml` under `keel add`, and answer choices the page offers
   (`engine=mariadb` off the JVM, `migrations=liquibase` on it). A
   throw becomes a `text/plain` 500 whose body `api.js` discards.
   Of 124 brownfield coverage refusals, 90 name a tag no command can
   supply — `arch.server-http` on a CLI, `framework.quarkus` on
   spring-cli, `lang.go, pkg.gradle` at a product root — because the
   nearest-adapter heuristic (`resolver.ts` `coverageGap`) cannot tell
   identity tags from tags another vertical adds. One fact also gets
   two codes and two sentences, and greenfield messages tell the user
   to run `keel add`.
3. **Availability is answered after the click, with opposite policies
   in the two halves.** Greenfield hides what a stack cannot carry;
   brownfield lists every vertical (`project-status.ts`, `steps.js`)
   and refuses 38 % of cards on click on a single-service project —
   plus 28 gateway cards that "install" zero files, get recorded, and
   then block the real install after `keel link`. At a product root
   11 of 13 cards refuse and the other two do nothing useful. The
   refusal lands in a banner ~400 px above the card.
4. **Page state keeps or drops the wrong things.** The extras
   control is a _question_ the handler stops asking once answered, so
   it vanishes after the first tick: one extra at most, never
   unticked. One click on an installed card leaves `reapply: true` on
   every later pick ("vertical 'ci' is not installed — nothing to
   reapply"). A preset switch wipes build system, layout, extras and
   answers, and Kotlin/Spring → fullstack lands on `fullstack-go`.
   Answers cannot simply be carried either: identity answers are keyed
   by per-preset bootstrap ids and read first-match, so a carried one
   previews `com.example` and installs `org.acme`.
5. **Product scope is invisible to the engine.** A monorepo product
   root writes each service's `Dockerfile` and `.dockerignore`
   without telling the service, so `keel add containerization`
   collides in both services of all six fullstack presets and
   distribution and iac are unreachable; `ci` writes a workflow under
   `backend/.github/` that no host reads. At the root, coverage runs
   against `['agentic.harness']`, and the page never reads
   `status.services`.

**Not the problem: the number of presets.** The 27 single-service
presets already are the complete language/framework × entrypoint
cross-product, and build system and layout are already dials. What
makes presets feel cranky is (4), plus the entrypoint being frozen at
`keel new` — which successor **R** addresses.

### Decisions on record that no longer hold

| Decision                                                | Why it no longer holds                                                                    | Replaced in |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| Distribution "refuses with the fix in the message" (E)  | The message never reaches `keel ui`, names a brownfield command in `keel new`, can't plan | Q0.4, Q1.3  |
| `--with` installs extras "in the order named"           | The engine knows the order; the page's order is alphabetical and loses `DB_URL`           | Q1.3        |
| Brownfield offers every vertical, "says so when picked" | What it says is jargon, off-screen, on 38 % of cards (85 % at a product root)             | Q1.8, Q1.9  |
| A coverage gap names the nearest adapter's unmet tags   | Useful to adapter authors; names tags no command can add for users                        | Q0.7, Q1.7  |
| "Already installs / installed" is an error              | "I want X" where X is present has one sensible reading                                    | Q1.6        |
| Gateway with no peer installs nothing and is recorded   | The recorded no-op later blocks the real install                                          | Q1.3        |
| A composite's `--with` names no service                 | Preset data already carries per-service extras                                            | Q2.3        |
| P: "no e2e suite of its own" for the page               | The page now carries state logic worth a DOM test                                         | Q1.5        |

### The measure: the composition grid

Q0.1 lands the grid as a ratchet — a known-violations file asserted
by exact equality, regenerated as known ∩ actual so it can only
shrink. Every later step names the invariant it moves. The oracle is
always the real `keel.preview`, never a re-implementation over tags
(the existing "what the page can post" test used one, which is how
the distribution throw got through).

| Id  | Invariant                                                                                            | At audit    | Zero at             |
| --- | ---------------------------------------------------------------------------------------------------- | ----------- | ------------------- |
| I1  | No preview throws — every cell, plus a seeded-user-file axis                                         | 62 + seeded | Q0.3                |
| I2  | Every extra `keel.dials` offers, posted with its prerequisites, previews Ok                          | 19          | Q1.3                |
| I3  | Every extras set the CLI accepts is reachable from the menu                                          | 19          | Q1.3                |
| I4  | A brownfield card's readiness agrees with preview                                                    | 149 of 294  | Q1.8¹               |
| I5  | Phase parity: same outcome (from Q0.1), same code and sentence (from Q1.7)                           | 0 (outcome) | Q1.7                |
| I6  | No refusal names a `lang.`/`framework.`/`runtime.`/`pkg.`/`layout.`/`arch.` tag                      | ≥ 90        | Q0.7 (hard at Q1.7) |
| I7  | In every composite service, under both layouts, every vertical is Ok or a coded, scope-aware refusal | —           | Q1.10               |
| I8  | Any permutation of an accepted extras set gives byte-identical changes                               | —           | Q1.3                |
| I9  | Preview and dry-run install give identical change lists for the same body                            | —           | Q2.1                |

¹ On every single-service project and at every product root; the
monorepo services' image cells (PHASE-3) read ready and meet the files
the product root wrote, and reach zero with Q1.10.

The grid reads each stack's default dials only, and sends one
non-default choice per question (I9), because it runs in `verify`. A
weekly report-only lane beside mutation was planned at the audit for the
rest — the full powerset of offered extras, where an undeclared soft
read would show as an I8 diff, and every choice of every question —
and landed with Phase 3 (Q3.4): `tests/sweep/`, on every dial setting of
every preset, with arrival order — a pair installed in one run and in
two — as the comparison that catches the soft read, since naming order
cannot.

### Phase 0 — stop the bleeding (defects only, no model change; ~1.5–2 weeks)

Q0.2, Q0.4, Q0.5 and Q0.7 need no grid and land first: between them
they remove every 500 and every tag-speaking remedy quoted above.

#### Q0.1 — The composition grid, as a ratchet (M) ✅

`tests/domain/core/composition-grid/{greenfield,brownfield,composite}.test.ts`
over `tests/support/composition-grid.ts`: cells derived from
`keel.catalog`, `keel.dials` and `keel.project-status`, never
hand-listed; Factory `installMediator` with a `FakeProcessRunner` and
a no-op `runDeferred`; port `Mediator.dispatch` only. Axes: stack ×
vertical in both phases (greenfield against each stack's default
`keel.dials` menu, brownfield on one scaffold per stack), product ×
service × vertical under both layouts, and a seeded-user-file axis
scoped by phase (`README.md`, `.gitignore` before `keel new`;
`Dockerfile`, `.github/workflows/ci.yml` before `keel add`, beside the
verticals whose preview creates them). I3's candidate sets come from
the promotes→requires graph, each chain longer than one also tried
behind every offered extra that promotes a tag — which is where
distribution's undeclared image turns up. Each axis keeps its own
verdict golden (`KEEL_UPDATE_GOLDEN=1`) and shrink-only known file, so
the parallel suites never race on one file. Landed at I1 = 85 (26
seeded before `keel new`, 47 seeded before `keel add`, 12
monorepo-service containerization), I2 = 19, I3 = 19, I4 = 233 (83
single-service, 150 in products), I5 = 0 and I6 = 0 — Q0.7 had
already cleared the coverage refusals. About 7 s wall on its own.
`tests/AGENTS.md` gains the rule "a menu-versus-gate test uses preview
or install as its oracle".

#### Q0.2 — A 500 carries its sentence (S) ✅

`executable/server.ts` answers an uncaught throw with the JSON
envelope (`keel.internal`); `api.js` reads the body once as text and
hands it to `response.js`, which parses it with a text fallback, as a
pure exported `errorFrom` tested like `finder.js` (a module of its own,
since `api.js` claims the token from `location` on load and cannot be
imported without a DOM). The page labels `keel.internal` as a bug to
report.

#### Q0.3 — A file already on disk, or missing from it, is a coded refusal (S) ✅

`apply.ts` `writeWholeFile` raises `PathConflictError extends
DomainError` (`keel.path-conflict`, carrying `path` and `adapterId`)
when the path exists and this run has no `create` for it — a file
patched earlier in the run shows as `modify` and still counts as the
project's; a path this run created twice stays a
`ContributionConflictError` (an adapter bug). Sentences by phase, read
off a `scaffold` apply mode `keel new` passes — in `keel new` the file
is the user's ("move it aside, or start in an empty directory"); in
`keel add` no move-aside advice, since in a monorepo service the file
may be the root's. A patch target the user deleted becomes
`PathMissingError` (`keel.path-missing`); under `keel new` it stays an
ordering bug. `jvm-format`'s foreign-content anchors — no `plugins {`
in `build.gradle.kts`, no `<build>` in `pom.xml` — raise
`keel.path-conflict`. I1 becomes hard: its 85 cells (26 seeded before
`keel new`, 47 before `keel add`, 12 monorepo-service
containerization) are all `keel.path-conflict` now, and the grid's
`HARD` list keeps its key out of every known file.

#### Q0.4 — Hidden prerequisites and bad answers get codes; the failing examples are fixed (S) ✅

`requireContainerImage` throws `keel.missing-prerequisites` with a
phase-neutral sentence (interim; Q1.3 deletes it). A supplied answer
outside a question's choices is `keel.invalid-answer` where a prompt
hands it back — the page's preview, a terminal; a default outside its
own choices stays a plain throw, being the adapter's bug. `--set` and
an install body reach the sticky path, which is not checked; Q1.0
checks them at the front doors. The `database-compose` guards become
`keel.unsupported-answer` (interim; Q1.11). The `--with` examples in
`keel new --help`, `docs/cli.md` and code comments that fail on every
shipped stack (`distribution,iac`, `persistence,iac`) or on every one
but the two Quarkus CLIs (`distribution,ci`) become
`containerization,distribution,iac`, pinned by a CLI test that also
holds `docs/cli.md` to the help's example.

#### Q0.5 — Brownfield page state stops poisoning later picks (S) ✅

Target and answer transitions move out of `keel-app.js` into a pure
`assets/web/src/target.js` (`retarget`, `answer`, `restart`,
`pickVertical`). A card pick is a whole target whose `reapply` says
whether _that_ card is installed, and it replaces the target rather
than merging into it; another vertical, preset or kind resets the
answers. Every change, and pointing the page at a directory, moves the
request generation on, so a late `/api/dials` reply is dropped rather
than adopted over a newer pick. `ui-refusal.test.ts` drives both card
switches in a browser. Clicking the `fullstack` or `bounded-context`
card is still refused as an unknown vertical, but no longer poisons
the picks after it; the inert chips are Q1.9's.

#### Q0.6 — A preset switch keeps the dials, and says when the language jumps (S) ✅

A stack change keeps `buildSystem`, `moduleLayout` and
`withPeerContext` — and a product's repository `layout`, the one dial
the list had missed — and lets `keel.dials` snap them (it already
does, through `prefer()`). `target.js`'s `settle` adopts the reply and
names, in one line under the Preset picker, each carried value the
user had moved off its default that did not survive. The finder falls
back to a sibling with the same framework, then the same runtime (a
`runtime` field on the catalog's language nodes, so the page never
parses an id), then `finder.defaultStack`'s language and framework —
never `languages[0]`, which is Go because languages sort by label —
and the same line announces the jump. Answers and extras still reset
(until Q2.2).

#### Q0.7 — Coverage refusals stop naming tags (S) ✅

Interim sentence, replaced by Q1.7: identity tags leave the message
(they stay in the `ResolutionError` detail); `arch.*` prints through
its `ENTRYPOINTS` label ("Observability needs an entrypoint this
project does not have: HTTP server — a REST endpoint"); a gap with an
identity tag in it reads "has no adapter for this project's stack";
the vertical is named by its title. The agent-harness redirect at a
product root is generalised to every vertical the root cannot carry:
"Persistence belongs to a service, and this is a product root — run
'keel add persistence' inside backend/ or frontend/". One sentence
builder (`src/domain/core/refusals.ts`) serves the resolver's throw,
the `--with` front door and the root redirect. A tag another install
adds (`iac`'s `dist.container-image`) is still named, as a capability
the project "does not have yet", until Q1.3 includes the prerequisite
and Q1.7 names it by its vertical.

### Phase 1 — one answer, asked everywhere

A few optional declarations and one pure planner, read by every
surface: the rule `src/domain/core/AGENTS.md` already applies to
Conflicts, extended to readiness. No tag is added, no manifest schema
changes, the kernel is untouched, and every new contract field is
optional with a fallback, so a plugin declaring none of them keeps
working.

#### Q1.0 — Answers only reach the adapters they belong to (M) ✅

Supplied answers (`--set`, an install body) are no longer seeded into
the manifest: `installVertical` takes them as `supplied`, each adapter
reads only the ones keyed to it or to a `sharesAnswersWith` sibling,
and only the adapter that read one records it — so a greenfield
composite records in each scope only the keys that resolved there,
and no reader scanning a fixed list of bootstrap ids can find a
foreign one. `supplied-answers.ts` holds the keys to the plan before
anything is committed (brownfield before the install, against the
vertical's resolved adapters; greenfield after staging, against every
scope's, dry runs included): a key for an installed vertical's
adapter, including a sibling it would borrow from, is
`keel.frozen-answer`; a key no adapter of the plan reads, or a
question its adapter does not ask, is `keel.unknown-answer`, naming
the plan's adapters that take answers (or the adapter's questions).
Supplied values are held to their choices where they first reach
their adapter (`checkSuppliedAnswer`, `keel.invalid-answer`), which
both front doors pass through, and never on recorded memory, which
serves older manifests. `validateChoice` holds each value of a
`multi-select` selection to the choices. The page adopts a preview's
reply through `previewed` (`target.js`), which drops the answers that
preview did not ask for: an extra unticked after its question was
answered would otherwise post a key the install refuses, a case the
plan's "the page never posts a stray key" had missed. Scripts that
`--set` another family's adapter now fail loudly instead of splitting
a package — a CHANGELOG entry; two test fixtures that did (the plugin
byte-identity matrix, the Kotlin combo e2e cells' Java bootstrap ids)
are keyed to their own adapters now.

#### Q1.1 — refactor: one install loop for both handlers (M) ✅

`NewProjectHandler.stageStack`'s ordered loop moves into `install.ts`
as `installVerticals`; `AddVerticalHandler` calls it with a list of
one. No behaviour change; the grid golden is byte-identical.

Landed with the harness buffer's contract carried over from
`installVertical`: a run given no buffer realizes its declarations
once, after the last vertical (`keel new`'s scopes); a caller that
supplies one finalizes it, which is how `keel add` keeps the harness
retrofit between the loop and the finalize, and the generation
restamp after. `keel add module` and the harness replay still call
`installVertical` directly: the first installs one synthetic vertical,
and the second replays each contributor against the recorded manifest,
never a running one. `install-verticals.test.ts` pins the run's three
shared pieces — running manifest, ownership, harness buffer.

#### Q1.2 — Two declarations and a planner, with no caller yet (M) ✅

- `Adapter.promotes?` (defaults to the vertical's union), because
  `Vertical.promotes` is a union over adapters and any reader built on
  it over-offers (iac on quarkus-cli).
- `Vertical.reads?` — "`contribute()` reads whether these are
  installed; install after them when both are in one run". Named to
  avoid `Adapter.after`. Checked in a post-load pass of `registryOf`:
  unknown ids ignored (a soft read of an absent plugin is harmless),
  cycles refused.
- `src/domain/core/planner.ts`, pure: `readiness(scope, v)` →
  `included | ready | needs(prerequisites) | unavailable(gap)`, the
  gap split into entrypoint, peer and identity with the nearest
  stacks that carry it; `plan(scope, requested)` → the ordered
  closure, smallest first, refusing when two closures tie rather than
  guessing between plugin providers.

A shipped-registry readiness golden records today's truth, so Q1.3's
diff is its review.

Landed with `readiness(registry, scope, id)`, `plan(registry, scope,
requested)`, `seedFor(stack, tags)` and `applies(v, tags)` exported
from `planner.ts`, a scope being `{tags, installed}`, and the
readiness types in `contract/queries.ts`. Declared:
`quarkus-cli-native` → `runtime.graalvm-native`, the five container
distribution adapters → `dist.container-image`, the four non-JVM
image adapters → `deploy.container-image`; `distribution.reads =
[persistence, observability]` and `persistence.reads =
[observability]`, both checked against the adapters' `contribute()`.
`dev-env` and `dev-container` read each other and adapt either way
round, so neither declares it (it would be a cycle). The search
closes over the providers in reach of the request's unmet `requires`
(adapter-level `promotes`), at most three added for any one
requested vertical (a request whose verticals together need more is
planned as the union of their own closures), and orders by
depth-first search: whatever feeds a tag a vertical's adapters
require _or exclude_ goes first, then `reads`, then the caller's
order — and a step that leaves an earlier vertical matching an
adapter the new tags exclude, or breaking one of its rules, is taken
back, which is what keeps `quarkus-cli-native` off a JVM image.
Beyond the text above: `needs` carries `alternatives` when another
set is exactly as small (readiness reports the tie; `plan` refuses it
as `tied`), the gap also names the vertical's own broken `rules`, a
capability another vertical could add is traced back to what that
vertical lacks (`iac` on `quarkus-cli` reads _entrypoint HTTP
server_, not _dist.container-image_), `nearestStacks` lists only the
nearest group, and `plan` also answers `unknown`, `incompatible`
(each plans alone, no order takes both) and the requested ids already
`included`. The golden (`tests/domain/core/planner-readiness.golden.json`,
28 presets × 14 verticals on default dials) has distribution _ready_
on every HTTP stack and iac _needs distribution_ on 19; gateway is
_unavailable_ everywhere, for want of a peer. The grid does not move.

#### Q1.3 — The throw becomes a declaration; both front doors and the menus ask the planner (L) ✅

`deploy.container-image` joins `predicate.requires` of the five
container distribution adapters — a tag containerization already
promotes, the pattern iac already uses — and `requireContainerImage`
is deleted. `legalExtraVerticals` offers ready ∪ needs; `DialOptions`
gains `verticals: {id, title, readiness, requires}`; `keel.dials`
snaps extras to the ordered closure and reports `adjustments` instead
of pruning silently. The `--with` gate stops caring about order
(`keel.extra-verticals-order` retires; naming an id twice stays
refused); gateway with no peer is `unavailable` ("run `keel link`
first"). **One commit**, since the shrink-only file forbids the
intermediate states. Settles D1 first.

Landed as one commit. Both front doors go through
`plan-refusal.ts` (`admit`), which plans the request and either
returns it in plan order or refuses: `keel.uncoverable-vertical` from
the planner's gap (a peer-only gap reads "Service gateway wires linked
projects — run `keel link <path>` first"), `keel.incompatible` for a
broken rule or a set no order installs, and
`keel.missing-prerequisites` — the code, now in `refusals.ts` — for a
set that plans only with verticals it did not name, or a tie, naming
them in install order ("Infrastructure as code needs Container image
and Distribution installed before it, in that order — add
containerization, distribution as well"). The command line refuses
that set in this step; including it is Q1.4's. `--with` is a set:
`admit` hands the planner its ids sorted, so verticals nothing ties
together go in by id and every permutation writes the same bytes
(toolchain and persistence both add a README section, and used to
place them in the order typed); `InstallReport.notes` says so when
the order named put one ahead of what it needs. `keel.dials` snaps
the page's extras the same way, by id, retrying a vertical tied
between two providers once the rest is kept. The terminal's
multi-select labels a _needs_ choice with what it needs, by title.
`legalExtraVerticals` gave way to `verticalOptions` (every vertical
of the preset, with its readiness) and `offeredAsExtra`, read by both
front ends. `VerticalOption.readiness` is the kind
(`included | ready | needs`) with `requires` beside it, so no tag
reaches the page; `requires` is empty for a vertical two sets would
serve equally. Distribution alone on `quarkus-cli-rest(-kotlin)`/Gradle
is _ready_ and installs `quarkus-cli-native` only (D3); with
`containerization` both install, image first.

Beyond the text above: `keel.project-status` no longer lists a
vertical that would install nothing — one declaring no dimensions
with no adapter matching, which today is the gateway without a linked
project. Refused at `keel add`, its 28 single-service cards and 6
product-root cards would otherwise have become new I4 violations; Q1.8
lists it again, as unavailable with its sentence. The planner's
_nearest adapter_ now counts what no install can add before counting
every unmet tag, so `go-cli`/`rust-cli`/`ts-cli` + distribution keep
their entrypoint gap now that the Go/Rust/TS image adapters also miss
an image. Grid: I2 19 → 0 and I3 19 → 0, both **hard** from here;
**I8 lands hard** on the greenfield axis — every permutation of each
offered vertical that `reads` another, with both chains
(`[containerization, distribution, persistence]` on 18 HTTP stacks,
108 previews), and each stack's whole menu named forwards and
backwards (28 stacks), stages byte-identical files; brownfield I4 83 → 81
(`quarkus-cli-rest(-kotlin)` + distribution); I5 parity kept. The
`DB_URL` case is pinned directly on go-http and quarkus-rest, every
permutation. The readiness golden moves exactly the 36 intended cells:
distribution _needs containerization_ on 17 HTTP stacks, iac _needs
containerization > distribution_ on 19.

#### Q1.4 — Prerequisites are included; `keel add` takes several verticals and proposes refreshes (M) ✅

Both handlers close a named set over its prerequisites and install it
in one Tree ("added Container image, Distribution — …").
`keel add a b` and `verticals: string[]` on the target. The planner
_proposes_ re-rendering installed verticals that read an incoming one
(distribution after persistence, for `DB_URL`) or whose adapters
change under the new tags; `--refresh <ids>` accepts. A newly
matching adapter in a refresh is asked its questions rather than
taking defaults silently.

Landed with `admit` returning the closure (`AdmittedSet.added`,
`neededBy`) and `admissionNotes` writing both front doors' first notes —
`added Container image, Distribution — needed by Infrastructure as
code`, then the dependency-order note; `keel.missing-prerequisites`
now refuses only a tie. `AddVerticalCommand` and `AddVerticalTarget`
carry `verticals` and `refresh` (the web API keeps `vertical` as the
alias for a list of one, exactly one of the two); `keel add
[targets...]` keeps `module` as the reserved first word, and naming a
vertical twice is `keel.invalid-verticals`. A refreshed vertical is
planned with the named ones as though it were not installed, so it
goes after what it reads or what decides its adapters — `keel add iac
--refresh distribution` installs on a `quarkus-cli-rest` whose
distribution predates its image — and runs in the `reapply` posture
(`installVerticals`' `rerender`). `planner.refreshProposals` reads the
tags the run actually left rather than the promotions the planner
assumes, and the report carries `refreshProposals` with a note each.
The frozen rule moved into `installVertical`: under the reapply posture
an adapter with recorded answers resolves from them without asking and
takes nothing supplied, and one with none is asked — so plain
`--reapply` asks a newly matching adapter too, and its preview shows
it. Adopting the harness beside other verticals replays into its
buffer only what was installed before the run. Beyond the text above:
brownfield holds supplied answers twice — before the run against every
adapter it could reach (`planner.reachableAdapters`), so a typo is
still refused before a question, and exactly once staged, against the
adapters it resolved, as greenfield holds them. Grid: brownfield I4 81 → 45 (17 ENG-1
distribution, 19 TEST-5 iac), composite I4 150 → 126 (the polyrepo
services' distribution and iac); greenfield's 36 distribution and iac
cells go from `keel.missing-prerequisites` to Ok, I5 parity kept. The
monorepo services' distribution and iac now stop on the image files
the root wrote (`keel.path-conflict`, still PHASE-3 for Q1.10).

#### Q1.5 — Greenfield extras become a real control (M) ✅

An "Also scaffold" group in Options, rendered from `dials.verticals`
with `target.extraVerticals` as its state: _Ready_, _Needs another
capability first_, _Comes with <preset>_ (chips). Ticking a "needs"
card ticks its prerequisites; unticking one unticks its dependants.
`keel.dials` always pins `extraVerticals` (to `[]` when empty), so the
question never vanishes; `dials.test.ts`'s "absent stays absent" is
inverted, and its walk toggles each offered extra against a real
preview. Review gains the row. A new `tests/e2e/ui-compose.test.ts`
in the `web` shard asserts what the page posts — no Generate on a JVM
stack, which that shard has no JDK for.

Landed with the gestures as one transition, `toggleExtra` in
`assets/web/src/target.js` (an untick follows dependants to a fixed
point), and the group — its parts, the badge naming `requires` by
title, `adjustments` as one line — read off the reply by a new pure
`assets/web/src/extras.js`. `hasDials` is now "the catalog knows the
preset": every shipped preset already had an Options step, so the rail
lists did not move; a preset pinning both dials (a plugin's) no longer
waits for a reply to earn one. The `extraVerticals` binding branch was
in `target.js`'s `fieldOf` since Q0.5, not in `keel-app.js`, and is
deleted there. Pruning before a post reuses Q1.0's `previewed`:
Generate now waits for the preview of the run as it stands, so the
body carries exactly the answers that preview asked. Beyond the text
above: _Questions_ reads "N answered, M on their defaults"; the plan's
command is dimmed with a line saying the terminal would refuse it
too; the Options step keeps the focus on a box ticked from the
keyboard across its redraw; and `watchTraffic` keeps the bodies the
page posts. `dials.test.ts`'s walk previews every body it reaches —
every dial setting of every preset, each extra ticked on its opening
dials and each box that moved unticked, some 300 previews — and holds
the page's gestures to leaving `keel.dials` nothing to add or drop.
The grid does not move: the step is the page's, and the goldens
regenerate unchanged.

#### Q1.6 — "Already there" is not an error (S) ✅

`--with` naming a stack's own vertical is dropped with a note;
`keel add X` on an installed X is Ok with an empty plan and "already
installed; `--reapply` re-renders it". Exit-code change → CHANGELOG
(D4).

Landed with two notes in `refusals.ts`, one per phase:
`alreadyIncludedNote` ("Development environment already comes with
quarkus-rest", which `keel.dials` now drops a page's extra with too)
and `alreadyInstalledNote` ("Version control is already installed;
'keel add vcs --reapply' re-renders it"). Both front doors set such a
vertical aside before they plan and install the rest; the notes open
the report. An add left with nothing to install returns before it
stages, so no file is written and neither is the manifest, but its
supplied answers are still held — any `--set` on it reaches nothing,
and is refused as frozen or unknown. A vertical both named and
`--refresh`ed is re-rendered, not noted. Unchanged ahead of the note:
a product root's refusal of what it cannot carry (Q1.10) and the
harness-generation gate. Grid: the 176 greenfield and 176 brownfield
"already" cells move from `keel.invalid-extra-verticals` /
`keel.vertical-already-installed` to Ok together (I5 parity kept), and
the composite axis's 162 with them; I3 counts what the dials reply
shows as _included_ as on the menu, since naming it adds nothing
(`new-project.test.ts` pins the same changes with it and without). No
known key moved.

#### Q1.7 — One refusal vocabulary, the same in both phases (L) ✅

`src/domain/contract/refusal.ts`: a `Refusal` union (`needs`,
`unavailable`, `elsewhere`, `path-conflict`, `path-missing`) and
`RefusalError extends DomainError`. `src/domain/core/refusals.ts` is
the only sentence builder: phase-neutral, entrypoints and build
systems by label, identity gaps as "no adapter for this project's
stack; nearest stacks that carry it: …", tags only in the structured
field. `api.ts` forwards `refusal` in the 422 body; the CLI builds its
hint from the same fields. Codes stay stable.

Landed with the union extended by what the planner already exposes:
`incompatible{verticals}` for a set no order installs, and
`unavailable.because`/`rules` for a vertical's own rule (its reason and
id, no longer the tags that tripped it); `needs` carries the tied
options, the only `needs` that still refuses since Q1.4. A capability
some vertical adds is named by that vertical ("Distribution needs what
Continuous integration adds, which this project does not have yet"),
the gateway's missing peer as "link one that does first", and the
`--with` wrapper is gone: the remedy each command has is the CLI's
`hint:` line (`contract/hint.ts`). `PathConflictError` and
`PathMissingError` moved into the contract — their two sentences with
them (`pathSentence`), since an adapter raises them — are exported to
plugins, and lost `jvm-format`'s engine import; a conflict inside a
composite's service names the path from the product root. The
resolver's `ResolutionError` is now only the `after` cycle; its
uncovered throw is a `RefusalError` from the builder, naming a
capability's vertical when the install is handed the registry. The
planner's nearest adapter now prefers an entrypoint gap to a framework
one, so `distribution` on a Spring or Micronaut CLI reads as the HTTP
server it lacks (four readiness-golden cells). The product-root
redirect and the composite `--with` refusal both became `elsewhere`,
with each service's readiness — from its manifest brownfield, its
preset greenfield — under their old codes until Q1.10's
`keel.wrong-scope`. `extraVerticalsQuestion` already labelled choices
by title. Grid: I5 compares code and sentence on every single-service
cell (the old wrapper back makes 73 cells fail), I6 is hard, and no
golden verdict moved.

#### Q1.8 — Readiness before the click (M) ✅

`ProjectStatus.available` carries `readiness` and `refusal` from the
same `planner.readiness` the menus and the add front door read, so a
card, a menu and a refusal cannot disagree. Status also reports the
harness-generation mismatch once, and why a bounded context cannot be
added. The add front door checks assembly rules over installed ∪
incoming. `keel add --list` prints readiness.

Landed as one reading, `add-readiness.ts`: the product-root redirect,
then `foresee` — the planner's readiness of one vertical, worded as
`admit` words the plan of it — over `projectScope`, the project's
effective tags, installed verticals and the rules those declare. The
add front door plans over the same scope. Every registered vertical
not installed is a card again (the gateway with nothing linked
included): `readiness` (`ready | needs | unavailable`), `requires`, and
`refusal` — the `{code, message, refusal}` the add's `Err` carries.
`harnessGeneration: {found, expected}` and `moduleRefusal` report the
other two gates once; the latter is `add-module.ts`'s project gates,
now one exported function its handler runs too. The rules: a
`PlanScope.rules` field carries the installed pieces' rules (and, in
greenfield, the preset's), and a plan must not newly break one — so a
vertical whose tags would reads unavailable, in the rule's sentence, on
the card, at `keel add` and at `keel new --with` alike — and
`installVerticals` holds every rule of the run's pieces again after
each vertical's fold, refusing one newly broken as `keel.incompatible`
before anything is committed. No shipped rule is of that kind; a
plugin fixture pins it. `keel add --list` is one status dispatch,
printed as ready, ready with what each needs first, not for this
project (in the refusal's words) and installed — the catalog outside a
project — and the page shows a generation mismatch once, above the
cards. Grid: I4 now reads "ready ⇔ Ok; needs ⇔ Ok, staging what naming
its prerequisites with it stages; a refusal ⇔ the same code and
sentence", every vertical installed or a card. Brownfield went 45 → 0
and composite 126 → 36: the product roots' 66 cards and the
web-components frontends' 24 agree now. The 36 left are the monorepo
services' image cells (PHASE-3), which read ready and meet the image
files the product root wrote; the root's declaration of what it builds
(Q1.10) is what can say so before the click, so I4 is not hard yet. No
verdict moved.

#### Q1.9 — The brownfield page shows readiness and takes several picks (L) ✅

Cards grouped _Ready · Needs another capability first · Not for this
project_ (collapsed, one sentence each) _· Belongs in a service ·
Installed_ (with a separate **Re-render** action; `fullstack` and
`bounded-context` as inert chips). The same checkbox control as Q1.5.
Refusals render inline in the plan column with `role="alert"`. After
Generate the page stays on "What to add"; a plan with no changes
cannot be generated.

Landed with the grouping in a new pure `assets/web/src/additions.js`
over `ProjectStatus.available` — a tied `needs` card under _Needs_,
badged as a choice — and the parts both halves share in
`readiness.js`: the greenfield _Also scaffold_ group gains _Not for
this project_ from `keel.dials`, whose `verticals` now lists every
registered vertical, `unavailable` with the `refusal` `keel new
--with` gives it (`foresee`, as the card's). The gestures are
`target.js` transitions — `toggleVertical` (a tick brings the card's
`requires`, an untick takes what needs it; posted as `verticals`,
prerequisites first), `rerender` and `toggleRefresh` — and a run's
subject is now the add as such, so ticking keeps the answers for
`previewed` to prune, while a re-render is a subject of its own.
`InstalledVerticalDescriptor.reapplicable` (the add registry has the
id) turns the product glue and a bounded context into chips, titled
from the stack's or `keel add module`'s own vertical; `keel add
--list` lists them apart. Proposed refreshes needed the preview to
carry them, so `InstallPreview` gains the report's `notes` and
`refreshProposals`, and the plan column shows the notes first. The
refusal region is headed by `response.js`'s `failureOf` — a refusal,
a bug (`keel.internal`) or no answer — and the review leads with the
same words. `moduleRefusal`'s layout sentence, which the disabled tab
now shows, names its rule and no longer the `modules.context` tag
(`refusals.ts`'s `rulesSentence`). `ui-refusal` moved to what only a
click can meet — a user's own `.github/workflows/ci.yml` in the way
(`keel.path-conflict`) — beside the card listed before any click; the
brownfield half of `ui-compose` generates once, on a `ts-http`
project whose image, release and IaC queue no action. _Belongs in a
service_ is the sentence alone until Q1.10's buttons. The grid does
not move: the step is the page's.

#### Q1.10 — Composite products: the root points into its services (L) ✅

A `scopeOf` probe through `ManifestStore` finds the enclosing product
and its services. At the root a vertical a service can take is
`elsewhere` (`keel.wrong-scope`), and the page renders the services
as **Open backend/** buttons. `Vertical.placement?: {scope:
'repository'}` on vcs, ci and distribution (their output is read only
at a repository root) replaces the hard-coded vcs hoist, so hoisting
and refusing cannot drift. `Adapter.providesInServices?` lets
`product-compose` declare the images it builds — and write them from
the same field — so containerization reads _included_ in those
services and stays _ready_ in a plugin product's backend the glue
does not build. Monorepo products still get no per-service release
pipeline or IaC; that is now said, and handed to **U**. `keel new`
inside a product's unlisted subdirectory is refused.

Landed with `domain/core/scope.ts`: `scopeOf` reads a directory's
manifest, the product root above it — the walk stops at the nearest
keel project, and looks no deeper than the deepest service path a
registered product declares — and at a product root each service's
manifest, once per question (the status no longer re-reads them per
card). `planScopeOf` hands the planner a value: a monorepo service's
`PlanScope` holds what the product gives it (`provisionsFor`: a placed
vertical the root installed, and a vertical a root adapter's
`providesInServices` lists its stack for) among `installed`, and
`member`, so a placed vertical neither goes there nor comes in as a
prerequisite, and one needing it reads unavailable with
`ReadinessGap.repositoryOnly` — computed by planning the service as a
repository of its own, without what the product gave it. The refusal
carries `repositoryOnly` and is worded from the first placed
vertical's `because`; the plan's "use `--layout polyrepo`" became
"per-service releases need the polyrepo layout", since a sentence names
no flag. Every scope refusal is `keel.wrong-scope` — the root's
`elsewhere` (was `keel.uncoverable-vertical`, and
`keel.invalid-agent-harness` for the harness) and `keel new --with` on
a composite (was `keel.invalid-extra-verticals`) — except `ci` and
`distribution` asked of a monorepo root, which no service can take
either: refused there as uncovered, sent nowhere. The agent-harness
special case became a declared rule on the product glue,
`fullstack/one-harness`, against the family kit's tag. A vertical a
service has from its product is neither installed nor a card:
`ProjectStatus.provided`, each with the note `keel add` answers it
with — an Ok that stages nothing (I4 holds it so) — and
`ProjectStatus.services` gained `directory` and `label` (the preset id
and build system, the page's own names for them). `keel new --with vcs`
on a composite is set aside with a note, as on a single preset, and
`keel.dials` lists a composite's own verticals as included so the menu
still says so (I3). The unbuilt-image note is generic ("backend/ has
no Container image from the product root, which builds one only for
the stacks it knows — 'keel add containerization' there adds its
own"), since nothing in the declaration names `compose.yaml`.
Registration refuses a placement with no `because`. The page's
**Open backend/** buttons emit `service-opened`, which lands on the
service's "What to add". Grid: I7 landed hard over the composite
cells — no service cell refused for a file in the way, and wherever the
polyrepo twin is Ok the monorepo cell is Ok or `keel.wrong-scope` — and
the 36 PHASE-3 I4 keys cleared, so I4 is hard too. The monorepo
scaffold of every shipped product is byte-identical to before
(manifests and reports included), checked against the previous build.

#### Q1.11 — Answer choices declare where they apply (S) ✅

`QuestionChoice.predicate?`: `mariadb` requires `runtime.jvm`,
`liquibase` excludes it; the preview and the prompt offer only
matching choices, and the `database-compose` guards go.

Landed as one function, `offeredIn` (`answers.ts`): the question with
only the choices whose predicate matches the scope's effective tags
where the adapter runs. `resolveAdapterAnswers` hands that question to
the prompt — so the terminal and the preview's recording prompt list
the same choices — and `validateChoice` holds the reply to it;
`checkSuppliedAnswer`, the check a `--set` or an install body meets
where it reaches its adapter, holds the value to the same list. So
`engine=mariadb` on `go-http` is `keel.invalid-answer` ("choices:
postgres") from the preview, `--set` and the page alike, and
`keel.unsupported-answer` is gone with the guards. Recorded memory is
still not held to the list. The default-answer grid cannot see this
class (it posts no answers), so it did not move; a focused sweep in
`preview.test.ts` holds it instead — on every stack whose menu offers
persistence, each non-default persistence choice previews and installs
(dry run, as `--set`) Ok where it is offered, and is refused by both as
`keel.invalid-answer` where it is not: 18 such cells. The preview
reports each offered choice without its predicate.

### Phase 2 — presets that bend

#### Q2.1 — Preview reads answers as install does; identity answers carry across presets (M) ✅

One precedence function (adapter key, then `sharesAnswersWith`
siblings, then default) for install _and_ preview;
`Question.shared: 'project'` marks identity questions for the page's
carry-over, persisting nothing (D11); shared readers pick the
bootstrap matching the tags, not the first id in a list. Lands I9.

Landed as `answerUnder` over `answerKeys` (`answers.ts`): an
adapter's own id, then its siblings in the order it lists them, the
first holding an answer giving it. The install reads recorded memory
by it and only then what was supplied — recorded first, because that
is the one order a preview can reproduce (its prompt is asked exactly
where recorded memory is silent) and the one that keeps two siblings
from disagreeing: before, a second bootstrap preferred its own
supplied answer over the first one's recorded one, and two keys meant
two packages. The preview's recording prompt reads what it is sent
by the same function, carries the adapter's siblings on the
`Asker`, holds the value to the question's choices under the key it
came under, and binds the question to that key, so the page's
`previewed` keeps it. `quarkus-cli-rest` with a
`quarkus-rest-bootstrap` package now previews and installs `org/acme`.
Every run reports what it read; `unusedAnswers`
(`supplied-answers.ts`) is the one reading of what nothing read — a
key no adapter reads, a question none asks, an installed vertical's
(frozen), a re-rendered one's recorded answers (the old
`frozenAnswerRefusal`, folded in), and, with the reads, a second,
different answer to a shared question or one a recorded answer settled
— which every install front door refuses the first of (`keel add
module` too, which took none before) and `keel.preview` lists as
`InstallPreview.unusedAnswers`, over the plan the run resolved
(`InstallReport.resolvedAdapters`). The same value under both sibling
ids agrees with itself and passes — the JVM combo e2e answers both
bootstraps so. `keel add` refuses a stray key before the run only at
a terminal; a run that asks nothing waits for the exact plan, as the
preview does. The identity questions of every JVM, Go, Rust,
TypeScript and web-components bootstrap declare `shared: 'project'`
(registration refuses another value), which the preview reports on
the bound question; in a product each service's bootstrap asks its
own, so two services keep two names. The readers that scanned a list
of bootstrap ids — the sample ports, the JVM bounded and peer
contexts, the Quarkus native build, the deploy descriptors' project
name, the TypeScript shell — read the bootstrap whose predicate the
manifest's tags match (`adapters/project-identity.ts`), so a manifest
an older keel seeded with another family's answers renders its own
package. A manifest recorded before this change reapplies byte for
byte (`support/fixtures/manifests/legacy-answers.json`). Grid: I9
landed hard on the greenfield axis — every preset with its whole
menu, sent as four bodies (none, every question answered away from
its default, the same keyed to the asker's sibling, and one question
answered twice) to a preview and a dry-run install, stages the same
bytes (a product's services included) or is refused alike, in the
sentence the preview reported.

#### Q2.2 — A preset switch keeps extras and answers (S) ✅

Snapped by `keel.dials` with `adjustments`; answers pruned to the next
preview's bindings, identity answers moved onto the new preset's
bootstrap.

Landed in the page alone (`target.js`, `<keel-app>`); no domain
change. A preset move carries `extraVerticals` with the dials;
`keel.dials` snaps them, and the line under the Preset picker names
each extra lost — _Container image dropped: …_ with the reason the
reply's `dropped` adjustment gave, or, where the reply gives none (a
product, which takes no extras of its own until Q2.3), in the "did not
keep" series by the title the old menu gave it — and keeps quiet about
one the new preset comes with (`included`), which it keeps. The
answers are **held** (`Run.held`) rather than posted: posted blind, a
choice the new preset does not offer — MariaDB, moved to Go — is
`keel.invalid-answer` from the preview, a refusal the page could not
leave, since the question to change it at comes from the preview it
refused. `previewed` places each held answer on its own question
where the new preview asks it and offers the value, and then an
identity answer — marked by the last preview before the move
(`Run.identity`, read off `PendingQuestion.shared`) — on the new
preview's shared question of the same id: only onto a question nothing
has answered, one question per answer, the first given first. Placing
a value the reply had not resolved to moves the generation on, and
`<keel-app>` previews again rather than draw that reply; what is still
held waits for that preview (an answer can bring its own adapter in),
and a reply that places nothing new lets the rest go. A carried
answer is therefore always posted under the key the new preset's own
bootstrap asks under, never a sibling's, so the question list's
grouping by `binding.adapter` (a Q2.1 note) never meets one. Held by
`target.test.ts` — the placements, and a real round trip
`quarkus-rest` → `quarkus-cli-rest` → `go-http` whose preview and
dry-run install agree, the package kept within the family and the name
across it, the same into `fullstack`'s backend under either layout,
and MariaDB let go on Go without a refusal — by
`dials.test.ts` (Maven, the modulith and `[ci]` kept onto
`quarkus-cli-rest`; the image dropped onto `quarkus-cli`, with its
reason; a development environment quiet onto the preset that includes
one) and by `ui-compose`, without Generate. No grid verdict moved.

#### Q2.3 — Per-service extras when creating a product (L) ✅

`--with backend:persistence`, mirroring `--build-system path=id`;
per-service menus from `compositeDials`; a bare `--with` routes to
the one service that admits it (D7). Two scopes staging the same
path are refused before the report, so preview and install agree.

Landed as `NewProjectCommand.services` / `NewProjectTarget.services`
(`Record<path, { extraVerticals }>`, the web schema's too), which the
CLI fills from `--with` entries of the form `path:id` (`parseWith`,
bare ids staying `extraVerticals`; which paths exist and whether the
forms mix is the engine's to refuse, `keel.invalid-extra-verticals`,
as are an id twice for one service and a pair on a single stack).
One scope serves the three readers of a service: `scope.ts`'s
`presetServiceScope`, now over the preset's verticals **and** the
product's extras for it (their promotions folded in, a placed one left
out under the monorepo layout, as `stageStack` leaves it out), on
`presetServiceTags` — the build system chosen for it, its default
module layout and its siblings' projections — plus the monorepo
provisions of Q1.10. `stageComposite` checks the form before any
question, then, after the layout and build systems and before a file
is staged, routes each bare id (`dials.ts`'s `routeExtra`: the one
service whose readiness is ready or needs, else the product-root
placement refusal or the `elsewhere` refusal naming each service's
readiness) and admits each service's extras on that scope through
`plan-refusal.ts`'s `admit` — set aside already-there ones with a note
(_backend: Container image already comes with fullstack_), close the
rest, notes prefixed with the service. The routed note is
_Persistence goes in backend/, the one service of fullstack that can
take it_; the CLI hint for a refusal several services could take
names the pairs (`'--with backend:toolchain' or '--with
frontend:toolchain'`), and one under a service's own refusal the pair
to drop (`drop 'frontend:persistence' from --with`), never another
stack to scaffold. `compositeDials` returns
`ServiceDialOptions.verticals` per service (`scopeOptions` over that
scope), snaps `target.services` per service (`snapOnto`, adjustments
carrying `service`), moves bare `extraVerticals` onto the routed
service (an `added` adjustment in the routed note's words) or drops
them with the refusal, and reports top-level `extraVerticals` /
`verticals` as a bare id reads — which is what keeps greenfield I3
hard now that `--with persistence` on a product is Ok. `singleDials`
reads a product's `services` extras as its own, so a move off a
product keeps them. `agentHarness` stays false on products, and the
composite `--no-agent-harness` refusal is unchanged.

Cross-scope writes: `Ownership` gained `writers` (path → the adapter
that last wrote it, recorded in `applyContribution` and for hook
scripts), each composite scope stages with its own, and
`stageComposite` refuses a path two scopes stage
(`keel.cross-scope-write`, `refusals.ts`'s `crossScopeWriteError`)
after staging and before the report — the Option A preset
(containerization among a monorepo backend's extras) is refused by
preview and dry run in one sentence naming `fullstack/product-compose`
and `containerization/quarkus-rest-image`. No manifest schema changed.
The page (`extras.js`' `serviceExtrasGroup` and
`servicesExtrasSummary`, `target.js`' `toggleExtra(…, service)` and
`serviceExtrasOf`, `services` carried across a preset move and its
extras counted kept or lost by id; `command.js` spelling the pairs)
draws an **Also scaffold in backend/** group per service. Held by
`new-project.test.ts`, `composite-scope.test.ts` (`fullstack --with
backend:persistence` byte for byte `keel new` then `keel add
persistence` in `backend/`, under both layouts, the manifest's owned
entries by source and target; `backend:ci` refused before a file; the
Option A preset), `new-with-example.test.ts` (the help's product
example planned on both layouts), the web `dials`, `extras`,
`target` and `command` suites and `ui-compose`. Grid: the greenfield
golden moved 12 product cells from `keel.wrong-scope` to Ok (each
product's `persistence` and `dev-env`, now routed) and gained their
I8 orderings; the composite axis now also previews every product ×
layout × service × vertical of each service's menu (156 cells), held
to I2 (offered ⇒ Ok), I3 (neither offered nor its own ⇒ refused) and
I7 against its polyrepo twin. The known files stayed empty. Not done:
the terminal wizard asks no per-service extras question — interactive
runs name them with `--with path:id` or take none, as before.

#### Q2.4 — `--no-agent-harness` reaches the page (S) ✅

`NewProjectTarget` and the web target schema gain `agentHarness`; the
Agent harness chip becomes deselectable and the copyable command
carries the flag; `keel.dials` filters out extras that promote
`agentic.harness`.

Landed as a dial of `keel.dials`. `DialOptions.agentHarness` says
where it exists (`harnessOptional`, `dials.ts`): a single-service
preset that comes with the harness and whose own tags and remaining
verticals do not switch it back on — never a product, whose every
service carries it. The settled target carries `agentHarness: false`
and nothing for on, which is what an absent field means to the
install and to the command line; `installCommandFor` maps it, so
dials, preview and install read one field. With it off, the menus are
read over the preset as `--no-agent-harness` installs it
(`withoutHarness`): `harnessLeftOut` keeps the harness `included` —
the preset's own, to press back on — and marks a vertical that would
switch it back on `unavailable` in the sentence `keel new` refuses the
pair with, which `snapExtras` drops it in. Switching it back on
includes needing it (`switchesHarnessOn`): a plugin vertical whose
plan installs the harness first as its prerequisite is refused too,
where `keel new` used to bring the harness back unasked and
`keel.dials` settled a target the install refused. `keel new`'s extras
question reads the same function in place of its inline filter, so
the two menus are one. The sentence stopped naming the tag (_it
switches the agent harness back on_), and the composite refusal now
says why the flag is single-service — every service of a product
carries the harness — where it claimed only "product-root harness
selection" was unsupported and `docs/cli.md` sent the user to `keel
add agent-harness` in a service that already had one. On the page
(`extras.js`, `<keel-new-form>`) the chip is a toggle button with
`aria-pressed`, a check while on, dashed and struck through when let
go, with a line under the chips saying which way it is and how to put
it back; the command line adds `--no-agent-harness`, the review a row,
and a preset move carries it like the other dials (`target.js`),
saying _Moving to fullstack-go did not keep the agent harness off._
where a product puts it back. Held by `dials.test.ts` (the dial on
`go-cli`, not on a product, a harness-less or self-activating preset;
a plugin's harness, and a plugin vertical needing one, unavailable and
dropped in the install's own words; the terminal's extras question
equal to the menu either way),
`preview.test.ts` (preview and dry-run install stage the same tree,
without `AGENTS.md` or skills; refused on a product), the web walk
(every single preset pressed off once — 28 more previews — and never
a product), a preset move each way, `command`, `extras`, `target` and
`api` cases, and `ui-compose` in a browser, without Generate. No grid
verdict moved.

#### Q2.5 — The verticals matrix is generated from the grid's verdicts (S) ✅

The compatibility matrix in `docs/verticals/README.md` and the stack
catalog's defaults table are rendered from the grid's goldens (D8),
between sentinel comments, and a guard in `verify` fails when
regenerating would change a committed file.

Landed as `tests/support/generated-docs.ts` and the guard beside the
others, `tests/generated-docs.test.ts`. The renderer reads the
verdicts from the brownfield and composite goldens (`keel add` in a
fresh scaffold, which the grid holds to the greenfield `--with`
verdict), what each scope comes with from `keel.dials` (`included`,
which under the monorepo layout counts what the product root gives a
service), and install order from the registry. Stacks, verticals,
layouts and services come from the catalog and the goldens, and none
is named in the renderer. Columns are the entrypoint sets the
presets reach, named as the wizard names them (CLI, HTTP server, CLI +
HTTP server, Browser SPA), then the product root (only under the
layouts where it is a keel project) and each product service. A cell
where a column's scopes disagree names them along the first dimension
that decides it: the layout (_● monorepo · ➕ polyrepo_), else the
preset or product, with the most common glyph read as _the rest_. Rows
follow the catalog table above the matrix, and the renderer refuses a
vertical that table does not place. The regions sit between
`<!-- generated:<name>:begin/end -->`; the hand-written notes around
them replace the old footnotes, and the whole file goes through
prettier, so the check is byte for byte.
`KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/generated-docs.test.ts`
regenerates, after the grid. The new table fixed what the hand-written
one got wrong: `distribution` on the Spring and Micronaut CLIs, filed
under a Quarkus-only footnote; `gateway` on a stack with no linked
project (refused on every one); and the product root and its two
services, which shared one column. The defaults table now lists
`agent-harness` and `code-style`. The stale sentences the plan listed
were fixed: `docs/cli.md`'s list of verticals (twelve of fourteen)
and its "three" drill-down questions (four); the "document order" the
wizard supposedly reads (`stack-presets.json`, `stacks.ts` — every
reader sorts, and only the registry golden sees the order); and the
product-compose comment, which Q1.10 had already rewritten and which
now names `ts-http`'s image too. Deviation: the guard sentences in the
root `AGENTS.md` and `tests/AGENTS.md` said four, but the list already
held six suites (the toolchain pair had joined without a recount), so
this guard makes seven, not five, and both now say so. No verdict
moved; the known files stayed empty.

#### Q2.6 — `README.md` and `.gitignore` are adopted on every stack (M) ✅

Seeded upserts on the Go, Rust, web-components and product
bootstraps, as the JVM family already does (D13), so "create a repo
with a README, clone, `keel new`" works on all 34.

Landed as one module, `adapters/adopted-files.ts`, that every family
writes the two files through: `adoptingRootFiles` turns a rendered
tree's root `README.md` and `.gitignore` into seeded upserts (the Go,
Rust and `web-components` bootstraps, `fullstack/product-docs`), and
the JVM and TypeScript shared roots reach the same adoptions through
`toUpsertPatches`, which was two private copies before, and
`readmeUpsert`. A `README.md` keeps the user's content, title
included, and gains keel's README after it, less keel's title,
unless it already has every one of that body's `##` headings (the
marker guard keel's README patches use, so an edit inside keel's
sections never makes a second copy). Each entrypoint's `### <arch>` section still follows, as
in a fresh project. A `.gitignore` keeps every line and gains each of
keel's entries it lacks, in keel's groups, under keel's comments. Each
`apply` is the identity on its own seed and its own fixed point,
compared on LF text so a CRLF file is adopted once. The JVM and
TypeScript stacks change too: their adopted README gained only the
entrypoint's section, and their `.gitignore` upsert was the identity,
so keel's entries went missing without a word. Now every family adds
them. Under `keel add walking-skeleton --reapply` the two are patched
files on every stack: the Go, Rust and `web-components` ones are no
longer rewritten to pristine, and every `.gitignore` regains keel's
missing entries. The entrypoints' README section patches (Go, Rust,
JVM, TypeScript) match their `### <arch>` marker in the file's own
line endings, so a CRLF README, adopted or checked out under
`core.autocrlf`, does not make that `--reapply` refuse the README as a
divergence. Any other pre-existing file is still
`keel.path-conflict` — for a file keel writes whole; one it patches
(`package.json`, `settings.gradle.kts`, `AGENTS.md`, …) was still
merged into, which the epic's final review found and fixed, and the
seeded axis now seeds every file the scaffold writes at the
directory's root (`seededBeforeNew`). Into an empty directory the bytes are unchanged
on every stack: 154 scaffolds (every preset on its default dials and,
where it takes them, the modulith, Maven, npm, polyrepo and two sets
of extras) hashed before and after, byte for byte. The
`agent-harness`, `stack-registry` and brownfield and composite grid
goldens do not move. The greenfield golden's 26 seeded
`keel.path-conflict` cells turn `ok`, so the seeded axis is `ok` on
all 34 stacks. Held by `adopted-files.test.ts` (each adoption, its
identity on the seed, its fixed point, CRLF, a blank file, a README
keel wrote under another name, an edited section) and
`new-project-adoption.test.ts`: one stack per family, scaffolded fresh
and over a user's two files, where the README is the user's followed
by the fresh one below its title, every keel entry is present once,
every other file is byte-identical, a service's own README inside a
product is adopted too, a `--reapply` keeps an edited README and
restores only a dropped entry, and a CRLF README comes through a
`--reapply` untouched on the Go, Rust, JVM and TypeScript families.
The two refusal tests that seeded a README (`new-project`,
`fullstack`) now seed `go.mod`.

#### Q2.7 — One page for both phases (M) ✅

The Directory step decides the flow; on a keel project the same "Also
scaffold" control shows installed verticals checked and locked, and
Generate dispatches the delta. The commands stay two (converge is
**S**).

Landed with Options hosting the one control, the design with fewer
page states: the brownfield _What to add_ step is gone rather than
shared, since sharing it would have split a new project's Options in
two. A keel project's rail is Directory, **Project**, Options,
Questions, Review — `project` in the place of the four preset steps,
`target` retired, so the page has as many step ids as before and one
Options state for both phases. **Project** is read-only: the preset the
manifest reads as and the choices that made it, a product's services,
the bounded contexts and what is installed. The page never sees a tag,
so this needed one domain addition the plan did not name:
`ProjectStatus.profile` (`domain/core/profile.ts`), which runs the
drill-down backwards (`stack-wizard.ts`'s new `axesOf`, the reading
`singlePath` now shares) over the manifest's tags to the answers
`keel new` was given and the preset they lead to — or, at a product
root, names the product with exactly the recorded services — worded
as `label`/`value` lines. Every assemblable preset on every setting of
its dials reads back as itself, and every product does
(`profile.test.ts`). **Options** draws one builder in both flows
(`dom.js`'s `alsoScaffold`, with `tickPart` and `lockedPart`), under
the same ids (`#extras-ready`, `-needs`, `-refused`): a new project's
preset verticals stay chips (nothing is installed yet, and the harness
is a switch there), and a keel project's installed verticals, its glue
and context, and a monorepo service's gifts from the product are one
**Installed** part, boxes ticked and disabled, a **Re-render** beside
each vertical `--reapply` names (`additions.js`' `installed`, which
replaces `rerenderable`, `chips` and `provided`). The lock holds in
the transition too: `toggleVertical` returns the run unchanged for an
installed or provided id. What Q1.9 and Q1.10 built that Options
lacked is kept inside the group or beside it: _Proposed re-renders_,
_Belongs in a service_ with its **Open** buttons, the bounded-context
tab with its disabled reason, and the harness-generation line above
the tabs. `keel ui` started in a keel project opens on Options, as do
Generate and **Open backend/**; an empty directory still opens on
Directory, and moving through the folder picker never leaves it. A
keel project's review reads _Project_ and _Also scaffold_ where a new
project's reads _Preset_ and _Also scaffold_.
Held by `steps.test.ts` (the rail per flow, where a step of the other
flow settles), `target.test.ts` (a locked box moves nothing),
`additions.test.ts`, `project.test.ts` (the summary off real
scaffolds, a product root and a monorepo service) and a new
`ui-compose` case on a seeded `ts-http` project: the page opens on
Options with its installed verticals ticked and disabled, one tick
posts `{ verticals: ['ci'] }` and `keel add ci --yes`, and the Project
step shows the profile and no control. The other browser suites
changed only where the flow did (the rail's `project` step, Options
for _What to add_, `#extras-*` for `#add-*`). No verdict moved: the
goldens regenerate byte-identical and the known files stay empty.

#### Q2.8 — Vocabulary: the nearest stack id, and the Backend shape relabelled (S) ✅

An unknown `--stack` suggests the nearest id — by facet tokens, then
edit distance (`quarkus-cli-http` → `quarkus-cli-rest`,
`fullstack-quarkus` → `fullstack`); the Backend shape reads "Backend
or tool — no front end (command line, HTTP service, or both)". Aliases
arrive with **T**.1.

Landed as one pure reading, `domain/core/nearest-id.ts`, that both
front doors ask when an id names nothing: `keel.unknown-stack` and
`keel.unknown-vertical` (`keel new --stack`, `--with`, `keel add`) put
the nearest id first — _unknown stack 'go-rest' — did you mean
'go-http'? Available: …_ — and keep the list. A typed word counts
where it weighs most: what an id spells, then what its own tags and
the finder's entrypoint labels say (`arch.server-http` is "an HTTP
server — a REST endpoint", which is how `go-rest` finds `go-http`
without an alias table), then what a product's services say; a word
every candidate answers to (`hexagonal`) is not counted; edit distance
breaks a tie, and is the whole reading only where no word matches,
within a bound, so noise names nothing. A vertical is read by its id
and its title (`container` → `containerization`). The relabel reads
through every summary unchanged, since each takes the name before
`—` (the terminal's resolution line, the masthead, the profile, the
language-jump notice: _… has no backend or tool preset_). Folded in
from the vocabulary notes the earlier steps left for this one:
frameworks are named as products (_Quarkus_, _Web Components_) in the
menus, the resolution line, the profile and the refusal of a
combination no preset scaffolds; the stack matrices'
hand-written headers use the finder's words (_HTTP server_, _CLI + HTTP
server_, _Browser SPA_), as the generated tables do; an extras
adjustment and a move's notice go on from the title (_Left out Version
control — it already comes with go-cli_) rather than saying it twice.
Sentences met in a real browser after Phase 1 were fixed too:
`keel add module` on the flat layout now reads as the rule's own reason,
capitalised — its id in the refusal's data (`rules`), no longer in the
words the disabled tab shows — and a flag a sentence names is set on
the page as one literal (`command.js`' `flagSpans`, `dom.js`'
`sentence`), so `--module-layout=modulith` no longer breaks after its
`--`; and a monorepo product root refusing a vertical no service can
carry says why, ending on the way forward the service's own refusal
gives — _… since it needs Distribution, which cannot go in a monorepo
service: … per-service releases need the polyrepo layout_ — from each
service's `repositoryOnly`, now carried in the `elsewhere` refusal.
Held by `nearest-id.test.ts` (the audit's guesses, slips and noise,
and the weighting on hand-made candidates), a `new-project` case per
guessed stack and one per vertical front door, `stack-wizard.test.ts`
for the label, `refusals.test.ts` and `composite-scope.test.ts` for
the product-root sentence, `command.test.ts` for the flag spans, and
the browser suites (`ui-refusal`: the tab's reason is capitalised,
names no rule and keeps the flag on one line; `ui-compose`: the root's
Infrastructure-as-code line ends on the polyrepo layout). No verdict
moved: the goldens regenerate byte-identical and the known files stay
as they were.

### Phase 3 — open ends, after #169

What Q's final review and D4 left open once #169 had merged: a
monorepo product root still refused what `keel new --with` on the same
product set aside as already there (Q3.1); `keel new` run inside a
project that already exists (Q3.2); two refusals whose words still fall
short, and a third Q3.1 met — the harness-generation refusal at a
product root, which names `keel add agent-harness` as the way forward
where that add installs nothing and is refused in turn (the refusal of
that very add names itself), as `keel add --list`'s generation line
and the page's notice do, each saying every add but that one is
refused — and a fourth Q3.2 left, `keel add module`, `keel link` and
`keel toolchain` inside a project still saying to run `keel new` first
(all four Q3.3); the weekly report-only lane _The measure_ planned
and did not build (Q3.4); and the first thing that lane found,
persistence throwing on the peer context's modulith (Q3.5). One step
each, the grid naming what moves.

#### Q3.1 — "Already there" at a monorepo product root (S) ✅

`keel add <v>` at a monorepo product root, for a vertical every service
that could take it already has — code style, the harness, the image the
root builds — is refused as `keel.wrong-scope`, while `keel new --with
v` on the product sets the same fact aside with a note (Q2.3). Make it
an Ok that adds nothing, its note naming the services, as D4 has it
everywhere else; list it in `ProjectStatus.provided`, so the page shows
it locked rather than refused; have I4 hold it; keep
`keel.wrong-scope` for a vertical some service could still take.

Landed as one reading both phases ask, `plan-refusal.ts`'s
`amongServices`, over how ready a vertical is in each service: one
placed at a repository root, asked of a monorepo product, is the
placement refusal; one no service admits and some service has is
`included`, naming those; any other is the `elsewhere` refusal.
`dials.ts`'s `routeExtra` still sends a vertical exactly one service
admits there and hands it the rest, unchanged (the greenfield golden
regenerates byte-identical); `add-readiness.ts`'s `productRootRefusal`
became `productRootReading`, the same reads over each service's
manifest, answering `included` — with the paths, and each service's
readiness — or `refused`. The add front door sets an `included`
vertical aside with `refusals.ts`'s new `inServicesNote` — _Code style
is already there: backend/ and frontend/ have it_ — beside what is
installed and what a monorepo service has from its product, and
returns before it stages when nothing is left, so nothing is written
and the manifest is not rewritten; named beside one the root carries
(`keel add code-style dev-env`) the rest install, and beside one it
refuses (`persistence`) the refusal wins. `keel.project-status` lists
each in `provided` with the same note, so the status, the preview, the
report and `keel add --list` (under _In its services, nothing to add:_)
say one sentence, and `addReadiness` is no longer asked of one. No
field was added to the status: a front end tells a product root by its
`services`, and the note names the directories. On the page,
`additions.js` puts a root's `provided` in a part of its own,
`inServices`, which `<keel-add-form>` locks under **In its services**
(`#extras-in-services`) — not _Installed_, since the root installed
none of it, nor _Belongs in a service_, since it is no refusal — and
the Project step's _Installed_ chips leave it out at a root, whose
rows name the services. Grid: 42 composite cells moved from
`keel.wrong-scope` to Ok, `add:<product>/monorepo+<v>` for each of the
six products and seven verticals, each the rule's `included` —
`agent-harness`, `code-style`, `dev-container` and `walking-skeleton`
(both services' presets install them), `containerization` (the root
builds both services' images), `gateway` (each service's product
extra) and `observability` (the backend has it; the web-components
front end cannot carry it). `persistence` (the backend could take it),
`toolchain` (both could) and `iac` (none has or can take it) stay
`keel.wrong-scope`, and `ci` and `distribution`
`keel.uncoverable-vertical`. I4 holds each through `holdCard`'s
`provided` branch, and the composite suite now holds the root to the
product's `keel.dials` too: what the menu shows as coming with the
product under that layout is exactly what the root's add answers with
an Ok that stages and runs nothing — recorded under I4, whose text
now says so, since I4 is hard and I5 is not and would give the axis an
allowance. The docs
matrix's product-root column moved on those seven rows from ↪ to ●,
its `included` now read from `keel.dials` rather than the preset's own
verticals — the renderer throws where `keel.dials` has one as coming
with the scope and its add is not Ok, and the composite suite holds
the other direction — and the legend says a ● there is what the
services have. The greenfield,
brownfield and planner-readiness goldens regenerate byte-identical,
and the known files stay as they were.

Beyond the text above: a re-render at the root. `--reapply` of such a
vertical stays `keel.wrong-scope`, the root's `elsewhere` refusal as
before, answered where a re-render of anything not installed is —
after the harness-generation gate, as `--refresh` is. The clause its
sentence has for services that have it, now reached only by a
re-render, says where each has it from, since _included_ covers two
facts: one a service installed ends _… have it already, and it is
re-rendered there_, and `hint.ts` spells the re-render in each
(`'cd backend && keel add code-style --reapply' or …`); one the root
builds for a service ends _… has it already, built by the product
root_, with no hint. Where the root builds it for every service having
it — the shipped products' image — the `elsewhere` lead would be
false, and the sentence is the root's own instead: _Container image is
not installed at the product root, which builds it for backend/ and
frontend/: nothing to re-render here_. And the service's own
re-render of it, which since Q1.10 said the product root re-renders
it — nothing at the root does: the glue, `fullstack`, is no vertical
`keel add` names — now says only _… the product root builds it for
this service: nothing to reapply here_, so neither sentence sends the
user to the other. That difference is carried in the refusal, not
inferred: a new optional `ElsewhereService.fromProduct`, set in both
phases from the service scope's `PlanScope.member` — greenfield, it
reaches a refusal only where two services could take the vertical and
the root builds it for a third, which a three-service plugin product
pins. `--refresh` of a vertical the root does not carry fell through
to `keel.vertical-not-installed`, advising a `keel add` that is now an
Ok adding nothing, or a refusal; it reads through `productRootReading`
too, so it is refused as `--reapply` of it is (`keel.wrong-scope`, or
`keel.uncoverable-vertical` for a pipeline or a release). And the generation gate: `keel add
agent-harness` alone skips it, as the command that brings a harness
forward, but at a product root it installs nothing, so there it is
gated like every other add rather than an Ok that restamps nothing.
The generation refusal still names `keel add agent-harness` as the
way forward there — for that very add too, refused as
`keel.wrong-scope` before this step — and it cannot restamp a root
whose harness is the product glue's: the third wording gap the Phase 3
intro names, left to its step with `keel add --list`'s line and the
page's notice, and said in `docs/cli.md`, `docs/ui.md` and the status
contract's TSDoc meanwhile.
Held by `plan-refusal.test.ts` (`amongServices`, each of its
answers), `composite-scope.test.ts` (the root's `provided` and its
notes; the preview, a dry run and a real run of each staging nothing,
files untouched and the manifest store asked for no write; the mixed
sets; both re-renders, the
image's at the root and in each service, and one each service runs,
`persistence` beside them; a plugin's product whose root sends the
image to the backend that could take it while the frontend has it,
then, once the backend has added it, says where each has it from; and
a three-service one whose `keel new --with` refusal and root add
refusal carry `fromProduct` alike), `harness-generation.test.ts` (the
stale root), `fullstack.test.ts` (the harness at the root, and
`persistence` there once the backend has it), `refusals.test.ts`,
`hint.test.ts`, the CLI's `add.test.ts` (`--list` at a root, and a
re-render at the root whose hint names in each service a `--reapply`
that runs, the image's naming none), `additions.test.ts` and
`project.test.ts`, and `ui-compose` in a browser (the root's **In its
services**, locked, naming both).

#### Q3.2 — `keel new` inside a keel project is refused up front (S) ✅

`keel new` in a subdirectory of an existing single keel project is not
refused: it trips over keel's own `CLAUDE.md` as a file in the way.
Refuse it up front with a coded refusal, `keel.inside-project`, worded
like `keel.inside-product` and naming the enclosing project, found by
the same unbounded walk up `keel add`'s `keel.not-initialised`
sentence reads. Nesting stays possible by scaffolding elsewhere and
moving the tree; a directory holding its own manifest stays
`keel.already-initialised`.

Landed after reproducing it, which showed the defect wider than
stated: in a directory the user made under a `go-cli`, `ts-cli` or
`quarkus-cli` project — `tools/`, `tools/scripts/` — or one keel wrote
that holds no `CLAUDE.md`, `.claude/` itself, `keel new` was not
refused at all, dry run or real, and scaffolded a second repository
inside the first, its own `.git`, `.claude/` and manifest; only in a
directory keel wrote a `CLAUDE.md` into (`internal/app/` on Go,
`domain/` on the others) did it meet that file, as
`keel.path-conflict`. So `keel ui`'s preview there answered a plan, or
that conflict. Inside a monorepo product, `enclosingProduct` looked no
further up than the deepest service path a product declares — one
level, for keel's own — and stopped at the first project it met, so
`<product>/docs/notes/` and `<product>/backend/tools/` scaffolded too.
`scope.ts` now has one walk up, `projectAbove` — the nearest manifest
above a directory, as far as a `WalkUp` says: at most `levels` up,
every one to the filesystem's root by default, passing over a manifest
keel cannot read unless told to stop there (`unreadable: 'stop'`, a
project whose manifest is null) — and `productAround`, the product
that project makes the directory part of when it is a product root:
`enclosingProduct` is the walk bounded as before, so `scopeOf`, `keel
add` and the status read what they did, and `nearbyProjects`' `above`
the walk unbounded, stopping at a manifest it cannot read. Every walk
ends at the user's home directory, unread. `new-project.ts`'s
`stage()` reads the directory's own manifest first, before the stack
is resolved or a question asked: holding one, it is
`keel.already-initialised` there and then — the check `stageSingle`
and `stageComposite` each made on this one scope root once the stack
and its dials were settled, moved up and made once — and one keel
cannot read throws from that read, the broken file reported as
anywhere. Holding none, the unbounded walk
decides, stopping at a manifest it cannot read: no project above, the
run goes on; a product root, `keel.inside-product` for a directory it
does not list (now at any depth: `docs/notes/` names `../../`) or for a
listed service emptied, as before; any other project — a product's
service included (`backend/tools/` names `../`, the service), and one
whose manifest keel cannot read, which cannot say it is a product root
— the new `keel.inside-project`: _this directory is inside the keel
project at ../; scaffolding a project inside another is not supported
— scaffold it elsewhere and move it here_. It is a plain
`DomainError`, its code `INSIDE_PROJECT_CODE` exported beside
`INSIDE_PRODUCT_CODE`, as `keel.inside-product` is: neither is about a
vertical or a file, which is what the `Refusal` union carries. The
remedy is in the sentence; `hint.ts` builds a hint from a
`RefusalError`'s fields only and has none for either code, so `keel
new` prints the sentence alone. `keel.preview` of a new project runs
the same handler, so it is refused alike: `keel ui`'s Directory step
reads such a directory as `initialised: false`, the page offers a new
project's steps, and the preview answers a 422 carrying the code,
which `response.js` reads as a refusal and the plan column shows where
the plan would be — no page change, no e2e suite touched. Held by
`new-project.test.ts` (a `go-cli` project's `tools/`, `tools/scripts/`,
`tools/scripts/lint/` and `internal/app/`, each refused naming `../`,
`../../` or `../../../` with no question asked and nothing written; the
preview refused in the same words, `keel add` there naming the same
project and the status reading none; a project moved in whole, and the
project's own directory, already initialised; a manifest keel cannot
read, in `tools/` and in a directory no project holds, reported alike;
`tools/scripts/` under a project whose manifest keel cannot read,
refused naming `../../`, where `keel add` names it too — each of the
last three interactive, with no `--stack` and no question asked; and
`my-app/` and `code/my-app/` under a home directory holding a
0.1.0-alpha global manifest, scaffolded and previewed, `keel add`
there pointing at `keel new`), `composite-scope.test.ts`
(`docs/notes/` and `docs/notes/drafts/` inside the product,
`backend/tools/` inside its service, and — with no question asked — a
project moved into `worker/` and a listed service whose manifest
cannot be read), `scope.test.ts` (over the fake store: `projectAbove`
unbounded four levels up and stopped by `levels`, passing over a
manifest it cannot read or stopping at it when told to, ending at the
home directory unread, and `productAround` for a service, an unlisted
directory two levels down, a project that is no product root and one
it cannot read), and
`server.test.ts` (over a socket and the real engine, `tools/` and
`domain/` under a scaffolded project: the status reads no project, the
preview is a 422 the page reads as a refusal). No verdict moved — the
grid scaffolds each greenfield and composite cell into a fresh scratch
directory and asks each brownfield one at a project's root: the
greenfield, brownfield, composite and planner-readiness goldens and the
docs matrix regenerate byte-identical, and the known files stay as
they were.

Beyond the text above: a directory holding a manifest is refused
first, whatever holds it, and `keel.already-initialised` with it. In a
project's own directory, a run with no `--stack` asked the whole stack
drill-down — and on a composite, its layout and build systems — before
refusing; it now asks nothing, and wins over a refusal of what was
named (an unknown `--stack` there is `keel.already-initialised` now).
Inside a monorepo product, a directory directly under the root that
the product does not list, holding a project moved in, was
`keel.inside-product`, read before its own manifest; and a manifest
keel could not read there or in a listed service was
`keel.inside-product` too — the unlisted directory's sentence, or the
listed service's _re-scaffolding_ one — while one deeper, such as
`docs/notes/`'s, was reported as the broken file. Now the first is
`keel.already-initialised`, the one rule for a directory holding a
manifest, and a manifest keel cannot read in the directory itself is
reported as the broken file wherever it sits, as in a directory no
project holds. Read as no manifest, it would have been
`keel.inside-project` inside a project, whose remedy — scaffold it
elsewhere and move it here — is what the user already did. A manifest
keel cannot read above the directory is the other way round: `scopeOf`
passes over it as not this directory's to report, but `keel new`'s
walk stops at it, since passed over it let a run under a project with
a broken manifest scaffold a second repository inside it — and so
does `nearbyProjects`', so that `keel add` there names that project,
where the broken file is reported, and not the `keel new` refused
there. And a walk ends at the user's home directory without reading
it: `ProjectReadDeps.home` and `InstallDeps.home`, which the
composition root sets to `os.homedir()`. 0.1.0-alpha's `keel install
--global` wrote `~/.claude/.keel-manifest.json`, which `parseManifest`
still reads — a v1 manifest, migrated with no services — so an
unbounded walk would make the home directory a project and refuse
`keel new` anywhere under it, where `enclosingProduct`'s one level
read it only directly under home, as no product's root; and `keel
add`'s sentence, unreleased, pointed at it. Not done, and not yet
planned: a polyrepo product's own directory holds no manifest and
sits inside no project, so `keel new` there still scaffolds a project
over the product's services, where `keel add` already points at them
(`nearbyProjects`' `below`) — said in `docs/cli.md`; and, run in the
home directory itself, keel still reads `~/.claude` as that directory's
own scope root, as before.

#### Q3.3 — Refusals name what they know (S) ✅

Four refusals that know more than they say. `keel new
--stack=quarkus-cli --with observability` is hinted towards
`--stack=quarkus-cli-rest --with observability`, a `--with` that preset
only sets aside, since observability comes with it; `--with
frontend:persistence` is refused as if the front end were a project
alone, naming no sibling that could take it; at a stale monorepo
product root the harness-generation refusal names `keel add
agent-harness`, which installs nothing there and is refused in the same
words, as `keel add --list`'s line and the page's notice do; and `keel
add module`, `keel link` and `keel toolchain` inside a project say to
run `keel new` first, which Q3.2 refuses there. Record on the refusal
which nearest stacks come with the vertical and which of the product's
other services could take it, word the hint (and, where it is then
wrong, the sentence) from those fields, name a way forward that works
at a product root, and point the three commands at the project above as
`keel add` points.

Landed as two optional fields on `UnavailableRefusal`, a truthful
sentence at the product root, and one sentence moved into the contract.
`comesWith` — among `carriedBy`, in its order, the stacks whose preset
installs the vertical as one of its own — is the planner's
(`ReadinessGap.comesWith`, read in `gapOf` off each nearest stack's
`verticals` through the registry), and `unavailableRefusal` carries it.
The sentence did not change: _the nearest stack that carries it_ is
still true of a stack that comes with it, it is one sentence for both
phases (I5), and changing it would move every such sentence for a
difference only the hint acts on. `hint.ts` words by the first nearest
stack, as it names only that one: a stack that comes with it is
scaffolded naming nothing more (_…, or scaffold quarkus-cli-rest, which
comes with it: 'keel new --stack=quarkus-cli-rest'_), and `keel add`'s
entrypoint-only hint reads _quarkus-cli-rest has this project's
entrypoints and comes with observability_; one that carries it only as
an extra keeps `--with` — persistence, which no preset installs, is the
shipped case, and the hint table pins a first nearest that carries it
as an extra beside a second that comes with it.

`elsewhere` — the product's other services, each an `ElsewhereService`
with its readiness there, present only where one of them can take the
vertical or has it — is filled wherever a front door can read the
siblings: `admit`, `foresee` and `planRefusal` take an optional
`siblings` (`ProductServiceScope`, new in `scope.ts`: a service's path,
preset and the scope a plan there reads), whose readiness
`readinessAmong` reads, as `routeExtra` and `productRootReading` now
read theirs. Greenfield, `dials.ts`' `siblingScopes` hands each service
the others from the scopes `routeExtra` reads — to `stageComposite`'s
admission, to `compositeDials`' per-service menus (`scopeOptions`) and
to its snap (`snapOnto`) — so `keel new`, the page's _Not for
frontend/_ and the reason a pick is dropped say one sentence.
Brownfield, `scopeOf` reads a monorepo service's siblings once, from
the root's list, each with its own manifest
(`DirectoryScope.siblings`), and `siblingsOf` hands them to the card
(`addReadiness`) and to the add front door alike. The sentence goes on
from the service's own, which is a single project's word for word where
no sibling could: _Persistence has no adapter for this project's stack;
backend/ can take it_, _…; backend/ has it already_ — never after a
placement or a re-render gap, which say what to do in the service
itself. The code is unchanged (the service cannot carry it; it is not
the wrong scope). The hint under a `--with path:id` adds the pair to
type instead (_drop 'frontend:persistence' from --with, or name
backend/: '--with backend:persistence'_), never a service already named
for it, and spells the pair to drop from the service refused, the one
`elsewhere` leaves out. A polyrepo service has no product root to list
its siblings, so `keel add` there is refused as a project of its own;
`keel new` of a polyrepo product names backend/ all the same, since the
preset lists its services.

At a stale product root nothing brings the harness forward: the root's
is the product glue's (`fullstack/product-harness`), `fullstack` is no
vertical `keel add` names, `keel add agent-harness` there adds nothing
to services that have it (and is gated since Q3.1), and the services'
own `--reapply` restamps only them. A real remedy would have made `keel
add agent-harness` at a stale root re-render the whole glue — its
`compose.yaml` and README with its harness, since an install runs
verticals and the harness is one adapter of one — and mean an Ok naming
the services at a current root but a re-render at a stale one, which
the root's `provided` card (held by I4 to an add staging nothing) could
not say. So the refusal says what is true instead:
`harness-generation.ts` reads a manifest listing services as a product
root — _this product root was scaffolded by an older keel (keel@…): … A
product root's harness is the product's own, and no 'keel add' brings
it forward — the agent harness is its services', each brought forward
in its own directory — so pin keel@…, the keel that scaffolded it, to
run '…' here_ — for an add the root runs itself (`dev-env`, or a
re-render of what it has: `vcs --reapply`) and `keel docs`. An add
naming only what is there already — what its services have (the
root's `included`: `agent-harness`, `code-style`, …), or what the root
has installed (`vcs`) with neither `--reapply` nor `--refresh`
re-rendering it — runs nothing at the root in any keel, so pinning one
would not help: its refusal, told who has it by the add front door
(`harnessGenerationRefusal`'s `already`: the services, the root, or
both), ends _— and its services have what 'keel add agent-harness'
names already, so there is nothing to run here_ (_this root has_, for
`keel add vcs`; _this root and its services have_, for `keel add
code-style vcs`). What the root cannot carry never
reaches the gate: `productRootReading` refuses it first, as in any
generation (`persistence`, `toolchain` and `iac` as
`keel.wrong-scope`, pointing into the services, which the root's
marker does not stop; `ci` and `distribution` as
`keel.uncoverable-vertical`), and `keel add module` now does the same,
refused as `keel.invalid-module` before the gate at a product root, as
the status's `moduleRefusal` there already said. `keel add --list`'s
line and `project.js`' `harnessNotice` read the same fields (the
status's `harnessGeneration`, and its `services`, which tell a product
root) and say it once, with which refusal each add there meets — _what
is not for this root as it says below, what it or its services have
already as nothing to run, and anything else naming the keel that
scaffolded it, to pin_, the page's of its cards (_one in its services
as theirs_: it offers no add of what the root has, only its re-render);
the status contract's TSDoc, `docs/cli.md` and `docs/ui.md` say it
where they described the gap.

`notInitialisedSentence` moved from `refusals.ts` into the contract
(`nearby.ts`, with `NearbyProjects` and `NOT_INITIALISED_CODE`), since
the toolchain context refuses with it and may not import the engine;
the walk stays `scope.ts`' `nearbyProjects`. `keel add module` reads it
once where it finds no manifest and words it through `add-module.ts`'
`notInitialised`, which `moduleRefusal` — the status's reading of a
directory holding none, with the same walk (`ProjectStatusDeps.home`
added) — calls too, so the status's `moduleRefusal` and the click stay
one sentence: _run 'keel add module' there_, with no name, so the two
are byte-identical. (The page shows that control only in a project, so
there it is a status field, not a control greyed out on screen.) `keel
link` reads it too, and the toolchain handlers are handed it as
`ToolchainDeps.nearby`, a function the composition root and the test
factory wire from `nearbyProjects` — required, so `tsc` holds the
composition root to wiring it. Inside a monorepo product root, in a
directory no service is, the project above is the root, which takes
no bounded context and declares no toolchain: the walk reports those
of its services that hold a project (`NearbyProjects.services` — not a
listed one holding none, such as the one a command is run in), and
`keel add module` and `keel
toolchain`, whose sentence says a product root refuses them too
(`notInitialisedSentence`'s `serviceScoped`), name those instead —
_this directory is inside the keel product at ../, whose services are
../backend/ and ../frontend/; run 'keel toolchain install' in one of
them_ — while `keel add` and `keel link`, which run at a root, still
name the root. A project named can refuse `keel add module` too — the
flat layout, which scaffolds default to, takes no bounded context — so
the walk hands back the manifest of each project it names (`scope.ts`'
`NearbyReading.manifests`: the one above, read on the way up; its
services; those below, read to find them), and `notInitialised` asks
`moduleRefusal` of each (`notInitialisedSentence`'s `refusedAt`): where
every one refuses it, for one reason, the sentence gives the reason
instead of pointing — _this directory is inside the keel project at
../, which refuses 'keel add module' too, since a bounded context needs
the modulith layout: …_, _…whose services are ../backend/ and
../frontend/, each refusing 'keel add module' too, since …_ — and where
one takes a context, or cannot be read, or they refuse it for different
reasons, it points as before. And at the root itself, which declares no
toolchain, `keel toolchain install|check` said to run `keel add
toolchain` first, which is refused there (`keel.wrong-scope`):
`engine.ts`' no-block refusal reads a manifest listing services as a
product root and names them — _this is a product root, which declares
no toolchain: a toolchain belongs to a service — run 'keel toolchain
install' in backend/ or frontend/_ — under the same code.

Grid: no verdict moved — the codes are unchanged, the greenfield,
brownfield and composite goldens regenerate byte-identical and the
known files stay as they were. The sentences of 36 composite cells
moved, which the goldens do not keep: each of the six products' front
end refusing persistence (_backend/ can take it_) and observability
(_backend/ has it already_), in `keel new` under both layouts and in
`keel add` in the monorepo front end, whose cards I4 holds to them.
I5's single-service sentences are unmoved: no single project carries
`elsewhere`, and `comesWith` changes no sentence. The planner-readiness
golden records `comesWith` now (_— comes with …_), and moved on exactly
the observability cells of the nine CLI-only presets, whose nearest
HTTP sibling comes with it. The docs matrix regenerates byte-identical.

Held by `hint.test.ts` (both hints with and without each field, a first
nearest stack that carries it only as an extra, three services, a pair
named for two of them, and on the command line `quarkus-cli --with
observability` and `fullstack --with frontend:persistence` under both
layouts), `refusals.test.ts` (each sentence with and without
`elsewhere`, the sentence alike with `comesWith`, no field where no
sibling could or the gap is a placement or a re-render), `plan-refusal.test.ts`
(`admit` and `foresee` alike over siblings that can, have, cannot or
are unknown), `planner.test.ts`, `new-project.test.ts` (the refusal of
`quarkus-cli --with observability` records `comesWith`),
`composite-scope.test.ts` (the greenfield refusal under both layouts,
the page's menu entry and dropped pick for it; the monorepo frontend's
cards and adds, before and after the backend takes persistence; the
polyrepo frontend's unchanged; `keel add module`, `keel link` and both
`keel toolchain` commands in a service's subdirectory, at a polyrepo
product's directory and in a monorepo product root's subdirectory that
is no service — `keel add module` saying why each flat project there
refuses it too, and pointing at a modulith above — both `keel
toolchain` commands at the root itself, the status's `moduleRefusal`
equal to the click's, and `keel add module` and `keel link` where no
project is near), `scope.test.ts` (`siblings`, `siblingsOf`, and
`nearbyProjects` from two levels under a product root, leaving out a
listed service that holds no project, at a polyrepo product's
directory, under a single project and at a manifest it cannot read),
`nearby.test.ts` (the sentence over every shape the walk hands it,
with every project it names refusing, one, or for different reasons),
`new-project.test.ts`' home directory (`keel add module` and the
status's `moduleRefusal` walking up no further than it),
`harness-generation.test.ts` (at a stale root, under both markers,
`agent-harness` and `code-style` saying the services have them, `vcs`
that the root has it and `code-style vcs` that both do, `dev-env`
naming the pin — alone, beside `code-style`, and under `code-style
--refresh vcs`, where the root's own is re-rendered — as `vcs
--reapply`, `keel docs sync` and `keel docs check` do, `persistence`
refused for its scope and `keel add module` as at any root, equal to
the status's; and the function on a product's manifest), the CLI's
`add.test.ts` (`--list` at a stale root, beside the refusals it
names), `project.test.ts` (the page's notice there, and a card not for
the root refused as the click is), the toolchain's `install.test.ts`
(told where the project is, and not; a product root's manifest naming
one, two or three services), and `ui-compose` in a browser (the front end's refused
persistence naming backend/).

Beyond the text above: `routeExtra` and `productRootReading` now read
each service's readiness through `readinessAmong`, the function the
sibling field is filled by, where each spelled the same map. A pair
named for two services, `--with frontend:persistence,backend:persistence`,
was hinted as _drop 'persistence' from --with_ — bare, since two
services named it — and is now spelled for the one refused. Where no
project is near, the refusals of `keel add module`, `keel link` and
`keel toolchain` end _first to create one_, as `keel add`'s did; and
`keel docs sync|check` refuse under `NOT_INITIALISED_CODE` rather than
their own spelling of it. Not done: `keel add` in a monorepo service
names no `cd` into the sibling that can take it —
`ElsewhereService.path` is relative to the product root, and the hint
cannot tell where the command ran relative to it — so the sentence
carries it there; `keel docs sync|check` where no project is still say
only that none is, since they never named `keel new`; and `keel add
module` at a product root itself, which predates this step, still
sends the user into a service (_run 'keel add module <name>' inside
the service directory instead_) without asking whether any takes a
bounded context — the front door reads the root's manifest alone
there, and the status's `moduleRefusal` is held to it.

#### Q3.4 — The weekly composition sweep: every extras set, every dial, every choice (M) ✅

The lane _The measure_ planned at the audit and never built: a
scheduled workflow beside `mutation.yml`, never a PR gate, running two
sweeps on every dial setting of every preset through `keel.preview`
and a dry-run install — the full powerset of offered extras, comparing
change lists across permutations (I8 generalised, to catch an
undeclared `Vertical.reads`), and every choice of every question (to
catch a choice offered where it throws). Report-only, like
`version-currency.yml`, and documented beside it.

Landed as three opt-in suites under `tests/sweep/` — `extras`, `arrival`
and `choices`, three files so vitest runs them in three workers — over
`tests/support/composition-sweep.ts`, and
`.github/workflows/composition-sweep.yml`: Monday 04:41 UTC and on
dispatch (a `stacks` input), `contents: read`, the action SHAs `ci.yml`
pins, Node alone, 180 minutes. Each suite self-skips unless
`KEEL_RUN_SWEEP=1` and reads nothing when collected, so `verify` gains
three skipped files — each still imports the engine, a couple of
seconds of collection — and the twelve tests of `machinery.test.ts`
(below), about a second; `KEEL_SWEEP_STACKS` narrows a run, and a
name the catalog lacks, or a list naming none, fails it. Each preset is
a test that collects every finding, grouped by what does not hold and
which paths differ, each group listing the command lines that
reproduce it (the page's `command.js`; an `arrival` pair's one run
`; against` its two) and the sizes of the two change lists or trees.
No golden, no known file: a red run is the report. Nothing is kept per
dispatch — the grid's support gained `Grid.stages`, its `staged`
read-back recording nothing — and it exports `THROWN` and
`identitySamples`; the page's own `settle` and `toggleExtra` tick each
set, so a set is what the page can build.

The settings are walked, never listed. The breadth-first walk
`application/web/dials.test.ts` made inline is
`tests/support/dial-walk.ts`' `walkDials`, which both call — the page's
test over `POST /api/dials`, the lane over the mediator, seeded with
each repository layout a product's preview asks (`layoutsOf`, moved out
of the composite suite into the grid's support) and crossed with the
agent harness left out wherever `keel.dials` lets it be. Sharing it
showed a gap in the walk: a move of one service's build system posted
that service's pair alone, which `keel.dials` fills with the other's
default, so it reached three of a product's four build-system
combinations (`backend=maven,frontend=pnpm` never); it now composes the
field with the page's own `withServiceBuild`, and the page's walk posts
367 bodies, four more: one per product with a build-system dial in each
service. 340 dial settings in all: twelve on a JVM or TypeScript single
preset, six on Go and Rust, eight on a product with a build-system dial
in each service, four on one with one.

- `extras` ticks every subset of each setting's menu (a product's per
  service), and each distinct set the ticks come to, once, is held to
  `keel.dials` keeping it as it is, a preview that is Ok and a dry-run
  install staging the same paths, kinds and bytes (I1, I2, I9), and —
  named backwards, in every order for up to three, in every order its
  boxes can be ticked in for up to three boxes (the subset the text
  above calls S: what a user ticks, before what those bring), and on a
  product whose every extra of the set it also takes without a
  service, named so — to staging the same (I8); spelled without
  services, it goes to a dry-run install as well (I2, I9). A single
  preset offers six extras at most, 32 or 40 sets once ticked; a
  polyrepo product twelve, six a service, 1,024 sets on each of its
  settings — within the bound (`POWERSET_BOUND`, twelve), past which a
  setting would be swept over sets of up to three, the whole menu less
  each one and the whole menu, with a warning.
- `arrival` is the part the text above did not have. `admit` sorts
  the ids it is handed, so a naming permutation of one set is the same
  plan by construction, and no permutation can show an undeclared
  read. What varies the order verticals install in is their arrival:
  for every ordered pair `(x, y)` of offered extras, each with what it
  needs, the suite installs for real `keel new --with x,y` and `keel new
--with x` then `keel add y` — in `y`'s service directory on a
  product, with the `--refresh` the add's preview proposes — and holds
  the two trees to each other, file for file, each manifest with its
  timestamps, key order and arrival-ordered lists normalised. Each `y`
  arrives on its own first, `keel new` then `keel add y` against `keel
new --with y`, and a pair that differs only as `y` alone does is
  listed under one heading rather than as a fact about `x`. A pair
  whose `y` is among what `x` needs is left out. A difference is read
  from which way the trees differ: `record` (only a manifest's record),
  `order` (lines in another order), files only the two runs hold where
  the add's refresh moves a vertical onto another adapter (a refresh
  that does not take back what the first adapter wrote), and anything
  else, refresh or none — a file only one run holds, or other bytes —
  as what an undeclared read looks like, since a refresh re-renders
  only the verticals that declare theirs.
- `choices` reads the questions off previews with no answers — of the
  whole menu ticked, of no extra, and of each offered extra ticked
  alone with what it needs — and answers each question an adapter asks
  with each choice it offers (a `multi-select`: none, each, all; a
  free-form question: the grid's identity sample, or the lane's
  `FREE_FORM_SAMPLES` — `remote` and `defaultBranch` — for the two
  that are not), one answer a body, on the first of those targets that
  offers it, to a preview and a dry-run install: no throw, no refusal,
  the answer read, the same changes.

Measured in full on this container, as landed (four vCPUs,
2026-09-25): 57 minutes of wall time for `tests/sweep`, with the three
files in three workers. `extras` took 57 minutes: 96,160 subsets
ticked to 28,288 sets over 340 dial settings, giving 28,288
`keel.dials` reads, 79,740 previews counting the reorderings and the
120 sets spelled without services, and 28,408 dry-run installs.
`arrival` took 21 minutes, measured again on its own once review gave
each extra an arrival of its own: 8,928 pairs and 1,844 extras alone,
6,288 scaffolds, 10,652 add previews and 10,496 adds, all on disk.
`choices` took 8 minutes: 6,346 answers to 3,974 questions, giving
8,870 previews and 6,346 dry-run installs. That is some 179,000
dispatches. Most of `extras` is the
products: the four with a build-system dial in each service took about
47 minutes each, side by side, at 4,160 sets apiece. So the workflow's
limit is three hours, and a preset's own 90 minutes. Swept alone, a
preset takes from seconds to eleven minutes (`fullstack`, nearly all of
it `extras`); `go-http` and `ts-cli` together take about half a minute.

What the run found: 46 of the lane's 105 tests red, and every preset
red in `arrival`. It comes to five things. None is fixed here, since
none is a one-line declaration that leaves the greenfield bytes alone;
each is left for a step of its own:

1. **A throw on a dial setting the grid never reads.** `persistence`
   throws on the modulith layout with the peer context, on
   `micronaut-rest`, `micronaut-cli-rest`, their Kotlin twins,
   `ts-http` and `ts-cli-http`, with either build system and with the
   harness on or off. The throw comes from its adapter's patch of the
   composition root (`persistence/micronaut-persistence`: _the
   composition root has drifted from the walking-skeleton shape — add
   "com.example.greeting.domain.core.greetinglog" to the @Import
   packages on MediatorFactory…_, with `…-kotlin` and
   `persistence/ts-persistence` alike). It happens in a preview, a
   dry-run install, `keel new` and `keel add persistence`, so it breaks
   I1 and I2. The lane met it in 64 sets per preset in `extras`, in
   `choices` in the whole menu and in persistence alone on four
   settings a preset (the settings' other questions it reads off the
   other extras' previews), and in 24 scaffolds and 24 add previews in
   `arrival`. The peer context's second context changes the root the
   patch anchors on; Quarkus, Spring, Go and Rust take persistence
   there. The fix is for the patch to read that root, not a
   declaration: declaring persistence unavailable there would take away
   what the other families give. Fixed by Q3.5, which does that.
2. **A refresh that changes adapters leaves the first one's files.**
   On `quarkus-cli-rest` and its Kotlin twin under Gradle, distribution
   alone resolves to the native binary (D3). `keel add
containerization` then proposes `--refresh distribution`, which
   re-renders it as the image's release pipeline. The native build's
   `.github/workflows/native-build.yml` and `release.yml` stay behind,
   and so do its answer and its tags in the manifest; one run naming
   both never writes any of them. `keel add distribution --reapply`
   after the image leaves the same two behind. The refresh D3 counted
   on does cover the image arriving later, but it cannot take back what
   the first adapter wrote: that is L's missing merge base. Until then,
   `docs/verticals/distribution.md` and `docs/cli.md` → `--refresh` say
   so, and that the native `release.yml` still runs on each `v*` tag.
3. **An add refused where one run is Ok.** On the same presets, `keel
add iac` after `keel new --with distribution` is refused as
   `keel.needs-refresh` (_Infrastructure as code needs Container image,
   then Distribution re-rendered_), while `keel add containerization`
   in the same place proposes that refresh instead. The lane takes up
   proposals, not a refusal's remedy, so the pair goes no further. This
   is by design (D12); it is recorded so a later step can decide
   whether it should be a proposal.
4. **README sections in arrival order.** Where `toolchain` arrives
   before `persistence` or `dev-env`, its README section comes before
   theirs. One run installs by id and puts it after. This holds on every
   HTTP preset, every CLI preset, web-components and each product's
   services: the same lines in another order, from an adapter whose
   output follows the order it runs in. The grid's I8 already holds one
   run to itself for this shared file. The rank-anchored upserts for
   shared files that **R** names would settle it across runs. Fixed by
   R.1a, which ranks those sections (`rank.ts`).
5. **The manifest records keel's own later write as drift.** Whenever
   `persistence` arrives in a later run — `keel new` then `keel add
persistence` included, no other extra needed — it writes its section
   into a directory document the agent harness tracks
   (`internal/infra/AGENTS.md` on Go). Two runs leave the harness's
   entry for that document with the first run's `sha256Shipped` and the
   new `sha256Current`, so keel's own write reads as the user's. One run
   records the patched bytes as shipped. This holds on every preset that
   offers persistence, with the harness on. Fixed by R.2a, whose harness
   fix records every entry of a file a run writes as the run leaves it
   (`install.ts` `foldHarnessEntries`).

No undeclared read: no pair's trees differed in a file one run holds
and two do not, or in a file's bytes, and the one pair whose two runs
hold files one run does not is (2), where the refresh moves
distribution onto another adapter.
`extras` found no naming order, bare spelling or dry-run install that
staged otherwise, and `keel.dials` kept every set. `choices` found no
offered choice refused or left unread, only the throw in (1) in the
previews it reads its questions off — the 940 answers it gained in
review, to the questions the whole menu hid, all Ok.

Beyond the text above: `extras` also holds each set to `keel.dials`
keeping it — the powerset form of the page walk's check that a gesture
leaves `adjustments` empty. That read, like the walk's own, goes through
`Grid.twin`: `keel.dials` refusing or throwing on a set, or on a setting
the walk reached, is a finding, and the preset goes on. The two
spellings of a product's extras mixed in one `--with` are refused
(`keel.invalid-extra-verticals`), so the bare spelling is swept only
where every extra of a set has one: to a preview and a dry-run install
(I2, I9) and against the set as ticked (I8), but not to `keel.dials`,
which routes a bare id onto its service (the page never posts one).
`choices` reads its questions off more than the whole menu the text
above names, since review found the whole menu hid some: one extra
answers a question another asks (Continuous integration decides
Distribution's CI provider, on every container family), or moves it onto
another adapter (a container image takes a composed CLI's distribution
off the native binary, and its `targets`), and on the settings where it
throws — (1) above — it asked nothing. The page's `serviceBuild` and
`withServiceBuild` moved, unchanged, from `keel-new-form.js` into
`target.js`, so the walk moves a service's build system with the page's
own code, as it ticks with the page's own `toggleExtra`; `dial-walk.ts`
also holds the page's settled run and the boxes it draws, which the page
walk and the lane had each copied. `tests/sweep/machinery.test.ts` is
not opted in: it holds the lane's helpers in `verify` — the settings
walked (each again with the harness left out, a product's every layout
and build-system combination, and a setting `keel.dials` refuses
recorded once while the walk goes on past it), the powerset and its
cap (each subset once), a tick bringing what it needs, a product's
ticks and keys per service, its two spellings, the answers a question
gets, what a preview and a dry-run install stage, read back with a
product's services, the comparison of two change lists (a path staged
twice included) and of two trees (which way they differ included), a
manifest read by what it records, and the report — so a helper that
rots shows on a PR rather than as a Monday run that swept nothing. `tests/ci-workflow.test.ts`
holds the workflow to a schedule and a dispatch, never a push or a pull
request, and to running the whole of `tests/sweep` opted in, on every
preset unless a dispatch names some — reading the step's environment as
Actions does, the workflow's and the job's under its own — with no
`if:` that could skip it and no `continue-on-error` that would pass a
red run. The grid
itself moved no verdict: the greenfield, brownfield, composite and
planner-readiness goldens and the docs matrix regenerate byte-identical,
and the known files stay as they were.

#### Q3.5 — Persistence survives the peer context (S) ✅

Q3.4's first finding, and only it. `persistence` throws a plain `Error`
— a crash at the terminal, a `keel.internal` in `keel ui` — on the
modulith with the peer context, on `micronaut-rest`,
`micronaut-cli-rest`, their Kotlin twins, `ts-http` and `ts-cli-http`,
with either build system and the harness on or off, wherever the menu
offers it: its patch of the composition root matches the line the
walking skeleton rendered, and the peer context has rewritten that line.
Make each patch read the root as it is — after the peer context, after
a `keel add module`, in one run or two — and add to the list it finds,
leaving the bytes alone wherever persistence already worked; refuse a
root a user rewrote as `keel.path-conflict` with an `anchor`, as
`jvm-format` does, rather than throw.

Landed as a read of each list. Micronaut's two — Java's
`@Import(packages = …)` and Kotlin's hand-wired `mediator(…)` — moved
out of `micronaut-context.ts` into `micronaut-root.ts`, which `keel add
module` and persistence now both read them through:
`widenImportPackages` (the added context's `rewriteList` over its
`IMPORT_REGION`, re-emitting the fenced list one entry a line) and
`widenKotlinMediator`, which now takes several parameters and elements
and adds each only where it is missing. `jvm-persistence.ts`'s
`patchMicronautImportPackages` still turns the skeleton's single string
into the one-line pair it always wrote, and widens any other list;
`patchKotlinCompositionRoot` still replaces the skeleton's one-liner,
and otherwise widens the mediator — the three ports after the parameters
there, the two handlers after the handlers there — its imports going
under `GreetHandler`'s either way. `ts-persistence.ts`'s `patchMainTs`
reads `createRegistryMediator([…])` bracket by bracket and re-emits it
with the pool and the greeting log declared above and the greeting-log
handlers after whatever it registered — over the skeleton's one-handler
line, byte for byte what it wrote before, so it has one path. On the
peer context's modulith the root now registers both:
`…greeting.domain.core.greet`, `…guestbook.domain.core.signing` and
`…greeting.domain.core.greetinglog` in `@Import`, the note inside the
fence once where the peer context's own rewrite had repeated it;
`welcome` beside the three ports, and `SignHandler(welcome)` before the
two greeting-log handlers, in Kotlin; `createGuestbookHandler()` before
them in `main.ts`. A root without its list is a `PathConflictError`, its
`path` the file and its `anchor` what the file lacks —
`'@Import(packages = …)' list holding only package names`, `'fun
mediator(…): Mediator = RegistryMediator(listOf(…))' holding only
parameters and handlers`, `'createRegistryMediator([…])' call holding
only handlers`, or the import each patch puts its own imports under —
and the other plain drift throws in the three persistence files took
the same one-line change: `server.ts`'s two anchors, the Micronaut
`GreetControllerTest` in both languages, and the root pom's `<modules>
element`. Nothing is written before one.

The grid moved nothing, since it reads default dials only: the
greenfield, brownfield, composite and planner-readiness goldens and the
docs matrix regenerate byte-identical, and the known files stay as they
were. The bytes were held past the verdicts, too: HEAD's build and this
one rendered 167 scenarios to 15,806 byte-identical files, before review
and again after each round of the fixes below it — the four Micronaut
and two TypeScript presets with `quarkus-rest` and `spring-rest-kotlin` beside
them, on each build system, layout and harness setting, persistence in
one run and in two; the peer context alone, and two `keel add module`s
with and without it, on eleven modulith presets; and the three products
carrying persistence under both repository layouts. Held by
`handlers/persistence-peer-context.test.ts` (each of the six presets,
the lines of its root that matter pinned, and one run against two byte
for byte; persistence before and after a `keel add module` on Micronaut
Java and Kotlin and `ts-http`, the TypeScript array read so that a hole
in it shows, and the array the project's formatter wraps after the
peer context and a `keel add module`, trailing comma and all; a
rewritten root, and a Kotlin context named `clock`, refused to
persistence and to `keel add module`, untouched and nothing written; a
root edited past what keel reads as a list refused alike, to `keel add
module` on Micronaut, where on `ts-http` it splices in with the comment
kept; a rewritten `GreetControllerTest` in each
language, refused naming that file; and over the skeleton's own
root, `ts-http`'s mediator and `micronaut-rest-kotlin`'s under both
layouts, byte for byte what persistence always wrote),
`adapters/micronaut-root.test.ts` (each helper over the bootstrap's
shape, the peer context's and its own re-emit, adding only what is
missing, naming a name taken, a handler taking a URL or a comma in a
string widened, and null on a comment in a list, a block body or
anything beside the list in `RegistryMediator(…)`),
`adapters/ts-context.test.ts` (an entry after a trailing comma on a line
of its own, and after the last entry where a comment follows it or ends
the array), `verticals/persistence.test.ts` (a grown `@Import` list
widened; each refusal's path, adapter and anchor, the `main.ts` import
each layout's own, and a block comment in the array refused),
`util.test.ts` (`codeOnly` over each literal and comment),
`handlers/composite-scope.test.ts` (a plugin's refusal in a product's
service keeping its anchor, and its name taken, under the service's
path), and `refusals.test.ts` and `cli/hint.test.ts` (the sentence of a
name taken, and no advice to move the file aside).

The lane, filtered, before and after. Before, `micronaut-rest`,
`micronaut-rest-kotlin` and `ts-http` each had 64 findings in `extras`
and 8 in `choices`, every one this throw. After, the six presets in one
run of all three suites, 6 minutes on this container: `extras` 0
findings over 2,304 sets on 72 dial settings (8,928 previews, 2,304
dry-run installs); `choices` 0 over 1,608 answers to 984 questions,
which now include the questions persistence asks on the peer settings
(276 answers on `micronaut-rest`, where there were 264); and `arrival`
no throw over 1,944 pairs, 432 arrivals alone, 1,368 scaffolds and
2,376 adds, where Q3.4 met it in 24 scaffolds and 24 add previews a
preset. `arrival` stays red, 42 findings a preset in four kinds, every
one Q3.4's (4) or (5): `README.md`'s lines in arrival order after
`toolchain`, and the manifest recording persistence's later write.

The real toolchain: no e2e suite builds persistence on Micronaut or the
TypeScript stacks, with the peer context or without, and none was added
(J's one-e2e-per-cell rule). Built by hand instead, from a build of this
tree: `ts-http` and `ts-cli-http` with the peer context and persistence
typecheck, pass dependency-cruiser and run their tests (the
Testcontainers ones skipping without Docker), `main.ts` prettier-clean;
`keel add module ordering` on top typechecks too, where the splice it
replaced gave TS2345. `micronaut-rest` compiles its main sources and
packs its runnable jar, the annotation processor writing bean
definitions for `GreetHandler`, `SignHandler`, `RecordGreetingHandler`
and `ListGreetingsHandler` out of the three packages, and
`micronaut-rest-kotlin`, whose mediator constructs its handlers by hand,
compiles its main sources and packs its jar too. That first run could
not resolve the assembly's test classpath — Maven Central answered 429 —
so the application module's test sources went uncompiled; a second,
after review, compiled them on both (`:application:api:compileTestJava`
and `compileTestKotlin`), the `GreetControllerTest` persistence patched
to extend `PostgresTestFixture` among them. Neither ran its tests, which
boot the datasource and need Docker, which this container lacks. The
build found something older, too: the persistence template's
`MicronautTxUnitOfWorkTest`, in both languages, no longer compiles
against the Micronaut Data the platform resolves
(`TransactionOperations` gained `managesTransaction` and narrowed
`findTransactionStatus`), on the default dials as well, where this step
changed no byte. No suite compiles it, so CI never saw it
(`tests/e2e/AGENTS.md` now says so); it is left for a step of its own.

Beyond the text above: the other order. `keel add module` after
persistence on the TypeScript stacks spliced `, create<Name>ContextHandler()`
in before the `])` persistence's array ends on — after its trailing
comma, a hole in the array, and TS2345 — as it did, before this step
too, after a comment ending an array a user wrote. `ts-context.ts` now
places the entry by the array's last token, comments and literals aside:
on a line of its own after a trailing comma, and otherwise straight
after the last entry, ahead of any comment there — the one-line splice
unchanged, and a comment kept where it is. The added contexts' own throws for a root with no list —
Micronaut's two, and `ts-context`'s for a `main.ts` with no mediator
call — became the same `PathConflictError`, in the files the list
reading passes through. Left as they were: the build-file throws in
`jvm-context.ts` and `ts-context`'s `package.json` one, the Spring and
web-components contexts' throws for a root with no list
(`spring-context.ts`'s `@ComponentScan`, `wc-context.ts`'s context-port
map), the Spring, Go and Rust persistence adapters' drift throws, and
the peer context's own patches, whose anchors match the skeleton's
rendering and whose fragility R's research names.

And a name clash the list reading reached. `keel add module clock` on
Micronaut Kotlin injects `clock: ClockHandler`, where persistence
injects `clock: Clock`, and `widenKotlinMediator` counted a parameter as
there only by its whole text — so either order wrote two parameters of
one name, which does not compile: persistence after the context newly,
since the drift throw had stopped it there before, and the context after
persistence, like `welcome` after the peer context, as it already had.
It now reads a parameter by name and type, and returns `{ taken }` for a
name another type holds, which both callers refuse as a
`PathConflictError` carrying it. That is a fact of its own, not a block
the file lacks, so the contract's `PathConflictRefusal` gained an
optional `taken`, and `pathSentence` a case for it — _'…/MediatorFactory.kt'
already has a 'clock' where keel adds one of that name — keel renames
neither, and the two would not build; rename the one there, then
re-run_ — which `refusalHint` does not advise moving aside before `keel
new`. It is refused as the file's, when the context's adapter patches
it, rather than at `keel add module`'s front door: which names a root's
mediator takes is the file's to say, and a user may have renamed one.
That leaves one card that reads otherwise than its add on a project
only keel has written: after `keel add module clock` on Micronaut
Kotlin, persistence's card reads the manifest and shows it ready, where
its preview and its add are refused. Before this step the add threw
there. The grid names no context and does not reach it; refusing `clock`
at that front door needs the names a stack's root takes for its own
declared, which nothing does yet, and is left for a step of its own
(`add-module.ts` says so). No scenario the byte comparison rendered
names a context so, and none of its files moved. And `keel new`'s
re-wrap of a refusal from a product's service, which moves its path
under the service's directory, carried the `anchor` and dropped the new
`taken`; it carries both now, so a plugin's adapter refusing a
service's file over a name is refused from the product root in the
same words.

And what the lists hold. `splitEntries`, `splitHandlers` and
`rewriteList` split on commas outside brackets, reading a list, not
Java, Kotlin or TypeScript: a comment among the entries was split on
its own commas and re-emitted as code, a handler taking a string with a
comma in it (`Echo("a, b")`) was split in two, and a Kotlin mediator
given a block body lost its `return` and gained a stray brace — `keel add
module` had done so to Micronaut roots already, and persistence, whose
exact-line anchor had thrown at each of them, came to as well,
reporting Ok over a root that no longer compiled. Each reader now takes
only what it can write back as it was, and is null on the rest, which
its callers refuse as the file in the way: `widenImportPackages` a list
with a comment in its braces, `widenKotlinMediator` a mediator that is
not `fun mediator(…): Mediator = RegistryMediator(listOf(…))` with
nothing beside the list, or with a comment among its parameters or
handlers, and `ts-persistence`'s reader an array with a comment in it —
which is what each anchor above now says it lacks. What is inside a
string or a character literal is the literal's: `widenKotlinMediator`,
`ts-persistence`'s reader and `ts-context`'s splice find their brackets,
commas and comments in `util.ts`'s `codeOnly`, the source with its
comments and literals blanked, and `widenImportPackages` its comments,
so a handler taking `"https://…"` is widened rather than taken for a
comment, as `keel add module` had widened it before. No keel
rendering holds any of them, and no byte moved.

### Decisions on record

Each taken as the audit recommended; the step that carries it is named.

- **D1 — Prerequisites are included automatically**, everywhere — the
  menus, `--with`, `keel add` — and said first in the plan and report;
  only a tie between equally small sets is refused (Q1.3, Q1.4).
- **D2 — Monorepo membership reaches the checks as declarations:**
  `Vertical.placement` and `Adapter.providesInServices`, each read by
  one structural check — no derived tag, no hand list (Q1.10).
- **D3 — Distribution alone on a composed CLI + HTTP JVM stack**
  resolves to the native binary only, documented (Q1.3); the refresh
  Q1.4 proposes covers Container image arriving later.
- **D4 — "Already there" is Ok**, exit 0, with a note and a CHANGELOG
  entry; no `--strict` (Q1.6).
- **D5 — Stray answer keys are refused** by every install front door,
  and the preview reports them so the page prunes them (Q1.0, Q2.1).
- **D6 — Unavailable cards stay visible**, collapsed, with the
  sentence, and the same group is shown in greenfield Options, so the
  halves follow one policy (Q1.5, Q1.9).
- **D7 — A bare `--with` on a product** goes to the one service whose
  readiness admits it, and is refused naming the services when several
  do (Q2.3).
- **D8 — The docs matrix is generated** from the grid's verdicts, with
  a regenerate-is-a-no-op guard (Q2.5).
- **D9 — Plugin verticals take part in the closure;** a tie is
  refused naming both, never picked by registry order (Q1.2, Q1.4).
- **D10 — Q2.7 (one page) was done inside Q;** **R**, then **S**, are
  the successors.
- **D11 — Identity answers change nothing persisted:** a
  `Question.shared` marker (Q2.1, Q2.2).
- **D12 — A refresh is proposed, never automatic** — a refresh
  overwrites template-owned files (Q1.4).
- **D13 — `keel new` in a non-empty directory** adopts `README.md` and
  `.gitignore` everywhere (Q2.6) and refuses anything else by name
  (Q0.3).

### Successors (named here, not part of Q)

- **R — Entrypoints can grow.** `keel add entrypoint <cli|http>`,
  proven byte-identical to the greenfield `*-cli-rest` cell (which
  keeps J's one-e2e-per-cell rule by proof), after rank-anchored
  upserts for shared files. Turns "needs an HTTP server entrypoint"
  from a sentence into an action. An experiment grew seven families
  this way with a user-edited `Main` intact. Landed; its own section,
  _R — Entrypoints can grow_, below, records it.
- **S — One converge operation (additive).** A desired state planned
  against disk; `new` and `add` become aliases; removal refused,
  citing L's missing merge base. Sliced in its own section,
  _S — One converge operation_, below; what "aliases" means is its
  DS1.
- **T — Facets over presets.** Presets generated from a platform ×
  entrypoint table with ids kept as aliases (all 34 regenerate
  exactly); products as per-service selections. Only with a data
  support tier for cells no e2e suite proves.
- **U — A release story for monorepo products.** Decide the image
  owner, one root Tree across scopes, a product-level pipeline,
  `keel add service`.

### Deliberately kept

- "Compatibility is a declaration" and "do not invent a tag": Q
  extends both — readiness is one function read by every surface, and
  the only predicate change adds a tag containerization already
  promotes.
- Presets as the entry vocabulary, and one e2e suite per stack cell:
  Q offers no new cell.
- The manifest records tags, not a preset id; answers stay frozen on
  `--reapply`; no removal or reconfiguration without L's merge base.
- Distribution needs a container image (E) — only its mechanism, a
  throw, goes. Naming a vertical twice in `--with` stays refused.
- `keel new` and `keel add` stay two commands; after Q1.4 and Q1.9
  both take a set planned by the same planner, and Q2.7 gives them one
  page.

---

## R — Entrypoints can grow ✅

**Proposed 2026-09-25 from five research passes over `adab93a`**
(Q's merge), **and landed**: R.1a to R.3d below, one commit per step,
every decision taken as recommended (_Decisions on record_). None of
the passes edited the repository. Q's Phase 3 (Q3.1 to Q3.5) landed
after the research. It moves nothing R stands on, and two of the
weekly sweep's findings fold into R.1a and R.2a (_The measure_,
below). Q's _Successors_ named this epic, and **S** follows it. R adds
a command, not a cell: every tree it writes is a tree `keel new`
already writes, and I10 below is the proof.

**Goal.** A project's entrypoints are no longer fixed at `keel new`.
`keel add entrypoint http` on a CLI project, or `keel add entrypoint
cli` on an HTTP one, must leave exactly the tree that the combined
preset leaves on the same dials. So `keel new --stack=quarkus-cli`
followed by `keel add entrypoint http` equals `keel new
--stack=quarkus-cli-rest`, byte for byte. The grown project then _is_
that cell, and J's one-e2e-per-cell rule holds by proof, not by a new
suite.

A CLI project today gets this refusal: _Observability needs an
entrypoint this project does not have: HTTP server — a REST
endpoint_, with a `hint:` that ends _a project's entrypoints are fixed
at 'keel new'_. R keeps the sentence and adds the action: `keel add
entrypoint http`, which brings Observability with it.

### How the research was run

**Setup.** Every run went through a `dist/` built from `adab93a`,
wired the way `tests/support/factory.ts` wires the grid: real templates
and filesystem Trees, `FakeProcessRunner`, a pinned `FakeClock`, and
deferred actions skipped. Every byte claim below is therefore about
staged trees before deferred actions, which is the grid's own
convention (I8).

**What was measured.**

- **Preset trios.** 102 scaffolds: 9 families, each with three presets
  (X-cli, X-rest or X-http, and the combined preset), on 34 dial
  settings. Each smaller preset was diffed against its combined preset
  in both directions, 68 pairs in all.
- **Shared-file census.** Every writer of every file that two adapters
  share, across 106 scaffolds.
- **Greenfield order census.** 668 cells.
- **Rank prototype.** Rank-anchored insertion dropped into a copy of
  `dist/`. It was checked against 730 greenfield scaffolds (55,043
  files), the seeded-README axis, brownfield adds on five stacks, and a
  64-case grow matrix: every CLI↔HTTP pair on every build system and
  layout, in both directions.
- **Harness.** The agent harness re-rendered in the reapply posture on
  13 cells.
- **Contexts.** Every context adapter rendered under both tag sets.
- **Hand-grown projects.** One project per family, including
  `keel add module` histories.

Every figure is measured unless it is marked _(inference)_.

### The finding that shaped it

**Growth adds files and never removes one.** In all 68 pairs:

- no file exists only in the smaller preset;
- no adapter the smaller preset resolves drops out of the combined
  preset;
- the adapters that newly match are the other entrypoint's bootstrap
  (`walking-skeleton/<fw>-rest-bootstrap`, `go-http-bootstrap`,
  `rust-http-bootstrap`, `ts-http-bootstrap`, or their `-cli-`
  counterparts) and, when HTTP is added, the preset's observability;
- the existing entrypoint's files are never rewritten. The experiment Q
  named grew seven families and left a user-edited `Main` intact.

What does not come out right is order, plus one re-render:

1. **Every writer of a shared file appends.** This covers:
   - the README sections (`### cli`, `### rest` or `### http`,
     `### Dev environment`, `### Monitoring stack`, `### Observability`,
     `### Dev container`);
   - `settings.gradle.kts` includes (`appendMissingLines`);
   - `pom.xml` modules (`insertModules`, before `</modules>`);
   - root `package.json` scripts (`mergeRoot`);
   - the basic Rust crate's `[[bin]]` tables.

   Each one writes at the end of the file, so greenfield order is simply
   adapter-resolution order, and an entrypoint that arrives late lands
   after every vertical installed since. A project grown by hand today
   (only the newly matching adapters, then the twin's missing
   verticals) differs from the twin in 64 of 64 cases in `README.md`,
   in 24 cases in `settings.gradle.kts`, 24 in `pom.xml`, 8 in
   `package.json`, and 1 in `Cargo.toml`. In every case that adds HTTP
   (32 of them), it also differs in `.devcontainer/devcontainer.json`.

2. **Two re-renders that nothing asks for.**
   - **The family kits.** The four kits
     (`agent-harness/{jvm,go,rust,ts}-claude-kit`) match on the family
     tag alone. They read `arch.cli` and `arch.server-http` inside
     `contribute()`, which drives the runbook title and commands, the
     `run` skill, `promote-to-modulith` and `add-module`, and the layer
     docs. `planner.refreshProposals` compares the ids of matching
     adapters, so it never proposes them, and `keel docs check` sees
     only the `/run` index row on JVM and TypeScript. Re-rendered in
     the reapply posture, every harness file came out byte-identical
     to the twin in all 13 cells tried.
   - **`devcontainer.json`.** When `dev-env` arrives after
     `dev-container`, it upgrades the standalone definition in place
     (`attachDevContainerToDevEnv`): `"name"` stays above the attach
     comment, and `docker-outside-of-docker` goes first. The twin
     lists dev-env before dev-container and renders the attached shape
     from the template, with that feature last. Running `keel add
dev-container --reapply` after dev-env restores the twin's bytes.
3. **A choice made inside `contribute()`.** Every bounded context
   other than the skeleton, meaning the peer context and each
   `keel add module` context, picks the assemblies it wires into by
   reading the entrypoint tags inside `contribute()` (`jvmAssemblies`,
   `tsAssemblies`, and four private copies of `assembliesOf`).
   - **The peer context.** Its predicate carries no entrypoint tag, and
     `modules.peer-context` is persisted. It matches before and after
     growth, so "install what newly matches" skips it and the new
     assembly comes out half-wired. On Quarkus there is no
     `GuestbookWiringTest`, no guestbook dependency in
     `application/api/build.gradle.kts`, and no `welcome` producer in
     `MediatorProducer`.
   - **Added contexts.** An added context matches neither before nor
     after growth, because `modules.context` is stripped after each
     run.

   Fixing this is R.3.

**The prototype closes 1 and 2.** It applied the rank rule at 18 call
sites in 13 adapter files and re-rendered dev-container after dev-env.
With that, the 64-case grow matrix is byte-identical to the twins
except for the harness files, and the harness re-render makes those
identical too. Greenfield bytes did not move in any of the 730
scaffolds or on the seeded axis.

**Two further facts set R's scope.**

- **Dev-env is not a prerequisite.** `dev-env/compose-base` has
  predicate `{}` and promotes nothing; observability does not require
  it, and `plan(observability)` is `[observability]`. Dev-env arrives
  only because every HTTP preset lists it.
- **No vertical promotes an `arch.*` tag.** An entrypoint tag is
  identity, so the command itself has to fold it in, the way
  `keel add module` folds in `modules.context`.

### What stands in the way

The passes found each of these, and each is resolved by the step
named.

1. **Shared files are appended to**, as described above. Resolved by
   R.1a and R.1b.
2. **`devcontainer.json` cannot take a fixed rank.** 548 greenfield
   cells have both a dev container and a dev env:
   - in 36 of them (CLI and SPA presets with `--with dev-env`, where
     dev-env is an extra installed after the dev container, and
     upgrades it in place), `docker-outside-of-docker` comes first and
     `"name"` stays above the attach comment;
   - in the other 512 (every HTTP preset, where dev-env installs
     first and the dev container renders the attached shape from its
     template) it comes last.

   Any fixed rank moves one of the two groups. The two groups split
   on one tag, though: the 512 carry `arch.server-http` and the 36 do
   not, and the in-place upgrade never runs on a greenfield HTTP
   preset. So R.1b ranks the upgrade by the tags, as DR1 ranks
   `### Dev container`. Where growth installs dev-env, it is the only
   path that reaches this file, and it reaches the attached template's
   bytes on every family, so R.2b re-renders no dev container (DR2,
   taken as its first option in R.1b). A CLI project that took dev-env
   as an extra is the exception: its upgrade ran on the CLI's tags,
   growth installs no dev-env there, and the definition keeps the
   CLI's shape, unlike the twin's. I10 has no extras, so it does not
   measure this (R.2a).

3. **`Cargo.toml` is also a shared file.** When CLI is added to
   `rust-http` on the basic layout, the CLI `[[bin]]` lands after
   `[dev-dependencies]` and the HTTP `[[bin]]`. Resolved by R.1b.
4. **Dev-env is outside the planner's closure.** R.2 therefore installs
   the verticals of the twin preset that the project lacks, closed
   through `admit` like any `keel add`. It does not rely on the
   closure of observability.
5. **The tag and `projects` have no source.** No vertical promotes an
   `arch.*` tag, and `projects` exists only on presets. The command
   folds in the tag and takes `projects` from the twin: `["peer.api.rest"]`
   on every HTTP preset.
6. **`refreshProposals` cannot see the kits or dev-container.** R.2
   names the kits' re-render itself. The dev container needs none
   where growth installs dev-env: R.1b took DR2's first option, so
   dev-env's in-place upgrade on the grown tags writes the twin's
   bytes. Where dev-env was an extra, see (2).
7. **`admit` sorts a request by id**, so `dev-container` comes before
   `dev-env`. `--refresh dev-container` in the same run re-renders it
   standalone before dev-env patches it, as measured. R.2's run uses
   the twin preset's order instead.
8. **`keel add walking-skeleton --reapply` cannot grow a project.** It
   rewrites the existing entrypoint's whole files to pristine and drops
   what later verticals patched in; `cmd/http/main.go` lost its OTel
   wiring. R.2 installs only the newly matching adapters, which
   `installVertical` cannot do today because it has no adapter filter.
9. **The manifest records growth out of order.**
   - `recordVertical` appends, so `dev-env` and `observability` land
     after `dev-container`.
   - `foldAnswers` appends, so when CLI is added the CLI bootstrap's
     key lands after `monitoring-compose`'s.
   - The family kit's `pre-commit-format.sh` entry records the hook as
     staged, before code-style fills its slot. On a fresh `quarkus-cli`
     the entry reads `823ec43e…` while the file on disk is
     `a377b652…`; Rust shows `efc2f026…` against `810ec272…`, and
     TypeScript `48deee79…` against `563860a0…`. Go's hashes agree.
   - Any harness re-render records the disk hash instead.

   Nothing reads these hashes today. Resolved by R.2a and R.2b (DR4).

10. **A grown project does not settle.** The actions that make a
    scaffold build (`pnpm install` or `npm install`, `go mod tidy`,
    `cargo check`, `gradle wrapper`, `./gradlew spotlessApply`) belong
    to adapters that already matched, so installing only the new
    adapters queues none of them. O also measured that keel's JVM
    templates are not formatter fixed points. Resolved by R.2b (DR5).
11. **Context wiring is chosen inside `contribute()`.** R.2 refuses
    such projects, and R.3 splits the adapters.
12. **Peer patches anchor on the bootstrap's first rendering.** These
    are Spring's one-line `basePackages`, Micronaut's `packages = …`
    and `RegistryMediator(listOf(GreetHandler()))`, and TypeScript's
    `MEDIATOR_LINE`. Each throws once a context has rewritten the line.
    R.3 fixes the order the wiring runs in.
13. **A drifted `devcontainer.json` throws off the `Err` rail.**
    `attachDevContainerToDevEnv` raises a plain `Error` when the
    `"image"` anchor is gone, and dev-env reaches it both under
    `keel add dev-env` today and under growth. The seeded axis never
    edits that file, so the grid has never seen this. R.2b turns it
    into a `path-conflict` refusal, and did.
14. **Products.** A product root keys its rows by preset id
    (`services[].stack`, `product-compose.ts`, `profile.ts`
    `productOf`), and growth would leave those rows stale. R.2 refuses
    growth in a monorepo product, at its root and in its services;
    this is U's work. A polyrepo service has no product root to keep
    true, and grows as a repository of its own (R.2b).
15. **The command's words.**
    - `keel add entrypoint http` is read today as the vertical
      `entrypoint`, giving "unknown vertical 'entrypoint'".
    - `http` is not an id in `ENTRYPOINTS` (the ids are `cli`,
      `server-http` and `spa`).
    - `cli/contract` may import only the kernel and the contract, so
      the word has to be resolved in the domain.

    Resolved by R.2a and R.2b.

16. **Coverage transfers only where the twin has a suite.** R.2b states
    what that covers. R adds no suite.
17. **Old manifests.** `InstalledModule.consumes` has been recorded
    only since #164 (`d762bf0`, 2026-09-13), but `--consumes` existed
    by 2026-08-22. A module added in that window would replay as
    standalone, and on Go it would not compile. Resolved by R.3a.

### The measure

- **The shared-file byte golden (R.1a).** It hashes the files R.1
  ranks on every single-service preset, every dial setting, and three
  extras sets. It lands before any code moves, and R.1 must leave it
  byte-identical.
- **The render guard (R.2a).** For each preset, it lists the adapters
  whose output changes when an entrypoint tag is added. Only a family
  kit, or an adapter the growth refusal refuses, may appear there.
- **I10: growing an entrypoint writes the twin's bytes (R.2b, hard).**
  It covers every single-entrypoint backend cell on every dial setting,
  with no extras. `keel new X; keel add entrypoint e` must leave the
  same tree, manifest and queued actions (less `vcs`'s) as `keel new`
  of the twin, or else be refused under its golden code. It starts
  with 128 `ok` cells and 64 refused ones, and R.3 turns the refused
  cells to `ok`. R.3a adds a module-history axis, each modulith cell
  again after two `keel add module` runs: 128 more cells, Go's 8 `ok`
  with it, which the other R.3 steps turn to `ok` too. Done with R.3d:
  all 192 cells and all 128 histories grow, every verdict of the axis
  `ok`.
- **The weekly sweep (Q3.4), which R reads as it lands.** Its
  `arrival` suite already shows this epic's first problem from the
  other side (Q3.4's finding 4): a README section lands in arrival
  order when `toolchain` arrives before `persistence` or `dev-env`,
  because every writer appends. R.1a ranks those headings too, so
  that finding goes on every preset. Finding 5, keel's own later write
  into a harness-tracked document read as drift, is the same fault as
  the kit hook's stale hash, and R.2a's harness fix takes both. After
  R.1 and R.2a, a filtered run of the lane on one preset per family
  shows the two findings gone, and each step's Landed paragraph says
  so.

### R.1 — shared files, each entry in its place ✅

#### R.1a — Rank-anchored README sections, pinned first by a byte golden (M) ✅

**The golden lands first**, in its own commit, green on today's code:
`tests/domain/core/shared-files.golden.test.ts` with
`shared-files.golden.json`.

- **Files hashed:** root `README.md`, `settings.gradle.kts`,
  `pom.xml`, `package.json`, `Cargo.toml` and
  `.devcontainer/devcontainer.json`.
- **Cells:** every single-service preset × build system × layout (×
  peer context under the modulith) × three extras sets: none, the
  whole offered menu, and `--with dev-env` where dev-env is an extra.
  Also `keel add dev-env` on each CLI and SPA preset's default
  scaffold, which is the brownfield path where DR1's lower rank
  decides.
- **Where cells come from:** `keel.catalog` and `keel.dials`, never a
  hand list.
- **Updating:** `KEEL_UPDATE_GOLDEN=1`.

Q2.6 checked 154 scaffolds before and after by hand and committed
nothing; this golden turns that check into a test.

**The rule** lives in a leaf module, `src/domain/core/rank.ts`, beside
`util.ts`'s `eolAware`. There is one rule for every kind of file:

- an entry goes immediately before the first existing entry whose rank
  is strictly higher than its own;
- when there is no such entry, it is appended exactly as today;
- equal ranks keep their arrival order;
- an existing entry's rank is read from its content, never from a
  marker keel would have to write.

Callers keep their marker guards in front of the rule, so each patch
stays its own fixed point (`apply.ts`'s reapply contract). Neither
`ContributionPatch` nor `apply.ts` changes. The rule works on LF text
and restores the file's line endings, as `eolAware` does.

**README ranks.** README sections rank by heading, and only `###`
headings after the file's last `## ` line count. That way a user's own
headings in an adopted README (Q2.6), including one named
`### Toolchain`, never act as anchors. The prototype broke the seeded
axis without this scoping and passed with it.

| Heading                             | Rank                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `cli`                               | 10                                                                 |
| `rest`, `http`                      | 20 (the order of `ENTRYPOINTS`)                                    |
| `Dev environment`                   | 30                                                                 |
| `Monitoring stack`, `Observability` | 35 each                                                            |
| `Dev container`                     | 40 when the project carries `arch.server-http`, 25 otherwise (DR1) |
| `Database`, `Persistence`           | 50                                                                 |
| `Toolchain`                         | 60                                                                 |
| any other heading                   | no rank                                                            |

`Monitoring stack` and `Observability` share a rank on purpose, so the
family's own order stands: 352 greenfield cells put the monitoring
stack first and 160 put observability first.

**Call sites.** The research counted twelve call sites that move onto
the rule; the persistence and migrations README patches join them (see
below). Each passes `ctx.manifest.tags`:

- `appendReadmeSection` in `jvm-shared-root.ts` (it also serves
  `jvm-shared-root-modulith.ts`);
- the private copy in `ts-shared-root.ts`;
- the inline appends in `go-cli-bootstrap.ts` and
  `go-http-bootstrap.ts`, and `readmePatch` in `rust-cli-bootstrap.ts`
  and `rust-http-bootstrap.ts`;
- the README patches in `dev-env-compose.ts`, `monitoring-compose.ts`
  and the four `<family>-observability.ts`, because a late HTTP
  entrypoint brings those sections in above an existing
  `### Dev container`;
- the `### Persistence` and `### Database` README patches (the
  `<family>-persistence` adapters, `flyway-migrations.ts`,
  `liquibase-migrations.ts`), which land above an existing
  `### Toolchain`.

The dev-container and toolchain sections stay appends. Every preset
brings the dev container before any extra, and toolchain ranks
highest. The persistence and migrations sections move onto the rule as
well, since they rank below a `### Toolchain` that may already be
there.

`### Toolchain` ranks above `Database` and `Persistence`, not beside
them. Ties keep their arrival order, so a shared rank would keep Q3.4's
finding 4, where toolchain arrives before persistence or dev-env and
its section lands above theirs. One run installs them by id and puts it
after both. Ranked 60, it lands where one run puts it, whichever
arrives first. R.1a closes that finding, and the golden holds that the
rank moves no greenfield cell.

**Tests.** `rank.test.ts` holds the rule: its fixed point, CRLF (the
prototype never tried a CRLF file), a fenced block, a user heading
above the last `## `, equal ranks, and an empty file. A guard pins
DR1's closed form to the presets: every single-service preset lists
`dev-env` before `dev-container` exactly when its tags carry
`arch.server-http`, and lists no `dev-env` otherwise.

**Holds green:**

- the new golden, unchanged by the second commit;
- `agent-harness.golden.json`, `run-skill.golden.json`, the three grid
  goldens and `planner-readiness.golden.json`, byte-identical;
- the e2e suites, since no template changes.

**CHANGELOG:** one line under _Changed_. A section keel adds to an
existing README, whether from a later `keel add` or from `--reapply`
restoring it, now lands in keel's order instead of at the end.

**Leaves out:**

- moving any section that is already there;
- the marker guards' whole-file reach (a user heading
  `### Dev container` still suppresses keel's own, as today).

**Landed first: the golden alone**, in a commit of its own with no
`src/` change. The rule, its call sites and the DR1 guard make up the
second commit, and the step's ✅ waits for it.
`shared-files.golden.test.ts` records 398 cells and 1,167 hashes:

- the 150 dial settings of the 28 single-service presets, with no
  extras and with the whole menu. The settings come from `walkDials`,
  the walk the weekly sweep makes;
- `--with dev-env` on the 54 settings of the ten presets where dev-env
  is an extra: the six JVM CLIs, `go-cli`, `rust-cli`, `ts-cli` and
  `web-components`;
- `keel add dev-env` on those ten presets' opening scaffolds;
- the whole menu with `migrations=liquibase` on the opening setting of
  the six presets whose preview offers it (Go, Rust and TypeScript,
  HTTP and CLI+HTTP);
- the whole menu on every preset's opening setting over a user README
  whose `### Toolchain` and `### Dev container` headings sit above
  keel's part.

Every cell writes `README.md` and `.devcontainer/devcontainer.json`.
`keel.dials` snaps each set, and on no setting does it add to the whole
menu or drop anything from it; the cell's key names the set in install
order, then the answer it is sent. A failure names the cell, as the
command line that makes it, and the file. The Factory is the grid's,
`installMediator` with a fake process runner and no deferred action;
the port is `Mediator.dispatch`. No existing golden or known file
moved.

Beyond the text above:

- **Greenfield cells are dry runs**, read back through the Tree that
  staged them. The brownfield scaffolds are real, so that `keel add`
  has a project on disk. Written to disk, the first 364 cells took
  about 21.5 s on their own; as dry runs they take about 14 s. The
  first recording was made on disk, and the dry-run reading reproduced
  every cell of it, since a commit is the only thing a real run adds.
- **Liquibase and a seeded README.** Every other cell answers the
  defaults, so none reached `liquibase-migrations.ts`'s `### Database`
  patch, one of this step's call sites. Every non-default choice the
  opening whole menus offer was measured against the default. Only
  `migrations=liquibase` swaps the writer of one of the six files;
  `engine=mariadb` rewords Flyway's section, whose writer the defaults
  already run. No cell seeded a README either, so an adopted one, where
  the rule's `## ` scoping decides, was pinned nowhere by bytes. Both
  kinds of cell read the opening setting alone, as I9 does: learning
  where Liquibase is offered takes a preview, and one on every setting
  added about a quarter to the suite's time. The 398 cells take about
  15 s on their own.
- **The agent harness is not an axis.** With it left out, all 364
  first cells hash the same, since it writes none of the six files,
  and the run saves under two seconds of the 21.5. It stays on.
- **The key is spelled by the test**, not by the page's `command.js`,
  so a change to how the page prints a command moves no key.
- **Mutation testing leaves the golden out**, as it does the grid
  (`vitest.stryker.config.ts`). Its installs run in a `beforeAll`,
  which Stryker credits to no test, so the golden could kill no
  mutant, and a mutant only it reaches would be scored Ignored instead
  of NoCoverage.

`tests/AGENTS.md` records the golden beside the planner's readiness
golden, and `docs/development.md` names the command that regenerates
it.

**Landed second: the rule**, and no golden moved.
`src/domain/core/rank.ts` holds it in three exports:

- `rankedIndex`, the rule over the ranks of the entries a file already
  has, in file order. It is kept apart from any file's syntax so that
  R.1b's lists can read their own entries into it.
- `readmeSectionRank`, the table above.
- `placeReadmeSection`, which reads the `### ` headings after the last
  `## ` line, outside fenced blocks (backticks or tildes, each closed
  only by a fence of its own character at least as long) and HTML
  comments. It puts the section before the first heading ranked above
  it, with one blank line either side, and otherwise appends it
  exactly as the callers did. It works on LF text and restores the
  file's endings through `eolAware`.

Eighteen writers moved onto it. Each passes `ctx.manifest.tags`, and
each keeps its marker guard:

- the JVM entrypoints' `addReadmeSection`, which is
  `appendReadmeSection` renamed and serves both build systems under
  both layouts (`JvmRootInputs` gained `tags`);
- the TypeScript one (`TsRootInputs` and `tsEntrypointContribution`
  gained `tags`);
- the four in the Go and Rust bootstraps;
- `dev-env-compose.ts`, `monitoring-compose.ts` and the four
  observability adapters;
- the Go, Rust and TypeScript persistence adapters, and
  `jvm-persistence.ts`'s `persistenceReadmePatch`, which the Quarkus,
  Spring and Micronaut adapters share and which now takes the tags;
- `flyway-migrations.ts` and `liquibase-migrations.ts`.

Two more, `dev-container.ts` and `toolchain.ts`, moved onto it as
well, which the text did not ask for (below).

The proof is the golden. `shared-files.golden.json` passes unchanged,
all 398 cells and 1,167 hashes, and was never regenerated. It does
catch a rank that moves a scaffold: a trial that ranked `Dev container`
35 on a project without `arch.server-http`, not kept, moved 118
`README.md` hashes. `agent-harness.golden.json` and
`run-skill.golden.json` pass as they were. The greenfield, brownfield,
composite and planner-readiness goldens and the docs matrix regenerate
byte-identical, and the known files stay as they were. No template
changed, so no e2e suite was run.

`rank.test.ts` holds the rule:

- `rankedIndex` passing unranked lines and equal ranks, and reading
  entries in file order, so the first ranked above wins over a lower
  one after it;
- a section appended exactly as before when nothing ranks above it,
  including a heading keel does not write, such as a plugin's;
- a section already there left in place: `### Persistence` goes above
  a `### Toolchain` the user moved above `### http`, which stays below
  both; and a heading keel does not write, below keel's sections,
  passed over;
- a later arrival placed where one run puts it: `### cli` above an
  existing `### http`, `### Persistence` above `### Toolchain`, and
  `### Dev environment` above `### Toolchain` on a CLI;
- the dev container ranked by the tags: the dev environment and both
  monitoring sections go above it on HTTP, and the dev environment
  goes below it elsewhere;
- equal ranks in arrival order;
- the fixed point behind the guard;
- a CRLF README, placed in its own endings and still a fixed point;
- a heading inside a fenced block — backticks, tildes, a tilde fence
  around a backtick line, a longer fence around a shorter one, an
  indented one — and a `## ` line inside a shell block, which would
  otherwise hide the sections below it;
- a heading inside an HTML comment, and a `## ` line there, which
  would otherwise hide the sections above it, while a comment closed
  on its own line, or an opener inside a fenced block, hides nothing;
- the user's `### Toolchain` above the last `## `, alone or under a
  `## ` heading of the user's, so the scope starts at the last `## `
  and not the first; a README with no `## ` line, and one whose last
  `## ` section is the user's own below keel's (a `## License`), which
  rank nothing;
- an empty file.

Its DR1 guard reads the registry: every single-service preset lists
`dev-env` before `dev-container` exactly where its tags carry
`arch.server-http`, and lists no `dev-env` otherwise.

`rank-arrival.test.ts` holds each writer to the rule where it and an
append part ways, which the golden cannot: on every one of the
golden's cells both write the same bytes, and a review that put two
writers back on an append found every suite still green. Its 21 cells
go through `Mediator.dispatch` with the grid's wiring and compare
`README.md` byte for byte:

- seven projects grown over two runs, against one run:
  `keel new --with toolchain`, then `keel add persistence` on
  `quarkus-rest`, `go-http` (once more with Liquibase), `rust-http`
  and `ts-http`, and `keel add dev-env` on `go-cli` and
  `web-components`;
- fourteen scaffolds whose sections the user deleted, each put back by
  `--reapply` in its place, against the scaffold: both entrypoints'
  sections on `quarkus-cli-rest` under each build system and layout,
  since the JVM's basic and modulith roots and their Gradle and Maven
  patches each add them apart, and on `go-cli-http`, `rust-cli-http`
  and `ts-cli-http`; observability's and monitoring's on
  `quarkus-rest`, `go-http`, `rust-http` and `ts-http`; the dev
  environment's with both of those on `go-http`, reapplied together,
  so it comes back first, with only the dev container ranked after it,
  which reads the tags; and the dev container's on `go-http` with
  persistence and the toolchain, and on `go-cli` with the dev
  environment.

Every one of the 21 fails on the appending code. With
`go-persistence.ts`, `dev-env-compose.ts` and `dev-container.ts` back
on an append, the seven cells that reach them fail. Each of the four
JVM root patches back on an append fails its own cell, and so does
`dev-env-compose.ts` passing no tags. The suite takes about two
seconds.

Q3.4's finding 4 is gone on one preset per family. The `arrival`
suite ran filtered, before and after, in two runs of about a minute
each (`quarkus-rest,go-cli,rust-cli-http`, then
`ts-http,web-components`).

- **Before:** 123 findings. 48 of them were `README.md` in arrival
  order after `toolchain`:
  - `dev-env` after it: 6 on `go-cli` and 12 on `web-components`;
  - `persistence` after it: 12 on `quarkus-rest`, 12 on `ts-http` and
    6 on `rust-cli-http`.
- **After:** 90 findings. There are none on `go-cli` or
  `web-components`, and 36, 36 and 18 on the other three. Every one is
  finding 5, the manifest recording persistence's later write, which
  R.2a takes. The 15 pairs with the harness on had differed in both
  `README.md` and the manifest; they now differ in the manifest alone,
  and are listed under finding 5's heading.

Beyond the text above:

- **The guards read their marker in the file's own endings.**
  `monitoring-compose.ts`'s patch was the one README writer whose guard
  read its marker in LF alone, neither under `eolAware` nor through
  `withEol`. On a CRLF README it appended LF lines. On every HTTP
  preset the dev container's patch runs after it and rewrote them in
  CRLF, so the guard missed its own section, and
  `keel add observability --reapply` added a second one. That was so
  before the rule; the rule, which writes in the file's own endings,
  would have made the guard miss on every CRLF README. The patch now
  runs under `eolAware` like the others: its section comes in CRLF,
  and a reapply finds it. The CHANGELOG lists it under _Fixed_.
  `new-project-adoption.test.ts`'s CRLF case now scaffolds four
  families' CLI+HTTP presets with persistence and the toolchain,
  `go-cli-http` with Liquibase, and `go-cli` with the dev environment
  and the toolchain, and reapplies every vertical that wrote a
  section. It fails on the old guard, and on each of the thirteen other
  patches outside the bootstraps with its `eolAware` taken off.
- **The dev container's and the toolchain's sections take the rule
  too.** The text kept both as appends, since every preset brings the
  dev container before any extra and the toolchain ranks highest. That
  holds for a section's first arrival, not for one `--reapply` puts
  back. A deleted `### Dev container` came back last: below
  `### Database`, `### Persistence` and `### Toolchain` on `go-http`,
  and below `### Dev environment` on `go-cli`. The CHANGELOG line the
  text asks for says such a section lands in keel's order.
  `dev-container.ts` now passes the tags like the others, so DR1's rank
  decides a restore too, and `shared-files.golden.json` passed
  unchanged with it. `toolchain.ts` moved so that every writer keeps
  one rule; ranked highest, its section is still appended exactly as
  before.
- **Equal ranks and a lone restore.** Sections that share a rank
  (`Monitoring stack` and `Observability`, `Database` and
  `Persistence`) keep their arrival order, as the text says. So one of
  a pair put back alone follows the other, where one run may put it
  first: a deleted `### Observability` on `go-http` comes back below
  `### Monitoring stack`. Ranking either monitoring section below the
  other would move the scaffolds that put it second, 160 or 352 of
  them, so this is kept, and `docs/cli.md` and the CHANGELOG say so.
- **A plugin preset's README takes keel's order.** The ranks reproduce
  keel's own presets, and the DR1 guard holds only those. A plugin
  preset that lists `dev-container` before `dev-env` on
  `arch.server-http`, or `toolchain` before `persistence`, now gets
  keel's order where it got its own list's, provided its README seed
  has a `## ` heading (below). A section a plugin writes ranks by its
  heading alone: under one keel writes (a `### Database`) it ranks as
  keel's, so a later section of keel's ranked below it goes above it,
  where it was appended; under any other, keel's pass it over.
  `docs/plugins.md` says all of this, and that a seed needs a `## `
  heading. No shipped preset moved.
- **A README with no `## ` line after keel's sections ranks nothing.**
  The text above scopes ranking to the `###` headings after the last
  `## ` line, and does not say what happens when none of keel's
  sections follows one. Every keel seed has one, so this happens only
  where the user deleted the `## ` headings, added a `## ` section of
  their own below keel's (a `## License`, the likelier case), or a
  plugin's seed has none. There, every section is appended, as before.
  `docs/cli.md` and the CHANGELOG say so.
- **HTML comments hide headings too.** The text names fenced blocks.
  Commenting a section out is how a user hides one of keel's for good,
  since deleting it brings it back on the next `--reapply`, while a
  commented-out marker still satisfies the guard. Read as live, a
  commented-out `### Toolchain` drew a later `### Persistence` inside
  the comment, where the append had put it after `-->`. A line opening
  `<!--` now hides every line up to the one holding `-->`, as a
  CommonMark HTML block does. No keel README writes a comment.
- **The DR1 guard reads the registry** (`shippedRegistry.stacks()`),
  because `keel.catalog`'s descriptors carry no list of verticals.

Not done here: R.1b's build-file lists and the dev container's
in-place upgrade.

#### R.1b — Ranked build-file lists: includes, modules, scripts, the CLI binary (S) ✅

This step applies the same rule to the lists the entrypoints share.

**Gradle and Maven modules.** `settings.gradle.kts` `include(...)`
lines and `pom.xml` `<module>` entries rank by module path, using the
lists that already exist:

| Module                                                               | Rank |
| -------------------------------------------------------------------- | ---- |
| the layout's `SEED_MODULES`                                          | 0    |
| `ARCH_MODULES.cli`                                                   | 1    |
| `ARCH_MODULES.rest`                                                  | 2    |
| anything else (the port fake, the peer, persistence, added contexts) | 3    |

This applies to both patches in `jvm-shared-root.ts` (around
`appendMissingLines` and `insertModules`) and both in
`jvm-shared-root-modulith.ts`. It reproduces the greenfield order:
seed, CLI, REST, peer, port fake, added contexts. For the modulith
`quarkus-cli-rest` that is:

- the seed modules;
- `:modules:greeting:user-side:cli` and `:application:cli`;
- the three REST modules;
- guestbook ×3;
- `:modules:greeting:infra:clock:fake`;
- then four modules for each added context.

**Root `package.json` scripts.** They rank by key (`localeCompare`),
which is the order `web-format`'s `addPrettierToPackageJson` →
`sortKeys` already gives them at greenfield. `mergeRoot` in
`ts-shared-root.ts` now inserts `start:cli`, or `dev:rest` and
`start:rest`, in their sorted place instead of after `typecheck`.

**The basic Rust crate.** The CLI `[[bin]]` (`rust-cli-bootstrap.ts`
`rootBinPatch`) goes before the first `[dev-dependencies]` or `[[bin]]`
table. The greenfield `rust-cli-http` order is `[dependencies]`, the
CLI `[[bin]]`, `[dev-dependencies]`, then the HTTP `[[bin]]`.

**What stays an append.** Everything that always arrives after the
entrypoints: `sample-port-fake` (and `-kotlin`), `jvm-persistence`,
`jvm-context`, `jvm-peer-context`, `rust-http-bootstrap`'s
`rootCratePatch`, `addWorkspaceMembers` (already sorted), the compose
helpers, `web-format` and `web-lint`.

**The dev container's features.** `attachDevContainerToDevEnv`
(`dev-container.ts`) upgrades a standalone `devcontainer.json` in place
when dev-env arrives after it. On a project carrying `arch.server-http`,
it now produces the attached shape the template renders, with the
docker feature last and `"name"` where the template puts it. This is
DR2's first option. Without that tag it keeps today's shape, so the 36
CLI and SPA cells with `--with dev-env` do not move. Only `keel add
dev-env` on an HTTP project that lacks it ever took this path, and no
shipped HTTP preset lacks it. The file keeps whatever else the user
wrote into it. If the upgrade cannot reach the template's bytes, this
part moves to R.2b as a re-render (DR2's fallback), and the step says
so in its Landed paragraph.

**Holds green:** the R.1a golden, unchanged. Unit tests cover each
list: a seed-only file, a file that already has the other entrypoint,
a file with a context after the port fake, and CRLF. Its CHANGELOG
line joins R.1a's.

**Leaves out:** `go.mod`, which never differed in any pair.

**Landed as the rank rule on each list**, each list read in its own
syntax into R.1a's `rankedIndex`, and no golden moved.

- **Gradle and Maven.** `jvm-shared-root.ts`'s `appendMissingLines`
  and `insertModules` gave way to `placeIncludes` and `placeModules`,
  over a `RootModules` value each layout passes: the basic layout's,
  and the modulith's own in `jvm-shared-root-modulith.ts`. Its `seed`
  and per-entrypoint lists are the old `SEED_MODULES` and
  `ARCH_MODULES`. `moduleRank` is the table above, one step finer: a
  module ranks by its place in the seed's list, then the CLI's, then
  REST's, and anything else after them all (below). An include is a
  line holding one `include("…")`, a module a line holding one
  `<module>…</module>`. Each of an entrypoint's missing lines goes
  before the first entry ranked above it, in the file's own line
  endings, every byte already there kept; where none is, it is
  appended as the old code appended it.
- **Root `package.json` scripts.** `mergeRoot` merges through
  `placeScripts`. A script already there keeps its place and takes the
  entrypoint's value, as before. A new one goes before the first
  script there whose name sorts after its own under `localeCompare`,
  the order `web-format` sorts them into.
- **The basic Rust crate.** `rootBinPatch` ranks a line holding
  `[dev-dependencies]` or `[[bin]]` above the CLI binary. The binary
  goes before the first of them, with one blank line either side as
  the README sections have, and is appended as before where there is
  none.
- **The dev container, by DR2's first option.**
  `attachDevContainerToDevEnv` takes the tags, which
  `dev-env-compose.ts` passes from the manifest. On `arch.server-http`
  it writes the template's attached shape: the Compose note above
  `"name"`, where `"name"` is the line above the image as the
  standalone shape renders it, and the docker feature after the last
  entry of the `"features"` object, with a comma added where that
  entry's code ends, ahead of any comment trailing it. Anywhere else
  it runs the old code, byte for byte. The upgrade reaches the
  template's bytes on every family, and on the tags growth leaves,
  `arch.cli` beside `arch.server-http`, so the fallback was not needed:
  where growth installs dev-env, R.2b re-renders no dev container. A
  CLI project that took dev-env as an extra keeps the CLI's shape
  through growth, which installs no dev-env there. _What stands in the
  way_ (2) and (6), R.2a, R.2b and DR2 now say both.

Everything the text keeps an append stays one: `sample-port-fake` (and
`-kotlin`), `jvm-persistence`, `jvm-context`, `jvm-peer-context`,
`rust-http-bootstrap`'s `rootCratePatch`, `addWorkspaceMembers`, the
compose helpers, `web-format` and `web-lint`. R.1a's CHANGELOG entry
under _Changed_ now covers the lists and the dev container too.

The proof is the golden again. `shared-files.golden.json` passes
unchanged, all 398 cells and 1,167 hashes, and was never regenerated;
its 118 cells with `dev-env` among the extras (54 with it alone) and
ten `keel add dev-env` cells, where the upgrade keeps its old shape,
are among them.
`agent-harness.golden.json` and `run-skill.golden.json` pass as they
were. The greenfield, brownfield, composite and planner-readiness
goldens and the docs matrix regenerate byte-identical, and the known
files stay as they were. No template changed, so no e2e suite was
run. Past the golden's six files, HEAD's code and this step's rendered
872 cells side by side: every preset on each build system and layout,
with the peer context on the modulith, under eight extras sets; each
product under both repository layouts; and `keel add dev-env` on each
CLI and SPA preset. They wrote 55,570 files byte-identical, and the
132 cells that refuse were refused by both, under the same code.

Where the rule and an append part ways:

- `rank-arrival.test.ts` gains twelve cells, each a scaffold whose one
  entrypoint's entries the user deleted, put back by `keel add
walking-skeleton --reapply` and compared with the scaffold byte for
  byte. Eight are `quarkus-cli-rest`'s includes or modules, the CLI's
  and then REST's, under each build system and layout, the Gradle
  modulith with the peer context. Two delete one of an entrypoint's
  several alone: `:application:rest:contract` on the basic Gradle
  layout, and the CLI's `modules/greeting/user-side/cli` on the Maven
  modulith. Two are `ts-cli-http`'s scripts: `start:cli` on npm, and
  `dev:rest` with `start:rest` on the pnpm modulith. All twelve failed
  on the appending code, and all twelve pass.
- `adapters/jvm-shared-root.test.ts` (new) holds both layouts under
  both build systems: the seed alone, appended as before; either
  entrypoint first, the list read back as the table above spells it;
  either arriving after the port fake and an added context, against
  one run; each of an entrypoint's modules deleted alone and put back;
  CRLF; the fixed point; and an entry already there never moved, REST
  going above a module the user moved above the CLI, which stays
  below both. An include in a block comment, a module in an XML
  comment, an include sharing its line with a comment, a module
  sharing its line with another, and a Maven profile's module below
  the root's list draw no entry, and a `//` comment holding `/*` above
  the includes hides none of them.
- `adapters/ts-shared-root.test.ts`: a later entrypoint where the
  formatter sorts one run, on pnpm basic and the npm modulith with
  `web-format`'s and `web-lint`'s own patches applied; either
  entrypoint first; CRLF; and a user's out-of-order scripts left
  where they are.
- `adapters/rust-cli-bootstrap.test.ts` (new): the seed alone, the CLI
  arriving after the HTTP unit and observability against one run, the
  HTTP binary with no `[dev-dependencies]` above it, CRLF, the fixed
  point, and a `# [[bin]]` comment ranking nothing.
- `verticals/dev-container.test.ts`: on an HTTP project the upgrade
  writes the attached render byte for byte on the JVM under Gradle and
  Maven, Go, Rust, and TypeScript under pnpm and npm, and on Go
  carrying `arch.cli` as well, the tags a CLI project grows to; in a
  CRLF definition, in its own endings; and around a user's edits (a
  renamed `"name"`, a feature spread over lines, a comment closing the
  features, a `"customizations"` block), which stay; below the brace
  of a features object with no entry, every line kept; after a last
  feature with a comment trailing it, the comma going ahead of the
  comment and the file still parsing; past a block comment the last
  feature's line opens, with or without its trailing comma; after one
  that already carries its trailing comma; first where the object
  closes on its last entry's line, or on the line a comment that entry
  opens ends, and last where it closes on a line of its own at its
  entries' indent, each followed by a multi-line `"customizations"`
  that stays as it was; the note above the Compose fields once
  `"name"` is no longer the line above the image; and a features
  object commented out above the real one, or a brace in a comment
  inside it, read as none of it. On a CLI it keeps the old shape, and
  on either a docker feature the user already listed stays where it
  is, once.

With the JVM and TypeScript writers back on an append, 38 of the 75
cases in the arrival, JVM and TypeScript suites fail; with the Rust
binary appended, three of its seven; with the dev container's tag
branch off, seventeen of that suite's thirty-four. The new cases add
about a second to `verify`.

Beyond the text above:

- **The Rust binary is proven on its patch alone.** The crate's
  `Cargo.toml` is `rust-bootstrap`'s own whole file, which `keel add
walking-skeleton --reapply` writes afresh, and without
  observability's dependencies, as blocker 8 says of other files. So
  no command reaches the ranked branch before R.2b's growth, and
  `rank-arrival.test.ts` holds no Rust cell. A first draft had one,
  and it failed on observability's missing dependencies, not on the
  binary.
- **What ranks.** The text reads each list's entries and does not say
  which lines count. Only a line holding one entry ranks. An include
  or a module inside a comment ranks nothing, since the rule would
  otherwise put an entrypoint's lines inside the comment a user hid a
  module in. `settings.gradle.kts` is read as code alone (`util.ts`'s
  `codeOnly`), so a `//` comment holding `/*` hides no include below
  it; `pom.xml`'s `<!-- -->` is read by hand. In `pom.xml` only the
  lines before the first `</modules>` rank, so a profile's modules
  never draw an entry into the profile. A Cargo table header ranks
  only on a line of its own. Where nothing ranks, the entry is
  appended as before. `docs/cli.md` says so.
- **One rank per module, not per entrypoint.** The table gives all of
  an entrypoint's modules one rank, and equal ranks keep their arrival
  order, so one of an entrypoint's several that the user deleted alone
  came back below the sibling still there: `:application:rest:contract`
  below `:application:rest:executable`, or the modulith's
  `:modules:greeting:user-side:cli` below `:application:cli`, as R.1a's
  lone README section does. A module ranks instead by its place in the
  order one run writes, the seed's list, then the CLI's, then REST's,
  anything else after them all, and each missing one is placed on its
  own. The groups keep the table's order, so no scaffold moved, and a
  lone module goes back where it was, which `docs/cli.md` and the
  CHANGELOG say.
- **Scripts without the formatter.** Every keel preset carries
  `code-style`, whose `web-format` sorts the scripts after the
  entrypoints, so no scaffold moved. A plugin preset that installs
  keel's TypeScript entrypoints without it got `start:cli` and the
  REST scripts after `test` and `typecheck`; it now gets them sorted.
  The CHANGELOG and `docs/plugins.md` say so.
- **A plugin preset's dev container.** One tagged `arch.server-http`
  that lists `dev-container` before `dev-env` got the CLI's shape from
  the upgrade; it now gets the definition as keel's HTTP presets
  render it attached. The CHANGELOG and `docs/plugins.md` say so too.
- **The dev container keeps what the user wrote.** `"name"` moves
  below the note only while it is still the line above the image; the
  docker feature follows the object's last entry, ahead of any comment
  closing it, and a features object with no entry takes it below its
  brace, every line kept. The object is read as code alone
  (`util.ts`'s `codeOnly`), so a comment is never taken for its last
  entry, and the comma that entry takes goes where its code ends,
  ahead of a comment trailing it: appended to the line, it would have
  landed inside the comment, and the file would no longer parse. The
  feature itself goes on the first line after that entry that no
  comment holds, so a block comment the entry's line opens closes
  above it rather than swallowing it. The object ends at the brace
  that matches its opener, counted over that code: a first draft took
  the next `  }` line for it, and a features object closing anywhere
  else handed the feature to the object after it, a multi-line
  `"customizations"`, in a file that still parsed. Where that brace
  is not the first code on its line (`{} },`), or no line between the
  last entry and it is out of a comment (`{} /* pinned` … `*/ },`),
  the feature goes first, as the CLI's shape lists it, rather than
  nowhere.
  `docs/verticals/dev-container.md` describes both shapes.
- **`gradleIncludeLines` is no longer exported**: the modulith reaches
  the lists through `placeIncludes` now.
- **The weekly sweep was not run.** No extra reaches a ranked branch.
  Persistence's JVM modules, the peer's and a context's still append
  after the entrypoints, and a dev environment is an extra only on CLI
  and SPA presets, where the upgrade keeps its old shape, so the lane
  has no finding R.1b could move.

Not done here: the drift `Error` in `attachDevContainerToDevEnv`,
which stays a plain throw until R.2b makes it a `path-conflict`
refusal.

### R.2 — the command ✅

#### R.2a — The growth reading, with no caller yet (M) ✅

`src/domain/core/growth.ts` is pure, as `planner.ts` is.
`growthOf(registry, manifest, entrypoint)` answers, before anything
runs, what `keel add entrypoint` would do or why it cannot. The
command, its preview, `keel.project-status` and the refusal builder
all read this one function.

**Finding the twin.** `growthOf` finds the twin through the drill-down
that `projectProfile` already walks, run over the tags plus the new
one: `axesOf` over the tags minus anything a vertical can add, then
`pathFor` with the grown entrypoints. It checks that the twin's own
tags are a subset of the grown set. A project the drill-down cannot
place, such as a plugin preset off the tree, has no twin and is
refused.

**What it returns:**

- **The grown tags**, sorted the way `foldTags` sorts them.
- **The grown `projects`**, taken from the twin.
- **Newly matching adapters, per installed vertical.** This is the
  before-and-after `matchingIds` reading that `refreshProposals`
  already makes. On every shipped cell it is exactly one adapter: the
  other entrypoint's bootstrap.
- **Adapters that stop matching.** There are none today, because no
  adapter excludes an entrypoint tag. If there were one it would be a
  refusal, since removal waits for L's merge base.
- **The verticals to install**: the twin's `verticals` minus the
  installed ones, in the twin's order. That is `dev-env` and
  `observability` when adding HTTP, and nothing when adding CLI.
- **The re-renders**: `agent-harness` wherever it is installed.
  `dev-container` is never among them: R.1b took DR2's first option,
  so where growth installs dev-env, its in-place upgrade on the grown
  tags writes the twin's `devcontainer.json`. On a CLI project that
  took dev-env as an extra (`--with dev-env`), growth installs none,
  and the definition keeps the shape that extra's upgrade wrote:
  `"name"` above the Compose note, the docker feature first. That
  differs from the twin's, knowingly: re-rendering it would be DR2's
  (b), overwriting what the user wrote, and I10, which has no extras,
  does not measure it.

**The refusal is structural.** It is read off the adapter set the way
`context-support.ts`'s `emitsFor` reads it. For each context marker the
project carries (the persisted `modules.peer-context`, and
`modules.context` once for each recorded module after the skeleton),
growth is refused while no adapter that requires the marker also
requires the new entrypoint's tag. Today this refuses exactly the
moduliths whose `modules` hold more than the skeleton
(`scaffoldedModules` records the skeleton first). Each R.3 step lifts
the refusal for its family by adding the adapters this check looks
for, with no edit here (DR6).

**The words.** `ENTRYPOINTS` (`stack-wizard.ts`) gains a `word` field:
`cli`, `http`, `spa`. This is the word the command takes and a hint
prints. It is resolved in the domain, because `.dependency-cruiser.cjs`
keeps `cli/contract` away from `domain/core` (DR7).

**The render guard** (`tests/domain/core/growth-render.test.ts`) keeps
the structural refusal honest. For each single-service backend preset,
on basic, modulith, and modulith-with-peer (plus a `modules.context`
probe), it renders every adapter of every preset vertical twice: under
the preset's tags, and under those tags plus the missing back
entrypoint. It fails if an adapter that matches both times contributes
differently, unless that adapter is a family kit or one the refusal
refuses. It is the passes' probe made permanent, and today it flags
exactly the kits, the peer-context adapters and the context adapters.

**The growth golden** (`growth.golden.json`) records `growthOf` for
every preset × dial setting × missing back entrypoint: the twin, the
newly matching adapters, the verticals, the re-renders, or the refusal
code. R.2b's diff is then reviewed against it, as Q1.2's readiness
golden was for Q1.3.

**A `fix(harness)` commit** rides along: `finalizeHarness` records
each realized file's hash after the buffer's patches have run, instead
of as staged (`install.ts` `foldHarnessEntries`). The kit's
`pre-commit-format.sh` entry then records the bytes on disk. Greenfield
manifests move for that one entry on JVM, Rust and TypeScript; no
project file moves, and `agent-harness.golden.json` excludes the
manifest. The same fix covers Q3.4's finding 5. There, a later `keel
add persistence` patches a directory document the harness tracks, and
the entry keeps the first run's `sha256Shipped`, so keel's own write
reads as the user's. keel's own write now records as shipped.
CHANGELOG, under _Fixed_.

**Holds green:** every golden except the new one, byte-identical. The
render guard passes on today's registry.

**Leaves out:** every caller.

**Landed first: the harness fix**, which touches no growth code.
`install.ts`'s `finalizeHarness` hands the Tree to
`foldHarnessEntries`, which hashes each realized file as the run leaves
it, after every harness patch, doc section and index row, instead of
taking the hash it was staged with. Every entry of a file the run
wrote, whichever contributor it names, takes those bytes as shipped
and as current, and keeps its `installedAt`. The same re-hash is
exported as `rehashEntries` for `keel add module`, whose re-index
writes the root map after the harness pass has recorded it.

Before, one entry on every default JVM, Rust and TypeScript scaffold
disagreed with its file on disk: the family kit's
`pre-commit-format.sh`, recorded before code-style's format step
landed in it. That held on 25 of the 28 single-service presets
(`web-components` included; Go's three agreed) and in 11 of the 12
services of the six products. On `quarkus-cli` the entry read `823ec43e…`
against `a377b652…` on disk, on `rust-cli` `efc2f026…` against
`810ec272…`, and on `ts-cli` `48deee79…` against `563860a0…`. After,
no entry disagrees. No project file moved. No golden records a
manifest, so none moved: the greenfield, brownfield, composite and
planner-readiness goldens and the docs matrix regenerate
byte-identical, the known files stay as they were, and
`agent-harness.golden.json`, `run-skill.golden.json` and
`shared-files.golden.json` pass as they were.

Q3.4's finding 5 is gone on one preset per family. The `arrival` suite
ran filtered, before and after, in two runs of about a minute and a
half and under a minute (`quarkus-rest,go-http,rust-cli-http`, then
`ts-http`). Before, it found 108: 36 on `quarkus-rest`, 18 on
`go-http`, 18 on `rust-cli-http` and 36 on `ts-http`. Every one was
persistence arriving in a later run, alone or after another extra,
with the manifest's `entries` the only difference. After, it found
none on any of the four.

`handlers/agent-harness.test.ts` holds it:

- the case that held a later install's baseline, _refreshes earlier
  current hashes … while preserving their baselines_, now holds the
  opposite: the later write is shipped on every entry of the file, and
  each keeps its `installedAt`. A user's edit to a file the later runs
  do not write stays visible: its entry is left as it was;
- a hook one contributor stages with a slot another fills records the
  filled hook, on both entries;
- `quarkus-rest`, `go-http`, `rust-http` and `ts-http`, each scaffolded
  `--with persistence` and again with `keel add persistence` after:
  every entry holds its file's bytes on disk, and the two manifests'
  entries are equal;
- the same four, scaffolded as a modulith, a skill file then edited,
  and given `keel add module orders`: every entry holds its file's
  bytes on disk but the edited skill's, which stays as it was.

All ten fail on the old code. `handlers/composite-scope.test.ts`,
which compared a product's persistence in one run and in two without
the hashes, because they differed, now compares them too.
`docs/composition.md` → Harness contributions and `ManifestEntry`'s
TSDoc say what the hashes record. The CHANGELOG lists it under
_Fixed_.

Beyond the text above:

- **One rule, so the baseline goes.** The text names the kit hook and
  finding 5; one rule covers both. Every entry of a file the run wrote
  takes its final bytes, so where keel wrote last, `sha256Shipped` and
  `sha256Current` agree. The earlier contributor's shipped hash that a
  later install left in place is what #164 called its baseline, and a
  test pinned it; that baseline is finding 5, so it now moves with
  keel's write. The cost: an edit the user had already made in a file
  keel writes into is recorded with keel's write, as the later
  contributor's own entry always recorded it. A difference between a
  file and its entry still means an edit keel did not record. Nothing
  reads one yet.
- **`keel add module` too.** The text names the harness pass. `keel
add module` re-indexes the root map after that pass, so its entry
  missed the new context's row on all four families; the handler now
  records what the re-index wrote.

Not done here: `keel docs sync` writes the index and no manifest, so a
row it changes reads as an edit until a run next writes that document.
Recording it means the sync writing the manifest, which is for
whatever first reads these hashes (L's merge base).

**Landed second: the reading**, and no existing golden moved.
`src/domain/core/growth.ts` holds it, pure.

- **`growthOf(registry, manifest, word)`** answers `grows` with a
  `GrowthPlan` (the entrypoint's id, the twin, the grown tags sorted as
  `foldTags` sorts them, the twin's `projects`, the adapters newly
  matching per installed vertical, the verticals to install and the
  ones re-rendered), or `present`, or `refused` with a `GrowthRefusal`.
  The refusal carries the code the command will refuse under, and no
  sentence: `keel.unknown-entrypoint`, `keel.uncoverable-entrypoint`
  (for a front end, for no twin, or for adapters that would stop
  matching, which it names), or `keel.contexts-need-rewiring` (the
  contexts, each with its marker).
- **The twin** is `axesOf` over the grown tags less `acquirableIn`'s,
  then `pathFor` among the single-service presets that `keel new`
  makes the grown project of on its dials (below). The rest are left
  out before placing, so neither a product nor a preset with a tag of
  its own sitting at the twin's node can hide it, whichever sorts
  first. A project the drill-down cannot place itself, with no
  language or no entrypoint, is refused as `no-twin` before a twin is
  looked for.
- **Newly matching** is `planner.ts`'s `matchingIds` before and after,
  exported for it.
- **The contexts** are probed with `emitsFor`, over the installed
  verticals and `bounded-context`, each narrowed to the adapters that
  require the new entrypoint's tag, on the grown tags and what a
  linked sibling projects.
- **`rerendersOf`** names `agent-harness` wherever it is installed.
- **The words.** `ENTRYPOINTS` gains `word` (`cli`, `http`, `spa`), and
  `entrypointNamed` takes the word or the id.

The growth golden is `tests/domain/core/growth.golden.test.ts` with
`growth.golden.json`, 216 cells. They are every single-service preset
lacking a back entrypoint, on each dial setting `walkDials` reaches,
each again with the agent harness left out, times each back entrypoint
the scaffold lacks:

- **128 grow**, each with exactly one adapter newly matching, the other
  entrypoint's bootstrap. The 64 that add HTTP install `dev-env` and
  `observability`; the 64 that add the CLI install nothing. The 64
  with the harness re-render it.
- **64 are refused** as `keel.contexts-need-rewiring`: every setting
  with the peer context, both ways, with and without the harness.
  These are the 128 and 64 that R.2b's I10 starts from.
- **24 are refused** as `keel.uncoverable-entrypoint`: `web-components`,
  both words, on its six settings with and without the harness.

A refused cell records why as well as its code: `front-end` on the
24, and on the 64 the context, `guestbook` by `modules.peer-context`.

Each setting is a real run into the shipped in-memory `Tree` and
`ManifestStore` fakes, so the reading is of the manifest keel writes.
The suite takes about 6 s on its own; written to disk, it took 10 s.

The render guard, `growth-render.test.ts`, renders 72 cells: the 18
single-entrypoint backend presets on their opening build system,
under the basic layout, the modulith, the modulith with the peer
context, and the modulith after a real `keel add module orders`. What
renders otherwise is exactly what the text expected:

- the four family kits, on every cell but the added context's, where
  only `bounded-context` is rendered;
- each family's peer-context adapter, on every peer cell;
- each family's context adapter, on every added-context cell.

Nothing else differs. With the refusal switched off, the guard failed
naming the 36 peer and added-context cells. With the skeleton counted
as a context, it failed naming 36 others, the 18 plain moduliths and
the 18 with the peer, whose `modules.context` refusal no adapter
rendered there backs. It takes about 6.5 s on its own, on disk.
`growth.test.ts` holds each rule on a fixture family in 28 cases, and
`stack-wizard.test.ts` holds the words. Mutation testing leaves out
both suites that run in a `beforeAll`, as it does the shared-file
golden. `tests/AGENTS.md`, `src/domain/core/AGENTS.md` and
`docs/development.md` record the golden and the guard. The greenfield,
brownfield, composite and planner-readiness goldens and the docs
matrix regenerate byte-identical, and the known files stay as they
were. No template changed, so no e2e suite was run. The reading has no
caller yet, so it has no CHANGELOG entry.

Beyond the text above:

- **The gate's first answers too.** `growthOf` takes the word and also
  answers the two gates before its refusals: a word naming no
  entrypoint, and one the project has already. The command, its
  preview, the status and the refusal builder then read one function
  for all of them. R.2b's handler keeps the scope and generation gates.
- **The harness is a dial.** The text installs the twin's verticals
  minus the installed ones. On a project scaffolded with
  `--no-agent-harness` that list includes `agent-harness`, which the
  twin on those dials would not have. `verticals` now leaves the
  harness out wherever the project has none, and the golden's cells
  without the harness hold it.
- **The twin is the preset on the project's dials.** The text checks
  that the twin's own tags are a subset of the grown set. A preset
  keeps its dials, the build system and the module layout, out of its
  own tags, so that check never saw them. A plugin family whose CLI
  offers a build system or layout that its CLI + HTTP preset does not
  would have grown into a preset `keel new` refuses on those dials. A
  candidate now counts only if one setting of its build system and
  module layout that its rules admit seeds only tags the grown project
  carries, and every tag of the grown project's identity. The peer
  context's marker must be on a setting that offers the peer. Where
  the project has no harness, the candidate must be one that
  `keel new --no-agent-harness` accepts. The same rule refuses a twin
  lacking a tag the project carries, as the text's refuses one
  carrying a tag it lacks. Every shipped trio has the same dials, so
  no cell moved; `growth.test.ts` holds each clause.
- **A front end** is the entrypoint `spa`, or a project whose shape
  the drill-down reads as anything but a backend.
- **An adapter that would stop matching** is refused as
  `keel.uncoverable-entrypoint`, naming the adapters. None does on a
  shipped cell.
- **Which marker a context is probed by.** The text probes
  `modules.context` once for each module recorded after the skeleton.
  The peer is recorded after the skeleton too, so it would have been
  probed under both markers. It is now probed only under
  `modules.peer-context`: the peer is the module recorded without a
  seam while that marker is on. A manifest carrying the marker with no
  such record names `guestbook`. The probe reads the registry's
  `bounded-context`, or keel's own where the registry lists none, as
  the shipped one does not, the way the harness retrofit does.
  `growth.test.ts` holds that an adapter of a listed `bounded-context`
  lifts the refusal. Keel's own has no adapter that could yet, so
  nothing holds that fallback until R.3a's module-history axis of I10
  reaches it.
- **A refused cell says why.** The text records the refusal code. A
  cell also records the reason, the adapters a drop names, or the
  contexts, which R.2b's sentence is to be worded from, so a reading
  whose reason moves moves a cell rather than only `growth.test.ts`.
- **Peer links.** Growth reads the tags a `keel link`ed sibling
  projects, before and after, as the planner does; `growth.test.ts`
  holds it. What the grown project's new `projects` mean for that
  sibling, which never received them, is R.2b's to settle. R.2b
  settled it with a note naming the `keel link` to run again.
- **The guard's exemptions are read, not listed.** "A family kit" is
  an adapter of a vertical growth re-renders (`rerendersOf`). "One the
  refusal refuses" is an adapter requiring a refused context's marker.
  The guard also checks the converse: each refused context, and each
  re-rendered vertical, rests on an adapter that renders otherwise.
  Each patch is compared by what it makes of the scaffold's file (or
  of its seed), and every other declaration as data.

Not done here: every caller, which R.2b and R.2c add.

#### R.2b — `keel add entrypoint <cli|http>` (L) ✅

**Contract.**

- `AddEntrypointCommand` (`keel.add-entrypoint`, with `cwd`,
  `entrypoint`, `answers`, `interactive`, `dryRun`) and its factory.
- `AddEntrypointTarget`, added to `InstallTarget` and
  `InstallCommand`.
- Its case in `installCommandFor`. That switch has no default, so every
  switch over targets fails to compile until it handles the new kind.
- `InstallReport.subject` documented for it: `entrypoint http`.

**The handler** is `handlers/add-entrypoint.ts`, a sibling of
`add-module.ts` rather than a case of `keel.add-vertical`. It changes
an identity tag, and no vertical may promote one
(`assertDeclaredPromotions`). It runs in six stages:

1. **Gates**, checked before a file moves:
   - not a keel project;
   - a product root or a product's service: `keel.wrong-scope`, with
     a sentence naming U;
   - `harnessGenerationRefusal`, asked as `keel add module` asks it;
   - an unknown word: `keel.unknown-entrypoint`, naming `cli` and
     `http`;
   - the entrypoint is already there: Ok, adds nothing, and carries a
     note (D4);
   - then `growthOf`'s refusals:
     - no twin, or a front-end entrypoint or project:
       `keel.uncoverable-entrypoint`;
     - contexts that would need rewiring: `keel.contexts-need-rewiring`,
       naming the contexts and never a tag (I6).
2. **The grown manifest.** The tags and `projects` from `growthOf` are
   folded in before anything resolves, the way `add-module.ts` folds
   `CONTEXT_TAG`.
3. **One `installVerticals` run**, in the twin preset's order:
   - **`walking-skeleton`, newly matching adapters only.** A new
     `InstallVerticalInputs.only` takes a set of adapter ids. The
     vertical still resolves as a whole, so `after` still orders the
     adapters that run; the rest are neither contributed nor recorded.
     This runs in the `install` posture, so a file that is already
     there is refused with `keel.path-conflict`, and the existing
     entrypoint's files are never read, let alone written.
   - **`agent-harness`, re-rendered** (`rerender`) wherever it is
     installed.
   - **`dev-env` and `observability`, installed.** They are closed
     through `admit`, which adds nothing on a shipped cell but keeps D1
     for a plugin's prerequisites. They run in the twin's order, not in
     `admit`'s id order.
   - **No `dev-container` re-render.** R.1b took DR2's first option:
     where growth installs dev-env, its in-place upgrade, on the grown
     tags, writes the twin's `devcontainer.json`. A dev environment
     installed earlier as an extra keeps the shape its upgrade wrote
     (R.2a).

   After the run come `retrofitHarness` for everything that did not
   run, one `finalizeHarness`, and the generation restamp, as
   `add-vertical.ts` does whenever the harness runs. `walking-skeleton`
   contributes no harness element, so its partial run loses nothing
   from the buffer; a guard asserts this. A project scaffolded with
   `--no-agent-harness` re-renders nothing and retrofits nothing.

4. **Settling actions (DR5).** `installVertical` gains an `actionsOnly`
   posture, the sibling of `harnessOnly`: contribute, keep the
   `actions`, and apply and record nothing. It replays the adapters of
   `walking-skeleton` and `code-style` that already matched. The grown
   project then queues what its twin queues, minus `vcs`'s actions:
   - JVM: `gradle wrapper` and `./gradlew spotlessApply`;
   - TypeScript: `pnpm install`;
   - Go: `go mod tidy`;
   - Rust: `cargo check`;
   - plus the observability fetch the Go and TypeScript adapters
     already queue.
5. **Recording at rank (DR4).**
   - New `verticals` rows go before the first recorded vertical that
     the twin lists later. `retrofitHarness` replays verticals in
     recorded order.
   - New `answers` keys go before the first key of an adapter that
     resolves later.
   - Nothing already recorded moves.
6. **Answers, notes and reports.**
   - Supplied answers are held as `keel add` holds them.
   - The bootstrap's identity answers are its recorded sibling's
     (`sharesAnswersWith`), so a `--set` for one is refused with
     `keel.frozen-answer`.
   - The only question growth asks is the monitoring stack
     (`observability/monitoring-compose`, `stack`, default `granular`).
   - The report carries the admission notes, the `diffs` of what
     re-rendered, and `refreshProposals` as today. On a project with a
     release that includes `--refresh distribution`, which
     changes nothing; D12 accepts that noise.

**Also in this step:**

- `attachDevContainerToDevEnv`'s drift `Error` becomes a
  `path-conflict` refusal of `.devcontainer/devcontainer.json`.
- **A linked project.** Adding HTTP gives the project the twin's
  `projects` (`peer.api.rest`), which a sibling it was `keel link`ed
  to never received: that sibling's `peers` row still records what the
  project projected before. The handler settles which it does, and a
  handler test holds it: re-project onto the sibling as `keel link`
  does, refuse, or note that `keel link` is to be run again (R.2a).
- **CLI:** `ENTRYPOINT_TARGET` sits beside `MODULE_TARGET` in
  `program.ts`. It takes exactly one argument and refuses `--reapply`,
  `--refresh` and `--consumes`. The help text and the missing-target
  error name the third form. The registry refuses a vertical id of
  `module` or `entrypoint`, which the CLI would otherwise shadow.
- **Preview and web API:** `keel.preview` takes the new target, and the
  web API's `targetSchema` and `narrow` accept it.
- **Docs:** `docs/cli.md` gets `## keel add entrypoint`, and
  `docs/composition.md` is updated. CHANGELOG, under _Added_.

**The grid: I10**, hard from this commit (DR8). A fourth suite,
`composition-grid/growth.test.ts`, covers:

- every single-entrypoint backend cell from `keel.catalog.finder`:
  Go, Rust, TypeScript, and Quarkus, Spring and Micronaut in Java and
  Kotlin, in both directions;
- × every dial setting from `keel.dials`: build system, layout, peer
  context under the modulith, and the harness on or off;
- with no extras: 192 cells, 96 each way.

**How a cell is checked.** Each cell scaffolds X and runs `keel add
entrypoint e` for real; a preview reports no manifest. It then
compares against `keel new` of the twin on the same dials:

- every file, byte for byte, including `.claude/.keel-manifest.json`
  (the pinned clock makes timestamps equal);
- the descriptions of the queued actions, minus `vcs`'s;
- I9 (`holdParity`).

`growth.golden.json`'s 192 backend cells are I10's: the 128 that grow,
which I10 holds `ok`, and the 64 refused with
`keel.contexts-need-rewiring`. Its 24 `web-components` cells stay
refused as a front end.

**Handler tests** (`add-entrypoint.test.ts`) cover:

- a user-edited `Main` is untouched;
- a pre-existing `application/rest/` is refused with `keel.path-conflict`
  and nothing is written;
- each refusal's code and sentence;
- interactive mode asks only for the monitoring stack;
- the generation gate;
- the product refusals.

**J's rule, by proof.** A grown cell whose bytes equal its twin's is
the twin's cell, so R adds no e2e suite. The proof carries only the
coverage the twin already has:

- **Covered at R.2b:** the seven basic combo suites (`combo-basic-*`:
  six JVM, plus `ts-cli-http` on pnpm).
- **Covered after R.3c and R.3d:** the fourteen modulith combo suites.
  All of them scaffold with the peer context
  (`jvm-combo-e2e.ts` passes `withPeerContext: true` under the
  modulith), so their grown cells are refused until then.
- **No suite today:** the six other JVM basic combos, `ts-cli-http`
  basic on npm, `go-cli-http` and `rust-cli-http` on both layouts, and
  every modulith without the peer. Growth leaves them exactly as
  covered as `keel new` does.

On disk, parity also rests on step 4 queueing the twin's actions.

**Holds green:** every existing golden. `pnpm test:e2e` is untouched.

**Leaves out:** the refusal's action and the page (R.2c).

**Landed as the command, and I10 hard.** No committed golden moved.

- **The contract.** `AddEntrypointCommand` (`keel.add-entrypoint`) and
  `addEntrypointCommand`, `AddEntrypointTarget` in `InstallTarget`, the
  command in `InstallCommand`, and its case in `installCommandFor`.
  `InstallReport.subject` reads `entrypoint http`.
- **The handler**, `handlers/add-entrypoint.ts`, wired in `main.ts` and
  the test factory, and run by `keel.preview`. It reads `growthOf` and
  derives nothing growth answers:
  - **Gates.** No manifest is `keel.not-initialised`, worded as `keel
add` words it — inside a monorepo product it names the services and
    says why each refuses the command too (`serviceScoped`,
    `refusedAt`), as `keel add module` does at a product root, and
    below a project growth refuses it gives growth's sentence. A
    product root, or a service of a monorepo product, is
    `keel.wrong-scope`. The harness generation is asked after it, as
    `keel add module` asks it, since the scope refuses in every
    generation; on a project with no marker its refusal names no keel
    to pin (`harnessGenerationRefusal`'s `pinnable`), since the marker
    and this command arrive in one release. Then growth's own answers:
    an unknown word, the
    entrypoint already there (Ok, a note, nothing staged, the manifest
    not written, and every supplied answer refused, as `keel add`
    refuses one with nothing to run), and its refusals.
  - **The run.** The grown tags and the twin's `projects` are folded
    into the manifest first. Then one `installVerticals` run, in the
    twin's order: the project's verticals keep their recorded order,
    and each vertical the twin names that the project lacks goes before
    the first recorded one the twin lists later. `walking-skeleton`
    installs only what newly matches (`only`); `agent-harness`
    re-renders; `dev-env` and `observability` install, closed through
    `admit` (a prerequisite `admit` adds goes before what needs it).
    `retrofitHarness` replays what did not run, one `finalizeHarness`
    realizes the buffer, and the generation is restamped where the
    harness ran. The retrofit takes the command line to re-run, so a
    recorded vertical no loaded plugin provides any more refuses the
    command and its preview naming `keel add entrypoint <word>`, not
    `keel add agent-harness`.
  - **Settling (DR5).** Every other vertical of the twin, except one
    placed at a repository root, replays in its place for its deferred
    actions alone (`actionsOnly`). The grown project queues the twin's
    actions in the twin's order, less `vcs`'s: `gradle wrapper` and
    `./gradlew spotlessApply`, `go mod tidy` and the OpenTelemetry
    fetch, `pnpm install` or `npm install` twice, `cargo check`.
  - **Recording at rank (DR4).** A new `verticals` row goes before the
    first recorded one the twin lists later; a new `answers` key goes
    before the first key of an adapter that resolves later, reading
    the grown project's verticals in that order and each one's adapters
    as they resolve on the grown tags; a new harness entry goes before
    the first recorded one the harness, realized in that order, realizes
    later. Nothing recorded moves.
  - **The report** carries the admission notes, the refresh proposals
    as `keel add` makes them, and the diffs of every modified file
    wherever the harness re-rendered, as `keel add --refresh` shows
    them. `workingTreeDiffs` moved from `add-vertical.ts` to `diff.ts`,
    which both handlers now call.
- **`install.ts`.** `InstallVerticalInputs` gains `only` and
  `actionsOnly`, and `installVerticals` takes both per vertical. An
  adapter outside `only` is neither applied nor recorded, and does not
  appear in the result's `adapters`. It is still contributed, from
  what the manifest records and asking nothing: its harness elements
  go into the buffer, re-rendered, and its actions are kept in their
  place under `actionsOnly`. A vertical that installs none of its
  adapters this way is not recorded again. `finalizeHarness` also
  returns the order it realized the harness in (`realized`), in which
  `realizeHarness` counts a directory's `CLAUDE.md` pointer it kept
  where it would have written it.
- **The words**, in `refusals.ts`:
  - `unknownEntrypointSentence` names the words the command takes;
  - `uncoverableEntrypointSentence` covers a front end, no twin, and
    verticals part of which would stop applying, named by title;
  - `incompatibleEntrypointSentence` gives each rule the entrypoint
    would break in its own sentence and under its id, as
    `brokenRulesRefusal` gives a vertical's;
  - `contextsNeedRewiringSentence` names the contexts, quoted;
  - `entrypointScopeSentence` covers a product root and a service,
    and `ENTRYPOINT_IN_PRODUCT_REASON` is its reason, which the
    not-initialised sentence gives too;
  - `entrypointPresentNote` and `relinkNote`;
  - `reapplyConflictSentence`, the `keel.reapply-conflict` sentence
    `add-vertical.ts` built inline, now worded here for both handlers
    and unchanged;
  - `missingHarnessContributorSentence`, the
    `keel.missing-harness-contributor` sentence `harness-retrofit.ts`
    built inline, now worded here around the command line to re-run —
    `keel add agent-harness` and `keel docs sync` as before, the growth
    command's own for growth.

  None prints a tag. The handler's exported `growthRefusalError` maps
  a `GrowthRefusal` onto them under its code.

- **The drift refusal.** `attachDevContainerToDevEnv` takes the
  patching adapter's id and throws a `PathConflictError` for
  `.devcontainer/devcontainer.json`, where it threw a plain `Error`.
  `PathConflictRefusal` gains `manual`, what keel leaves to the user
  rather than rewrite their change, and `pathSentence` words it: the
  file changed since keel scaffolded it, and attaching it to the dev
  environment is the user's to do, then re-run. `keel add dev-env`
  over a customized definition is refused before anything is written,
  where the terminal printed the recipe and the page answered
  `keel.internal`. `docs/verticals/dev-container.md` keeps the recipe.
  CHANGELOG, under _Fixed_.
- **The CLI.** `ENTRYPOINT_TARGET` sits beside `MODULE_TARGET`. It
  takes exactly one word and refuses `--reapply`, `--refresh` and
  `--consumes` before dispatching. The help text and the missing-target
  error name the third form.
- **The registry.** `RESERVED_VERTICAL_IDS` (`module`, `entrypoint`)
  refuses either as a vertical id, naming the plugin. CHANGELOG, under
  _Changed_: such a plugin vertical could be installed by `keel new
--with`, never by `keel add`.
- **The web API.** `targetSchema` and `narrow` accept
  `{ "kind": "add-entrypoint", "entrypoint": "http" }`. The page does
  not offer it yet (R.2c).

**I10.** `composition-grid/growth.test.ts` is the grid's fourth axis.
Its cells come from the finder's single-entrypoint backend
combinations, each paired with the combination carrying both, on every
setting `harnessSettings` walks. That walk, and `newCommandLine`,
moved from `growth.golden.test.ts` into `support/dial-walk.ts`, so the
growth golden and the grid key their cells alike. Each cell scaffolds
the preset and holds `keel add entrypoint` to I9 on it: its preview
and a dry-run install, over no answers and over the monitoring stack
answered away from its default. It then grows it for real and holds
the grown tree to `keel new` of the twin on the same dials: every
file's sha256, the manifest's among them, and the descriptions of the
deferred actions, which the grid's runner now records per directory
(`Grid.queued`), less version control's — read off `vcs` itself, not
the handler's rule of what settles, so a wrong rule shows. A cell
that is refused must be refused under the code
`growth.golden.json` records for it. `INVARIANTS` and `HARD` gain I10,
and `holdParity` takes the project's directory for a target that adds
to one.

- **Cells.** 192: 128 `ok` and 64 `keel.contexts-need-rewiring`, each
  the cell R.2a's golden reads. With them come 512 I9 cells. The new
  `composition-grid/growth.golden.json` holds all 704 verdicts.
  `growth.known.json` is `{}`, because `sweepGrid` reads each axis's
  known file, whatever it holds. The other known files stay as they
  were.
- **Timing.** The axis takes about 21 s on its own and 27 s beside the
  other three. The grid takes about 30 s wall (it was about 25 s). In
  two full CI-mode runs the axis took 33 s and 28 s, and the runs 139 s
  and 131 s, against R.2a's 128 s. That is under the research's
  estimate of about 35 s, so it stays in `verify` whole: 256 real
  scaffolds (the 192 cells, and 64 twins, one per setting, which both
  directions share), 192 real adds and 512 dry-run dispatches.
- **It catches what it is for.** With recording at rank switched off,
  I10 failed on 120 of the 128; with the settling replay switched off,
  on all 128.

The greenfield, brownfield, composite and planner-readiness goldens,
the docs matrix, `growth.golden.json` and `shared-files.golden.json`
regenerate byte-identical. The keel ui browser suites (`ui-compose`,
`ui-refusal`, `ui-stack-finder`, `ui-plugin-stack`) pass: 43 tests,
with the target schema changed.

**The tests.**

- `handlers/add-entrypoint.test.ts` has 32 cases:
  - an edited Quarkus `Main` is untouched, with the grown manifest's
    order and the queued actions;
  - HTTP to CLI, and the finder's `server-http` taken as the word;
  - a user's `application/rest/executable/build.gradle.kts` is
    `keel.path-conflict`, with the manifest, README, tree and actions
    untouched;
  - interactive mode asks only `observability/monitoring-compose`'s
    `stack`;
  - `quarkus-rest` with a native image and distribution, grown the CLI
    at a terminal, is asked only the native release's `targets`,
    creates its two workflows, and equals `quarkus-cli-rest` with the
    same extras and answer byte for byte;
  - a dry run writes nothing, and a `--no-agent-harness` growth
    reports no diffs;
  - an extra the project took (persistence on `go-http`) queues
    nothing again (DR5);
  - an identity answer supplied for the new bootstrap is
    `keel.frozen-answer` unless it agrees, and one that agrees is
    taken at a terminal, which asks only `stack`; one for the
    bootstrap already there is `keel.frozen-answer` whatever it says,
    and at a terminal before a question is asked, as a stray key is
    `keel.unknown-answer`; one for observability, which growing an
    HTTP project settles and never re-renders, is `keel.frozen-answer`
    in either mode;
  - Distribution's refresh proposed on `quarkus-cli --with
distribution`, naming `keel add distribution --reapply`, dry run or
    not;
  - on a plugin family (`acme`: CLI, HTTP and both presets; notes
    before a base observability needs, listed before it, and a runbook
    after both whose skill names the entrypoints; the CLI's layer doc
    speaks of the server, and observability ships a skill and a layer
    doc): the grown tree equals the twin's byte for byte, the
    runbook's skill rendered on the grown tags by the retrofit, the
    CLI's doc by the replay of what `only` left out, the new harness
    entries recorded where the twin records them, and the queue in the
    twin's order, what the project lacks before the runbook; an answer
    for observability, which needs what the base promotes, is taken at
    a terminal; its harness kit's recorded answer is
    `keel.reapply-frozen-answers` before a question is asked;
  - an entrypoint already there is an Ok with its note, committed but
    under a dry run, and every answer supplied for it is refused in
    either mode, as its preview reports it;
  - the linked-project note, and none where `projects` did not change;
  - each refusal's code and sentence: no project, below a monorepo
    product's root and below its service, below a modulith with the
    peer context, a polyrepo product's directory (pointing at its
    services, the back end growing), a monorepo product's root and
    service — again under an older generation, the same sentences —
    the generation (the whole sentence, naming no pin, before growth's
    own answers), an unknown word, `spa`, a front end, a plugin
    vertical's rule (`keel.incompatible`, as `keel new` of the twin
    with it is), a recorded plugin vertical no longer loaded
    (`keel.missing-harness-contributor`, naming this command, the
    preview alike), and the peer context. The polyrepo service grows.
  - `growthRefusalError` words the `no-twin`, `drops` and
    `keel.incompatible` refusals, which no shipped cell reaches,
    naming no tag.
- `install-verticals.test.ts` adds four cases: part of a vertical,
  in resolution order; the rest replayed for actions alone, reading no
  supplied answer; a vertical replayed whole, from its recorded
  answers, and not recorded again; the harness elements of an adapter
  left out replayed into the buffer, re-rendered.
- `registry.test.ts` adds two, `add.test.ts` eight (the third form
  read in the help too), `api.test.ts` two, `refusals.test.ts` four,
  `growth.test.ts`, `supplied-answers.test.ts`, `hint.test.ts` and
  `harness-generation.test.ts` (no pin, as a project and at a product
  root) one each, and `dev-container.test.ts` two: the
  refusal's data and sentence, and `keel add dev-env` over a
  customized definition refused on the `Err` rail.

**The proof on disk.** One cell per family was grown on disk with its
real deferred actions, then built and driven as its twin's combo suite
drives it:

- **Go.** `go-cli` grew HTTP and `go-http` grew the CLI. Each ran `go
mod tidy` twice, then `go vet`, `go test` and `go build`. The CLI
  greeted, and the HTTP unit served the whole `/greet` contract:
  health probes and the correlation id included.
- **TypeScript.** `ts-cli` on pnpm grew HTTP and ran `pnpm install`
  twice. `pnpm run typecheck` and `pnpm test` passed, the CLI greeted,
  and the REST server answered 200 and a 400 problem.
- **Rust.** `rust-cli` grew HTTP, and `cargo check` compiled the HTTP
  unit (16 s). `cargo test` passed, the CLI greeted, and the HTTP unit
  answered `/greet`.
- **The JVM.** `quarkus-cli` on Gradle grew HTTP. `keel new` and the
  growth each ran their `gradle wrapper` and `./gradlew spotlessApply`
  for real, with the host Gradle taken from the 9.7.0 wrapper
  distribution: the image's own 8.14.3 cannot start on JDK 25
  (`.github/AGENTS.md`). `./gradlew build` failed four times on Maven
  Central's 429s while resolving Quarkus, and passed on the fifth
  try. Every module compiled, `spotlessCheck` was up to date, and the
  ten generated tests passed: the CLI's one, REST's seven, the
  domain's two. The CLI jar greeted, and the REST jar served `/greet`
  and both health probes. The jars ran under `JAVA_HOME` set to JDK
  25; the image's `JAVA_HOME` points at 21.

Covered by e2e as the step's text says: the seven basic combo suites
are the twins of their grown cells. No suite was added, and `pnpm
test:e2e` is untouched.

A probe beyond I10: ten presets with every extra their menu offers
(`quarkus-cli`, `quarkus-rest`, `spring-cli`, `micronaut-rest`, and
Go, TypeScript and Rust both ways) all grew. Each newly matched only
the other bootstrap on default answers. `quarkus-cli`, which carries a
release, got Distribution's refresh proposed, as the text expects.
Answered otherwise, one more adapter newly matches: over all eighteen
single-entrypoint backend presets with every extra, on Gradle and
Maven, with the JVM and the native image, `quarkus-rest` and
`quarkus-rest-kotlin` on Gradle with the native image newly match
`distribution/quarkus-cli-native` when grown the CLI, and nothing
else does.

`docs/cli.md` gets `## keel add entrypoint`, `docs/composition.md`
gets _Growing an entrypoint_, and `docs/ui.md` the target. The
reserved ids and a plugin family's growth go in `docs/plugins.md`, and
the README gets its line. `tests/AGENTS.md`, `tests/e2e/AGENTS.md`,
`docs/development.md`, `src/domain/core/AGENTS.md`,
`src/domain/contract/AGENTS.md` and `src/application/cli/AGENTS.md`
say what changed, and `docs/verticals/agent-harness.md` that growing
re-renders the harness. CHANGELOG, under _Added_, _Changed_ and
_Fixed_.

Beyond the text above:

- **What settles.** The text replays `walking-skeleton` and
  `code-style`. The handler replays every vertical of the twin that
  was installed before and is not placed at a repository root, which
  is `vcs`'s placement. On every shipped twin those two are the ones
  with actions, so the queue is the same. A plugin twin whose other
  verticals queue actions gets them too; an extra the project took is
  no vertical of the twin, and queues nothing again (DR5).
- **What `only` leaves out is replayed, not guarded.** The text
  leaves an adapter outside `only` neither contributed nor recorded,
  and a guard asserting that `walking-skeleton` loses nothing from the
  buffer. The adapter is still contributed, and its harness elements
  go into the buffer re-rendered, as the retrofit would put them: the
  vertical counts as run, so no retrofit reaches it. A plugin vertical
  whose adapter that matched before ships a skill or a layer doc then
  grows into its twin, where a guard threw off the `Err` rail — the
  command, its dry run and the preview alike, while `growthOf` read
  the cell as growing. No shipped adapter declares one.
- **Harness entries at rank too.** The text ranks `verticals` and
  `answers`. A vertical growth installs may declare a harness element
  — none shipped does, a plugin's may — whose entry was appended after
  every recorded one, where `keel new` of the twin records it among
  them. The handler now realizes the harness buffer in the twin's
  order, the retrofit's contributions among the run's, and places a
  new entry before the first recorded one that realization puts
  later. `finalizeHarness` returns that order; a directory's
  `CLAUDE.md` pointer the pass kept counts where it would have been
  written. No shipped cell moved.
- **A polyrepo service grows.** The text refuses a product's service.
  A monorepo service is refused: its product root records it by
  preset. A polyrepo service has no product root, and nothing records
  it (`scopeOf` reads no product around it), so it grows as a
  repository of its own, and a handler test holds it.
- **Where no project is, the refusal says why the ones it names
  refuse too.** `keel add module` asks each project the
  not-initialised sentence names whether it takes a context. This
  command asks whether it is in a monorepo product and, failing that,
  growth's own refusal of it, so a directory below a modulith with the
  peer context is told why that project refuses the command rather
  than sent there. Growth's sentences open with an entrypoint's label
  or the word, so they go on from that sentence as they are.
- **A linked project is told, not written (R.2a's open question).**
  The sibling's manifest is left as it was. The report names the
  `keel link` that brings its record up to date, and only where
  `projects` changed: adding HTTP to a CLI, never the CLI to an HTTP
  project. `keel link` upserts by ref, so running it again is the
  whole remedy. Re-projecting from here would write another project's
  manifest, which a dry run and the preview must never do.
- **Refresh proposals point at a later run.** `refreshProposalNote`
  offers `--refresh` in the same run on a dry run, which this command
  refuses. Its notes always name `keel add <id> --reapply`.
- **The planner closes nothing on a real twin.** The run is closed
  through `admit`, as the text says, but `keel new` of a preset
  refuses a vertical listed without its prerequisite, or before it
  (measured on the `acme` family: _Acme obs needs what Acme base adds_),
  so every prerequisite of what the project lacks is itself a vertical
  the twin lists first, or one the project has. The admission notes,
  and a prerequisite `admit` adds placed before what needs it, are
  reached by no twin `keel new` accepts; the rest of the run's order
  is held by the `acme` handler test.
- **Answers are held as `keel add` holds them.** A re-rendered
  harness's recorded answer is refused before the run, whatever the
  mode, and a stray key is refused at a terminal — read against the
  newly matching adapters and the verticals installed or re-rendered
  whole, together, as `keel add` reads its order, so an answer for
  one needing what another of them promotes is taken. The rest are
  refused once the run is staged, exactly. An answer for the
  bootstrap already there is `keel.frozen-answer`, as `keel add`
  gives it: `supplied-answers.ts` reads an answer as one a re-render
  freezes (`keel.reapply-frozen-answers`) only where its own adapter
  runs, not wherever another adapter of its vertical does. Where the
  entrypoint is there already nothing will run, so every answer is
  refused, whatever the mode, as `keel add` refuses one where
  everything it names is installed and as the preview reports it
  (I9); the grid grows no preset toward the entrypoint it has, so the
  handler test holds it.
- **A rule the entrypoint breaks is refused.** The text names three
  refusals. A vertical the project has may declare a rule the
  entrypoint's tag breaks — no shipped rule mentions one, a plugin's
  may — and `installVerticals` counts a rule the grown manifest breaks
  already as standing, so the run did not see it. `growthOf` reads it
  before anything runs, as `keel.incompatible` (`rules`), which
  `keel new` of the twin with that vertical is refused under too; no
  shipped cell moves.
- **What the command writes of the existing entrypoint.** Nothing: it
  never reads its files. On the JVM the queued formatter
  (`./gradlew spotlessApply`, or `./mvnw spotless:apply` on Maven)
  then formats the whole project, the existing entrypoint's sources
  included, as the pre-commit hook would; the docs say so rather than
  claim the files untouched.
- **Where the refusal is worded.** `growthRefusalError` lives in the
  handler and takes the registry, so a vertical is named by its title.
  `refusals.ts` cannot import `growth.ts`'s types: dependency-cruiser
  counts type imports, and `growth.ts` reaches `refusals.ts` through
  the planner. R.2c's status can import it from there.
- **No command in a refusal.** The `no-twin` sentence says "no stack
  keel offers is this project with it as well", and names no `keel
new`. The drift refusal has a sentence of its own
  (`PathConflictRefusal.manual`): the generic anchor sentence would
  have told the user to add keel's `"image"` line back, which the
  attach replaces, leaving theirs beside the compose fields, ignored.
  The recipe the old message spelled is in the docs.
- **An extra's part can come with the entrypoint.** The text has
  growth ask only the monitoring stack. On a project that took extras,
  an adapter of an extra may newly match on the grown tags, and it
  installs through `only` as the bootstrap does: a Quarkus REST
  project on Gradle with a native image and distribution, grown the
  CLI, gains `distribution/quarkus-cli-native`'s two release workflows
  and is asked their `targets`, as `keel new` of the twin with those
  extras asks them, and the grown tree equals that twin's. The docs
  and the CHANGELOG say so, and a handler test holds it.
- **The generation refusal names no pin it cannot keep.** The text
  asks the generation as `keel add module` does, whose refusal ends
  _"— or pin keel@…"_, the keel that scaffolded the project. No keel
  that writes no marker has this command, the two arriving in one
  release, so on an unmarked project that pin is a dead end and the
  refusal leaves it out. Once the generation moves on, a project
  stamped with an older one is named its pin again, since the keel
  that stamped it has the command.
- **A missing plugin names this command to re-run.** Where the
  project records a vertical no loaded plugin provides any more, the
  harness retrofit refuses (`keel.missing-harness-contributor`), and
  its sentence named `keel add agent-harness`, which is installed
  already here. `retrofitHarness` now takes the command line of the
  run that replays, and the sentence moved into `refusals.ts`.

Not done here: the refusal's action, the status field and the page
(R.2c) — and with them the hint's closing _a project's entrypoints are
fixed at 'keel new'_ (`hint.ts`) and `missing.entrypoint`'s doc in
`refusal.ts`, which this command makes untrue and R.2c rewords.
`ReadinessGap`'s own doc in `queries.ts`, which said the same, now
says `keel add entrypoint` adds a back one. The byte identity of a
project that took extras is not I10's; a CLI project with dev-env as
an extra keeps its definition's shape, its README's order and its
manifest's rows as that extra left them, which `docs/cli.md` says.

#### R.2c — The refusal carries the action (M) ✅

**The field.** `UnavailableRefusal` gains
`grow?: { entrypoint: string; comes: boolean }`:

- `entrypoint` is the word for the entrypoint that would admit the
  vertical;
- `comes` says whether the vertical comes with it: `true` for
  observability; `false` for persistence and containerization, which
  read `ready` once the entrypoint is there (measured on `quarkus-cli`).

The planner answers it with a what-if `readiness` over `growthOf`'s
scope, and only when the gap is entrypoint-only, or entrypoint plus
peer. The refusal's sentence does not change, so I5 and I6 do not
move.

**Why the gap is not made acquirable.** Doing so would drop the HTTP
server from every REST project's profile (`profile.ts` filters
acquirable tags), re-rank the nearest-stack gap, plan an entrypoint
into `keel new --with persistence`, and break I5.

**The CLI.** `hint.ts`'s `add` branch reads the field:

- _'keel add entrypoint http' brings Observability with it_;
- _'keel add entrypoint http', then 'keel add persistence'_;
- _'keel add entrypoint http', then 'keel link <path>'_ for gateway on
  a CLI, which gets no hint today.

`refusal.ts`'s `missing.entrypoint` doc ("fixed at `keel new`")
changes to match. `keel add --list` moves these cards from _Not for
this project:_ to _After 'keel add entrypoint http':_.

**Project status.** `ProjectStatus` gains `entrypoints`, shaped like
`canAddModule` and `moduleRefusal`: each back entrypoint with its
label, whether it is present, and `growthOf`'s refusal sentence when it
cannot be added.

**The page** never reads a tag:

- `readiness.js` and `additions.js` put a card with `grow` in a group
  of its own, with the action;
- the Project step's _Adapters_ line offers the missing back
  entrypoint;
- `command.js` spells `keel add entrypoint http`;
- `<keel-add-form>` and `<keel-app>` preview and review it the way they
  do a module.

**Grid.** I4 holds each card against its add as it does today. The
codes and sentences are unchanged, so the brownfield golden and the
docs matrix regenerate byte-identical.

**Tests:** `hint.test.ts`, `add.test.ts` (its "fixed at 'keel new'"
literals), `refusals.test.ts`, `additions.test.ts`, `project.test.ts`,
and a browser case in an existing `ui-*` suite.

**Docs:** `docs/cli.md`'s refusal section and `docs/ui.md`. CHANGELOG,
under _Changed_.

**Leaves out:** greenfield. There, an entrypoint gap still means
choosing the nearest preset.

**Landed as data on the refusal, and no golden moved.** The sentence
and the code of every refusal are as they were; the action travels
beside them.

- **The field.** `UnavailableRefusal.grow` is a `GrowAction`,
  `{ entrypoint, comes }`, in `refusal.ts`, and `ReadinessGap.grow`
  carries the same from the planner; `unavailableRefusal` copies it
  across and words nothing new. `missing.entrypoint`'s doc no longer
  says "fixed at `keel new`": `keel new` chooses the entrypoints, and
  `keel add entrypoint` adds a back one, which `grow` names where that
  lets the vertical in.
- **The planner's what-if.** `PlanScope.grown` lists, for each back
  entrypoint the project could grow, a `GrownScope`: the entrypoint's
  tag and the scope the grown project plans on. `gapOf` hands its gap
  to `growOf`, which acts only on a gap that is entrypoints, or
  entrypoints and a peer, with no identity tag and no rule. It reads
  the vertical again over the grown scope. `included` means it comes
  (`comes: true`); `ready` or `needs` means its own add installs it
  once the entrypoint is there (`false`); an `unavailable` whose gap is
  the link alone, where the gap named a peer already, means `false`
  too. Anything else offers no action.
- **Where the grown scope comes from.** `growth.ts`'s `grownScope`
  folds the grown tags and the twin's `projects` into the manifest,
  plans the verticals growth installs as the command admits them (the
  set by id, the re-rendered harness as if not there yet), and counts
  them installed, with what the planner closed them over. Its tags
  carry what the run promotes: the adapters that newly match, then
  what it installs, folded by the planner's new `tagsAfter` as a plan
  folds them (`seedFor` now reads it too), so a vertical such a tag
  feeds reads `ready` there, and one it excludes reads refused. It is
  null where the planner refuses what growth installs, as the command
  then does.
  `add-readiness.ts`'s `addScopeOf` builds the scope for `keel add`:
  `planScopeOf`, plus a grown scope for each back entrypoint the
  project lacks where `growthOf` grows. It builds none inside a
  monorepo product (`scope.ts`'s new `productPlaceOf`, which the
  handler's scope gate now reads too). The cards (`addReadiness`,
  which the status now calls with one scope for every card) and the
  add front door (`add-vertical.ts`) both plan on it, so a card and
  its click carry the same action.
- **The status.** `ProjectStatus.entrypoints` lists an
  `EntrypointStatus` per back entrypoint: its word, its finder label,
  whether the project has it, and, where it lacks it, what
  `keel add entrypoint` would install (`installs`), or the refusal
  where it would refuse. Both are the command's own reading, exported
  from the handler as `entrypointReading`: the scope, then growth's
  refusal (`growthRefusalError`), then the planner's refusal of what
  growth installs (`admitGrowth`, which the run's `planOf` now shares),
  or what the run installs, in its order (`incomingOf`, shared too). The
  field is optional, and absent where no project is, as
  `harnessGeneration` is.
- **The CLI.** `hint.ts`'s `add` branch reads `grow`:
  - _'keel add entrypoint http' brings observability with it_;
  - _'keel add entrypoint http', then 'keel add persistence'_;
  - _'keel add entrypoint http', then 'keel link <path>' a project it
    can wire, then 'keel add gateway'_ for the gateway on a CLI, which
    had no hint.

  Where there is no action, the old hint stays, less its closing
  clause: _go-cli-http carries both this project's entrypoints and
  persistence_. `keel add --list` prints the cards a `grow` names under
  _After 'keel add entrypoint http':_, each as its title — _which
  comes with it_ for observability, _once 'keel link <path>' links a
  project it can wire_ for the gateway, both `hint.ts`' `growNote` —
  and its description. On a CLI
  that can grow a server, only what growing would not let in is left
  under _Not for this project:_ — on the default scaffolds, distribution
  on a Quarkus CLI built with Maven, refused for its build system.

- **The page** reads no tag; of a refusal's `missing` it asks only
  whether a linked project is missing too, never which:
  - `readiness.js`: `growingOf` groups the cards whose refusal carries
    `grow` by entrypoint, and `refusedOf` leaves them out.
  - `additions.js`: the group's `grows`, each named by the status's
    label, with its command and, per card, _Comes with it._, _Added
    after it._, or _Added after it, once a linked project serves it._
  - `project.js`: `entrypointOffers` and `entrypointName` read the
    status's `entrypoints`, and `projectSummary` hangs the addable ones
    on the Adapters line.
  - `command.js` spells `keel add entrypoint http`.
  - `target.js` makes each entrypoint a subject of its own.
  - `<keel-add-form>` draws the _After adding HTTP server_ part with
    its **Add HTTP server** button, before _Installed_; an **Add an
    entrypoint** tab beside the bounded context's, disabled with its
    reason where the command would refuse; the entrypoint as a card,
    with what the run installs, what _Add verticals_ takes after it and
    what waits on a link too, in `additions.js`' `entrypointNotes`; and
    the Project step's **Add HTTP server**.
  - `<keel-app>` completes, hints and reviews it as it does a module
    (_Entrypoint HTTP server_).
  - `steps.js`' step docs say so.

**Grid.** Nothing moved. The greenfield, brownfield, composite and
growth grid goldens, the planner-readiness golden, R.2a's
`growth.golden.json` and the docs matrix regenerate byte-identical in
the order the grid reads them, and the known files are as they were.
I4 now holds each card to its add by its data as well as its code and
sentence (`holdCard`, over the refusal the preview came back with), so
every brownfield and composite card carries the action its click does,
and it passes. Either half losing the action fails it: a card without
it breaks I4 on 52 of brownfield's cells. Both losing it, as a change
to the scope they share would, I4 cannot see; `project-status.test.ts`
holds the action itself, on every CLI preset.

**The proof.** A probe held every card on every single-service preset,
on every dial setting with the harness on and off (300 cells), to its
add's refusal as data, the action included, and then grew each cell
whose cards carry an action and read the status again:

- 792 unavailable cards; 368 carry `grow`, all `http`, on the 64 CLI
  cells that can grow a server;
- observability comes with it on all 64; containerization, iac,
  persistence and the gateway are added after it on 64 each, the
  gateway waiting on a link too; distribution on 48. On the other 16,
  all Quarkus CLIs, distribution carries no action: on the 8 built
  with Gradle its native release is ready already, and on the 8 built
  with Maven it is refused for the build system, an identity gap, and
  is the one card those 8 cells leave under _Not for this project_;
- every card equals its add's refusal: code, sentence and data;
- once grown, every card that comes was installed, and every other
  was ready, needed a prerequisite, or, the gateway, lacked only its
  link — held since by `project-status.test.ts` on every CLI preset
  and build system, as `keel new` leaves it, without the agent harness
  and as a modulith, with what the status said the entrypoint installs
  against what it installed;
- the status offers a missing back entrypoint on 128 cells (64 each
  way) and refuses 88 on 76 cells: the one it lacks on each of the 64
  with the peer context, and both on each of `web-components`' 12. No
  card on those cells carries it.

**The tests.**

- `planner.test.ts` adds 10 cases on a fixture family: the word,
  comes, a prerequisite traced back to the server, a link as well, a
  rule the grown project breaks, with a link or without, a link the
  grown project lacks that the gap never named, no grown scope or
  another entrypoint's, an identity gap, a rule the project breaks
  already or a link alone — each over a grown scope that would take
  the vertical — and the plan a front door refuses with.
- `refusals.test.ts` adds one: the field carried, the sentence and
  code unchanged.
- `growth.test.ts` adds 6 for `grownScope`: the grown project, what
  the planner closes growth over, the tags growing installs promote
  (what they feed offered the entrypoint, what they exclude not), what
  a newly matching adapter promotes, the rules of what growing
  installs, and the planner's refusal of it.
- `project-status.test.ts` adds 10: a CLI, an HTTP project, a peer
  modulith, a front end, a monorepo product's root and service, a
  polyrepo service, and a plugin's vertical only a Go CLI takes, named
  on its card in a polyrepo service and in no monorepo one. Each holds
  every field against the command it reports, and each card against
  its add, data included. The other three grow every CLI preset for
  real, on each build system it offers or the one it builds with — as
  `keel new` leaves it, without the agent harness, and as a modulith —
  and hold each card's action, and what the status said the entrypoint
  installs, to the project it left. The stale-generation case finds
  the entrypoint still offered.
- `add-entrypoint.test.ts` adds one: the planner's refusal of what the
  twin has and the project lacks, which the status reports as the
  command gives it.
- `hint.test.ts` goes from 32 to 40 cases. The three old literals lose
  the closing clause, the command line holds the grown hints on
  `go-cli` and the fallback on its peer modulith, and `growNote` says
  what `--list` says.
- `add.test.ts`'s list case reads the new group.
- `additions.test.ts` adds three and rewrites one — two of the new
  ones hold `entrypointNotes`, the harness re-rendered or not, and what
  it lets in the same either way — `project.test.ts` and
  `command.test.ts` add one and extend one each, and `target.test.ts`
  adds one.
- In the browser, `ui-refusal` rewrites its first case and adds one.
  The new case takes the action from the group, previews
  `keel add entrypoint http --yes`, reviews it, finds the Project
  step's offer pressed, and leaves for a vertical; the form says what
  the run installs and re-renders. From a vertical, it then takes the
  same run from the **Add an entrypoint** tab, which opens on the
  server, and from the Project step's offer. `ui-compose`'s CLI
  and Project-step cases read the new part and the offer. Its product
  case now holds the collapsed _Not for this project_, which
  `ui-refusal` no longer reaches, and the entrypoint tab off in a
  monorepo service.
- The four suites pass: 44 tests.

`docs/cli.md` (the refusal section, `--list`, `keel add entrypoint`),
`docs/ui.md`, `docs/composition.md` (Refusals, Growing an entrypoint),
`docs/plugins.md`, four vertical pages and the verticals README's
prose, the README,
`src/domain/core/AGENTS.md`, `src/application/cli/AGENTS.md`,
`src/application/web/AGENTS.md`, `assets/AGENTS.md`, `tests/AGENTS.md`
(I4) and `tests/e2e/AGENTS.md` say what changed. CHANGELOG, under
_Changed_, and R.2b's _Added_ entry no longer says the page does not
offer it.

Beyond the text above:

- **The hint names the vertical by its id.** The text writes
  _Observability_. The CLI's contract has only the refusal, which names
  the vertical by id, as every hint does.
- **The gateway's hint spells the whole way in:** _then 'keel link
  <path>' a project it can wire, then 'keel add gateway'_, where the
  text stops at the link.
- **No action, the old hint.** Where the refusal carries none, a
  project growth refuses among them, the hint still names the stack
  that carries both, less the clause R.2b made untrue.
- **What the what-if accepts.** The text reads `ready` as the
  answer. `needs` counts too: iac is added after the server, and its
  own add brings its image and release. A grown project that would
  still refuse the vertical for another reason gets no action. On
  `quarkus-cli --with distribution`, iac would need
  `--refresh distribution` after growing, so its hint names the stack.
- **Handed in, not computed.** The planner answers `grow`, as the text
  says, but over scopes `addScopeOf` hands it: `growth.ts` imports the
  planner and `scope.ts`, so either reading growth itself is an import
  cycle, which dependency-cruiser refuses.
- **The planner's refusal too.** The status reports the planner's
  refusal of what growth installs, which the command gives, beside the
  scope and growth's own. No shipped cell reaches it; a plugin family
  in `add-entrypoint.test.ts` does.
- **I4 holds the data.** The text keeps I4 as it was. It compared code
  and sentence alone, so a card and its click could disagree on the
  action unseen; it now compares the refusal's data too.
- **One tab.** The text has `<keel-add-form>` preview the entrypoint
  as it does a module. It has one **Add an entrypoint** tab, not one
  per entrypoint. The tab opens on the first entrypoint the project can
  grow, and is off with the first one's reason where it can grow none.
- **The docs beyond the two named:** `docs/composition.md`,
  `docs/plugins.md`, and the containerization, distribution,
  observability and persistence pages and the verticals README, whose
  refusals now come with the command.
- **What adding it installs.** The text has the status report each
  back entrypoint, whether it is present, and its refusal. It also
  reports what the command would install (`installs`), so the
  entrypoint's form names everything that comes with it — a dev
  environment beside observability, which is `ready` on a CLI and so
  is no card the action names — rather than only the cards it lets in.

Not done here: greenfield, as the text says; the page offers no
`keel link`, so it says the gateway waits on one rather than linking
it; a vertical that growing leaves needing a re-render gets no
action; and neither does one whose nearest adapter lacks more than the
entrypoint, though another would take it once grown: on a Quarkus CLI
built with Maven, distribution is refused for Gradle, which its native
release needs, while growing a server, then its container image,
would let the container release in.

### R.3 — moduliths grow too ✅

One step per family. Each is its own green commit and its own pull
request's worth of change: it lifts growth's refusal for its family
alone, and it holds that family's e2e shards green.

**The split.** Every context adapter, whether the peer
(`walking-skeleton/<family>-peer-context`) or a `keel add module`
context (`bounded-context/<family>-context`), becomes a **shell** plus
one **wiring adapter** per back entrypoint.

- **The shell** keeps today's predicate and everything that does not
  depend on an entrypoint: the context's own modules and the root
  registration. That means the `settings.gradle.kts` includes or
  `pom.xml` modules, the root `Cargo.toml` members, and TypeScript's
  `workspaceInstall`.
- **A wiring adapter** requires the shell's tags plus exactly one of
  `arch.cli` or `arch.server-http`. It is ordered `after` the shell
  and after that entrypoint's bootstrap, and it writes only that
  assembly's files and patches.

The per-assembly output is already self-contained. Its files are
byte-identical across assemblies except for the JVM `package` line,
and no patch touches a file another assembly owns. A project with both
entrypoints simply matches both wiring adapters, so no predicate needs
an OR.

Greenfield bytes should stay put _(inference, from the disjoint
targets)_; the R.1a golden, extended with module histories, checks it.

**What the split unlocks.** `growthOf`'s refusal lifts family by
family. "Install what newly matches" now reaches the peer's new wiring
adapter in `walking-skeleton`. Added contexts are reached by a replay
that R.3a lands:

- for each recorded module after the skeleton that has its own seam
  (the peer records `seam: false`), in `manifest.modules` order, after
  observability;
- run `bounded-context` with `modules.context` and `addModuleInputs(m)`,
  restricted to the adapters that newly match;
- then strip those inputs, as `withoutAddModuleInputs` does.

**Ordering is load-bearing**, and the twin's order already meets each
constraint:

1. **The peer before observability.** Rust's
   `application/http/Cargo.toml` `[dependencies]` patches prepend, and
   greenfield has the peer's five lines below the seven OpenTelemetry
   ones.
2. **The peer before any added context in the new assembly**, because
   of the peer patches' anchors (blocker 12).
3. **Modules in recorded order.** A context's wiring calls the wiring
   of the context it consumes: Go `wire<Consumes>Service()`, Rust
   `crate::<x>::wire_service()`, TypeScript `create<X>ContextService()`.

**Grid.** I10 gains a module-history axis: each modulith cell, with and
without the peer, after `keel add module orders --consumes greeting`
and `keel add module shipping --consumes orders`, grown and compared
with the twin that has the same history.

#### R.3a — Go, and the context replay (M) ✅

**The split.**

- `go-context` becomes a shell plus `go-context-cli` and
  `go-context-http`. The shell is files only, with no patches; each
  wiring adapter writes `cmd/<unit>/<ctx>.go` and its test.
- `go-peer-context` is split the same way.
  `internal/modules/guestbook/userside/signing` stays in the shell,
  because it does not depend on the entrypoint.
- Both private copies of `assembliesOf` are removed.

**Shared machinery that lands here:**

- the module replay in `add-entrypoint.ts`;
- the module-history axis. It is the first check of the `bounded-context`
  growth probes: the shipped registry lists none, so `growthOf` reads
  keel's own, which no test reaches before this (R.2a);
- the R.1a golden's module-history cells.

The machinery comes first so that it is isolated where the family
diff is smallest.

**Refuses** a module without `consumes` whose existing CLI wiring calls
another context's wiring function, naming the module (blocker 17).

**Moves:** Go's peer-context and module-history cells to `ok`.

**Holds green:** `add-module-go`, `modulith-go-*`, the R.1a golden, the
render guard (Go's adapters no longer differ), and I10.

**Landed as the machinery first, then Go's split**, and the goldens
moved only where Go's contexts now grow.

- **The module histories, recorded before any code moved.**
  `support/dial-walk.ts` gains `moduleHistory`, `keel add module orders
--consumes <skeleton>` and then `shipping --consumes orders`, with the
  skeleton read off `keel.project-status`'s first module, and
  `addModuleCommandLine`, which spells the three suites' keys. Each
  suite gives every modulith setting it walks that history wherever the
  status allows a context (`canAddModule`, every single-service preset):
  - `shared-files.golden.test.ts` records 100 cells, every modulith
    setting of the 28 single-service presets with no extras. The
    scaffold and the first add are written, and the last add is a dry
    run. The golden went from 398 cells and 1,167 hashes to 498 and
    1,461, and no cell moved. A history's `README.md`,
    `devcontainer.json` and root `package.json` hash as its scaffold's
    do; its contexts register in `settings.gradle.kts` (36 cells),
    `pom.xml` (36) and `Cargo.toml` (6), which R.3b and R.3d must leave
    as they are. Go's contexts write none of the six files.
  - `growth.golden.test.ts` reads growth again after the history: 144
    cells, so 216 became 360. Its in-memory `Tree` now keeps what a run
    commits, per directory, since a context's add patches the
    scaffold's files. On the code before the split, the 128 backend
    ones were all `keel.contexts-need-rewiring`, and `web-components`'
    16 `keel.uncoverable-entrypoint`.
  - I10 grows each modulith setting a second time, after the history,
    and holds it to the twin given the same history: 128 cells, and
    396 new verdicts, 1,100 in all. The grown run's queue is held to
    the one the twin's `keel new` queued, less version control's: each
    context's add queued its own when it ran, on either side.
- **The reading.** `GrowthPlan.modules` lists the contexts `keel add
module` added, in recorded order, each with the adapters of
  `bounded-context` that the grown tags newly match with the
  `modules.context` marker on. That vertical is keel's own, the one
  `keel add module` runs, whatever a registry lists. The structural
  refusal now reads the adapters growing runs (both below).
- **The replay**, `wireModules` in `handlers/add-entrypoint.ts`. After
  the run's last vertical, which is where the twin's own history adds
  them, each context is replayed in recorded order. The vertical runs
  with the marker and the context's inputs seeded, what it consumes
  read off its record, and only the adapters `modules` names (`only`),
  onto the run's tree, ownership and harness buffer. The inputs are
  then stripped (`withoutAddModuleInputs`). The harness retrofit
  replays no context: the replay put the harness elements of what it
  left out into the buffer itself, as a vertical that ran does, and the
  skeleton and the peer are `walking-skeleton`'s, never
  `bounded-context`'s.
- **The old-manifest refusal** (blocker 17), `unrecordedConsumer`. A
  context growing wires in whose record names nothing it consumes is
  checked against the paths `bounded-context` writes for it consuming
  each context recorded before it with a seam, less the paths it
  writes for it alone. If any of those is on disk, the gateway is
  there, and growth is refused as `keel.contexts-need-rewiring`, naming
  both contexts (`refusals.ts`' `unrecordedConsumesSentence`), before
  anything is written. The paths come from `install.ts`'s new
  `contributedPaths`, which contributes each adapter from what the
  manifest records, as the `actionsOnly` replay does (both now share
  `recordedContribution`), so the handler knows no family's layout.
- **Go's split.** `go-context.ts` is now three adapters. The shell,
  `bounded-context/go-context`, writes the context's packages and,
  under `--consumes`, its gateway. `go-context-cli` and
  `go-context-http` each require the marker and their entrypoint's tag,
  and each writes `cmd/<unit>/<context>.go` and its test, after the
  shell and that entrypoint's bootstrap. `go-peer-context.ts` is split
  the same way: the shell keeps the context, its gateway and
  `userside/signing`, and `go-peer-context-cli` and `-http` each write
  `cmd/<unit>/guestbook.go` and its test. The template variables are
  defined once for all three (`contextOf`, `peerOf`), and both copies
  of `assembliesOf` are gone.

The goldens moved as the step's text says, and nothing else did:

- `growth.golden.json`: Go's 4 plain peer cells (`go-cli` and
  `go-http`, harness on and off) went from
  `keel.contexts-need-rewiring` to growing, newly matching the peer's
  wiring adapter beside the bootstrap. Of the 144 history cells added,
  Go's 8 grow, each recording `modules`: `orders` and `shipping`, each
  wired by `bounded-context/go-context-http` (or `-cli`). On the code
  before the split they read refused, as the other 136 still do.
- The grid's `growth.golden.json`: 12 verdicts moved to `ok`, Go's
  four peer grows and their eight default I9 bodies. Of the new
  verdicts, 36 are `ok`: Go's 8 history grows, their 24 I9 bodies, and
  the peer cells' 4 answered ones. I10 now grows 132 of the 192 plain
  cells, with the 60 refused being every peer setting off Go, and 8 of
  the 128 histories, all Go's.
- `shared-files.golden.json` was recorded before the split and passed
  unchanged after it.
- The greenfield, brownfield, composite and planner-readiness goldens
  and the docs matrix regenerate byte-identical. The known files are as
  they were: brownfield's `{"I5": {}}`, and `{}` for the others.

**The proof.**

- **I10.** It holds Go's 4 peer cells and 8 history cells to their
  twins byte for byte, manifest included. With the replay switched
  off, I10 failed on exactly the 8 history cells.
- **The render guard** passes, with Go's peer and context adapters
  rendering the same both ways.
- **No greenfield byte moved.** HEAD's code and this step's each
  scaffolded every Go preset on both layouts, with and without the
  peer context and the agent harness, and each modulith again after
  the history: 30 settings and 1,601 files, byte-identical, manifests
  included.
- **The e2e suites.** `add-module-go`, `modulith-go-cli`,
  `modulith-go-http`, `modulith-go-peer-context`,
  `modulith-go-persistence` and `modulith-go-persistence-liquibase`
  pass: 9 tests.
- **On disk**, with the real deferred actions and Go 1.24:
  - `go-cli` on the modulith, with the peer context and the history,
    grew HTTP. `go vet` and `go build` passed, and `go test ./...` passed
    in 17 packages, among them `cmd/http`'s four wiring tests (the
    guestbook's two, `orders`', and `shipping`'s through `orders`'
    wiring). The CLI greeted. The HTTP unit answered `/greet` with 200
    and a correlation id, and a blank name with 400, and both health
    probes answered 200. Nothing under `cmd/cli/` changed.
  - `go-cli` on the modulith with `orders` alone grew HTTP, with 11
    packages passing.
  - `go-http` with the peer context and the history grew the CLI, with
    17 packages passing, and the CLI greeted.
  - A manifest with `orders`' `consumes` removed is refused as above.
    A build of the same keel without the check grew that project, and
    `go vet ./cmd/http` then failed: _not enough arguments in call to
    orders.NewOrders_.

**The tests.**

- `growth.test.ts` goes from 35 to 38 cases. A replay reads each added
  context in recorded order, not by name, on either entrypoint, and
  reads neither the skeleton nor the peer, and none on a skeleton-only
  modulith — on keel's Go presets, since only keel's families have
  adapters in keel's `bounded-context`. An installed vertical's adapter
  lifts no added context, and a `bounded-context` a registry lists
  lifts neither the peer nor an added context, recorded among the
  verticals as `keel add module` records it. The linked-sibling case
  now wires through an installed vertical.
- `add-entrypoint.test.ts` goes from 33 to 40:
  - a Go peer modulith with the history, grown and equal to its twin
    byte for byte, its `modules` record kept and no marker or input
    left behind;
  - an edited `cmd/http/billing.go` kept, while a standalone context is
    wired into `cmd/cli/` standalone;
  - a Go modulith with `orders` grown, with the agent harness and
    without it, where a registry lists a `bounded-context` of its own:
    the status offers HTTP, and the project grows equal to its twin. It
    fails where the twin's order, the retrofit or the replay reads the
    registry's;
  - the old-manifest refusal, its preview alike, the command's pointer
    from a directory below the project, and the growth once `consumes`
    is recorded again, as the refusal says. It fails with the check
    switched off;
  - the same refusal where the gateway's test was deleted and the
    gateway kept. It fails where the check needs every file of the
    gateway;
  - the same refusal of `shipping`, whose gateway reaches `orders`, a
    context `keel add module` added rather than the skeleton. It fails
    where the check reads the first seam alone;
  - a peer context recorded consuming nothing, as a keel before #164
    recorded it, beside `orders`: it grows, since its gateway is where
    `bounded-context` would put one and `walking-skeleton` wires it. It
    fails where the check reads every context, not only those the
    replay wires.
- `project-status.test.ts` offers HTTP on a Go peer modulith with an
  added context, with the action on its cards.
- `hint.test.ts` has that project's hints carry the action.
- `go-context.test.ts` and `walking-skeleton-go-modulith.test.ts` hold
  the split: the adapters each resolves, one wiring adapter per
  entrypoint, each writing the same file into its own assembly.

Which order the handler replays the contexts in is not observable on
Go: each wiring file is written whole, every context resolves the same
adapter, and none queues an action or declares a harness element.
`growth.test.ts` holds the order `growthOf` lists them in; R.3b's
`[dependencies]` and `mod` patches are the first bytes it moves.

The cases that held growth's refusal on a Go peer modulith (the
handler's two, the status's, the hint's and `project.test.ts`') now
scaffold `quarkus-cli`, which R.3d lifts last.

**The cost.** Measured alone, the growth axis takes about 38 s (it was
25 s), the grid about 43 s wall (it was 30 s), the shared-file golden
26 s (15 s) and the growth golden 12 s (7 s). The module histories
take about 13 s of the axis, a `keel add module` about 100 ms. A
trial that copied each scaffold rather than rendering it again saved
a second, and was not kept. The full CI-mode run took 162 s, against
150 s for HEAD's code on the same machine.

`docs/cli.md` (`keel add entrypoint`, and the refusal section's
examples), `docs/composition.md` (Growing an entrypoint),
`docs/plugins.md`, `docs/stacks/go.md`, `docs/ui.md`,
`docs/development.md`, the README, `tests/AGENTS.md`,
`src/domain/core/AGENTS.md` and `src/domain/contract/AGENTS.md` say
what changed, and so do
`EntrypointStatus`' `installs` and `refusal` docs and
`entrypointReading`'s, which read no files. R.2b's CHANGELOG entry under
_Added_ now says what Go's moduliths do, and R.2c's under _Changed_
narrows its "for now". The old-manifest refusal has no entry: `keel
add module` is unreleased too, so only a build of keel from between it
and #164 leaves a project that reaches it.

Beyond the text above:

- **The refusal reads what growing runs.** R.2a probed a context's
  marker over every installed vertical and `bounded-context` alike.
  Now that growing runs something for each context, the probe reads
  exactly that. For the peer, which newly matches in an installed
  vertical, it reads the installed verticals' adapters. For an added
  context, which the replay reaches, it reads keel's `bounded-context`
  (below). An installed vertical's adapter requiring `modules.context`
  never runs, since `keel add module` runs `bounded-context` alone,
  and `bounded-context`'s adapter requiring `modules.peer-context`
  never runs for the peer. Counting either would grow a half-wired
  assembly. No shipped cell moved. `growth.test.ts` rewrote the case
  that held the looser reading, and its linked-sibling case.
- **Blocker 17 is read off the gateway, not the wiring.** The text
  refuses a module whose CLI wiring calls another context's wiring
  function. The existing wiring is the user's to edit, and the call
  differs by family (Go's `wire<X>Service()`, Rust's
  `crate::<x>::wire_service()`, TypeScript's
  `create<X>ContextService()`). A consumer of the skeleton calls its
  facade, not a wiring function, and would not build either. The
  gateway `keel add module --consumes` writes is found where the
  family's own render puts it, which covers every consumer and every
  family R.3b to R.3d splits, and ignores what the user did to the
  wiring. The sentence names the context the gateway reaches and says
  how to record it in the manifest, as `recordedAnswerSentence` says
  how to remove an answer an older keel recorded there. Its code is
  `keel.contexts-need-rewiring`: it is a context the command cannot
  rewire.
- **The status offers what the file check refuses.** `keel.project-status`
  reads no files (`ProjectStatusDeps` has no `Tree`), so on such a
  project it offers the entrypoint, and so does a vertical's refusal
  whose action it is (`addScopeOf`, which reads what the status
  reads). The command and its preview refuse it, and so does the
  command's pointer from a directory below the project, which reads
  the files of each project it names. That is the same arrangement
  `keel add module` has with a composition root it cannot read. Only
  a project a keel from before #164 gave a `--consumes` context, and
  that `keel add agent-harness` has since restamped, reaches it.
- **The histories' actions.** The text holds a grown project's queue to
  the twin's. With a history, the twin's last run is its last `keel add
module`, so I10 compares the grown run with the twin's `keel new`.
  Each context queued what it needed when it was added, on both sides,
  and the settling replay covers the rest. A wiring adapter queues
  nothing on Go, and no context is replayed for its actions alone: the
  context vertical is no vertical of the twin (DR5).
- **The shells' `after`.** The peer's shell ran after all three
  bootstraps, for the wiring it wrote in each assembly. It now runs
  after the base bootstrap alone, whose module path it reads, and each
  wiring adapter runs after the shell and its entrypoint's bootstrap.
  The context's shell lists none: in `bounded-context` a bootstrap is
  never there. No byte moved, since Go's contexts write whole files and
  record no answer.
- **Keel's own `bounded-context`, never a registry's.** R.2a's probe
  read a `bounded-context` the registry lists ahead of keel's, as the
  harness retrofit has since #164. `keel add module` runs keel's own
  alone, so a registry's would have the replay run adapters that
  command never ran, and a plugin registering the id would refuse
  keel's own Go contexts. The probe and the replay read keel's. Since
  `keel add module` records `bounded-context` among the project's
  verticals, growth leaves that row out of the installed verticals it
  reads, so a listed one neither lifts the peer nor runs beside the new
  bootstrap, and `growth.test.ts` holds that it lifts nothing on a
  manifest recording it. The command reads it nowhere either: the
  twin's order ranks no adapter of that row, and the run's harness
  retrofit replays no context (above), so the status and the command
  agree. A plugin family's added contexts do not arise: `keel add module`
  refuses its projects. The retrofit's reading elsewhere is left as it
  was: its suite puts keel's own adapters there, with harness elements
  added.
- **The sentence.** `contextsNeedRewiringSentence` said "keel does not
  yet wire a context into a new one", which is untrue on Go. It now
  says "this stack's contexts".
- **`web-components`' histories** are in the growth golden, refused as
  a front end, as its plain cells are. I10 grows backends alone.
- **The weekly sweep was not run.** Growth is no axis of it, and the
  step names no finding.

Not done here: Rust, TypeScript and the JVM (R.3b to R.3d), whose peer
and history cells stay refused; a status that reads the old-manifest
case; and an e2e suite of a grown Go modulith. There is none for
`go-cli-http` on the modulith, so growth leaves those cells as covered
as `keel new` does, and the proof on disk stands in.

#### R.3b — Rust (S) ✅

**The split.**

- `rust-context` becomes a shell (the root `Cargo.toml` members patch)
  plus `-cli` and `-http` wiring adapters. Each wiring adapter writes
  `application/<unit>/src/<ctx>.rs`, calls `addCrateDependencies` on
  that assembly's `Cargo.toml`, and adds the `mod <ctx>;` line through
  `assemblyModulePatch`.
- `rust-peer-context` is split the same way.
- Both copies of `assembliesOf` are removed.

**Risk:** the `[dependencies]` prepend order against
`rust-observability`.

**Holds green:** `add-module-rust`, `modulith-rust-peer-context`, the
R.1a golden, and I10.

**Landed as the split alone**, on R.3a's machinery, and the goldens
moved only where Rust's contexts now grow.

- **The context.** `rust-context.ts` is now three adapters. The shell,
  `bounded-context/rust-context`, writes the context's crates and,
  under `--consumes`, its gateway, and adds them to the root
  `Cargo.toml`'s `members`. `rust-context-cli` and `rust-context-http`
  each require the marker and their entrypoint's tag. Each writes
  `application/<unit>/src/<context>.rs`, adds the context's crates to
  that crate's `Cargo.toml` (`addCrateDependencies`) and declares the
  module in its `main.rs` (`assemblyModulePatch`), after the shell and
  that entrypoint's bootstrap. What all three read is worked out once
  (`contextOf`).
- **The peer.** `rust-peer-context.ts` is split the same way. The
  shell keeps the three `guestbook` crates and their `members`, and
  `rust-peer-context-cli` and `-http` each write `guestbook.rs`, the
  peer's five dependency lines and `mod guestbook;` in their crate.
- Both copies of `assembliesOf` are gone, and the four wiring
  adapters are registered beside their shells in `walking-skeleton`
  and `bounded-context`. Nothing else changed: `growthOf` finds the
  wiring adapters and lifts Rust's refusal with no edit (DR6), and
  R.3a's replay wires Rust's added contexts as it wires Go's.

The goldens moved where R.3 says a family's step moves them, on Rust's
cells alone, and the R.1a golden gained entries on them; nothing else
moved:

- `growth.golden.json`: 12 cells went from
  `keel.contexts-need-rewiring` to growing. They are Rust's 4 plain
  peer cells (`rust-cli` and `rust-http`, harness on and off), newly
  matching the peer's wiring adapter beside the bootstrap, and its 8
  history cells, each recording `modules`: `orders` and `shipping`,
  each wired by `bounded-context/rust-context-http` (or `-cli`).
- The grid's `growth.golden.json`: 36 verdicts moved to `ok`, the 12
  grows and their 24 default I9 bodies. 12 were added, all `ok`: the
  I9 bodies answering the monitoring stack on the 6 cells that grow
  HTTP, which a refused cell never reached. That makes 1,112 verdicts.
  I10 now grows 136 of the 192 plain cells, with the 56 refused being
  every peer setting off Go and Rust, and 16 of the 128 histories,
  Go's 8 and Rust's 8.
- `shared-files.golden.json` changed no entry it had. It gained 52, on
  the 20 Rust modulith cells: each assembly's `Cargo.toml` and
  `src/main.rs`, recorded on HEAD's code (below). Its 6 Rust history
  cells register their contexts in the root `Cargo.toml` as before.
- The greenfield, brownfield, composite and planner-readiness goldens
  and the docs matrix regenerate byte-identical. The known files are as
  they were: brownfield's `{"I5": {}}`, and `{}` for the others.

**The proof.**

- **I10.** It holds Rust's 4 peer cells and 8 history cells to their
  twins byte for byte, manifest and queued actions included. The risk
  the text names is met by the twin's order, which growth already
  runs in. Each wiring and observability prepend to the new crate's
  `[dependencies]`, so the twin lists shipping's four crates, then
  orders' four, then OpenTelemetry's seven, then the peer's five, then
  the bootstrap's own. `walking-skeleton` wires the peer before
  observability runs, and the replay wires the contexts after the run's
  last vertical, in recorded order. The `mod` lines go in in that
  order too, each after the last, so `main.rs` declares `guestbook`,
  `orders` and `shipping` in turn. With the replay reversed, I10
  failed on exactly Rust's 8 history cells, and Go's still passed,
  since Go's wiring files are written whole. The order R.3a's replay
  keeps is now in the bytes, as R.3a expected.
- **The render guard** passes, with Rust's peer and context adapters
  rendering the same both ways.
- **No greenfield byte moved.** The R.1a golden holds it on the files
  the split rearranges: its 52 new entries, recorded on HEAD's code,
  pass on this step's. Beyond its settings, HEAD's code and this
  step's each scaffolded every Rust preset on both layouts, with and
  without the peer context and the agent harness, and each modulith
  again after the history: 30 settings and 1,505 files,
  byte-identical, manifests included. They did the same with the
  whole extras menu `keel.dials` offers (`ci`, `dev-env` and
  `toolchain` on `rust-cli`; `ci`, `containerization`, `persistence`,
  `distribution`, `iac` and `toolchain` on the other two), on each
  layout, peer and history setting: 15 settings and 1,166 files,
  byte-identical.
- **The e2e suites.** `add-module-rust`, `modulith-rust-cli`,
  `modulith-rust-http` and `modulith-rust-peer-context` pass: 7 tests.
- **On disk**, with the real deferred actions and cargo 1.94.1:
  - `rust-cli` on the modulith, with the peer context and the history,
    grew HTTP. `cargo test --workspace` passed 48 tests in 33 test
    binaries. Among them are the HTTP crate's 13: the guestbook
    wiring's, `orders`' two, and `shipping`'s two, through `orders`'
    `wire_service()`. The CLI greeted. The HTTP unit answered `/greet`
    with 200 and a correlation id, a blank name with 400, and both
    health probes with 200. Nothing under `application/cli/` changed.
  - `rust-cli` on the modulith with `orders` alone grew HTTP, with 32
    tests passing.
  - `rust-http` with the peer context and the history grew the CLI,
    with 48 tests passing, the CLI crate's 8 among them, and the CLI
    greeted.
  - A manifest with `orders`' `consumes` removed is refused, naming
    both contexts. R.3a's old-manifest check finds Rust's gateway crate
    with no edit, which `add-entrypoint.test.ts` now holds (below).

**The tests.**

- `rust-context.test.ts` goes from 11 to 12 cases: the context is
  wired into each assembly by an adapter of its own, the same module
  in each crate, and on a CLI project into the CLI's alone.
- `walking-skeleton-rust.test.ts` goes from 8 to 10: the peer resolves
  its shell and one wiring adapter per entrypoint, each writing the
  same `guestbook.rs`, its `mod` line and its crates into its own
  assembly; and the wiring adapter's drift error names it (below).
- `add-entrypoint.test.ts` goes from 40 to 42. One case is a Rust peer
  modulith with a history of `orders`, then `billing` consuming it,
  grown and equal to its twin byte for byte, the new crate's
  `[dependencies]` holding billing's crates above `orders`', those
  above OpenTelemetry's and those above the peer's, with its `mod`
  lines in recorded order. The grid's history is also the names'
  order, so a replay sorted by name passes I10; this case fails with
  the replay sorted by name, and with it reversed. The other is R.3a's
  old-manifest refusal on a Rust modulith, whose gateway is a crate:
  every case of it scaffolded Go, so the check could stop finding
  Rust's gateway with the suite green. It fails with the check blind
  to a `-gateway` crate.
- `shared-files.golden.test.ts` records each Rust modulith assembly's
  `Cargo.toml` and `src/main.rs` (below). With the peer's five
  dependency lines reversed it fails; before, the whole suite passed.

**The cost.** Measured alone, the growth axis takes about 39 s, against
38 s for HEAD's code on the same machine: 12 more cells grow for real,
held to 6 more twins, so it scaffolds 396 projects (it was 390) and
runs 272 `keel add module`s (264). The full CI-mode run took 171 s.

`docs/cli.md` (`keel add entrypoint`, and the refusal and hint
sections), `docs/composition.md` (Growing an entrypoint, which now
says where the order shows in Rust's bytes), `docs/plugins.md`,
`docs/stacks/rust.md`, `docs/ui.md`, `docs/development.md`, the
README, `tests/AGENTS.md`, `src/domain/core/AGENTS.md`,
`bounded-context.ts`, the render guard's and the R.1a golden's headers,
and the notes on their Rust siblings in the Go peer context, the
TypeScript context adapters and the TypeScript and JVM layouts say
what changed. So does `GrowthPlan.adapters`' doc, which said one
adapter newly matches on every shipped preset, as `docs/composition.md`
did: on a Go or Rust peer modulith the peer's wiring adapter does too.
R.2b's CHANGELOG entry under _Added_ now says what Rust's moduliths
do, with I10's new counts, and R.2c's under _Changed_ narrows its "for
now" to the other families.

Beyond the text above:

- **The shells' `after`.** Both shells ran after all three bootstraps,
  for the wiring they wrote in each assembly. Each now runs after the
  base bootstrap alone, whose workspace manifest it adds its crates to.
  Go's context shell lists none, but it patches nothing. Each wiring
  adapter runs after its shell and its entrypoint's bootstrap. In
  `walking-skeleton` this moves the peer's shell ahead of the port
  fake. Neither writes a file the other does, and no byte moved
  (above).
- **The peer's drift error names its wiring adapter.** The plain throw
  on an assembly `Cargo.toml` with no `[dependencies]` table named the
  peer's adapter, which patched it. It now names the wiring adapter
  that patches it, which `walking-skeleton-rust.test.ts` holds. It
  stays a throw, as `addCrateDependencies`' own does: no scaffold
  reaches it.
- **The R.1a golden records Rust's assembly files.** R.3 says that
  golden checks greenfield bytes stay put, but none of its six files
  is one the split rearranges on Rust: the peer's and each context's
  wiring, the bootstrap and observability all write each assembly's
  `Cargo.toml` and `src/main.rs`. It now records both on every Rust
  modulith cell. The entries were generated on HEAD's code, in a copy
  of its tree, and this step's code writes them byte-identical. Before
  this, the peer's five dependency lines could be reversed with the
  whole suite passing, since I10 compares a grown project with a twin
  the same adapters write.
- **The weekly sweep was not run.** Growth is no axis of it, and the
  step names no finding.

Not done here: TypeScript and the JVM (R.3c and R.3d), whose peer and
history cells stay refused; and an e2e suite of a grown Rust modulith.
There is none for `rust-cli-http` on either layout, so growth leaves
those cells as covered as `keel new` does, and the proof on disk
stands in.

#### R.3c — TypeScript (M) ✅

**The split.**

- `ts-context` and `ts-peer-context` each become a shell (which keeps
  `workspaceInstall`) plus wiring adapters.
- Each wiring adapter writes `application/<cli|rest>/src/<ctx>.ts`,
  applies `dependencyPatch` to that assembly's `package.json`, and
  applies the `main.ts` wiring patch. The peer's wiring adapter also
  writes `tests/guestbook-wiring.test.ts` in its assembly.
- `tsAssemblies` is removed; only these two adapters call it.

Running the peer before added contexts is a correctness requirement
here, because of the `MEDIATOR_LINE` anchor.

**Holds green:** `add-module-ts`, `combo-modulith-ts-cli-http-{npm,pnpm}`,
the R.1a golden, and I10.

**Landed as the split alone**, on R.3a's machinery, and the goldens
moved only where TypeScript's contexts now grow.

- **The context.** `ts-context.ts` is now three adapters. The shell,
  `bounded-context/ts-context`, writes the context's package and,
  under `--consumes`, its gateway, and queues the `workspaceInstall`
  that links the package. `ts-context-cli` and `ts-context-http` each
  require the marker and their entrypoint's tag. Each writes
  `application/<cli|rest>/src/<context>.ts`, declares the context on
  that assembly's `package.json` (`dependencyPatch`), and splices its
  handler into the mediator that assembly's `main.ts` builds
  (`wiringPatch`, Q3.5's read of the array, unchanged), after the
  shell and that entrypoint's bootstrap. What all three read is worked
  out once (`contextOf`).
- **The peer.** `ts-peer-context.ts` is split the same way. The shell
  keeps the `guestbook` package, and `ts-peer-context-cli` and `-http`
  each write `src/guestbook.ts` and `tests/guestbook-wiring.test.ts`,
  declare the peer on the assembly's `package.json` and put its handler
  on the mediator, in their assembly (`peerOf`).
- `tsAssemblies` is gone. `tsAssembly(layout, unit)` names one
  assembly's paths, each wiring adapter its own, and the four wiring
  adapters are registered beside their shells in `walking-skeleton`
  and `bounded-context`. Nothing else changed: `growthOf` finds the
  wiring adapters and lifts TypeScript's refusal with no edit (DR6),
  and R.3a's replay wires TypeScript's added contexts as it wires Go's
  and Rust's.

The goldens moved where R.3 says a family's step moves them, on
TypeScript's cells alone; nothing else moved:

- `growth.golden.json`: 24 cells went from
  `keel.contexts-need-rewiring` to growing. They are TypeScript's 8
  plain peer cells (`ts-cli` and `ts-http`, on npm and pnpm, harness
  on and off), newly matching the peer's wiring adapter beside the
  bootstrap, and its 16 history cells, with the peer and without, each
  recording `modules`: `orders` and `shipping`, each wired by
  `bounded-context/ts-context-http` (or `-cli`).
- The grid's `growth.golden.json`: 72 verdicts moved to `ok`, the 24
  grows and their 48 default I9 bodies. 24 were added, all `ok`: the
  I9 bodies answering the monitoring stack on the 12 cells that grow
  HTTP, which a refused cell never reached. That makes 1,136 verdicts.
  I10 now grows 144 of the 192 plain cells, with the 48 refused being
  every peer setting on the JVM, and 32 of the 128 histories: Go's 8,
  Rust's 8 and TypeScript's 16.
- `shared-files.golden.json` changed no entry it had. It gained 156,
  on the 60 TypeScript cells: each assembly's `package.json` and
  `src/main.ts`, on both layouts, recorded on HEAD's code (below).
- The greenfield, brownfield, composite and planner-readiness goldens
  and the docs matrix regenerate byte-identical. The known files are
  as they were: brownfield's `{"I5": {}}`, and `{}` for the others.

**The proof.**

- **I10.** It holds TypeScript's 8 peer cells and 16 history cells to
  their twins byte for byte, manifest and queued actions included. The
  order the text calls a correctness requirement is the twin's order,
  which growth already runs in. The new assembly's `main.ts` is the one
  its bootstrap renders in the same run, and `walking-skeleton`
  installs the peer's wiring adapter beside that bootstrap, so the
  peer's `MEDIATOR_LINE` anchor always finds the bootstrap's own line.
  Observability then wraps the server, and the replay, after the run's
  last vertical, splices each added context's handler after the
  array's last entry, in recorded order. Each context's import goes in
  above the last one's, and its entry in the assembly's `package.json`
  right after the skeleton's, so both read the last added first, the
  peer's below them. With the replay reversed, I10 failed on exactly
  TypeScript's 16 history cells and Rust's 8, and Go's still passed.
- **The render guard** passes, with TypeScript's peer and context
  adapters rendering the same both ways.
- **No greenfield byte moved.** The R.1a golden holds it on the files
  the split rearranges: its 156 new entries, recorded on HEAD's code,
  pass on this step's. Beyond its settings, HEAD's code and this step's
  each scaffolded `ts-cli`, `ts-http` and `ts-cli-http` on npm and pnpm, on
  both layouts, with and without the peer context and the agent
  harness, and each modulith again after the history: 60 settings and
  4,304 files, byte-identical, manifests included. They did the same
  with the whole extras menu `keel.dials` offers (`ci`, `dev-env` and
  `toolchain` on `ts-cli`; `ci`, `containerization`, `persistence`,
  `distribution`, `iac` and `toolchain` on the other two), on each
  package manager, layout, peer and history setting: 30 settings and
  3,103 files, byte-identical, persistence's read of the mediator
  array beside the peer and the history included.
- **The e2e suites.** `add-module-ts`,
  `combo-modulith-ts-cli-http-npm` and `-pnpm`,
  `combo-basic-ts-cli-http-pnpm`, `modulith-ts-cli-npm` and `-pnpm`,
  `modulith-ts-http-npm` and `-pnpm`, and `modulith-ts-peer-context`
  pass: 11 tests. The combo moduliths scaffold with the peer context,
  so TypeScript's grown peer cells now have a suite by proof, their
  twin's: the first two of the fourteen modulith combo suites R.2b
  counts as covering their grown cells after R.3c and R.3d. Go's and
  Rust's have none.
- **On disk**, with the real deferred actions, Node 22.22, npm 10.9
  and pnpm 10.33:
  - `ts-cli` on npm, on the modulith with the peer context and the
    history, grew HTTP. `npm run typecheck`, `npm run lint`
    (dependency-cruiser) and `npm test` passed, the tests 45 in 14
    files across seven workspace packages, `application/rest`'s 12
    among them, its guestbook wiring's through the seam. The CLI
    greeted. The HTTP unit answered `/greet` with 200 and a
    correlation id, a blank name with 400, and both health probes
    with 200. Nothing under `application/cli/` changed.
  - `ts-http` on npm with the peer context and the history grew the
    CLI, with the same three passing and 45 tests, and the CLI greeted.
    Nothing under `application/rest/` changed.
  - `ts-cli` on pnpm with the peer context and a standalone `billing`
    grew HTTP, the three passing with 39 tests in 12 files.
  - `ts-cli` and `ts-http` on pnpm with the peer context and the
    history grew too, and their 45 tests pass, but
    `pnpm run typecheck` fails — as their twin's does, with the same
    `TS2307`s (below).

**The tests.**

- `ts-context.test.ts` goes from 14 to 18 cases, under a `describe` of
  their own: the context is wired into each assembly by an adapter of its
  own, the same module in each, and on a `ts-http` project into
  `application/rest` alone; a `keel add module` on a `ts-cli-http`
  project queues one action, the shell's install, and the case fails
  with the shell queuing none, which only the e2e saw before (a
  `TS2307` on the unlinked package), or the wiring adapters one each;
  a `keel add module` on a `ts-cli-http` project whose CLI `main.ts`
  has no mediator is refused as `keel.path-conflict`, its refusal's
  `adapterId` naming `bounded-context/ts-context-cli`, and writes
  nothing; and the wiring adapter's `package.json` drift error names it
  (below).
- `walking-skeleton-ts-modulith.test.ts` goes from 28 to 30: the peer
  resolves its shell and one wiring adapter per entrypoint, each
  writing the same `guestbook.ts` and wiring test into its own
  assembly, putting the handler on its mediator and declaring the peer
  on its `package.json`; and the wiring adapter's three drift errors
  name it (below).
- `add-entrypoint.test.ts` goes from 42 to 44. One case is a
  TypeScript peer modulith on pnpm with a history of `orders`, then
  `billing` consuming it, then `shipping` consuming `billing`, grown
  and equal to its twin byte for byte, the new `main.ts`'s mediator
  listing the skeleton's handler, the peer's, `orders`', `billing`'s
  and `shipping`'s in turn, its imports `shipping`'s, `billing`'s,
  `orders`', the skeleton's and the peer's, and its `package.json`
  listing `shipping` above `billing` above `orders` above the peer.
  No sort by name, either way, and no reversal gives the recorded
  order, so the case fails on its own with the replay sorted by name
  either way, with it reversed, and with the peer's import or each
  context's put elsewhere. The other is R.3a's old-manifest
  refusal on a TypeScript modulith, whose gateway is a directory of
  the context's package; it fails with the check blind to
  `src/infra/`.
- `shared-files.golden.test.ts` records each TypeScript assembly's
  `package.json` and `src/main.ts` (below). With the peer's import put
  above the skeleton's it fails on 26 entries, and with each context's
  put at the end of `main.ts` on 16; before, the whole suite passed
  with either.

**The cost.** Measured alone, the growth axis takes about 43 s,
against 41 s for HEAD's code on the same machine: 24 more cells grow
for real, held to 12 more twins, so it scaffolds 408 projects (it
was 396) and runs 288 `keel add module`s (272). The whole grid takes
about 52 s wall (50 s), and the full CI-mode run 176 s (177 s), with
3,141 tests passing where HEAD's code passes 3,133. The R.1a golden's
new entries cost nothing measurable: it hashes four more files a cell.

`docs/cli.md` (`keel add entrypoint`, and the refusal and hint
sections), `docs/composition.md` (Growing an entrypoint, which now
says where the order shows in TypeScript's bytes), `docs/plugins.md`,
`docs/stacks/ts-http.md`, `docs/ui.md`, `docs/development.md`, the
README, `tests/AGENTS.md`, `tests/e2e/AGENTS.md`,
`src/domain/core/AGENTS.md`, `bounded-context.ts`, the render guard's
and the R.1a golden's headers and the note on the TypeScript context
adapters in the JVM layout say what changed, and so does
`GrowthPlan.adapters`' doc. R.2b's CHANGELOG entry under _Added_ now
says what TypeScript's moduliths do, with I10's new counts, and R.2c's
under _Changed_ narrows its "for now" to the JVM families. The two
[Unreleased] entries that named `tsAssemblies` no longer do.

Beyond the text above:

- **The peer's anchor stays.** Q3.5 had already moved `ts-context`'s
  own wiring off the bootstrap's line onto a read of the array, which
  the context's wiring adapters keep as it was; the peer's still
  replaces that line. Growth meets the requirement the text names with
  no code (above), and a `main.ts` that has lost the line still throws
  as it did: the peer's wiring runs beside the bootstrap that writes
  it, so no scaffold reaches the throw.
- **The drift errors name the wiring adapter.** The peer's three plain
  throws and the context's `package.json` one named the adapter that
  patched the file, as the context's `PathConflictError` over a
  `main.ts` with no mediator did in its `adapterId`. Each now names the
  wiring adapter that patches the file: `ts-context.test.ts` holds the
  context's two, the refusal's data among them, and
  `walking-skeleton-ts-modulith.test.ts` the peer's three. A refusal's
  sentence names no adapter, so no sentence moved.
- **The shells' `after`.** The context's shell lists none, as Go's: it
  patches nothing. The peer's shell keeps both bootstraps, since the
  TypeScript family has no base bootstrap, and either renders the
  workspace the package joins and records the scope it reads. Each
  wiring adapter runs after its shell and its entrypoint's bootstrap.
  In `walking-skeleton` this moves the peer's wiring after the port
  fake, on every TypeScript peer modulith; neither writes a file the
  other does, and no byte moved (above).
- **The R.1a golden records TypeScript's assembly files.** As on Rust,
  none of its six files is one the split rearranges: the peer's and
  each context's wiring, the bootstrap and observability all write
  each assembly's `package.json` and `src/main.ts`. It now records
  both on every TypeScript cell, the basic layout's too, whose
  `main.ts` observability and persistence patch. The entries were
  generated on HEAD's code, in a copy of its tree, and this step's code
  writes them byte-identical. The mediator array and the `package.json`
  entries had cases of their own, but nothing held where the wiring's
  imports go in `main.ts`: the peer's could go above the skeleton's, or
  each context's to the end of the file, with the whole suite passing,
  since I10 compares a grown project with a twin the same adapters
  write.
- **The guard on a tag set with no entrypoint went with
  `tsAssemblies`.** Both adapters threw when the tags named no
  assembly to wire into. On such a tag set no wiring adapter matches,
  and the shells never get that far: `tsBootstrapAnswers` finds no
  bootstrap and throws first. Go's and Rust's adapters never had the
  guard; the JVM's keep theirs until R.3d.
- **The skeleton's second declaration is gone.** Where a context
  consumed the skeleton, `ts-context` also declared the skeleton's
  package on the assembly's `package.json`. On the modulith that
  package is the assembly's core package, the entry `dependencyPatch`
  anchors on and throws without, so the second patch always found it
  there and changed nothing. The split would have copied it into each
  wiring adapter; it went instead, and no byte moved: the R.1a golden
  records each assembly's `package.json` after the history, where
  `orders` consumes the skeleton, and HEAD's code and this step's
  scaffolded 72 TypeScript settings again, the histories and the
  extras menus among them: 5,716 files, byte-identical, queued actions
  included.
- **A pnpm modulith with a `--consumes` history does not typecheck,
  grown or not.** The context `keel add module --consumes` adds does
  not declare the context it consumes in its `package.json`, so under
  pnpm's isolated store its gateway's `@acme/greeting/service` import
  is a `TS2307`, in the context and in each assembly wiring it; npm's
  hoisting resolves it, and vitest resolves it on either. HEAD's code
  gives the same on a `ts-http` modulith after one
  `keel add module orders --consumes greeting`, with no growth.
  `add-module-ts` builds on npm alone, so CI never saw it;
  `tests/e2e/AGENTS.md` now says so, and the fix is the Backlog's _A
  TypeScript context declares the context it consumes_.
- **The weekly sweep was not run.** Growth is no axis of it, and the
  step names no finding.

Not done here: the JVM (R.3d), whose peer and history cells stay
refused; the pnpm `--consumes` declaration above, now a Backlog entry;
and an e2e suite of a grown TypeScript modulith with a history. There
is none for `ts-cli-http` with one, so growth leaves those cells as
covered as `keel new` does, and the proof on disk stands in.

#### R.3d — JVM: Quarkus, Spring and Micronaut, in Java and Kotlin (L) ✅

**The split.** `jvmContextAdapter` and `jvmPeerContextAdapter` each
yield a shell plus `-cli` and `-rest` wiring adapters, taking the
adapter count from 12 to 36. The framework hooks already receive one
assembly at a time:

- **Quarkus:** binds nothing.
- **Spring:** `bootClass`, today worked out by checking
  `assemblyPkg.endsWith('cli')`, becomes a static fact of each wiring
  adapter.
- **Micronaut:** `importPackagesPatch` (Java) and `mediatorListPatch`
  (Kotlin) move into the wiring adapters.
- **Maven:** anchors on the `greeting-user-side-service` dependency,
  which a fresh assembly pom carries.

`jvmAssemblies` is removed.

**Proof surface.** 3 frameworks × 2 languages × 2 build systems × 2
directions = 24 growth cells, plus module histories. Growth also runs
the twin's `spotlessApply` (R.2b, step 4).

**Holds green:** every JVM e2e shard (the 24 `add-module-*` suites, the
12 JVM `combo-modulith-*` suites, and the `modulith-*` suites), the
R.1a golden, and I10.

**Also fixes** three stale docs:

- `bounded-context.ts` names a `modules.consumes` tag that does not
  exist;
- the comment in `combo-modulith-quarkus-cli-rest-gradle.test.ts`
  about `arch.cli`;
- the harness's claim that every context has `user-side/api`.

**Landed as the split alone**, on R.3a's machinery, and the goldens
moved only where the JVM's contexts now grow. The one greenfield byte
it moves is the stale harness line the text asks it to fix.

- **The added context.** `jvm-context.ts`'s factory, now
  `jvmContextAdapters`, yields three adapters per framework and
  language. The shell, `bounded-context/<framework>-context` (and its
  `-kotlin` twin), writes the context's contract, core and seam
  modules and, under `--consumes`, its gateway, and registers them in
  `settings.gradle.kts` or the root `pom.xml`. `…-cli` and `…-rest`
  each require the marker and their entrypoint's tag. Each writes that
  assembly's `<Name>Wiring` class and its test, gives the assembly its
  dependencies on the context (`assemblyDepsPatch`), corrects the
  composition root's note where the context consumes the skeleton
  (`seamDocPatch`) and applies the framework's `bind`, after the shell
  and that entrypoint's bootstrap. What all three read is worked out
  once (`contextOf`).
- **The peer.** `jvmPeerContextAdapters` splits the peer the same way.
  The shell keeps guestbook's three modules and their registration,
  and `walking-skeleton/<framework>-peer-context-cli` and `-rest` (and
  the `-kotlin` twins') each write `GuestbookWiringTest`, the peer's
  two dependencies and the `Welcome` binding in their assembly
  (`peerOf`). The 12 context adapters are 36.
- **The framework hooks**, each handed one assembly as before:
  - Quarkus binds nothing for a context, and its peer binding is as it
    was.
  - Spring's boot class is a static fact of each wiring adapter:
    `BOOT_CLASS` (`spring-peer-context.ts`, which `spring-context.ts`
    reads too) maps the binding's entrypoint to `Main` or
    `Application`. Both used to read `assemblyPkg.endsWith('cli')`.
  - Micronaut's `importPackagesPatch` (Java) and `mediatorListPatch`
    (Kotlin) are the wiring adapters' `bind`, reading the lists through
    Q3.5's `widenImportPackages` and `widenKotlinMediator`, unchanged.
  - Maven anchors each assembly's new dependencies on the
    `greeting-user-side-service` one a fresh assembly pom carries, as
    both adapters already did.
- `jvmAssemblies` is gone. `jvmAssembly(layout, arch)` names one
  assembly's paths, each wiring adapter its own, and `jvm-bootstrap.ts`
  exports `ARCH_TAG`, the tag each requires. The 24 wiring adapters are
  registered beside their shells in `walking-skeleton` and
  `bounded-context`. Nothing else changed: `growthOf` finds them and
  lifts the JVM's refusal with no edit (DR6), and R.3a's replay wires
  the JVM's added contexts as it wires the other families'.

The goldens moved where R.3 says a family's step moves them, on the
JVM's cells alone; nothing else moved:

- `growth.golden.json`: 144 cells went from
  `keel.contexts-need-rewiring` to growing. They are the JVM's 48 plain
  peer cells (the twelve single-entrypoint presets, on Gradle and
  Maven, harness on and off), newly matching the peer's wiring adapter
  beside the bootstrap, and its 96 history cells, with the peer and
  without, each recording `modules`: `orders` and `shipping`, each
  wired by `bounded-context/<framework>-context-rest` (or `-cli`, and
  the `-kotlin` twins'). The only cells left refused are
  `web-components`' 40, as a front end.
- The grid's `growth.golden.json`: 432 verdicts moved to `ok`, the 144
  grows and their 288 default I9 bodies. 144 were added, all `ok`: the
  I9 bodies answering the monitoring stack on the 72 cells that grow
  HTTP, which a refused cell never reached. That makes 1,280 verdicts,
  every one `ok`. I10 now grows all 192 plain cells and all 128
  histories.
- `shared-files.golden.json` changed no entry it had. It gained 966,
  on the 240 JVM modulith cells and 78 basic CLI ones: each assembly's
  build file, composition root and boot class, recorded on HEAD's code
  (below). The root `settings.gradle.kts` and `pom.xml` the shells
  register in, which it records on every JVM cell of their build
  system, the 84 peer cells and 72 history cells among them, passed
  byte-identical.
- The greenfield, brownfield, composite and planner-readiness goldens
  and the docs matrix regenerate byte-identical. The known files are as
  they were: brownfield's `{"I5": {}}`, and `{}` for the others.

**The proof.**

- **I10.** It holds the JVM's 48 peer cells and 96 history cells to
  their twins byte for byte, manifest and queued actions included, the
  wrapper and `spotlessApply` among them. The twin's order, which
  growth already runs in, is now in the JVM's bytes too. Each context's
  wiring adds its modules to the new assembly's build file right after
  the kernel on Gradle, and after the skeleton's
  `greeting-user-side-service` on Maven, so the last added comes first
  there either way. It adds its entry to the lists the container reads
  at their end, so the last added comes last. The peer's wiring, on
  Spring and Micronaut, rewrites the one-line forms of those lists the
  new bootstrap rendered, and `walking-skeleton` installs it beside
  that bootstrap, first. With the replay reversed, I10 failed on
  exactly 120 cells: every JVM history (96), Rust's 8 and
  TypeScript's 16. Go's still passed.
- **The render guard** passes, with the JVM's peer and context adapters
  rendering the same both ways. No adapter renders otherwise but the
  family kits.
- **No greenfield byte moved with the split.** HEAD's code and this
  step's each scaffolded all eighteen JVM presets on Gradle and Maven,
  on both layouts, with and without the peer context and the agent
  harness, and each modulith again after the history: 360 settings and
  28,740 files, byte-identical, manifests and the 1,440 queued actions
  included. They did the same with the whole extras menu `keel.dials`
  offers, on each build system, layout, peer and history setting: 180
  settings and 21,360 files, byte-identical, with 720 queued actions.
  The harness fix (below) then moved one line of the root `AGENTS.md`
  (two on the CLI + REST presets), and that file's hashes in the
  manifest, on the 144 modulith settings with the harness.
- **The e2e suites.** All sixty-three the text names pass here, 65
  tests: the twenty-four `add-module-*`, the twelve JVM
  `combo-modulith-*` and the twenty-seven JVM `modulith-*` suites —
  the twenty-four named for a framework, on both build systems, and
  the three Quarkus REST ones, `modulith-baseline`,
  `modulith-persistence` and `modulith-persistence-mariadb`, on
  Gradle. Neither the peer nor `keel add module` reaches those three,
  and with no Docker daemon here the two persistence suites compiled
  their database-bound tests without running them, as they do on any
  machine without one. They ran with JDK 25 and the host Gradle 9.7.0
  (below), each suite's fresh dependency home backed by the local one
  read-only — Gradle's `GRADLE_RO_DEP_CACHE` over a copy of its cache,
  Maven's `maven.repo.local.tail` through `MAVEN_OPTS` — since
  fetching it all from Maven Central meets its 429s
  (`tests/e2e/AGENTS.md` now says how). Fifteen Gradle suites first
  failed resolving dependencies on those 429s, before compiling
  anything, and passed when run again — thirteen after the on-disk
  growths below had fetched what they lacked, and the two persistence
  ones, whose dependencies nothing else fetches, a minute later. The
  twelve combo suites scaffold with the peer context, so every JVM
  peer modulith grown with no history now has a suite by proof, its
  twin's. CI runs the whole grid on push.
- **On disk**, with the real deferred actions, JDK 25 and the host
  Gradle taken from the 9.7.0 wrapper distribution (the image's 8.14.3
  cannot start on JDK 25, `.github/AGENTS.md`):
  - `quarkus-cli` on Gradle, on the modulith with the peer context and
    the history, grew HTTP. `./gradlew build` passed, its 33 tests
    among them `application/api`'s `GuestbookWiringTest`,
    `OrdersWiringTest` and `ShippingWiringTest`, each dispatching
    through the real container. The CLI jar greeted. The REST jar
    answered `/greet` with 200 and a correlation id, a blank name with
    a 400 problem, and both health probes with 200.
  - `micronaut-rest-kotlin` with the same history grew the CLI. The
    build passed its 33 tests, the new assembly's three wiring tests
    among them, through the hand-wired mediator the wiring extended,
    and the CLI jar greeted.
  - `spring-rest` with the same history grew the CLI. The build passed
    its 33 tests, the new assembly's three wiring tests through
    `Main`'s widened scan, and the CLI jar greeted.
  - `quarkus-rest-kotlin` with the same history grew the CLI, with 33
    tests passing, and the CLI jar greeted.
  - `spring-cli` on Maven with the same history grew HTTP. Its
    `./mvnw verify` passed 33 tests, the new assembly's three wiring
    tests through `Application`'s widened scan among them. The CLI jar
    greeted, and the REST jar answered `/greet` with 200 and a
    correlation id, a blank name with a 400 problem, and both health
    probes with 200.
  - In each, nothing of the existing assembly changed but the
    formatting of what `keel add module` had written: both contexts'
    modules, and their `<Name>Wiring` and its test. The growth's queued
    `spotlessApply` formats the whole project (R.2b), and
    `keel add module` queues no formatter, so the twin keeps those
    files as rendered. I10 compares staged trees and cannot see it; the
    Backlog now has it, _A JVM context lands formatted_.

**The tests.**

- `jvm-context.test.ts` goes from 19 to 23 cases, its composed
  project's one becoming five under a `describe` of their own. The
  context is wired into each assembly by an adapter of its own, the
  same class in each but for its package line, and on a `quarkus-cli`
  project into the CLI's alone. On `spring-cli-rest`, each wiring
  adapter widens its own assembly's boot class, `Main` in the CLI's
  and `Application` in the REST one. On `micronaut-cli-rest` and
  `quarkus-cli-rest` on Maven, each assembly pom declares the context
  right after the skeleton's seam, not at a `</dependencies>` (on
  Quarkus the first closes `<dependencyManagement>`): with the context
  put before the first `</dependencies>` or the last, both cases fail.
  On all six bindings, both build systems and both entrypoints, every
  patch of each wiring adapter but the seam note's refuses a file
  drifted past its anchors naming that adapter, a plain throw's prefix
  or a `PathConflictError`'s `adapterId`: 40 refusals. The Micronaut
  Kotlin `taken` refusal names
  `bounded-context/micronaut-context-kotlin-rest`.
- `peer-context.test.ts` goes from 29 to 39. For each framework and
  language, the peer resolves its shell and one wiring adapter per
  entrypoint, and the two wiring tests are the same but for the
  package. Spring's wiring adapters patch their own boot class, `Main`
  or `Application`, and their three drift errors name
  `walking-skeleton/spring-peer-context-cli`. On every framework,
  language, build system and entrypoint, each of the 60 patches the
  peer's wiring adapters contribute refuses a drifted file naming its
  adapter, and Micronaut Kotlin's refuses a hand-rewritten handler
  list naming `walking-skeleton/micronaut-peer-context-kotlin-cli`.
- `claude-kit.test.ts` (the agent harness's family kits) goes from 15
  to 16. The Spring REST modulith's runbook names the skeleton's REST
  row and no CLI one, a Micronaut CLI modulith's the CLI row alone, and
  its CLI + REST twin's both, in that order, with no
  `modules/<ctx>/user-side/api` or `cli` left. The old negative
  assertion there, no `modules/<ctx>/user-side/cli/`, held on every
  JVM stack once the rows named `greeting`, and now reads
  `modules/greeting/user-side/cli/`.
- `shared-files.golden.test.ts` records each JVM modulith assembly's
  build file, composition root and boot class (below).
- `add-entrypoint.test.ts` goes from 44 to 46. A Micronaut Kotlin peer
  modulith with a history of `orders`, then `billing` consuming it,
  then `shipping` consuming `billing`, is grown and equal to its twin
  byte for byte. The new mediator takes `welcome`, `orders`, `billing`
  and `shipping` in turn and lists their handlers in that order, and
  the new assembly's build lists `shipping`'s modules above
  `billing`'s, above `orders'`, above guestbook's. A Spring peer
  modulith on Maven, with `orders` then `billing`, grows the CLI equal
  to its twin, `Main`'s scan listing both after guestbook in recorded
  order and its pom `billing`'s seam above `orders'`. No sort by name,
  either way, and no reversal gives those orders: both cases fail with
  the replay sorted by name, and with it reversed.
- The refusal's own cases move onto a fixture (below): the handler's
  two, the status's, the hint's and the page's two, in
  `additions.test.ts` and `project.test.ts`.

**The cost.** Measured alone, the growth axis takes about 77 s, against
46 s for HEAD's code on the same machine. 144 more cells grow for real,
held to 72 more twins, so it scaffolds 480 projects (it was 408) and
runs 384 `keel add module`s (288), each a JVM project heavier than the
others. The whole grid takes about 80 s wall (it was about 52 s),
and the full CI-mode run about 185 s, against 182 s for HEAD's code on
the same machine, with 3,158 tests passing where HEAD's passes 3,141:
the growth axis runs beside the rest.

`docs/cli.md` (`keel add entrypoint`, and the hint and pointer
sections), `docs/composition.md` (Growing an entrypoint, which now
says where the order shows in the JVM's bytes), `docs/plugins.md`,
`docs/stacks/jvm.md`, `docs/ui.md`, `docs/development.md` (what the
R.1a golden records), the README, `tests/AGENTS.md`,
`tests/e2e/AGENTS.md` (and how to run the JVM suites locally),
`src/domain/core/AGENTS.md`, `src/domain/contract/AGENTS.md` (its
example of a project growth refuses), `bounded-context.ts`,
`micronaut-root.ts`, the JVM layout's and `GrowthPlan.adapters`' docs
say what changed. R.2b's CHANGELOG entry under _Added_ now says what
the JVM's moduliths do, with I10's new counts, and R.2c's under
_Changed_ names the refusal a plugin family still gets in place of its
"for now".

Beyond the text above:

- **The factories are plural.** `jvmContextAdapter` and
  `jvmPeerContextAdapter` returned an adapter; `jvmContextAdapters`
  and `jvmPeerContextAdapters` return `{ shell, wiring: { cli, rest } }`
  (`JvmContextAdapters`), and each framework file exports its six. The
  wiring ids end in `-rest`, as the text says, where Go's, Rust's and
  TypeScript's end in `-http`: the JVM calls its HTTP entrypoint REST
  everywhere else (`quarkus-rest`, `JvmArch`).
- **The errors name the wiring adapter.** The peer bindings' plain
  throws, both factories' dependency throws, the context's Spring throw
  and its Micronaut `PathConflictError`s named the one adapter that
  patched the file, whose id is the shell's now. Each now names the
  wiring adapter that patches it, through the binding's new
  `adapterId`. A refusal's sentence names no adapter, so no sentence
  moved. `peer-context.test.ts` holds every peer wiring adapter's
  throws to that, and `jvm-context.test.ts` every context wiring
  adapter's, on each framework, language, build system and entrypoint
  (above); `jvm-context.test.ts` and `persistence-peer-context.test.ts`
  hold the `taken` refusal's data, and `refusals.test.ts`' example of
  it now names `bounded-context/micronaut-context-kotlin-rest`.
- **The guard on a tag set with no entrypoint went with
  `jvmAssemblies`**, as TypeScript's did with `tsAssemblies`. On such a
  tag set no wiring adapter matches.
- **The shells' `after`.** Both shells keep both bootstraps, since
  either may be the one present, and each seeds the root build files
  the shell registers in. Each wiring adapter runs after its shell and
  its entrypoint's bootstrap, which on Quarkus and Micronaut moves the
  peer's wiring after the port fake; on Spring the port fake, first by
  id, already ran before the peer. Neither writes a file the other
  does. The shell keeps the old adapter's id and `after`, so it takes
  that adapter's place, and `settings.gradle.kts` and `pom.xml` list
  guestbook's and the clock fake's modules in the order they did
  before: guestbook's first on Quarkus and Micronaut, the clock fake's
  on Spring (above).
- **The three stale docs, and their copies.** `bounded-context.ts`
  named a `modules.consumes` tag: the gateway is a branch on the inputs
  `keel add module --consumes` seeds, and the header says so. The
  combo-modulith comment was in all twelve JVM `combo-modulith-*`
  suites, not one, and all twelve now say each assembly is wired by an
  adapter of its own, and so do `tests/support/jvm-combo-e2e.ts`, which
  they call, and `modulith-quarkus-cli-gradle.test.ts`, which quoted
  the old `cli ? layout.cliRuntime : layout.restRuntime` and counted
  the shell's `include(…)` lines among the assembly's patches. The
  harness claim was the runbook's layout map on a JVM modulith,
  listing `modules/<ctx>/user-side/api/{contract,adapters}/` as what
  the REST assembly mounts, or `modules/<ctx>/user-side/cli/` as what
  the CLI one does (both, on a CLI + REST modulith), as if every
  context had them. Only the skeleton's does, and the peer and every
  context `keel add module` adds have none, so the map names
  `modules/greeting/…` and says no other context has any until you
  write them. That is a greenfield byte R.3 moves, knowingly: one line
  of a JVM modulith's root `AGENTS.md` (two on a CLI + REST one), and
  its hashes in the manifest. _Deliberately kept_ below says so, and a
  CHANGELOG entry under _Fixed_ does too; `claude-kit.test.ts` holds
  the rows (above). `tests/support/jvm-add-module-e2e.ts` named
  `jvmContextAdapter`, and now names the split.
- **The refusal needs a fixture now.** The tests that held
  `keel.contexts-need-rewiring`'s words on a real preset scaffolded a
  `quarkus-cli` peer modulith, which now grows. They scaffold it
  through `tests/support/unsplit-peer.ts` instead: the shipped registry
  with Quarkus' peer folded back into the one adapter it was, which
  picks its assemblies inside `contribute()`. That is what a plugin's
  family that does not split its wiring looks like, and every sentence
  and hint they hold is as it was. `agent-harness-grown.test.ts` put a
  skill on every `bounded-context` adapter, and a skill is one
  adapter's whole file, so it now puts it on the shells alone.
- **The refusal's sentence is kept.** `contextsNeedRewiringSentence`
  still reads "… cannot be added here yet: … and keel does not yet
  wire this stack's contexts into a new one", as R.3a worded it,
  though no keel preset reaches it now. What does, a modulith of a
  plugin's family whose context adapter picks its assemblies as it
  renders, is what it is still true of: keel, running that family's
  adapters, wires none of its contexts into a new entrypoint, and the
  family lifts it by splitting them, as `docs/plugins.md` says.
  Rewording it would move the words `add-entrypoint.test.ts` holds,
  and the hint and the page carry, for a case no keel preset reaches.
- **The R.1a golden records the JVM's assembly files.** Of its six
  root files, the split reaches only the two the shells register in,
  `settings.gradle.kts` and `pom.xml`, which passed byte-identical
  (above). The wiring goes where the bootstrap and the peer's and each
  context's wiring adapters all write: each assembly's build file and
  composition root, and Spring's boot class. It now records each
  assembly's build file, composition root and boot class, `Main` or
  `Application`, on every JVM modulith cell, and the basic CLI
  assembly's build file, at the same path. The entries were generated
  on HEAD's code, in a copy of its tree, and this step's code writes
  them byte-identical. Before, only `add-entrypoint.test.ts`' two new
  cases held any of those bytes, the contexts' order on two presets,
  and the peer's two dependency lines could be reversed in every JVM
  assembly with the whole suite passing, since I10 compares a grown
  project with a twin the same adapters write. The golden now fails on
  156 entries with that, and on 48 with each context's modules put
  above the kernel on Gradle.
- **The weekly sweep was not run.** Growth is no axis of it, and the
  step names no finding.

Not done here: an e2e suite of a grown JVM modulith with a history.
None of the combo suites adds one, so growth leaves those cells as
covered as `keel new` does, and the proof on disk stands in. And a JVM
context formatted as it lands, now a Backlog entry. With this step
every back-end family keel ships grows with its contexts, and epic R has
landed; growth's refusal of a context now stands only for a plugin's
family that does not split its context wiring.

### Decisions on record

Where a decision is genuinely open, the options are listed with a
recommendation.

- **DR1 — Where `### Dev container` ranks.**
  - (a) By the tags: 40 with `arch.server-http`, 25 without. This
    reproduces all 548 cells that have both sections, was prototyped
    with no greenfield change, and is pinned by R.1a's guard.
  - (b) By the preset the tags read as. This needs the registry
    inside a patch's `apply`, which `Ctx` does not carry.
  - (c) No rank, with R.2b moving the section instead. That breaks the
    rule that R never moves what is already there.

  **Recommend (a).** Taken in R.1a: `readmeSectionRank` ranks it 40
  on `arch.server-http` and 25 elsewhere, and `rank.test.ts` holds
  every single-service preset to the order that reading assumes.

- **DR2 — `devcontainer.json`.**
  - (a) Rank the in-place upgrade by the tags (R.1b). The docker
    feature and `"name"` go where the attached template puts them when
    the project carries `arch.server-http`, and stay where they are
    otherwise. This moves no greenfield cell and keeps a user's other
    edits.
  - (b) R.2b re-renders `dev-container` after dev-env. This gives the
    twin's bytes, but overwrites a user's edits (they are shown in the
    `diffs`).
  - (c) A fixed rank for the docker feature. This moves the 36 cells
    that put it first.
  - (d) Exempt the file from I10 permanently.

  **Recommend (a), falling back to (b)** if the upgrade cannot reach
  the template's bytes. Taken in R.1b as (a): the upgrade reaches the
  attached template's bytes on every family, so (b) is not needed. It
  runs only where growth installs dev-env: a CLI project that took
  dev-env as an extra keeps the shape that extra wrote, knowingly
  unlike the twin and outside I10 (R.2a).

- **DR3 — The harness re-render versus D12** ("proposed, never
  automatic").
  - (a) Automatic, as part of what adding an entrypoint means. The
    harness would otherwise be false (a runbook that says "CLI" next to
    a REST assembly). The plan names the re-render, the dry run shows
    it, and the report carries its diffs. The cost: user edits to
    template-owned harness files are reverted, as under `keel add
agent-harness --reapply`.
  - (b) Only propose `--refresh agent-harness`. The project is then not
    the twin until the user accepts.
  - (c) Refuse where a harness file's disk hash differs from the
    recorded `sha256Current`. This is a step toward L.

  **Recommend (a).** Taken in R.2b: the harness re-renders wherever it
  is installed, and the report carries the diffs.

- **DR4 — The grown manifest.**
  - (a) Record at rank, with R.2a's hash fix. The manifest is then
    compared byte for byte.
  - (b) Record by append, and have I10 compare the manifest as data,
    with the kit hook's hash normalised. The manifest stays
    distinguishable, and `retrofitHarness` replays verticals in a
    different order. Whether that ever moves a byte was not measured.

  **Recommend (a).** The hash fix landed in R.2a: every entry of a
  file a `keel new` or `keel add` writes records the bytes the run
  leaves it, so the kit hook's entry and a later write's agree with
  disk. Recording at rank landed in R.2b — the new `verticals` rows,
  `answers` keys and harness entries — and I10 compares the grown
  manifest with the twin's byte for byte.

- **DR5 — How a grown project settles.**
  - (a) An `actionsOnly` replay. This gives the twin's actions, and I10
    can check them.
  - (b) Each newly matching bootstrap queues its own fetch, following
    the precedent of `ts-context`'s `workspaceInstall`. JVM formatting
    is left to the pre-commit hook, and a template that is not a
    formatter fixed point then fails the first `spotlessCheck`.
  - (c) Queue nothing, and have the report say what to run.

  **Recommend (a).** Taken in R.2b: every vertical of the twin that
  is not placed at a repository root replays for its actions
  (`actionsOnly`), and I10 checks the queue against the twin's, less
  version control's. An extra the project took is no vertical of the
  twin, so it queues nothing again: with extras, the grown queue can
  lack an extra's own fetch (persistence's `go mod tidy`), which
  repeats the bootstrap's today. I10 has no extras.

- **DR6 — How R.2 knows an already-matched adapter would need
  re-rendering.**
  - (a) Structurally, held honest by the render guard. The refusal
    lifts family by family as R.3 lands.
  - (b) A hard-coded "modulith with more than the skeleton". Each R.3
    step would have to edit it.
  - (c) An `Adapter` declaration of the tags `contribute()` reads. That
    is a contract field every plugin must keep true, and today it has
    one reader.
  - (d) A render probe at run time. `keel.project-status` would then
    render every adapter twice on each call.

  **Recommend (a).** (c) becomes the right move if a second reader
  appears. Taken in R.2a: `growthOf` refuses a context while no adapter
  requiring its marker also requires the entrypoint's tag, and
  `growth-render.test.ts` holds that reading to the renders both ways.
  R.3a narrowed it to the adapters growing runs: the installed
  verticals' for the peer, the replayed `bounded-context`'s for an
  added context. R.3b lifted Rust's refusal, R.3c TypeScript's and
  R.3d the JVM's, the last, with no edit to it, as (a) intended. No
  family keel ships is refused any more; the reading stands for a
  plugin's family whose context adapter picks its assemblies as it
  renders.

- **DR7 — The word.** `keel add entrypoint cli|http`, with the word
  carried by `ENTRYPOINTS`. `server-http` is also accepted, since the
  finder prints it. `spa` is recognised and refused with its reason.
  `entrypoint` and `module` become reserved first words, and the
  registry refuses both as vertical ids. A `--entrypoint` flag on the
  vertical form was rejected: it could not combine with
  `--reapply` or `--refresh`. The word landed in R.2a: `ENTRYPOINTS`
  carries it, `entrypointNamed` takes it or the id, and `growthOf`
  reads `spa` as `keel.uncoverable-entrypoint`. The reserved first
  words landed in R.2b: the CLI reads both, and the registry refuses
  both as vertical ids.
- **DR8 — I10 is hard from R.2b**, with no allowance: every cell is
  either `ok` or its golden refusal. Taken: `HARD` lists I10, and
  `growth.known.json` is `{}`.

### Not in scope for R

- **Removing an entrypoint, or `--reapply` of one.** That needs L's
  merge base.
- **A browser SPA.** A front end is a product's other service; that is
  U's `keel add service`.
- **Growth inside a monorepo product**, at its root or in a service.
  That is U's. A polyrepo service, which no product root records,
  grows as a repository of its own (R.2b).
- **Byte identity with extras installed.** A CLI or SPA project that
  already has dev-env keeps `### Dev environment` below
  `### Dev container` and keeps the attach-shape `devcontainer.json`.
  This belongs to the weekly report-only lane.
- **Plugin presets off the drill-down**, which are refused. Plugins
  also get no access to `rank.ts`.
- **Driving adapters** (a subcommand, a resource) for added contexts.
- **`web-components` context wiring.**
- **Staleness detection:** `keel docs check` seeing a stale runbook.
- **The marker guards' whole-file reach.**
- **Converge.** That is S.

### Deliberately kept

- **The manifest records tags, not a preset id.** The twin is the
  drill-down's reading, and R adds no tag; `ENTRYPOINTS` gains a word.
- **One e2e suite per cell.** R keeps it by proof (I10).
- **D12 still governs every refresh R does not name.**
- **R.1 and R.3 move no greenfield byte of a keel preset** but one,
  knowingly: the stale harness line R.3d was asked to fix, one line of
  a JVM modulith's root `AGENTS.md` (two on a CLI + REST one) and its
  hashes in the manifest. A plugin preset's README now takes keel's
  section order (R.1a), and its root scripts and its dev container
  keel's order too (R.1b).

---

## S — One converge operation

**Proposed 2026-09-27 from thirteen research passes over `babae29`**
(R's merge). None of the passes edited the repository. Q's
_Successors_ named this epic, and R's _Not in scope_ left converge to
it. S adds no command, no flag and no manifest field. Every path that
installs or re-renders verticals becomes a caller of one operation:
`keel new`, `keel add` (with `--refresh` and `--reapply`),
`keel add entrypoint` and `keel add module`. `keel toolchain`,
`keel link` and `keel docs sync` stay commands of their own (DS6).
The three things
that operation makes true, which no path makes true today, each land
as a step of their own, with its golden naming the cells it moves:

- a re-render keeps what later verticals wrote into the files it
  rewrites;
- one order for what the manifest records;
- a leftover is said, not silently kept.

**Goal.** One operation reads the manifest and computes the
composition the project is to have: what the manifest records, plus
what the command asks for. It then converges the project onto that
composition:

- it installs what the composition lacks;
- it re-renders what the command names;
- it records what is new where one run of `keel new` records it;
- it takes nothing away: no command can ask it to, and where
  reaching the composition would need a removal, it refuses or says
  what it leaves, citing L's missing merge base (DS5).

Its callers keep their surface, their gates and their words.
`keel new` is the operation run from a seed manifest, so `new` and `add`
become two front doors of one operation (DS1, recommended).

Today `keel add walking-skeleton --reapply` on a Go HTTP project
rewrites `cmd/http/main.go` to the pristine template and drops
observability's wiring. That is R's blocker 8, which R worked around
and did not fix. After S the bootstrap re-renders within the recorded
composition: every other vertical's patches are replayed onto the
files the bootstrap rewrote, and onto no other, so observability's
lines come back (DS4).

### How the research was run

**Setup.** Every run went through `babae29`, from a `dist/` built from
it or from its sources under vitest, wired the way
`tests/support/factory.ts` wires the grid: real
templates, filesystem or in-memory Trees, `FakeProcessRunner`, a
pinned `FakeClock`, and deferred actions recorded rather than run.
Every figure is measured unless it is marked _(inference)_.

**Thirteen passes.** There was one reader per path that changes a
project, and one each for the engine, the grid and the schema:

- `keel add`;
- `--reapply` and `--refresh`;
- `keel add entrypoint`;
- `keel add module`;
- `keel toolchain`;
- the planner's closure;
- `keel new`;
- the install engine every path calls;
- the other writers: `keel link`, `keel docs sync` and the harness
  retrofit;
- `keel ui` and the preview;
- the grid and its goldens;
- the manifest's schema.

A thirteenth pass measured the paths against one another.

**What was measured.**

- **Rebuilt from the manifest.** 443 scaffolds: every single-service
  preset on every dial setting, harness on and off (300), and every
  offered extra alone on the opening dials (143). Each was rebuilt
  into a second directory from a `keel new` command derived from its
  manifest alone, and compared byte for byte, manifest included.
- **Implied against ran.** For 231 `keel new` cells and 143 `keel new`
  then `keel add` cells, the adapters each recorded vertical resolves
  to on the recorded tags were compared with the adapters the runs
  reported.
- **Fixed points.** 830 cells:
  - every dial setting with no extras and with the whole menu;
  - every modulith setting after a module history;
  - every product under both layouts, at the root and in each service.

  Each was re-rendered whole: once with `--reapply` naming every
  recorded vertical, and once naming only those `keel add` can name.
  Separately, 500 cells (the 300 settings, and the 200 modulith
  settings after a history) re-rendered each vertical alone.

- **Mixed projects.** 94 projects over seven presets, built from
  `keel new`, `--with`, `keel add`, `keel add entrypoint` and
  `keel add module`. For each, the adapters the manifest implies were
  compared with the adapters that ran.

- **Arrival.** Three comparisons:
  - `keel new --with y` against `keel new` then `keel add y`: 143
    pairs;
  - `keel new --with a,b` against `keel new --with a` then
    `keel add b`: 636 ordered pairs;
    - `keel new --no-agent-harness` then `keel add agent-harness`,
      against `keel new`: 56 cells, and again after one offered extra:
      143 cells, each also run through `keel docs check`.

  Each compared the whole tree and the raw manifest.

- **Order.** Whether the planner reproduces a preset's order (28
  presets), and whether it reproduces `keel new`'s order with the
  extras (171 cells). What installing a preset in the planner's order
  does (28), and what reordering a preset's own verticals moves (6
  presets, 3 orders each).
- **The schema.** What a keel reading this manifest does with a field
  it does not know, with `version: 3`, and with a toolchain block
  `schemaVersion` of 2.

### The finding that shaped it

**The manifest already is the project. The paths disagree only about
how to say so.**

1. **The composition needs no new record.**
   - On all 300 dial settings, the drill-down places the project back
     on its own preset, with no collision. The recorded verticals equal
     that preset's on its dials, in order.
   - All 443 rebuilds are byte-identical, manifest included. The
     command they were rebuilt from reads:
     - the preset off the tags (`profile.ts` `projectProfile`);
     - the build system and layout off their tags;
     - the peer context off `modules.peer-context`;
     - the harness off whether `agent-harness` is recorded;
     - the extras as the recorded verticals less the preset's;
     - the answers as recorded.
   - Resolving each recorded vertical on the recorded tags gives
     exactly the adapters that ran, in order: 231 of 231, and 143 of 143.
   - Across 94 mixed projects, no adapter matches without having run.
     The only adapters that ran and no longer match are the added
     contexts', whose marker `keel add module` strips.

   What cannot be derived is where the drill-down places nothing: a
   plugin preset off the tree, a manifest migrated from v1, and a
   product root, which records its services by preset
   (`services[].stack`).

2. **Re-rendered whole, the composition is a fixed point almost
   everywhere.** On all 300 dial settings with no history, one
   `--reapply` run naming every recorded vertical stages nothing. The
   manifest moves `updatedAt` alone. Of the 830 cells, 516 are fixed
   points. The other 314 are exactly the three places where a path's
   reading of the project is narrower than the manifest:
   - **200 module histories.** `keel add module` records a
     `bounded-context` row that `--reapply` cannot name, so naming
     every recorded vertical is refused as `keel.unknown-vertical` on
     all 200. Naming only those `keel add` can name, the bootstrap's
     re-render loses each context's wiring, for good, on 188 of the
     200 (JVM 144, Rust 12, TypeScript 24, `web-components` 8). Go's
     12 wire their contexts into files the bootstrap does not write.
   - **108 cells with a dev environment taken as an extra** on a CLI or
     SPA preset. `dev-container` reads, inside `contribute()`, whether
     `dev-env` is recorded (`devEnvInstalled`), and `dev-env` reads
     whether `dev-container` is. Neither declares it: a mutual
     `Vertical.reads` is refused as a cycle. Re-rendered after the dev
     environment, the definition comes out as the attached template.
     One run wrote the standalone definition, which `dev-env` then
     attached in place (R.1b), with the docker feature first and
     `"name"` above the note. The other two reads of the vertical list,
     persistence's of observability and distribution's of both, are
     declared. They are what `--refresh` exists for (D12), and they
     make no cell off here.
   - **6 monorepo product roots.** Their glue row, `fullstack`, cannot
     be named either. The product root is U's.

   One vertical re-rendered alone is not a converge.
   `walking-skeleton` alone changes files on 19 of the 28 presets on
   their opening dials, and on 400 of the 500 cells. It rewrites its
   whole files and drops what later verticals patched into them:
   - observability and persistence on every HTTP preset;
   - code-style on `web-components`;
   - the gateway in a product's front end;
   - each context's wiring.

   On the 300 settings with no extras, every other vertical
   re-rendered alone is a fixed point. So
   `keel add walking-skeleton --reapply` is still R's blocker 8.

3. **Files converge; the record's order does not.**
   - **143 single-extra pairs.** Every file is identical, and so is the
     action queue. The manifest is identical in 106. In the other 37 it
     differs only in the order of `entries`: 18 of them are
     persistence and 19 are iac. The add appends its new harness entry,
     where one run realizes it in place.
   - **636 ordered pairs.**
     - 167 are identical.
     - 431 differ only in the manifest's order: `verticals` rows,
       `answers` keys and `entries`.
     - 36 differ in files. Each of those carries the refresh the later
       add proposed (D12): distribution reads persistence.
     - 2 are refused on one side only (Q3.4's finding 3).
   - **56 harness adoptions.** Every file and every entry is
     identical. `agent-harness` is recorded last instead of third.

   That last difference is not cosmetic. The navigation index replays
   the verticals in recorded order, and a directory takes the first
   description it meets (`dedupeDocs`). So on 18 of the 143 projects
   that adopted the harness after one extra (every stack with
   persistence), `keel docs check` is red, and `keel docs sync` then
   moves `AGENTS.md` away from what one run writes.

   A new row lands in one of three places today:
   - `keel new`: the preset's order, then the extras in `admit`'s
     order;
   - `keel add` and `keel add module`: appended;
   - `keel add entrypoint`: at the twin's rank (`placed`, `atRank`),
     which I10 holds byte for byte.

   The planner cannot supply a target order. It returns the delta
   alone:
   - handed a preset sorted by id, as `admit` hands it, it reproduces
     none of the 28 presets' orders;
   - installed in that order, every one of the 28 throws on a patch
     target not yet written;
   - named preset first, then the extras it planned, it reproduces
     `keel new`'s order on 171 of 171.

   Reordering a preset's own verticals, where the run still installs,
   moved no file on the six HTTP presets measured, since R.1's ranks
   see to that. It did move the manifest and the action queue.

4. **Every path is one engine with a different mix of switches.**
   - `keel new`: the `scaffold` posture, and the engine finalizes the
     harness.
   - `keel add`: the `install` posture, the handler's harness buffer,
     the retrofit, the restamp and the proposals. `--refresh` and
     `--reapply` add the `reapply` posture per vertical.
   - `keel add entrypoint`: `only`, `actionsOnly`, the context replay,
     the buffer sorted to the twin's rank, and `atRank`.
   - `keel add module`: one `installVertical` of keel's
     `bounded-context`. The engine finalizes, then the handler
     re-indexes the root map and rehashes its entry.

   The tail is copied nearly line for line between `add-vertical.ts`
   and `add-entrypoint.ts`: the retrofit, the finalize, the restamp,
   the `keel.reapply-conflict` mapping, the proposals and the commit
   order. So is `proposalNote`.

   `keel new` is already converge-shaped. Run the way `keel add` runs
   it, with a caller's harness buffer and `finalizeHarness`, on the
   same seed and order, it writes the same bytes, manifest included,
   on 4 of 4 cells. It does so under the `install` posture too, on an
   empty directory.

   Only `keel add entrypoint` computes a target and makes the project
   equal to it. It is the prototype, and its general half is the
   operation:
   - adapters newly matching, before and after;
   - recording at rank;
   - settling;
   - the harness re-rendered and realized in the target's order.

**Three further facts set S's scope.**

- **Nothing is ever removed, and nothing says so.** No domain code
  deletes a file. On `quarkus-cli-rest` under Gradle, distribution
  resolves to the native binary until a container image arrives.
  `--refresh distribution` then moves it onto the image's pipeline,
  and leaves behind:
  - `.github/workflows/native-build.yml` and `release.yml`;
  - the answers key `distribution/quarkus-cli-native`;
  - the tag `runtime.graalvm-native`.

  One run never writes them. The report says nothing: no diff and no
  note. This is Q3.4's finding 2, still open. The weekly `arrival`
  suite, filtered to that preset, finds exactly its 12 findings, all
  of them this one and finding 3.

- **The toolchain engine converges something else.**
  `keel toolchain install|check` renders the block onto the managers'
  own files and the machine. Its desired state reads the manifest's
  toolchain block, the lockfiles on disk and the managers' answers,
  and its verdict includes which tools are installed. dependency-cruiser holds it apart both ways.
  The block's needs are composition state already, written by the
  `toolchain` vertical through `foldToolchain`. Growing an entrypoint
  on a project with the toolchain wrote the twin's bytes on four
  families.
- **An older keel strips a field it does not know.** The schema's
  objects are zod's default strip objects, so an older keel reads an
  unknown key, at the top level or in any row, and drops it on its
  next write. Six commands write the manifest. `version: 3` is
  unreadable, and so is a toolchain block with a `schemaVersion` of 2:
  both throw a raw `ZodError` off the `Err` rail. Reordering rows is
  readable by every keel. So S records nothing new (DS2). It needs
  nothing new, by (1).

### What stands in the way

The passes found each of these, and each is resolved by the step
named.

1. **No composition exists as a value.** Each handler assembles its
   own `installVerticals` call and copies the same tail. Resolved by
   S.2 and S.3.
2. **Three placement rules, and no target order.** The planner closes
   and orders the delta. Nothing orders the whole. `keel new` takes
   the preset's array as data, `keel add` appends, and growth ranks
   by its twin. `mergedById` assumes a request sorted by id: named in
   preset order, with its prerequisites left to the planner, a
   container image lands before `vcs` on 36 of 36 cells. S.2 names
   one reference order, the one `keel new` of the composition
   records. S.3 to S.6 keep each caller's placement as it is, and S.8
   moves `keel add` onto the reference.
3. **Contexts live outside the vertical list.**
   - `keel add module` records a `bounded-context` row that no
     re-render can name.
   - It installs every matching context adapter, while growth
     installs the newly matching ones.
   - It finalizes the harness per context, while growth shares one
     buffer. Two contexts finalized on one ownership collide on the
     map region.
   - The harness retrofit replays every recorded module, the skeleton
     and the peer included. Growth's `contextsOf` reads the added ones
     alone. Replaying the skeleton or the peer through
     `bounded-context` for their files is refused as a path conflict,
     or stages 8 to 12 foreign changes.

   Resolved by S.5 (one reading, one buffer, the retrofit) and by S.7
   (the contexts come back with the vertical whose files they patch,
   DS10).

4. **A re-render of one vertical drops what later verticals wrote into
   its files.** This is R's blocker 8, and it is still open. Resolved
   by S.7.
5. **The dev container's two shapes are chosen by arrival.** In one
   run the definition is attached by whichever of `dev-container` and
   `dev-env` comes second. On an HTTP preset, the template renders it
   attached. Where the dev environment is an extra, `dev-env` attaches
   it in place. A re-render of the definition after the dev
   environment writes the template's shape, whatever wrote the one on
   disk. R ranked this by the tags (DR1, DR2). S.7 finishes the same
   closed form: without `arch.server-http`, `dev-container` renders
   what the in-place attach leaves. No greenfield cell renders that
   branch, since on those presets the dev container always comes
   first.
6. **What a re-render leaves behind is not said.** Resolved by S.9.
7. **The manifest takes no field an older keel keeps.** Resolved by
   DS2: S records nothing new, and (1) says it need not.
8. **`keel new` spans scopes.** A product stages several Trees and
   refuses a path two of them write (`crossScopeWrite`). Its order is
   the preset's data, which `admit`, sorting a request by id, does not
   reproduce. S.6 makes each scope a converge from its seed manifest
   and leaves the product's orchestration where it is. Product roots
   stay U's.
9. **Nothing pins what S would move.**
   - No golden records a manifest's bytes. The agent-harness golden
     leaves the manifest out, shared-files hashes six root files
     and the assembly files, and I8
     and I9 compare staged Trees, which hold no manifest. I10 compares
     a grown project with its twin, and the two can move together.
   - The grid never dispatches `--reapply`, `--refresh` or
     `keel add module` as a target of its own.
   - I9 is held on `keel new` and `keel add entrypoint` alone. It was
     measured on `keel add` on 319 of 319 cells, but nothing holds it.

   Resolved by S.1a and S.1b, before any code moves.

10. **The toolchain engine sits behind the dependency-cruiser wall.**
    It may import only the kernel and the contract, and `domain/core`
    may not import it. Resolved by DS6: it stays a command of its own.
    The `toolchain` vertical is a caller, through `keel add`.

### The measure

- **The paths golden (S.1a), hard from the day it lands.** It pins
  every path's output absolutely, where every other golden pins one
  facet of it or compares two projects that can move together. Its
  cells come from `keel.catalog`, `keel.dials` and
  `keel.project-status`. The one exception is the Q3.4 pair below,
  named for the finding it pins.
  - **`keel new`:**
    - every single-service preset on every dial setting
      `harnessSettings` walks, with no extras;
    - the whole menu on every setting with the harness;
    - each offered extra alone on the opening dials;
    - the whole menu on the opening dials under each of the grid's
      I9 answer bodies (`answerBodies`: every question answered away
      from its default, the same keyed to the sibling its asker
      borrows from, and one question answered twice), so that answer
      folding is pinned where the e2e suites' non-default answers
      reach it;
    - every product under each repository layout.
  - **`keel add y`:**
    - every offered extra alone on each preset's opening scaffold, on
      default answers and with every question its preview asks
      answered away from its default;
    - the same after the module history on each preset's modulith
      setting;
    - at each product root and in each service, under both layouts.
  - **`keel add agent-harness`:** on each preset's opening scaffold
    made with `--no-agent-harness`, and on each such scaffold made
    with each offered extra alone.
  - **`keel add b` after `keel new --with a`:** every ordered pair of
    offered extras on the opening dials of each preset that carries
    both entrypoints (read off `keel.catalog`'s tags), with the
    refresh each add proposes taken. Q3.4's finding 2 is pinned
    by name, since no pair rule reaches it: on `quarkus-cli-rest` and
    its Kotlin twin under Gradle, `keel new --with distribution`, then
    `keel add containerization --refresh distribution`, and the same
    with `keel add containerization`, then
    `keel add distribution --reapply`.
    - **`--reapply`:**
    - each recorded vertical alone, then the whole re-render (below),
      on each preset's opening scaffold and on its whole-menu
      scaffold, and in each service of every product under both
      layouts;
    - `walking-skeleton` alone, then the whole re-render, after the
      module history on each modulith setting. Every other vertical
      re-rendered alone there was measured a fixed point.
  - **`keel add module`:** the module history on every modulith
    setting.
  - **`keel add entrypoint`:** each single-entrypoint backend preset,
    both ways:
    - on its opening scaffold, with no extras and with the whole
      menu;
    - after the module history on its modulith setting;
    - on its opening scaffold made with `--no-agent-harness`, after
      `keel add agent-harness`;
    - once grown, followed by `keel add dev-container --reapply`.

  **What each cell records:**
  - its verdict: `ok`, the refusal's code, or `thrown:<Name>`;
  - a digest of each top-level entry of the tree it leaves;
  - the manifest, apart from the tree, digested per field, so that a
    move of the manifest alone reads as one and names its field;
  - the descriptions of the deferred actions, less version control's,
    whose wording depends on the machine's git;
  - the report's notes, proposals, changes (kind and path), diff paths
    and resolved adapters;
  - `keel docs check`'s drift count on the project it leaves.

  A cell is keyed by its command lines, joined by `&&`. A failure
  names the cell and what moved in it. The golden reads no other
  golden, and the converge golden (S.2) keys on it.

- **The whole re-render.** The measure's name for one `--reapply` run
  naming every recorded vertical that `keel add` can name, as a dry
  run. Those are all of them but `bounded-context`, which
  `keel add module` records, and a product root's `fullstack`. An added
  context's wiring comes back with the vertical whose files it
  patches (S.7, DS10).
- **I9 on every install target (S.1b).** Today the grid holds only
  `keel new` and `keel add entrypoint` to I9, a preview against a
  dry-run install. S.1b adds:
  - `keel add` of every card, and `--reapply` of every installed
    vertical, in the brownfield and composite axes;
  - `--refresh` of each installed vertical beside the add of the
    project's first `ready` card, in brownfield;
  - `keel add module orders` on each preset's modulith setting, where
    brownfield gains one scaffold per preset for it.

  I9 is hard already, so no known file moves. It was measured on 319
  of 319 `keel add` cells, and on 73 refusals.

- **I11: the recorded composition is a fixed point (S.1b, widened by
  S.7, hard).** A project's whole re-render stages nothing.
  - **Lands in S.1b** on the cells where it holds today: brownfield's
    scaffolds and each composite service. A product root is left out:
    its glue is U's.
  - **S.7 adds cells:** growth's twins, module histories included
    (I10 makes each grown project its twin's bytes, so the twin
    carries the grown cell), and brownfield's whole-menu scaffolds of
    the ten presets where the dev environment is an extra.
  - **S.7 adds a reading:** each recorded vertical re-rendered alone
    stages nothing, on brownfield and composite.
- **I12: arriving later equals one run (S.8, hard).** In the brownfield
  axis, on each preset's opening dials, the three pairs below leave
  the same project, every file and the manifest byte for byte:
  - `keel new X`, then `keel add y`, against `keel new X --with y`,
    for each offered extra;
  - `keel new X --no-agent-harness`, then `keel add agent-harness`,
    against `keel new X`;
  - `keel new X --no-agent-harness --with y`, then
    `keel add agent-harness`, against `keel new X --with y`.

  Pairs stay in the paths golden and the weekly lane. From S.8 the
  `arrival` suite normalises the manifest's timestamps alone, not its
  order.

- **I10 stays hard, and the four known files stay as they are**:
  brownfield `{"I5": {}}`, and greenfield, composite and growth `{}`.
  I11 and I12 land hard with no violation, so neither adds a key.
- **The converge golden (S.2).** `converge.golden.json` records the
  operation's reading on every cell the paths golden keys:
  - the target composition's order;
  - what each vertical of the run does;
  - the contexts it wires;
  - where it records;
  - or the refusal.

  R.2a's `growth.golden.json` regenerates from it byte-identical. It
  also holds the round trip: on every single-service `keel new` cell,
  and on each product's services, the reading names the preset, the
  dials and the extras that wrote the manifest.

- **The weekly sweep.** The `arrival` suite runs filtered, one preset
  per family, before S.7, after S.8 and after S.9. Each of those
  steps' Landed paragraph says what it found.

**Budget.** Today `CI=true pnpm test` takes about 225 s on four cores.
The grid's axes run in parallel workers, and growth, the longest, took
124 s of its 180 s `beforeAll` budget in that run. It takes about 77 s
alone. Three rules keep that in hand:

- The paths golden is some 2,500 real in-memory dispatches
  _(inference)_. The in-memory growth golden runs about 650
  dispatches in 17 s. So the paths golden is split by path into four
  files (`keel new`; adds and pairs; re-renders; modules and growth),
  each under about 60 s alone, each in a worker of its own.
- Brownfield takes about 5 s today. S.1b adds some 900 dispatches to
  it, S.7 ten real scaffolds, and S.8's I12 some 330 real runs,
  measured at about 50 s. It stays well below growth.
- Growth takes I11 on its 160 twins alone. If S.7 finds growth past
  about 150 s under `CI=true pnpm test`, it first lands, in a commit
  with no `src/` change, a shard option for `sweepGrid`. Each shard
  then writes a golden of its own, and all of them read the axis's
  one known file and never write it. No known file is added or moved.

Each step's Landed paragraph says what it added, file by file, under
`CI=true pnpm test`.

**Each step lands as** one commit that passes `pnpm lint`,
`pnpm typecheck` and `CI=true pnpm test`. The same commit carries its
docs, its CHANGELOG entry where a user can see the change, and its
Landed paragraph here. Two more gates apply where they are named:

- where a step changes what the page's previews show, the keel ui
  browser suites with `KEEL_RUN_E2E=1`;
- where a template or a re-render changes what a toolchain builds, the
  e2e suites that build it.

### S.1 — Pin every path first

#### S.1a — The paths golden (M) ✅

**The golden lands alone**, in a commit with no `src/` change, green on
today's code: `tests/domain/core/paths-*.golden.test.ts`, four files
with their JSON, over one helper in `tests/support/`.

- **Cells:** as _The measure_ lists them.
- **Factory:** the grid's `installMediator`, with a fake process runner
  and deferred actions recorded, not run. Every run is real, into the
  shipped in-memory `FakeTree` and `FakeManifestStore`. A dry run
  stages no manifest, and a manifest is what S moves. One in-memory
  disk, a map by absolute path, serves every scope:
  - each `Tree` a run opens is a `FakeTree` seeded with what the disk
    holds under its root, and commits back into the disk;
  - a product root and its services therefore see one another's
    files, which R.2a's per-directory map does not do;
  - a cell that starts from a scaffold copies the scaffold's files and
    manifest into a directory of its own.
- **Port:** `Mediator.dispatch`.
- **Updating:** `KEEL_UPDATE_GOLDEN=1`, written as `prettier --check`
  holds it, as the growth golden is.

Per-file hashes for every cell would come to some 6 MB. A digest per
top-level entry and per manifest field keeps the golden small and
still names what moved. Where a later step needs the file, it re-runs
the cell's command lines.

**Holds green:** itself, on today's code. Every other golden, the grid
and the known files are untouched.

**The proof** that it catches what it is for, in the Landed paragraph:

- one R.1a writer put back on an append moves the cells that reach it;
- two verticals of `keel add` recorded in the other order move those
  cells' `verticals` field, and no tree digest.

Both are tried and undone. The Landed paragraph also gives each
file's time.

`tests/AGENTS.md` records the golden beside the shared-files and
growth goldens. `docs/development.md` names the command that
regenerates it. `vitest.stryker.config.ts` leaves it out, as it leaves
out the grid and the other goldens that run in a `beforeAll`. No
CHANGELOG entry: nothing a user sees moves.

**Leaves out:** `keel toolchain`, `keel link` and `keel docs sync`,
which S does not make callers (DS6). `keel docs check` is read, as a
number per cell.

**Landed as the golden alone**, in one commit with no `src/` change.
`tests/support/paths-golden.ts` holds the Factory, the spelling of
each command line and the recording; the four suites hold one family
each, and `paths-machinery.test.ts` the Factory's own pins of a mode
and an instant (below). They record 3,436 cells, over 4,345
dispatched runs and 843 scaffolds, each made once and copied into
every cell that starts from it:

- **`paths-new`, 689 cells:** the 300 settings of the 28
  single-service presets, the harness on and off; the whole menu on
  the 150 with it; the 143 offered extras alone; the whole menu on
  each opening setting under the three answer bodies (84); and the six
  products under both layouts (12). 661 are Ok, and the 28 `twice`
  bodies `keel.unknown-answer`, as I9 has them.
- **`paths-add`, 1,326 cells:** the 143 extras alone on the opening
  scaffolds, and 98 of them again with their questions answered; the
  143 after the module history on the 28 opening modulith settings;
  171 adoptions of the harness (28 bare, 143 after one extra); 245
  ordered pairs on the nine presets carrying both entrypoints, in 265
  cells, since the 20 whose preview proposes a refresh are recorded
  taking it and not (below); Q3.4's second spelling on its two
  presets; and 504 adds at the product roots (168) and in their
  services (336). 1,150 are Ok. The rest are the refusals
  the composite grid records too, 84 `keel.not-initialised` at the
  polyrepo roots, 54 `keel.wrong-scope` and 36
  `keel.uncoverable-vertical`, and `keel.needs-refresh` twice:
  `keel add iac` after `keel new --with distribution` on the two
  Quarkus CLI-and-REST presets.
- **`paths-reapply`, 731 cells, all Ok:** 651 verticals re-rendered
  alone (176 on the opening scaffolds, 319 on the whole-menu ones, 156
  in the 24 product services) and the 80 whole re-renders.
- **`paths-grow`, 690 cells, all Ok:** the 200 module histories, the
  bootstrap re-rendered alone after each and each one's whole
  re-render; and 90 `keel add entrypoint` cells, five on each of the 18
  single-entrypoint backend presets.

`keel docs check` finds no drift on any cell but 18, as the research
found: the harness adopted after `--with persistence`, on the 18
presets that offer it. The re-renders read as the research measured
them:

- the whole re-render stages nothing on all 28 opening scaffolds, on
  all 24 services and on 18 of the 28 whole menus. The other ten are
  the presets where the dev environment is an extra, and each restages
  `.devcontainer/devcontainer.json`. After a history it stages nothing
  on 12 of the 200, Go's, and the bootstrap's files on the other 188;
- `walking-skeleton` alone stages files on 19 of the 28 opening
  scaffolds, 19 of the 28 whole menus, all 24 services and 196 of the
  200 histories. `dev-container` alone does on the same ten whole
  menus, and `distribution` on Q3.4's two cells. Every other vertical
  re-rendered alone is a fixed point on every cell.

The files take 35 s, 43 s, 13 s and 42 s alone (new, add, reapply,
grow), under `CI=true`, and 40 s, 49 s, 14 s and 49 s beside the rest
of `CI=true pnpm test`, which took 261 s on four cores against 208 s
and 240 s in two runs without them: some 35 s more. Growth's grid
axis took 105 s, against 111 s and 118 s. Those are at a load average
of 2 to 3; at about 7, with the step's other checks beside it, the
suite took 289 s and 330 s against 212 s, and the files 40 s, 45 s,
16 s and 48 s alone. The JSON comes to 1.20 MB, 3.59 MB, 1.78 MB and
1.18 MB.

**The proof**, each tried, then undone byte for byte:

- **An R.1a writer on an append.** Go persistence's README section put
  back on a plain append moved exactly one cell of the four files, in
  `tree:README.md` alone. It is the one cell where that section
  arrives below an existing `### Toolchain`:

  ```sh
  keel new --stack go-cli-http --module-layout basic --with toolchain && keel add persistence
  ```

- **Another record order.** `recordVertical` prepending in
  `install.ts`, which every path records through, moved
  `manifest.verticals` on every cell with a manifest: 661, 1,326, 731
  and 690 of them. No tree digest moved on a cell still Ok. The drift
  `keel docs check` reads moved on 603 of them, since the index
  replays the recorded order, and `manifest.entries` moved on 18 adds
  and `answers` on 80 growth cells. The 280 whole re-renders moved
  under their own keys: `manifest.verticals` and the report on all of
  them, since a re-render runs in recorded order, and the actions they
  would queue on 273. The 45 `keel add entrypoint` cells that stopped
  coming back Ok (10 `keel.path-missing`, 35 thrown) are the only
  trees that moved. As narrow as the plan words it, `add-vertical.ts`
  recording what one `keel add` installs in the other order moved 189
  adds, each one bringing a prerequisite, in `manifest.verticals`
  alone.

Beyond the text above:

- **Every `Tree` reports the net, as the filesystem adapter does.**
  The shipped `FakeTree` lists every write as a change. `FsTree` lists
  the net against the disk. Recorded through the fake as it ships,
  1,678 reports (523 adds, all 731 re-renders and 424 growth cells)
  listed files written back onto their own bytes, and every whole
  re-render seemed to stage something. The suite's `Tree` is a `FakeTree`
  subclass that reports the net. Between the two readings, no tree,
  manifest, verdict or drift moved.
- **File modes are pinned as git stores them.** The fake keeps the
  mode a write gives but cannot read one back, so the suite's `Tree`
  notes it and commits it with the bytes, a file written with none
  keeping the mode it had, as `FsTree` does. What it keeps is `0o755`
  where any executable bit is set and `0o644` otherwise
  (`pinnedMode`): an executable template reaches a run with the
  permission bits of the contributor's checkout, which git writes
  under their umask. Pinned as full octal, the four executable
  templates checked out `0o775`, as `umask 0002` leaves them, moved all
  731 re-render cells; pinned as git stores them, they move no cell
  of the four files. A file's line in its entry's digest is its path,
  that mode and its bytes, and an executable bit that moves alone is a
  `modify`, as `FsTree` stages it. The harness's hooks written `0o644`
  rather than `0o755` (`apply.ts`) moved `.claude`, or a service's, on
  every cell whose project carries the harness: 511, 1,326, 731 and 390.
- **Each command of a cell runs at its own instant**: `PINNED_NOW` for
  the first, a minute later for each position after it, the same day
  (`instantAt`), through a mediator wired over the same fakes per
  position. On one clock every timestamp a manifest records is one
  instant, whichever run wrote it, so a run that re-stamps what an
  earlier one recorded is invisible: a harness entry re-stamped on
  every run (`install.ts`) and a vertical re-stamped by its own
  `--reapply`, both at once, moved no cell. Per position, the first
  moves `manifest.entries` on 751 adds, all 651 real re-renders and
  390 growth cells, and the second `manifest.verticals` on 165 adds,
  the 651 and all 690 growth cells. The instant is the position's, not
  the sweep's order, so a cell copied from a scaffold records what the
  whole chain run in it would. Regenerated so, the golden moved in the
  manifest alone, `updatedAt` and the rows a later command stamps, on
  922 adds, 651 re-renders and all 690 growth cells, and on no
  `keel new` cell, whose one command runs at `PINNED_NOW`.
- **The report pins more than the plan lists.** Its subject and its
  skipped harness elements, which the command line and the page print,
  and each diff's hunks beside its path: a whole re-render is a dry
  run, so its tree is the base's, and on the 198 that restage files
  the hunks are what pins the bytes it would write. A skipped count
  one too high (`install.ts`) moved 250 cells in `report` alone, the
  150 `--no-agent-harness` scaffolds and the 100 whole re-renders after
  a history without the harness. The changes and diffs are pinned as
  sets, in code-unit order: a `Tree` lists them by `localeCompare`,
  which follows the machine's locale. Listed in the `Tree`'s order,
  the report moved under `LANG=cs_CZ.UTF-8` on 623 cells (617 of
  `keel new`, six adds), and nothing else did; as sets, the four files
  are green there.
- **A dry run's actions are the ones its report says it would queue**,
  since it runs none. Version control's are pinned too, on every run.
  The measure leaves them out because their wording depends on the
  machine's git; through the fake process runner it depended on the
  test's own directory instead, which an unscripted `git rev-parse`
  answers as the repository's toplevel. The fake answers that probe
  as outside any repository, so git's wording is the same on every
  machine. A dry run's report names no adapter to leave them out by.
- **The whole re-render names its verticals in code-unit order.** A
  re-render runs in recorded order whatever order it is named in, and
  only the report's subject follows the naming, so the key survives a
  change to the record's order.
- **`keel docs check` is read once per state.** A cell that leaves the
  tree and manifests another left (a refusal, a dry run, a fixed
  point) reads that one's drift. The check replays every recorded
  contributor, and without this it was a third of the time: the
  re-render family took 23.5 s, and the add and growth families 49 s
  and 51 s.
- **Q3.4's first spelling is a pair.** The pair rule reaches it: the
  add's preview proposes `--refresh distribution`. So it is one cell,
  recorded once, and so is the add that proposes it (below), which the
  finding's family names too. The second spelling is the one named. A
  preview that refuses proposes no refresh, so each
  `keel.needs-refresh` pair is recorded as its add answers.
- **A proposal is pinned on the install that makes it.** The text
  takes each proposed refresh, and an add that takes one proposes
  nothing more. Recorded so, none of the 1,306 add cells carried a
  proposal in its report: a change to what an install proposes moved
  no add cell unless the preview's moved with it, and S.4 re-plumbs
  exactly these, `--refresh` becoming a converge caller. The 20 pairs
  whose preview proposes a refresh are recorded again without it, 20
  cells, all Ok and with no drift, and each report carries its
  proposal: 18 `keel add persistence` on a project made with
  distribution, which reads persistence, and Q3.4's
  `keel add containerization` on its two presets, whose proposal moves
  distribution from `quarkus-cli-native` to `jvm-container`. Logged
  from `reportOf`, the add file's 1,326 reports carry those 20
  proposals and no other. They cost the add file some 2 s over the
  times above: back to back, under a load average of 4 to 8, its tests
  took 43.5 s and 43.3 s with them and 41.4 s and 41.9 s without.
- **The golden is not small.** A cell holds 12 to 34 top-level
  entries on a single project and 42 to 57 on a product, and 14
  fields per manifest, 15 where it records a toolchain: about 1.7 kB
  on a single project and 4 kB on a product. The four files come to
  7.7 MB, more than the 6 MB the plan put on per-file hashes. The same
  digests recur across cells, so they compress 29-fold (269 kB under
  `gzip -9` file by file, 294 kB under its default). A change reads
  through the failure's list of moved cells and fields, not the JSON's
  diff.
- **A cell's directory is named by the digest of its key**, under a
  fake root that no byte depends on. A refusal is recorded by its
  sentence, and the 84 `keel.not-initialised` at the polyrepo roots
  name where they looked, so the sentence reads the cell's directory
  as `<cell>`. All four families re-run under another root, with other
  directory names, recorded the same golden. Four presets sweep at
  once (`eachStack`), and the record is the same in any order.
- **`stopped:<verdict>`** marks a cell whose chain stopped before its
  last command, as `&&` does. No cell carries it today.

`tests/AGENTS.md` records the golden beside the shared-files and
growth goldens, and `docs/development.md` names the command that
regenerates it. `vitest.stryker.config.ts` leaves the four out, and
keeps `paths-machinery.test.ts`, whose cells run in its tests, in
under a second. No existing golden or known file moved. No CHANGELOG
entry: nothing a user sees moves.

#### S.1b — I9 on every install target, and I11 where it holds (S) ✅

`support/composition-grid.ts`' `holdParity` is generic over the install
target already, and I9 is hard. These cells are held to it:

- **Brownfield**, on each preset's opening scaffold:
  - a dry-run install beside each card's preview;
  - `--reapply` of each installed vertical;
  - `--refresh` of each installed vertical, beside the add of the
    project's first `ready` card.
- **Brownfield**, on one new modulith scaffold per preset:
  `keel add module orders`.
- **Composite**, in each service: the same as brownfield's opening
  scaffold.

The new cells are keyed `install:`, `reapply:`, `refresh:` and
`module:`, never `add:`. That keeps them out of the compatibility
matrix, which reads the brownfield and composite goldens by the
`add:` prefix (D8). `generated-docs.test.ts` passes as it is.

`INVARIANTS` and `HARD` gain I11, the whole re-render staging nothing.
It is held on brownfield's scaffolds and on each composite service.
Both are fixed points today: 300 of 300 dial settings were measured,
and every service under both layouts.

**Holds green:**

- the known files, unchanged;
- the brownfield and composite goldens: they gain keys, each the
  verdict its preview records, and no existing key moves.

No `src/` change. `tests/AGENTS.md`'s grid section says what each axis
now holds, adds I11 to the hard invariants and their steps, and gives
brownfield's new time.

**Leaves out:**

- a product root's re-render, refused as `keel.unknown-vertical` today,
  which is U's;
- the cells I11 cannot hold before S.7: module histories, and a dev
  environment taken as an extra.

**Landed as tests alone**, in one commit with no `src/` change, and no
existing verdict moved. `support/composition-grid.ts` gains I11 in
`INVARIANTS` and in `HARD`, and three helpers:

- `nameableOf`: the recorded verticals `keel.catalog` lists, in
  recorded order. What it leaves out is derived, never listed. It
  drops nothing on the 80 projects whose whole re-render is held. At
  each of the six monorepo product roots, composite throws unless it
  drops `fullstack` and nothing else, so the filter is seen dropping
  the row it is for. `bounded-context`, the other, is recorded only by
  a module history, which S.7 brings.
- `holdFixedPoint`: the whole re-render as one dry run
  (`installCommandFor` of `add-vertical` with `reapply`), read back
  through `Grid.staged`, so bytes are compared rather than the report.
  I11 is recorded where it is not Ok, where it stages anything, or
  where its report's `resolvedAdapters` holds no adapter of a vertical
  it names.
- `holdRerenders`: `reapply:`, `refresh:` and `fixed:` on one project,
  shared by both axes. Each `reapply:` and `refresh:` pair is held to
  I11 as well, under its own key: its install is Ok, and its
  `resolvedAdapters` hold an adapter of the vertical the key names.
  That is the reading `holdFixedPoint` makes of the whole re-render,
  one private helper (`reachesAll`) shared by both.

`holdParity` also takes its two cells by name (`ParityCells`), so a
card's preview keeps its `add:` key and its install goes under
`install:`. Called with one id, as greenfield and growth call it, it
names the install `<id>!install` as before, and both axes pass against
their goldens untouched. It now returns the install's outcome, which
`holdRerenders` reads, and its other callers ignore.

The goldens gained keys and nothing else:

- **`brownfield.golden.json`**, from 503 verdicts to 1,711. It gained
  1,208:
  - 392 `install:` cells beside the 392 `add:` previews: 319 `ok` and 73
    `keel.uncoverable-vertical`, each its preview's verdict. These are
    the 319 and 73 the research measured;
  - 176 `reapply:` pairs (352 verdicts), all `ok`: five verticals on
    each of the ten CLI and front-end presets, and seven on each of the
    other eighteen, which add `dev-env` and `observability`;
  - 176 `refresh:` pairs (352), all `ok`. Each is beside `keel add ci`,
    the first `ready` card on all 28 presets;
  - 56 `fixed:` cells, all `ok`, each staging nothing: 28 on the
    opening scaffolds, and 28 `fixed:<stack>/modulith` on the modulith
    scaffolds, held before any context is added;
  - 28 `module:` pairs (56), all `ok`. All 28 presets offer the
    modulith on their opening dials, and every modulith scaffold takes
    a context.
- **`composite.golden.json`**, from 672 verdicts to 1,656. It gained
  984, in the 24 services (six products, two services each, under both
  layouts):
  - 336 `install:` cells: 276 `ok`, 36 `keel.wrong-scope` (`ci`,
    `distribution` and `iac` in each monorepo service) and 24
    `keel.uncoverable-vertical` (`observability` and `persistence` in
    each front end);
  - 156 `reapply:` pairs and 156 `refresh:` pairs, 312 verdicts each,
    all `ok`. The first `ready` card is `ci` in a polyrepo service,
    `persistence` in a monorepo back end and `dev-env` in a monorepo
    front end;
  - 24 `fixed:` cells, all `ok`.
- **Nothing else moved.** A script compared every key of HEAD's two
  goldens with the new ones: none lost, none changed, and no `add:` key
  gained. The greenfield and growth goldens are untouched and hold.
  The four known files are as they were: brownfield's `{"I5": {}}`,
  and `{}` for the others. `generated-docs.test.ts` passes unchanged.

I9 and I11 hold on every cell, so neither adds a known key.

**The proof** that each new family catches what it is for, each tried
in a scratch edit under `src/` and undone. A dry run is told apart from
a preview by `interactive`, which the preview sets:

- **I9 on `add:`.** A non-interactive dry run of `keel add ci`, without
  `--refresh`, wrote one extra file. I9 failed on exactly 40 cells:
  `add:<stack>+ci` on all 28 presets, and in the 12 polyrepo services.
  The monorepo services refuse `ci` as `keel.wrong-scope` on both
  sides. Nothing else failed.
- **I9 on `reapply:` and `refresh:`.** The same extra file, written by
  any non-interactive dry run that re-renders exactly one vertical. I9
  failed on exactly 352 brownfield cells (176 `reapply:` and 176
  `refresh:`) and 312 composite ones (156 and 156), and nothing else.
- **I9 on `module:`.** The same extra file, written by a non-interactive
  dry run of `keel add module`. I9 failed on exactly the 28 `module:`
  cells, and nothing else.
- **I11 on bytes.** `code-style/editor-baseline` added a line to its
  `.editorconfig` region whenever `dev-container` was already recorded.
  That render is not its own fixed point, since a scaffold records the
  dev container after code style. I11 failed on all 56 `fixed:` cells
  of brownfield and in all 24 services. I9 held, since the preview and
  the install both staged the line. The extra file written by a dry
  run re-rendering more than one vertical fails the same 80 cells, and
  only them.
- **I11 on what re-renders.** A `--reapply` naming more than one
  vertical re-rendered only `vcs` and `agent-harness`, and skipped the
  rest. What is skipped stages nothing, so the bytes alone let it
  through: without the `resolvedAdapters` reading, both axes passed,
  18 tests of 18. With it, I11 failed on the same 80 cells, and only
  them.
- **I11 on the pairs.** Without the reading on each pair, three edits
  passed both axes, 18 tests of 18, every pair reading `ok` with
  parity intact. With it, each failed I11 alone:
  - `--refresh` made a no-op, dropped from the re-render and from the
    admitted set, in the preview and the install alike: exactly the
    176 brownfield `refresh:` cells and the 156 composite ones;
  - a `--reapply` naming one vertical cut short to the empty plan:
    exactly the 176 `reapply:` cells and the 156. I9 held even where
    `walking-skeleton` stages files re-rendered alone, since both sides
    then staged nothing;
  - in the test, not under `src/`, the bodies stripped of `reapply`
    and of `refresh`, so each pair ran a plain add: all 352 brownfield
    pairs and all 312 composite ones.

**Times**, under `CI=true` on four cores, as vitest reports a file's
tests: the sweep's `beforeAll` and the assertions. Each axis was timed
six times, three of them paired with HEAD's copy of it, at a load
average of 2 to 3:

- brownfield alone takes about 13 s (12.3 to 13.9), up from about
  3.7 s (3.4 to 3.9);
- composite alone takes about 11.3 s (10.9 to 12.9), up from about
  6 s (5.4 to 6.4).

In two runs of `CI=true pnpm test`, brownfield took 19.8 and 16.9 s,
and composite 13.1 and 15.5 s. Greenfield took 35.7 and 34.3 s, and
growth 113.9 and 107.9 s. The suite took 260 and 256 s, with 194 files
and 3,162 tests passing each time. Both axes stay well below growth.

Beyond the text above:

- **The keys.** The cells are keyed `<family>:<scope>…`, with the
  scope as `add:` spells it: the preset, or
  `<product>/<layout>/<service>`. A card's install is
  `install:<scope>+<v>`. A re-render is
  `reapply:<scope>+<v>` or `refresh:<scope>+<card>~<v>`, and the
  module add is `module:<stack>`, each with its install under the same
  key plus `!install`. The whole re-render is one cell, `fixed:<scope>`,
  a family the text above does not name, and `fixed:<stack>/modulith`
  on the modulith scaffold. An I9 disagreement is recorded under the
  preview's cell, `add:` included, as it always was.
- **The modulith scaffold is a setting, not a cell.** Each preset is
  settled again with `moduleLayout: 'modulith'` (`settle`), and
  `keel.dials` settles every other dial as the opening dials have it,
  on all 28. The scaffold is dispatched through `Grid.read`, which
  fails the sweep if it is refused and records no verdict, so the
  golden gains only the cells measured. The add is
  `keel add module orders`, with no `--consumes`.
- **The modulith scaffold is held to I11 too.** _The measure_ lands I11
  on "brownfield's scaffolds", and this one has no module history when
  it is held, so it is one of the 300 dial settings measured as fixed
  points. Held here, the modulith layout's whole re-render is guarded
  now, rather than from S.7, when growth's twins bring it.
- **I11 reads what re-renders, not only what it stages.** The text
  above has the whole re-render stage nothing. A re-render that skips
  a vertical stages nothing too, so the cell also requires the
  report's `resolvedAdapters` to hold an adapter of every vertical it
  names. It held on all 80 cells today.
- **I11 reads each pair too.** _The measure_ brings a vertical
  re-rendered alone under I11 at S.7, and then for what it stages.
  Held to I9 alone, a `reapply:` or `refresh:` pair whose body or
  engine re-rendered nothing still reads `ok`, and measures only what
  the `add:` and `install:` cells measure. So each pair is also
  recorded under I11, on its own key, where its install is refused or
  resolves no adapter of the vertical it names, and `INVARIANTS`' I11
  says so. It held on all 352 brownfield pairs and 312 composite ones
  today. It adds no dispatch: in paired runs at a load average of 3
  to 4.5, brownfield took 14.2 and 15.9 s with it and 13.5 and 15.1 s
  without, and composite 11.5 s twice with it and 12.7 and 13.8 s
  without.
- **Composite takes the `refresh:` cells too**, as the step text says,
  although _The measure_ names brownfield alone for them.
- **One copy of `runIn`.** The real run the axes scaffold with moves
  into `support/composition-grid.ts`. Growth imports it in place of
  its own copy, and composite in place of an inline one. Nothing else
  in growth moves.
- **The cost is higher than the estimate.** _The measure_ put S.1b at
  some 900 dispatches. It is 1,208 in brownfield, plus 28 real
  scaffolds, and 984 in composite.
- **What a re-render stages.** I9 compares bytes, not emptiness, so a
  `reapply:` cell that stages files still agrees. A scratch dispatch
  of every such re-render, not kept, found one vertical that stages
  anything re-rendered alone: `walking-skeleton`, on the 19 presets
  _The finding that shaped it_ counts, and in all 24 services. Every
  other vertical re-rendered alone stages nothing there. Every
  `module:` and `refresh:` pair stages at least one file on both sides.

### S.2 — The reading: one composition, planned against the manifest (M) ✅

`src/domain/core/converge.ts` is pure, as `planner.ts` and `growth.ts`
are. It imports `growth.ts`, never the reverse. `contextsOf` moves out
of `growth.ts` into a leaf module that both import, so no cycle forms
(dependency-cruiser's `no-circular`).

- **`compositionOf(registry, manifest)`** reads what the manifest
  records as `keel new` would have written it:
  - the preset the drill-down places the project on
    (`projectProfile`), with its dials read off the tags;
  - the harness dial: whether `agent-harness` is recorded;
  - the extras: the recorded verticals less the preset's;
  - the added contexts: the recorded modules after the skeleton, the
    peer apart (`contextsOf`);
  - the tags and `projects`, as recorded.
- **The reference order** is the one `keel new` of that composition
  records:
  - the preset's verticals in the preset's order, less the harness
    where the project has none, and less what a monorepo service's
    placement leaves to the root;
  - then the extras in `admit`'s order on the preset's scope;
  - then `bounded-context`, which one run never records and
    `keel add module` records last.

  Where the drill-down places no preset (a plugin preset off the tree,
  a manifest migrated from v1), the reference is the recorded order.
  S.2 reads the reference order. S.8 is the step that records by it.

- **A request** is what a command asks for:
  - verticals to add, closed over their prerequisites through `admit`
    (D1, D9). The caller hands in the `PlanScope` and the siblings it
    builds today (`addScopeOf`, `siblingsOf`), since a manifest alone
    does not say where a monorepo service sits;
  - verticals to re-render (`--refresh`, `--reapply`);
  - an entrypoint, read by `growthOf` as today: the tag, the twin's
    `projects`, the twin as the preset;
  - a context to add, with the answers the user supplied;
  - or, from a seed manifest, a preset on its dials with its extras.

  A request has no field that takes anything away. Removal is refused
  by construction: no command can ask for it (DS5).

- **`convergeOf(registry, manifest, request)`** returns the plan or a
  refusal. The plan holds:
  - the target composition;
  - the run, one step per vertical in run order. A step installs the
    vertical whole; installs only the adapters the target's tags newly
    match (`matchingIds` before and after); re-renders it; or replays
    it for its deferred actions alone (`actionsOnly`), where the
    caller settles (DR5, DS7);
  - the contexts to wire, and with which adapters;
  - the caller's placement, as today:
    - growth: `twinOrder`, the recorded rows in their order with new
      ones at the twin's rank, and the harness realized in that order;
    - every other caller: appended, with the harness realized in run
      order.

  The refusals are growth's, read through `growthOf`. One of them
  moves: the refusal of an entrypoint whose tag would make an adapter
  stop matching (`keel.uncoverable-entrypoint`, `drops`) now cites
  L's missing merge base. No shipped cell reaches it, so no golden
  moves, and `refusals.test.ts` holds the new sentence. It names a
  vertical, never a tag (I6).

**The proof.**

- `growth.golden.json` regenerates byte-identical: 360 cells, the
  reading R.2a recorded.
- `converge.golden.json` records the reading on every cell of the
  paths golden, and holds the round trip. The research measured the
  round trip on 443 of 443 single-service cells (300 settings and 143
  single extras); the whole-menu cells and the services are new
  ground. The later steps' diffs are reviewed against this golden, as
  Q1.2's readiness golden was for Q1.3.
- `converge.test.ts` holds each rule on a fixture family:
  - the reference order with and without a preset, and in a monorepo
    service;
  - a harness left out;
  - the added contexts, the peer and the skeleton apart;
  - each request kind;
  - a prerequisite admitted and placed;
  - a request type that cannot name a removal.
- The render guard (`growth-render.test.ts`) passes as it is.

**Holds green:** every golden, byte-identical.

**Docs:** `src/domain/core/AGENTS.md` adds `converge` to the engine's
modules and says what it reads. `tests/AGENTS.md` and
`docs/development.md` add the converge golden, and its regeneration
order: the paths golden, then the converge golden, then the growth
golden, then the grid. `vitest.stryker.config.ts` leaves the golden
out. CHANGELOG, under _Changed_: the `drops` sentence, which a
plugin's family can reach.

**Leaves out:** every caller, and every placement change.

**Landed as the reading alone**, in one commit, called by no handler.
`src/domain/core/converge.ts` holds `compositionOf`, `referenceOrder`
and `convergeOf` over five request kinds (`add`, `reapply`,
`entrypoint`, `module`, `new`), and `src/domain/core/contexts.ts`
holds `contextsOf`, moved out of `growth.ts` unchanged, which both
import. `growth.ts` exports `settingOf`, the dial reading its
`scaffoldsAs` was, now `settingOf(…) !== null`, and `GrowthContext`
is `contexts.ts`' `RecordedContext`. `refusals.ts` rewords the `drops`
sentence. `tests/domain/core/converge.test.ts` holds 32 cases on the
`acme` family, a product of two of its presets, and keel's Go CLI, and
`tests/domain/core/converge.golden.test.ts` the golden:

- **3,436 cells**, every key of the four paths goldens and no other;
  its first test reads their keys. The 689 `keel new` cells read 707
  scopes: 677 single projects, 6 monorepo product roots and 24
  services. Of the other 2,747, 2,499 converge appended and 72 at the
  twin's rank: the 90 `keel add entrypoint` cells less the 18 whose
  last command is the dev container's re-render. 114 stop at the
  handler's gates, each read through the function the handler reads
  it with: 84 `keel.not-initialised` at the polyrepo roots, and at the
  monorepo roots 18 `keel.wrong-scope` and 12
  `keel.uncoverable-vertical` (`productRootReading`). 62 are the
  planner's refusals, recorded with their sentence: 36
  `keel.wrong-scope` in the monorepo services, 24
  `keel.uncoverable-vertical` and the two `keel.needs-refresh`; 12 of
  the sentences name a sibling service, which the `add` request's
  siblings give them. A test holds every cell against the verdict its
  paths golden records, code for code: every refusal it records is
  read, and every Ok is a plan, but for the 28 `keel.unknown-answer`
  bodies, which read as plans, since an answer is no part of a
  request. The runs hold 6,960 installs, 2,770 re-renders, 225 settles
  and 72 partial installs that settle the rest; 218 cells wire
  contexts, the 200 module adds and the 18 growths after a history.
- **The round trip holds on 697 of 697 scopes**: every single-service
  `keel new` cell that comes back Ok (the 300 settings, the 150 whole
  menus, the 143 single extras and the 56 answered bodies; the 28
  `twice` bodies refuse), the 24 services, and 24 more beyond the
  paths golden, which names no extra of a product's service: each of
  the 6 products under each layout, every service naming its whole
  menu, recorded nowhere. On each, the manifest it leaves reads back
  as the preset, the dials, the harness, what the product gave the
  service and the extras it was given, as a monorepo service or not
  as it is, with a reference order equal to the order it records, and
  the `new` reading's run in that order too. A test holds that every
  Ok cell is read back in each scope it writes, a monorepo product's
  root apart. The research measured 443; the whole menus, the
  answered bodies and the services are new ground.
- **The record each run leaves is held against the reading** on the
  272 cells whose last command is `keel add module` (200) or a
  converging `keel add entrypoint` (72): each is run, and the
  verticals it records, in their order, and the contexts it records
  are the target's, on 272 of 272; on the 200 module adds, the
  `bounded-context` adapters its report resolves are the ones the
  reading wires.
- **Held byte for byte**: `growth.golden.json` (360 cells) and the four
  paths goldens, each regenerated with `KEEL_UPDATE_GOLDEN=1` and
  diffed against HEAD. The grid passes, and its four known files are
  as they were. The render guard passes as it is.

The golden takes about 44 s alone under `CI=true` (43.4, 43.9 and
44.3 s in three runs, as vitest reports the file's tests), and
`converge.test.ts` 52 to 69 ms. The
golden makes 1,410 real runs (844 `keel new`, 456 `keel add module`,
90 `keel add entrypoint` and 20 `keel add`) and 1,789 readings (840
`keel.dials`, 440 previews, 508 statuses and the catalog), against the
4,345 runs the paths golden dispatches. It comes to 1.62 MB, 46 kB
under `gzip -9`. In one run of `CI=true pnpm test` on four cores it
took 56.1 s beside the rest, and `converge.test.ts` 54 ms. The suite
took 294 s, with 201 files and 3,213 tests passing, against 261 s,
with 199 files and 3,174 tests, for HEAD (S.1a and S.1b) run on the
same box just before it: 33 s more. Growth's grid axis took 105.0 s,
and the paths golden's four 33.1, 41.6, 15.1 and 43.9 s (new, add,
reapply, grow).

`tests/AGENTS.md`, `src/domain/core/AGENTS.md` and
`docs/development.md` record the golden and the regeneration order,
`vitest.stryker.config.ts` leaves it out, and `tests/support/dial-walk.ts`
lists it among the walk's consumers. The CHANGELOG entry is under
_Added_ (below). No template changed, and no shipped cell reaches the
new sentence, so no preview moves: neither the `keel ui` browser
suites nor any e2e suite was run. `pnpm lint`, dependency-cruiser's
`no-circular` among it, and `pnpm typecheck` pass.

Beyond the text above:

- **The families' sweeps moved to `tests/support/paths-families.ts`**,
  so one enumeration serves both goldens; each paths suite is its
  family and `pathsGolden`. `PathsSweep` gains a reading mode
  (`PathsReader`): every scaffold and every command before a cell's
  last run for real, and the last only where the reading runs it —
  the `keel new`, `keel add module` and `keel add entrypoint` cells,
  whose records it is held against. `keel new` sweeps last, and 350 of
  its cells are read off the scaffold another family made of the same
  line rather than run again. Two things fell out of sharing one
  sweep. A scaffold asked for as a recorded cell after one family made
  it unrecorded (the opening modulith's history, in `keel add` and in
  growth) was never recorded, so `extend` keeps the two apart. And
  `keel.dials` is read once per target, which every family asked
  again: 3,906 reads fell to 828 over the paths golden's cells, and
  the golden from 51.6 s to about 43 s before the runs it is held
  against were added. Neither moved a cell of the paths golden.
- **A composition carries three fields the text does not list.**
  `recorded` is the record in its order, which the reference falls
  back on where no preset reads back and which a target carries with
  its new rows where its caller places them. `member` is read off the
  record rather than handed in, since no caller has it to hand: a
  preset listing verticals a repository root carries, of which the
  project records none. Only `new`, whose seed records nothing, takes
  it in its request. `given` is what a product installs in its
  service of its own accord (`StackService.extraVerticals`, `gateway`
  on every shipped product), read where the project links each other
  service of a registered product with a service on its preset, at the
  path `keel new` of the product links it, and records all of it.
  Products that place a service alike read alike: a `web-components`
  frontend reads the same under each of the six.
- **What a product gives its service comes before the user's
  extras.** `keel new` installs it straight after the preset's
  verticals, in the product's order and never admitted, then admits
  the extras the user names on a scope that has it
  (`presetServiceScope`, with what a monorepo product root gives the
  service). The `new` request names the product and the service's
  path for that, and the reference order places `given` so. It moves
  the order of 60 cells from a first reading that admitted `gateway`
  with the extras, which sorted it after any extra whose id sorts
  before it: `keel add` of ci, containerization, dev-env, distribution
  or iac in a polyrepo service, and of dev-env in a monorepo
  frontend, 6 products each. The paths golden names no extra of a
  product's service, so the round trip is also held on each product's
  services naming their whole menu, which fails on 24 of 24 scopes
  under that first reading.
- **A step can install in part and settle.** Growth installs the
  newly matching adapters of a vertical of its twin and replays the
  rest for their actions, on all 72 cells, so an `only` step carries
  `settles`. A `present` entrypoint converges with an empty run,
  appended.
- **Growth's pure pieces moved into `converge.ts`**, since the reading
  needs them now: `placed`, `grownManifest`, `admitGrowth` and
  `incomingOf`. `add-entrypoint.ts` imports them back, which is all
  a handler changes; no handler calls the reading. S.3's `placed` has
  moved already.
- **The extras' scope.** `admit` orders the extras on the scope
  `keel new` plans them on, over the preset's tags, the dials and what
  linked projects project there (the effective tags no vertical can
  add). An extra no registered vertical is any more comes after the
  others, which `admit` still orders; extras it refuses together keep
  their recorded order.
- **The `drops` sentence cites L's reason in words of its own**, not
  by name: _… and keel removes nothing it installed — without a
  recorded base, it cannot tell what it wrote from what you changed
  since_. The missing recorded base is the reason `docs/cli.md` gives
  for `--reapply`; the second half is new, and `docs/cli.md` now says
  it of the entrypoint too. `refusals.test.ts` holds it, and
  `add-entrypoint.test.ts`' table of growth's refusals moves with it.
- **The CHANGELOG entry is under _Added_, not _Changed_.** The command
  itself, `keel add entrypoint`, is unreleased, under _Added_, so the
  reason is folded into that entry's `keel.uncoverable-entrypoint`
  clause, which did not name this case before; no released refusal
  changed.

### S.3 — The run, and `keel add entrypoint` its first caller (L) ✅

`src/domain/core/converge-run.ts` holds `converge(inputs)`, which runs
a plan and commits nothing. `converge.ts` stays pure. The run is:

- one `installVerticals` run over the plan's steps, with `only`,
  `actionsOnly` and `rerender` read off them;
- each context's replay (`wireModules`, moved out of the handler);
- a seam after the run, before the harness pass, where the caller's
  exact answer check runs, as both handlers run it today;
- `retrofitHarness` for what did not run, with the caller's command
  line (`line`);
- one `finalizeHarness`, the buffer realized in the caller's order;
- the recording at the caller's placement: `placed`, `twinOrder`,
  `atRank` and `inPlace`, moved out of the handler;
- the restamp where the harness ran;
- a `ContributionConflictError` read as `keel.reapply-conflict` where
  anything re-rendered, and rethrown otherwise, as both handlers do;
- `refreshProposals`, with the caller's wording of a proposal (a later
  run's for growth, the dry run's for `keel add`);
- the report, with the diffs of what re-rendered (`workingTreeDiffs`)
  and the caller's notes in the caller's order.

The commit tail, tree then manifest then deferred actions, becomes one
function every caller calls.

`add-entrypoint.ts` keeps what is its own:

- the gates: the scope, the generation (`pinnable`), the word, the
  entrypoint already there;
- growth's refusals, and the old-manifest check that reads the files
  (`unrecordedConsumer`);
- the linked-project note;
- the words.

It hands the rest to `converge`. `entrypointReading` and `grownScope`
read the same plan.

**Holds green:**

- I10 on all 320 cells, and the growth axis's I9;
- both growth goldens, the render guard and the paths golden;
- the handler's 46 cases.

The keel ui browser suites are not run, since no preview changes.

**Leaves out:** every other caller.

**Landed as the run and its first caller**, in one commit, with no
golden moved. `src/domain/core/converge-run.ts` (534 lines) holds
`converge(inputs)`, which stages a plan `convergeOf` read and commits
nothing, and `commitConverged`, the tail every caller is to call: the
tree, then the manifest at the project scope, then the deferred
actions. `handlers/add-entrypoint.ts` goes from 832 lines to 489. It
reads its plan with `convergeOf(…, { kind: 'entrypoint' })` and hands
it to `converge`; its own `planOf` and `RunStep` go, and
`wireModules`, `twinOrder`, `rankOf`, `atRank` and `inPlace` move
into the run as they were, and `proposalNote` too, taking the registry
and the wording as arguments. What it keeps is the text's list, and
`reachable`, the early answer check's reading, now over the plan's
steps. `add-vertical.ts`, `add-module.ts` and
`new-project.ts` are untouched, and `converge.ts` changes in two doc
comments alone.

- **Held byte for byte**, each suite against its committed JSON under
  `CI=true`, and `git diff --exit-code` over every golden and known
  file after: `growth.golden.json` (360 cells), `converge.golden.json`
  (3,436), the four paths goldens (689, 1,326, 731 and 690), and the
  shared-files, agent-harness and run-skill goldens. The grid's four
  axes pass, growth's I10 on all 320 cells with its I9, and the known
  files are as they were: brownfield's `{"I5": {}}`, `{}` for the
  others.
- **The handler's 46 cases pass unchanged**, as do `growth.test.ts`,
  `install-verticals.test.ts`, `converge.test.ts`, the project-status
  suite and the render guard (`growth-render.test.ts`, its 4 cases). A
  47th pins the order of the handler's own notes around the run's
  proposals, which no case held, since none had growth add a
  prerequisite: on a plugin family whose twin lists an observability
  without the base it needs, a project recording a reader of the
  observability and linked to another says the base the planner added,
  then the refresh proposed, then the relink.
- **`tests/domain/core/converge-run.test.ts`**, 20 cases on a fixture
  family, over an in-memory disk each shipped `FakeTree` opens seeded
  from and commits back into, a project scaffolded by the run itself:
  each posture (a step installed whole, `only` with and without
  settling, settled alone, re-rendered with its diff, on a project
  without the harness counting what it skipped); growth's own plan,
  read by `convergeOf`, run at the twin's rank and again appended,
  moving the rows, the answer keys and the entries and no file; the
  harness realized in the twin's order and in the run's; the retrofit
  with and without the recorded contexts, and a context's element,
  which the twin ranks nothing of, realized and recorded after every
  ranked one; a re-render's conflict read as `keel.reapply-conflict`,
  and an install's rethrown; the caller's check seeing the staged
  adapters and reads and winning before the harness pass, and, where
  it holds, the retrofit's refusal naming the caller's command line;
  the proposals between the caller's notes, worded by the caller's flag
  alone, dry run or not; what a proposal reads, in run order; an
  installed vertical whose adapters the run's tags change, read before
  on the recorded tags and after on the run's, and none proposed that
  ran; none for what reads a vertical the run re-renders; the commit's
  order; and its deferred actions run for real, the runner handed no
  dry run, and each action run through `runActions` where the caller
  hands none.

**The proof** that the suite catches what it is for, each tried in a
scratch edit of `converge-run.ts` and undone byte for byte. Each failed
exactly the cases named, and no other of the file:

- the buffer left in run order under a twin placement: the case of the
  twin's order;
- the record appended under a twin placement, no `atRank`: the growth
  case and the case of the run's order;
- `proposeForLater` ignored, the wording read off the dry run: both
  cases of the wording; and read with the dry run as it was,
  `proposeForLater || !dryRun`: the case of this run's wording;
- a conflict read as a refused re-render whatever re-rendered: the
  rethrow;
- the caller's check moved after the retrofit: the seam's case, where
  the retrofit's refusal then won;
- the manifest written before the tree's commit: the commit's case;
- the recorded contexts replayed whatever the caller says: the
  retrofit's case. Of the handler's 47 cases and
  `agent-harness-grown.test.ts`' 6, run on the same edit, it failed
  one: the one wiring each context by keel's own `bounded-context`
  whatever a registry lists;
- an adapter the twin ranks nothing of realized first: the case of the
  context's element;
- the commit's deferred actions handed a dry run, or skipped where the
  caller hands no runner: the case of the deferred actions;
- the proposals' tags before read off the manifest the run leaves, or
  a vertical that ran proposed: the case of the adapters;
- every step read as installed: the case of the re-render;
- the installed verticals sorted: the case of run order.

And in `handlers/add-entrypoint.ts`, its notes before and after the
proposals swapped, or its admission notes dropped: the handler's 47th
case, and no other of its 47 or of `agent-harness-grown.test.ts`' 6.

**Times**, under `CI=true` on four cores. `converge-run.test.ts` takes
62 to 82 ms alone in three runs (as vitest reports the file's tests).
`add-entrypoint.test.ts` and growth's grid axis, run together, took
8.7 s and 86.6 s at a load average of 2.7, against 8.5 s and 85.9 s
for HEAD at a load average below 1; the handler's suite took 7.9 s
beside `growth.test.ts`, `install-verticals.test.ts` and
`converge.test.ts`. In one run of `CI=true pnpm test` the suite took
280.8 s as vitest reports it (4 min 42 s wall), with 202 files and
3,234 tests passing, one file and 21 tests more than HEAD's 201 and
3,213, against 274.2 s (4 min 35 s wall) for HEAD, run on the same box
just before it — HEAD's run starting at a load average of 1.3, this
one at 3.5. Growth's axis took 113.0 s (HEAD's 104.8 s),
`add-entrypoint.test.ts` 11.0 s (11.0 s), the render guard 10.8 s
(8.9 s), the converge golden 53.2 s (50.6 s), the paths golden's four
33.8, 42.8, 12.8 and 45.7 s (36.3, 45.0, 13.6 and 47.2 s; new, add,
reapply, grow), and `converge-run.test.ts` 73 ms beside the rest.

No template changed and no preview moves, so neither the `keel ui`
browser suites nor any e2e suite was run. No CHANGELOG entry:
`keel add entrypoint` is itself under `[Unreleased]`, and the one thing
of it a user sees that moves, the order a proposal lists what it reads
(below), moves on no shipped cell. `pnpm lint`, dependency-cruiser's
`no-circular` among it (306 modules, 1,508 dependencies), and
`pnpm typecheck` pass. `src/domain/core/AGENTS.md` names the run among the engine's
modules, says what it does, and trims the handler's part of the
drill-down note to what it keeps.

Beyond the text above:

- **The run takes its ports as fields of its inputs**
  (`ConvergeDeps`), as `retrofitHarness` does, so a handler spreads
  its deps into the call; `commitConverged(deps, run)` takes the four
  the commit touches (`CommitDeps`). Neither imports
  `handlers/deps.ts`, and the clock is read once, in the run.
- **The twin the run ranks by is the target's preset**, with the
  target's harness dial, not a field of the placement. `growthOf` finds
  the twin by the `settingOf` reading `compositionOf` reads the
  target's preset with, so the two agree wherever growth grows, and
  `Placement` stays as S.2 recorded it (`rows/harness` in the converge
  golden). A twin placement whose target reads back no registered
  preset throws.
- **The run reads the rest off the plan**: the re-rendered ids (its
  `rerender` steps: growth's `rerender`, `keel add`'s `--refresh` and
  `--reapply`), what ran (every step but a settled one), and whether
  the harness runs (its `agent-harness` step ran: growth's
  `rerender.length > 0`, `keel add`'s `ran.has('agent-harness')`).
- **The proposals read the steps that install, in run order.**
  Growth handed them the admitted set in the planner's order; the run
  hands the same set in the twin's, the order they install in. A
  proposal's `reads` lists the verticals it reads among them in that
  order, which `RefreshProposal.reads` documents as install order, and
  its note names them so. The two orders differ only where one recorded
  vertical reads two verticals growth installs in an order other than
  the planner's, which only a plugin's family can make: a reader of two
  verticals its twin lists the other way round, grown, now names them in
  the twin's order in `reads` and in the note, where HEAD named them in
  the planner's. No shipped one does: distribution reads persistence
  and observability, and no preset lists persistence. The run's order
  is pinned in `converge-run.test.ts`: a deploy vertical declaring the
  log before the metrics, the run installing the metrics first.
- **Three things stay the caller's to say.** Whether the retrofit
  replays the recorded contexts (`retrofit.contexts`): growth's run
  replays none, as it did (`modules: []`), and `keel add`'s adoption
  replays each, as it does, until S.5 reads them once. The notes
  around the proposals (`notes.before`, `notes.after`): `keel add`
  sets its notes of what was there before them, growth its admission
  notes before and its relink note after. And the proposals' wording
  (`proposeForLater`, `refreshProposalNote`'s `committed`, whatever the
  dry run says): growth passes true, a later run's, as it always worded
  them, dry run or not; `keel add` is to pass `!dryRun`, as it words
  them today.
- **The handler reads growth twice, and admits it twice.** `growthOf`
  for its gates, its note, its subject and the files check; then
  `convergeOf`, which reads `growthOf` and `admitGrowth` again, for the
  plan, whose refusal is the planner's the handler returned before; and
  `admitGrowth` once more for the admission notes, which the plan does
  not carry. The times above show no cost that
  stands out from the load.
- **`entrypointReading` is unchanged.** It reads the plan's own pieces,
  `admitGrowth` and `incomingOf`, as `convergeOf` does, and names the
  verticals in `incomingOf`'s order, which the status reports;
  `grownScope` is `growth.ts`' and unchanged.
- **The goldens were held, not regenerated.** Each suite compares
  every cell with its committed JSON and names each one that moved, as
  `verify` runs it, rather than rewriting it under
  `KEEL_UPDATE_GOLDEN=1`, and `git diff --exit-code` shows every golden
  and known file as HEAD has it.

### S.4 — `keel add`, `--refresh` and `--reapply`, callers (M) ✅

`add-vertical.ts` keeps what is its own:

- naming the verticals (unknown, named twice);
- the scope, and the product root's reading of what its services
  have;
- the generation gate and `bringsHarness`;
- the notes of D4 (installed, provided, in the services);
- the early answer check.

The run is `converge`'s:

- a plain add is the request of its verticals, appended and realized
  in run order, as today;
- `--refresh` adds its re-render set, planned as if not there yet, as
  today;
- `--reapply` is the request of a re-render alone, run in recorded
  order, as today.

Its copies of the tail, of `proposalNote` and of `hasAnswers` go.

**Holds green:**

- the paths golden: every `keel add`, `--reapply`, `--refresh`,
  adoption and product cell, byte-identical;
- the brownfield and composite goldens;
- I4, I5, I9 and I11;
- `add-vertical.test.ts`, and the handler suites that reach it.

No preview changes, so neither the keel ui browser suites nor any e2e
suite runs. No CHANGELOG entry.

**Leaves out:** what a re-render replays (S.7), and where a new row
goes (S.8).

**Landed as the run's second caller**, in one commit, with no golden
moved. `handlers/add-vertical.ts` goes from 608 lines to 494. It reads
its plan with `convergeOf`: the `add` request, naming the verticals it
installs, those `--refresh` names beside them, and the scope and
siblings it plans on (`addScopeOf`, less what it re-renders, and
`siblingsOf`); or, under `--reapply`, the `reapply` request, naming
what `--reapply` and `--refresh` name. It hands the plan to
`converge`, and the run to `commitConverged` unless it is a dry run.
Its copies of the tail go: the `installVerticals` call, the retrofit,
the finalize, the restamp, the conflict mapping, `refreshProposals`,
the report and the commit, and so do `proposalNote` and
`hasAnswers`. What it keeps is the text's list, the refusals of a
re-render of a vertical not installed or of one its own rules refuse
(`ruleRefusal`), the empty plan's early return, and its admission
notes. It says four things to the run:

- the recorded contexts are replayed where the harness runs, adopted
  or re-rendered (`retrofit.contexts`), under the retrofit's own
  command line, `keel add agent-harness`, as before;
- the exact answer check is `strayAnswerRefusal` over the staged run;
- a proposal is worded as `!dryRun` says (`proposeForLater`);
- its notes go before the proposals, the admission notes then D4's,
  and none after.

`converge.ts` changes in one doc comment, its module's, which names
`keel add` the reading's second caller. `converge-run.ts` changes in
how a refused re-render names what it re-rendered (below), and in two
doc comments: its module's, which names `keel add` the run's second
caller, and `proposeForLater`'s.

- **Held byte for byte**, each suite against its committed JSON under
  `CI=true`, and `git diff --exit-code` over every golden and known
  file after: the four paths goldens (689, 1,326, 731 and 690 cells,
  every `keel add`, `--reapply`, `--refresh`, adoption and product cell
  among them), `converge.golden.json` (3,436), `growth.golden.json`
  (360), and the shared-files, agent-harness and run-skill goldens. The
  grid's four axes pass: brownfield's and composite's I4, I5, I9 and
  I11 among them, and growth's I10 on all 320 cells. The known files
  are as they were: brownfield's `{"I5": {}}`, `{}` for the others.
- **The handler's 34 cases pass unchanged**, as do the other 26
  handler suites (460 tests), one case of which goes on (below), and
  `tests/application`'s web and CLI suites (18 files, 313 tests).
  Four cases join them, each pinning
  what no case of those suites, and no cell of the paths golden, held,
  and each passing on HEAD's handler and run as on this one. A 35th:
  the notes of what was there already come before the refresh the run
  proposes. On `go-http` with distribution,
  `keel add distribution persistence --dry-run` says distribution is
  installed, then proposes its refresh in this run's words. The
  admission notes before D4's were held already. A 36th: on `go-http`
  with distribution then persistence,
  `keel add distribution --reapply --refresh persistence` restores an
  edited `migrations/README.md` and resolves distribution's adapter
  before persistence's four, in the order recorded, although
  distribution reads persistence. The last two run on a plugin's
  family. A 37th: of a log whose patch appends a line and a deploy
  that reads it, installed deploy first, a `--refresh` of both runs
  the log first, meets the log's own line, and is refused naming
  `'acme-deploy', 'acme-log'`. A 38th: a `go-cli` project recording a
  plugin's vertical, the plugin gone, plans an add and a `--reapply`
  under `--dry-run`, and adopting the harness beside `ci` is refused
  as `keel.missing-harness-contributor`, naming
  `keel add agent-harness`, not the command run. `converge-run.test.ts`
  gains a 21st case: a refused re-render names what it re-rendered in
  the order the project records it, whatever order it ran in, and one
  the manifest does not record after the rest. And
  `agent-harness-grown.test.ts`' adoption on a grown project goes on
  to re-render the harness it adopted, since the handler now asks for
  the contexts' replay (`retrofit.contexts`) where HEAD's got it from
  the manifest it handed the retrofit. A `--reapply` of the harness,
  then a `--refresh agent-harness`, each over the greeting
  context's skill edited and the team notes cut back to the user's
  prose, puts the skill back byte for byte and each context's region
  back, the domain files, the deferred actions and the modules
  recorded as they were. An unedited tree cannot tell a re-render
  that replays no context: it writes the same bytes. The case passes
  on HEAD's handler and run as on this one, and takes about 0.3 s
  more (0.88 to 1.03 s against 0.62 to 0.77 s, three runs each).

**The proof** that the suites catch the handler's part. Each was tried
in a scratch edit of `add-vertical.ts` and undone byte for byte, then
run against the handler suites, `tests/application`, the paths
golden's add, re-render and growth files and the brownfield and
composite axes (50 files, 832 tests):

- **D4's notes moved after the proposals.** Nothing failed before the
  35th case. With it, that case alone fails.
- **The admission notes dropped.** Five of the handler's cases fail,
  and 189 cells of `paths-add` move, each in `report` alone: the adds
  whose admission note names what the planner added. S.1a's proof
  counted 189 adds bringing a prerequisite too.
- **The proposals worded as a later run's under `--dry-run` too.** Two
  of the handler's cases fail, the 35th among them.
- **The exact answer check dropped.** Eight cases fail: two in
  `add-vertical.test.ts`, three in `preview-answers.test.ts` and three
  in `supplied-answers.test.ts`.
- **The empty plan run rather than returned.** Two cases fail: the
  handler's own case of adding nothing a second time, whose manifest
  store records the write, and `composite-scope.test.ts`' monorepo
  root adding what its services have.
- **The retrofit replaying no recorded context.**
  `agent-harness-grown.test.ts`' adoption on a grown project fails, and
  no other case. No paths or grid cell moved, since no context adapter
  of keel's declares a harness element (S.5).

The 36th to 38th cases were then added, and three more edits run on the
same 50 files, now 835 tests. Each failed one case and no other:

- **`--reapply` naming what it names alone**, not what `--refresh`
  names beside it: the 36th, its adapters distribution's alone.
- **The retrofit handed `keel add`'s own command line**: the 38th, its
  refusal naming `keel add agent-harness ci`.
- **The run naming a refused re-render in run order again**, in
  `converge-run.ts`: the 37th, naming `'acme-log', 'acme-deploy'`, so
  without it nothing in the 50 files catches the edit, and in
  `converge-run.test.ts` its 21st case alone.

The adoption case's re-render came last, and two more edits run on the
same 50 files, still 835 tests. Each replays the recorded contexts
where the harness is adopted and not where one flag re-renders it:

- **`contexts: !reapply`** fails the adoption case, at the skill its
  `--reapply` leaves edited, and no other case.
- **`contexts` false under `--refresh agent-harness` alone** fails the
  same case, at its `--refresh`, and no other.

Before the re-render, all 835 passed under both, the adoption case as
it stood among them. The retrofit replaying no context at all still
fails that case at the adoption, before its re-render.

**Times**, under `CI=true` on four cores, as vitest reports a file's
tests. Five files carry most of the step's dispatches:
`add-vertical.test.ts`, `paths-add`, `paths-reapply` and the
brownfield and composite axes. They were run together four times,
alternating this handler with HEAD's copy of it, at a load average of
4 to 8 from other work on the box:

- this handler's two runs took 52.8 s and 49.5 s: `paths-add` 43.7 s
  and 41.1 s, brownfield 16.6 s and 16.7 s, composite 14.8 s and
  15.0 s, `paths-reapply` 13.8 s and 13.3 s, and the handler's suite
  5.1 s and 5.5 s;
- HEAD's took 50.7 s and 63.3 s, in the same order 39.8 s and 48.0 s,
  16.9 s and 20.0 s, 13.9 s and 15.5 s, 13.5 s and 15.6 s, and 7.0 s
  and 10.0 s;
- HEAD's, run alone before the step at a load average below 1, took
  50.4 s: 42.1 s, 15.3 s, 13.6 s, 13.9 s and 5.0 s.

The second admission, and a re-render's reading of its composition,
show no cost that stands out from the load. In one run of
`CI=true pnpm test`, at a load average of 8.3 to 8.5, the suite took
346.6 s as vitest reports it (5 min 47 s wall), with 202 files and
3,236 tests passing, two tests more than S.3's 3,234. Growth's axis
took 118.8 s and the converge golden 72.9 s. The paths golden's four
took 39.2 s, 51.2 s, 15.7 s and 51.7 s (new, add, reapply, grow),
brownfield 18.1 s, composite 15.7 s and the handler's suite 8.7 s.
Those run high against S.3's run (280.8 s, at a load average of 3.5),
in step with the load, so the paired runs above are the comparison. A
last run, after the 36th to 38th cases and the converge golden's
reading of `--reapply` beside `--refresh` (below), took 391.9 s
(6 min 33 s wall) at a load average rising from 2.4 to 10.8, with 202
files and 3,239 tests passing, the converge golden among them in
60.9 s and the handler's suite in 7.8 s, and `git diff --exit-code`
over every golden and known file clean after it.

No preview changes, so neither the `keel ui` browser suites nor any
e2e suite was run. There is no CHANGELOG entry, since nothing a user
sees moves. `pnpm lint` and `pnpm typecheck` pass. Dependency-cruiser,
part of `pnpm lint`, cruises 306 modules and 1,505 dependencies, three
fewer than at S.3, since the handler imports less.
`src/domain/core/AGENTS.md` names `keel add` among the run's callers,
and says what its handler keeps and what it tells the run.

Beyond the text above:

- **A refused re-render names what it re-rendered in recorded order.**
  The handler named a `keel.reapply-conflict`'s verticals in the order
  the project installed them, and the run named them in the order they
  ran. Under `--reapply` the two orders are one. `--refresh`, though,
  re-renders in the planner's order, so a `--refresh` of two verticals
  the planner orders otherwise than the record would have changed its
  sentence if a conflict stopped it. No paths or grid cell reaches
  that; the handler's 37th case does, on a plugin's family.
  `converge-run.ts`' `recordedFirst` names them in the order the
  project records them, any it does not record after. Growth
  re-renders the harness alone, so nothing of it moves.
- **`hasAnswers` goes with its guard, rather than moving.**
  `unusedAnswers` and `strayAnswerRefusal` find nothing where nothing
  is supplied, and `keel add module` already calls the latter
  unguarded. So both checks now run on every add, and the early one
  reads the reachable adapters where it did not before.
  `add-entrypoint.ts` keeps its own copy, since S.4 touches no other
  handler.
- **The handler admits the set twice**, as `keel add entrypoint` reads
  growth twice. `convergeOf` admits it for the plan. The handler admits
  it again on the same scope for the admission notes, which the plan
  does not carry, and, as before, once more without the refresh set
  under `--refresh`. The second admission is of the set `convergeOf`
  admitted, on its scope, and the planner is pure, so it cannot
  refuse: where it would, the handler throws, as it does for a growth
  refusal an `add` or `reapply` request cannot earn, and it takes no
  siblings, which only word a refusal. No test can reach either. A
  `--reapply` now reads a plan too, and so reads the project's
  composition (`compositionOf`), which it did not before; the 38th case
  holds that reading on a project recording a vertical no plugin
  loaded provides. The times above show what it costs.
- **`--reapply` beside `--refresh`** re-renders both, in recorded
  order, as it did: the `reapply` request names both, and the 36th
  case holds it. The converge golden's reading of `keel add` builds
  that request as the handler does, gating a `--refresh` of a vertical
  not installed under `--reapply` too. No paths cell combines the two,
  so no byte of `converge.golden.json` moves.
- **The empty plan stays the handler's.** Run, it would stage nothing
  and still write the manifest's `updatedAt`, which the proof above
  shows two suites hold.

### S.5 — `keel add module`, a caller, and one reading of the added contexts (M) ✅

`add-module.ts` keeps what is its own:

- the name;
- the seven refusals, `moduleRefusal` among them;
- `--consumes`;
- the generation gate.

The run becomes `converge`'s request of one context. The same replay
that wires contexts into a grown assembly wires it, with three
differences:

- it installs every adapter of keel's `bounded-context` that the tags
  match, since none has run;
- it reads the answers the user supplied, in the command's mode;
- it takes no refresh proposals, as today.

It runs onto one Tree, one ownership and one harness buffer, finalized
once. The module record, and the first time the `bounded-context` row,
are appended, as today. The handler's second re-index of the root map,
which merges rows rather than replacing them, stays where it is, and
so does `rehashEntries` after it.

One reading of the added contexts, `contextsOf`, serves growth, this
command, the harness retrofit and S.7. The retrofit changes in two
ways:

- it stops replaying the skeleton and the peer through
  `bounded-context`, which it never needed, since a context declares
  no harness element;
- it reads keel's own `bounded-context`, as growth and this command
  do, rather than a registry's first.

**The proof.**

- No byte moves on keel's registry. No context adapter declares a
  document, a skill or a hook, and keel's registry lists no
  `bounded-context`, so the retrofit already fell back to keel's own.
- A plugin that registers a `bounded-context` of its own no longer has
  its harness elements replayed. Its contexts were never run by
  `keel add module`, which runs keel's own alone. The CHANGELOG says
  so, under _Changed_.
- Held byte-identical:
  - the paths golden's history and module cells;
  - I10 with histories;
  - `shared-files.golden.json`'s 100 history cells;
  - `add-module.test.ts`.

No template changes, so no e2e suite runs.

**Leaves out:** the plain `Error`s some adapters throw for an anchor
they cannot find, and the formatter a JVM context lands without (the
Backlog's). Both are the adapters', not the operation's.

**Landed as the command's run on converge**, in one commit, with no
golden moved. `handlers/add-module.ts` goes from 420 lines to 411. It
reads its plan with `convergeOf(…, { kind: 'module', name, consumes })`
and hands it to `converge`, then records the context after the others,
re-indexes the root map and rehashes what that rewrote, as before, and
commits through `commitConverged`. Its own `installVertical` call, its
seeding and stripping of the add-module inputs and its copy of the
commit tail go. The plan's contexts are `ConvergeModule`s
(`converge.ts`): growth's `GrowthModule`, and, on the one
`keel add module` adds, `adds`, with what it consumes. `wireModules`
(`converge-run.ts`, 534 lines to 551) reads `adds`: that context
consumes what the plan says and reads the answers supplied, in the
caller's mode, where a recorded one replays as before; and it returns
the answers each wiring read, so the caller's check sees them. The one
reading of the added contexts is `contexts.ts`' new `addedContextsOf`
(40 lines to 55): `contextsOf`'s `modules.context` contexts, each
consuming what its record says. Growth (459 lines to 457), the
reading's private `addedContexts` and the retrofit read it, where each
filtered `contextsOf` for itself. `harness-retrofit.ts` replays keel's
own `bounded-context` once for each, and nothing for the skeleton or
the peer.

- **Held byte for byte**, each suite against its committed JSON under
  `CI=true`, and `git diff --exit-code` over every golden and known
  file after:
  - the four paths goldens (689, 1,326, 731 and 690 cells), among them
    the 200 `keel add module` cells, and the 618 cells of the fourth
    and 143 of the second that run after a module history;
  - `converge.golden.json` (3,436), whose 200 module cells are run and
    held against their reading, as S.2 landed them;
  - `growth.golden.json` (360, 144 after a history);
  - `shared-files.golden.json` (498, its 100 history cells among them);
  - the agent-harness and run-skill goldens.

  The grid's four axes pass: growth's I10 on all 320 cells, 128 of them
  after a history, and brownfield's I9 on its 28 `keel add module
orders` cells. The known files are as they were: brownfield's
  `{"I5": {}}`, `{}` for the others. `add-entrypoint.test.ts`' 47
  cases, `agent-harness.test.ts`' 18, `docs.test.ts`' 10, the
  project-status, preview-answers, legacy-answers and harness-generation
  suites, and the five context adapters' suites pass unchanged.

- **What moved in the tests**, each the step's own:
  - `converge.test.ts`: the module plan carries `adds`, consuming
    `greeting`, and `null` where nothing is named.
  - `converge-run.test.ts`: the retrofit's two cases went with the
    family's own `bounded-context`, whose skill they wrote. One now
    holds, and is named for, an absence: the retrofit writes that skill
    under neither caller setting (`retrofit.contexts` true or false),
    on a project recording the skeleton and one added context. The
    other held an element no adapter of the twin ranks realized and
    recorded last, and S.5 leaves no context element to hold it with.
    A draft vertical stands in: its one adapter excludes a tag a later
    vertical of the run promotes, so the run writes its skill, and the
    twin, reading the tags the run leaves, ranks it nothing.
  - `agent-harness-grown.test.ts`: adoption on a grown Quarkus
    modulith, on a registry listing its own `bounded-context` with a
    skill and a team-notes region on each context's shell, now writes
    neither for any of the four contexts, the skeleton's `greeting`
    included. The notes stay as the user wrote them, and persistence's
    replayed skill is still written and recorded. A second case, on
    the same registry, adds `ordering` to a harnessed modulith, then
    checks and syncs the root map: no `inspect-` row after the add or
    the sync, no drift, the notes as written, and no entry under
    `.claude/skills/inspect-`. Run on HEAD's sources, the add wrote
    rows for `/inspect-greeting` and `/inspect-ordering`, skills
    nothing wrote. A third, the marker case, from the second review,
    adds `orders` to `go-cli`'s modulith on a registry whose
    `code-style` has one more adapter, requiring `modules.context` and
    writing a skill: the root map has no row for it, and the check
    reports no drift. With the re-index reading the marker, the add
    wrote a `/marked` row.
  - `add-module.test.ts` gains two cases on `go-cli`'s modulith, the
    run past the gates. In the 11th, the adapters the report resolves
    are the plan's, and the root map is among its changes; nothing is
    noted or proposed. The row is recorded once and last, and each
    context after the others, `orders` consuming `greeting` and
    `shipping` none, at the pinned instant, with the tags and answer
    keys as they were, and the root map's entries hashing what is on
    disk. In the 12th, on a clock a second later each time it is read,
    the context's `installedAt`, the row's and the manifest's
    `updatedAt` are one instant.

**The proof** that the suites catch what they are for, each tried in a
scratch edit and undone byte for byte, run against the four suites
above, `add-entrypoint.test.ts`, `agent-harness.test.ts`,
`docs.test.ts`, `preview-answers.test.ts` and the five context
adapters' suites (234 cases). Each failed exactly the cases named:

- the retrofit reading a registry's `bounded-context` first, as HEAD
  did: the retrofit's case, the adoption's, and the root map's on that
  registry;
- the context the run adds consuming what the record says, which is
  nothing: 37 cases, across the five context suites and
  `add-entrypoint.test.ts`;
- the handler's report keeping the run's changes, from before the
  re-index: the 11th case;
- an element no adapter ranks realized first: the stand-in case;
- the handler not rehashing what the re-index wrote: 11 cases, the
  11th, four of `agent-harness.test.ts`' provenance cases (the root map
  `keel add module` re-indexes, on quarkus-rest, go-http, rust-http and
  ts-http) and six of `add-entrypoint.test.ts`' module-history cases,
  and, run apart, `paths-grow.golden.test.ts`' comparison;
- the run reading the clock afresh rather than the handler's instant:
  the 12th case;
- the re-index reading the manifest with the context marker, as HEAD
  did: the marker case, and, outside the goldens, the grid and e2e,
  no other of the 167 files' 2,919 cases.

Five edits fail nothing, and cannot: the retrofit replaying no context
at all; `converge` ignoring `retrofit.contexts`; the retrofit
replaying every recorded module through keel's own `bounded-context`,
the skeleton and the peer included, as HEAD did where no registry
listed one; the added context's wiring without the supplied answers
and the mode; and the run dropping the answers that wiring read. No
adapter of keel's `bounded-context` declares a harness element or asks
a question, so each writes what HEAD wrote. The first three are the
retrofit's replay of the added contexts, which the text asks for and
which writes nothing today; the last two, the command's mode. They are
kept so that a context adapter that declares an element or asks a
question is replayed, and answered, as a first install is. Deleting
the replay and the setting instead, since no suite can hold them,
would depart from the text's "`contextsOf` … serves … the harness
retrofit", so it is left to the plan.

**Times**, under `CI=true` on four cores, with another checkout's suite
running beside both runs. In one run of `CI=true pnpm test` the suite
took 350.0 s as vitest reports it (5 min 51 s wall), with 202 files
and 3,235 tests passing, one test more than HEAD's 3,234. HEAD, run on
the same box just before it, took 351.8 s (5 min 53 s wall). HEAD's run
started at a load average of 2.0 and passed 9 during it; this one
started at 5.2 and ended at 10.4. Beside the rest, with HEAD's in
brackets:

- growth's axis took 107.9 s (133.8 s);
- the converge golden 68.8 s (66.5 s);
- the paths golden's four 41.3, 56.1, 16.1 and 52.4 s (35.3, 44.7, 14.6
  and 46.4 s; new, add, reapply, grow);
- `shared-files.golden.test.ts` 48.8 s (40.7 s);
- `add-module.test.ts` 1.75 s (1.53 s).

Alone, in three runs, `add-module.test.ts` took 0.95 to 1.11 s,
`agent-harness-grown.test.ts` 0.84 to 1.82 s, `converge-run.test.ts`
94 to 215 ms and `converge.test.ts` 83 to 125 ms. No difference stands
out from the load. Run again after the review's two new cases, the
suite took 291.7 s (4 min 52 s wall), 202 files and 3,237 tests
passing, from a load average of 4.4 to 4.7: growth's axis 106.4 s, the
converge golden 56.0 s, the paths goldens 32.4, 43.5, 13.4 and 42.2 s,
`shared-files.golden.test.ts` 38.1 s, `add-module.test.ts` 1.39 s and
`agent-harness-grown.test.ts` 1.44 s. After the second review's marker
case, it took 343.0 s (5 min 44 s wall), 202 files and 3,238 tests
passing, from a load average of 6.0 to 4.8: growth's axis 123.0 s, the
converge golden 70.6 s, the paths goldens 36.2, 49.1, 14.7 and 47.1 s,
`shared-files.golden.test.ts` 42.2 s, `add-module.test.ts` 1.34 s and
`agent-harness-grown.test.ts` 2.84 s.

No template changed and no preview moves, so neither the `keel ui`
browser suites nor any e2e suite was run. `pnpm lint`,
dependency-cruiser's `no-circular` among it (306 modules, 1,509
dependencies: one more, net — the handler's imports of `converge.ts`
and `converge-run.ts` and the retrofit's of `contexts.ts`, less the
handler's of `actions.ts` and the run's of `growth.ts`), and
`pnpm typecheck` pass. The CHANGELOG entry is under _Changed_.
`src/domain/core/AGENTS.md` names the command a caller and says what
the retrofit reads, and that it writes nothing today.
`docs/composition.md` (the harness adoption),
`docs/verticals/agent-harness.md` (adopting it later) and
`docs/plugins.md` (growing) say which `bounded-context` the replay
reads.

Beyond the text above:

- **No flag for the proposals.** The run still reads them, over the
  steps it installs and the tags it leaves. A module plan installs no
  step, and keel's `bounded-context` declares no promotion, which
  `installVertical` refuses an adapter to make undeclared. So the run
  proposes nothing by construction, and the 11th case holds it.
  `proposeForLater` is passed true, a later run's words, since the
  command takes no `--refresh`.
- **The context the run adds is marked on the plan**, by `adds`, rather
  than handed to the run already recorded. The manifest records it
  after the run, as before: the handler records it. The run's one
  finalize projects the index over the manifest's modules, and HEAD's
  install read them without the new one. `adds` is a field the converge
  golden's module cells do not print, so the golden does not move.
- **One instant for the run and the record.** The handler reads the
  clock once and hands the run a clock that stays at that instant, so
  the context's `installedAt` and the manifest's `updatedAt` are one
  timestamp, as they were, and the 12th case holds it. The run reads
  its clock once, as S.3 has it.
- **The re-index reads the manifest the run leaves**, with the
  add-module inputs and the context marker stripped. HEAD re-indexed
  over the manifest still holding them. No vertical but
  `bounded-context` reads either, so no byte moves on keel's registry,
  and a plugin's vertical whose adapters require or exclude the marker
  is now indexed there as `keel docs sync` indexes it. The CHANGELOG
  entry says so, and the marker case holds it.
- **The handler throws where the reading of one context refuses**,
  which it never does: `moduleOf` has no refusal, and the handler's
  gates are the command's refusals.
- **`retrofit.contexts` stays the caller's.** Since the retrofit reads
  keel's own `bounded-context`, whose adapters declare no harness
  element, the setting moves no byte on any registry, and no suite can
  tell its two values apart. It stays so that a context adapter that
  declares one is replayed by an adoption, and not a second time by
  growth, which wires the contexts itself.
- **S.4's re-render of the adopted harness reads so too.** S.4, landed
  beside this step, went on in `agent-harness-grown.test.ts`' adoption
  case to re-render the harness it adopted, over the greeting
  context's skill edited, and held the skill and each context's region
  put back. Neither is written now, so the re-render edits the
  persistence skill instead, which the retrofit replays as a recorded
  vertical that did not run, and holds it put back byte for byte, no
  `inspect-<context>` skill written, the team's notes left as the
  user's prose, and the domain, the deferred actions and the modules as
  they were, under `--reapply` and `--refresh agent-harness` alike. A
  retrofit that replays no recorded context passes it, as S.4 says it
  would where no context declares a harness element.

### S.6 — `keel new`, a caller from its seed manifest (L) ✅

`stageStack` hands `converge` a scope's seed and its request:

- **The seed:** the empty manifest with the identity no vertical
  makes: the preset's and the dials' tags, `projects`, `peers`,
  `services`, the scaffolded modules and the generation.
- **The request:**
  - the preset's verticals, in the preset's order. They never go
    through `admit`, which sorts a request by id and then reproduces
    none of the 28 orders, and which cannot order a product root's
    glue;
  - then the extras, in `admit`'s order;
  - less what a monorepo service's placement leaves to the root.

It runs in the `scaffold` posture. The engine's own finalize becomes
the operation's. The research measured that byte-identical on 4 of 4
cells.

`new-project.ts` keeps everything else, since it is `keel new`'s:

- the drill-down and the review;
- the dials and their gates;
- adopting a `README.md` and a `.gitignore` (D13);
- the directory gates;
- the product: its scopes, its routing of extras, `crossScopeWrite`
  and the commit across scopes.

**Holds green:**

- the greenfield and composite goldens;
- every invariant the greenfield and composite axes hold;
- the agent-harness, run-skill and shared-files goldens;
- the paths golden's `keel new` cells, the answered bodies included,
  byte-identical;
- `new-project*.test.ts`.

No byte of a scaffold moves, so no e2e suite runs. No CHANGELOG entry.

**Leaves out:** a converge of a product's root or across scopes (U),
and `keel new` in a directory holding a project, which stays
`keel.already-initialised` (DS1).

**Landed as the run's fourth caller**, in one commit, with no golden
moved. `stageStack` in `handlers/new-project.ts` builds each scope's
seed as it built its manifest before, reads its plan with
`convergeOf(…, { kind: 'new', … })` and hands it to `converge`, where
it called `installVerticals` and the engine realized its own harness
buffer. The request names the preset, the harness dial, the extras
the handler admitted on the scope in the order they install, whether
the scope is a monorepo service, and, for a product's service, the
product and the service's path, which say what the product gives it.
The handler's own placement filter goes, since the reading applies it
(`presetServiceVerticals`). The handler goes from 2,125 lines to
2,159, its doc comments most of the difference. The run takes three
inputs it did not take before, each optional and absent for the other
callers:

- `apply`, the posture its steps install in: `scaffold` here, and
  `install` where it is absent;
- `rules`, the preset's own (`stack.conflicts`), held with the run's
  after every step, as `installVerticals` holds them;
- `owners`, the handler's ownership, which `crossScopeWrite` reads
  back to name who wrote a file two scopes stage.

`Converged` carries two fields more, `adapters` and `reads`: what the
run resolved and the supplied answers it read. The handler holds those
answers across every scope at once, after the last is staged, as
before. `converge-run.ts` goes from 566 lines to 612; `converge.ts`
changes in its module's doc comment and in `serviceAt` (below), 871
lines to 875; `install.ts` in two doc comments alone, 825 lines to
829; and `apply.ts` does not change. What the handler keeps is the
text's list, with the answer check across its scopes, `underService`
and `commitScopes`: every tree, then every manifest, then each scope's
deferred actions.

- **Held byte for byte**, each suite against its committed JSON under
  `CI=true`, and `git diff --exit-code` over every golden and known
  file after:
  - the four paths goldens (689, 1,326, 731 and 690 cells): the 689
    `keel new` cells, the answered bodies among them, and every
    scaffold the other three run their commands on;
  - `converge.golden.json` (3,436 cells, 707 `keel new` scopes in
    its 689 `keel new` cells), whose round trip reads back 673 of those
    scopes (the product roots stay U's), and 24 more in the product
    menus it records nowhere: 697, each now converged by the handler;
  - the grid's greenfield (1,335 cells) and composite (1,656) goldens,
    and brownfield's and growth's;
  - `shared-files.golden.json` (498), the agent-harness golden (28
    presets), the run-skill golden (5 families) and
    `growth.golden.json` (360).

  The grid's four axes pass, with every invariant the greenfield and
  composite axes hold, and growth's I10 on all 320 cells. The known
  files are as they were: brownfield's `{"I5": {}}`, and `{}` for the
  others.

- **The handler's suites pass**, unchanged but for a case each in two
  of them: `new-project.test.ts`, 98 cases to 99,
  `composite-scope.test.ts`, 36 to 37, `new-project-adoption.test.ts`'
  15, and the 13 web suites of `tests/application/web` (240 tests).
  The two cases:
  - `new-project.test.ts`' `fullstack` under the monorepo layout, on a
    clock a second later at every read: each of its three manifests
    records every timestamp at the one instant, the manifest's, its
    verticals', modules' and entries'. Handed the deps' clock instead
    of the command's instant, each scope's verticals are stamped at a
    later instant than its manifest, and the case fails where every
    other suite, on a pinned clock, passes; HEAD passes it;
  - `composite-scope.test.ts`' plugin product listing two services at
    one path, `go-http` and `web-components` at `app/`, refused under
    the polyrepo layout as `keel.cross-scope-write` in HEAD's
    sentence, which a `serviceAt` that matches the path alone turns
    into a plain throw (below).
- **`converge-run.test.ts` gains four cases**, from 21 to 25, on the
  family's CLI preset:
  - the `new` reading of a seed, with the harness and without it, with
    two extras, run in the `scaffold` posture, stages what
    `installVerticals` stages from the same seed when it realizes its
    own buffer: every file's bytes, the deferred actions, the adapters,
    the count of skipped elements, and the manifest compared as JSON,
    so key order too. What the research measured on 4 of 4 real
    cells is held as a case, on the fixture family; on the shipped
    presets the goldens above hold it;
  - the posture: the log's patch writes into a user's `log.txt` under
    `install`, and is refused as `keel.path-conflict` under
    `scaffold`;
  - the caller's rules: a rule of the preset's on the tag a step
    promotes refuses that step as `keel.incompatible`, naming the rule,
    and the same run without it is Ok;
  - the caller's ownership, read back for who wrote `cli.txt`, and the
    adapters and supplied answers the run returns.

**The proof** that the suites catch the handler's part. Each edit was
tried in a scratch copy of `stageStack` and undone byte for byte, then
run against the handler suites `keel new` reaches most (the two
`new-project` suites, `assembly-rules`, `composite-scope`, the six
`fullstack` suites, `supplied-answers` and `preview-answers`),
`converge-run.test.ts`, and the greenfield and composite axes: 15
files, 276 tests. Each failed exactly the cases named:

- **The run in the `install` posture.** The greenfield axis's golden
  moves, and I1, which is hard, breaks on 31 cells. Four of
  `new-project.test.ts`' cases fail: the refusals of ts-http over the
  user's `package.json`, of quarkus-rest over their
  `settings.gradle.kts`, and of go-cli over their `.gitattributes` and
  `.claude/settings.json`, each a patch that merges into the user's
  file where the scaffold posture refuses it.
- **The preset's rules not handed to the run.** `assembly-rules.test.ts`'
  case of a preset's own rule over the tags its verticals fold in, and
  no other.
- **The run's own ownership, not the handler's.** `composite-scope.test.ts`'
  case of a product two of whose scopes write one file, whose sentence
  names each writer, and no other.

The same three edits made in `converge-run.ts` instead, so that the
run ignores `apply`, `rules` or `owners`, each fail one case of
`converge-run.test.ts`, its own, and none of the three other handler
suites that call the run (`add-vertical`, `add-entrypoint` and
`add-module`, 122 tests with it). The byte-identity case passes under
the run's `install` posture too: on an empty tree the two postures
write the same, as the research found.

**Times**, under `CI=true` on four cores, as vitest reports a file's
tests. Seven files carry most of `keel new`'s dispatches: the two
`new-project` suites, `composite-scope.test.ts`, `paths-new`, the
converge golden and the greenfield and composite axes (175 tests).
They were run together four times, alternating this step's sources
with HEAD's, at a load average of 3 to 11 from other work on the box:

- this step's two runs took 74.1 s and 81.8 s: the converge golden
  62.5 s and 68.9 s, `paths-new` 42.9 s and 39.9 s, greenfield 41.4 s
  and 41.0 s, composite 17.0 s and 20.8 s, and `new-project.test.ts`
  14.2 s and 19.9 s;
- HEAD's took 89.0 s and 68.4 s, in the same order 76.8 s and 58.4 s,
  43.6 s and 37.1 s, 46.1 s and 37.3 s, 23.2 s and 16.4 s, and 20.2 s
  and 15.1 s.

The reading of each scope's seed shows no cost that stands out from
the load. In one run of `CI=true pnpm test` the suite took 360.3 s as
vitest reports it (6 min 1 s wall), with 202 files and 3,247 tests
passing, four more than HEAD's 3,243, against 316.8 s (5 min 18 s
wall) for HEAD, run on the same box just before it. HEAD's run started
at a load average of 0.3 and ended at 5.8; this one started at 0.8 and
ended at 6.0, and collecting the files alone took it 26 s longer
(166.7 s against 140.7 s), which nothing this step changes reaches.
Beside the rest, with HEAD's in brackets:

- the converge golden took 72.8 s (59.9 s);
- the paths golden's four 39.6, 51.7, 16.2 and 49.1 s (39.3, 50.7,
  16.4 and 50.7 s; new, add, reapply, grow);
- greenfield 42.2 s (35.5 s), composite 15.8 s (17.9 s), brownfield
  21.5 s (17.7 s) and growth's axis 121.5 s (118.8 s);
- `shared-files.golden.test.ts` 42.4 s (42.0 s) and
  `new-project.test.ts` 16.9 s (14.1 s).

`converge-run.test.ts` takes 85 ms alone. A last run, on the finished
tree with its docs, took 372.8 s (6 min 13 s wall) from a load average
of 2.5 to 5.8, with 202 files and 3,247 tests passing: the converge
golden 71.4 s, the paths goldens 39.5, 50.4, 15.4 and 48.7 s,
greenfield 43.8 s and growth's axis 144.3 s. `git diff --exit-code`
over every golden and known file, 19 of them, was clean after it. After
review, with the two handler cases above, `serviceAt`'s match on the
preset and the doc comments, a run took 348.3 s (5 min 49 s wall) from
a load average of 1.9 to 6.0, with 202 files and 3,249 tests passing:
the converge golden 69.2 s, the paths goldens 38.8, 50.7, 17.0 and
49.4 s, greenfield 43.5 s and growth's axis 138.3 s. The goldens and
known files were clean after it too.

No byte of a scaffold moves and no preview changes, so neither the
`keel ui` browser suites nor any e2e suite was run. There is no
CHANGELOG entry, since nothing a user sees moves. `pnpm lint` and
`pnpm typecheck` pass. Dependency-cruiser, part of `pnpm lint`,
cruises 306 modules and 1,508 dependencies, two more than HEAD's
1,506: the handler imports `converge.ts` and `converge-run.ts` where
it imported `install.ts`, and the run imports `answers.ts` for the
type of what it read. `src/domain/core/AGENTS.md` names `keel new`
among the run's callers, and says what its handler keeps and what it
tells the run.

Beyond the text above:

- **The extras are admitted twice**, as `keel add` admits its set
  twice. The handler admits them before a question is asked, for its
  refusals and its notes. The reading admits that set, already closed,
  again, on the scope `keel new` plans it on (`presetScope`, or
  `presetServiceScope` for a service), which is the handler's. So it
  cannot refuse, and where it would, the handler throws. The converge
  golden's round trip already held the `new` reading's run to the
  order `keel new` records, on all 673 of the scopes it records, and
  the menus' 24.
- **The run's refusals cannot reach `keel new`.** The handler hands the
  run no `check`, since it holds the supplied answers across every
  scope at once, after the last is staged, as before; and nothing
  re-renders. Where `converge` returned a refusal, the handler throws.
  Every throw of an install or of the harness pass reaches the handler
  as before, with a service's paths moved under it (`underService`),
  since the run rethrows what it does not read as a re-render's
  conflict.
- **One instant for the command.** The handler reads the clock once,
  as before, and hands each scope's run a clock that stays at that
  instant, as `keel add module` does. A product's root and services
  share their timestamps, which `new-project.test.ts`' case on a
  ticking clock holds (above), as `add-module.test.ts` holds
  `keel add module`'s.
- **The reading finds a service by its preset too.** S.2's
  `serviceAt` took the first service a product lists at the request's
  path, and nothing in the registry stops a plugin's product listing
  a path twice: on one listing `go-http` and `web-components` at
  `app/`, the `web-components` scope's reading would throw a plain
  `Error` under the polyrepo layout, where HEAD's install refuses the
  product as `keel.cross-scope-write`. `serviceAt` now matches the
  path and the preset. On that product, and on one listing `go-http`
  twice at `app/`, the first with persistence of its own, both layouts
  come back as HEAD's do: `keel.cross-scope-write` in HEAD's sentence,
  or, under the monorepo layout with two presets, the product glue's
  `ContributionConflictError`, thrown on HEAD too. Two services on one
  preset at one path read the first one's extras, and meet the same
  refusal. Refusing such a product at registration would be a new
  refusal, and is left alone.
- **What the run adds is a no-op on a seed.** `emptyManifestV2` stamps
  this keel's generation, so where the harness runs, the restamp writes
  the same value onto the key already there, and a
  `--no-agent-harness` project keeps it, as before. The retrofit
  replays nothing, since everything recorded ran and a seed records no
  added context (`retrofit.contexts` false). No refresh can be
  proposed, since a seed records no vertical.
- **A monorepo product's root runs through the same call.** Its plan
  is the product's verticals in the product's order, which the
  handler installed before. Its round trip, and a converge of a root
  that exists, stay U's.
- **The report stays the handler's.** A product's report spans its
  scopes, so the handler still builds it from each scope's tree,
  deferred actions and skipped count. Of the run's own report it reads
  the count alone.
- **The engine keeps its own finalize**, which no command reaches now.
  `installVerticals` still realizes its buffer where it is handed none,
  as `install-verticals.test.ts` holds, and `converge-run.test.ts`'
  first new case holds the run's finalize to it on a seed. Its module
  comment and TSDoc say
  so now: both front doors reach it through `converge`, which always
  hands it the buffer. Taking the finalize out is left to a step that
  changes `install.ts` anyway.

### S.7 — A re-render keeps what later verticals wrote (L) ✅

This is the first step that changes what a command writes, and it
fixes R's blocker 8. A re-render (`--reapply v`, `--refresh v`) now
runs within the recorded composition (DS4):

- `v` re-renders in the `reapply` posture, as today. The apply records
  which of `v`'s whole files it rewrote: those it wrote because the
  render differs from what the Tree holds, not those it skipped as
  identical.
- Every other recorded vertical then replays its patches in recorded
  order, and each added context's wiring after them. They go onto
  those files, and onto no other. A new posture of `installVertical`,
  `patchesOnto`, takes that set:
  - it writes no whole file;
  - it collects no harness element and queues no action;
  - it reads its answers as recorded, against the recorded manifest.

  A guarded patch is its own fixed point, so what it wrote into those
  files comes back as it was. One that is not a fixed point refuses
  the run as `keel.reapply-conflict`, as a re-rendered one does today.

- D12 holds. Only what the command names is re-rendered, and the
  replay writes into no file but those that re-render rewrote. A whole
  file another vertical owns is left as the user left it.

Why every other vertical, not only those recorded after `v`: rows
recorded at rank (growth now, every caller after S.8) do not keep
arrival order. A vertical that ran before `v` in one run cannot have
patched `v`'s whole files. Its patch would have found no target, or
its seed would have turned `v`'s write into a conflict. So the wider
set restores the same bytes, whatever the recorded order.

A declared read (`Vertical.reads`) is the one way the replay could
write something new. It would take a vertical whose patch into `v`'s
files depends on another that was recorded after it. No shipped order
reaches it: persistence needs HTTP, which brings observability first.
The Landed paragraph says the paths golden's pairs confirm this.

**The dev container by the tags.**

- Without `arch.server-http`, `dev-container`'s attached render is the
  standalone definition attached as `dev-env` attaches it in place
  (R.1b), which is what one run wrote. With the tag it is the
  template, as today.
- No greenfield cell reaches the first branch: on every preset without
  the tag, the dev container comes first (R.1a's DR1 guard).
- A CLI project that took the dev environment as an extra, and has
  since grown HTTP, gets the template's shape from a re-render: its
  twin's. That is the one shape a re-render moves, and it lies outside
  I10, which has no extras.

**I11 widens**, hard, as _The measure_ says: growth's twins,
brownfield's ten whole-menu scaffolds where the dev environment is an
extra, and each recorded vertical re-rendered alone.

**The golden moves**, on these cells and no other:

- every `walking-skeleton --reapply`, and every whole re-render, that
  lost a later writer's lines. Each now keeps them and stages nothing:
  - the 19 presets on their opening dials and with their whole menu:
    observability, persistence and code-style;
  - every product front end: the gateway;
  - every module history but `go-cli`'s: observability on each HTTP
    one, Go's included, and the contexts' wiring on the JVM, Rust,
    TypeScript and `web-components`;
- `dev-container --reapply`, and the whole re-render, on the
  whole-menu scaffolds of the ten presets where the dev environment
  is an extra. Each now stages nothing;
- the grown project's `keel add dev-container --reapply` where it took
  the dev environment as an extra;
- the converge golden's re-render cells, which gain the replay steps.

The Landed paragraph lists them by command line.

**Holds green:** every greenfield byte, I10, and every other cell of
every golden.

**Runs:**

- the keel ui browser suites, since a re-render's preview now stages
  less;
- `code-style-jvm`, the e2e suite that re-renders before it builds;
- a fixture test, since no shipped patch reaches the new refusal.

**CHANGELOG:**

- _Fixed_: `keel add walking-skeleton --reapply` keeps what
  observability, persistence, code-style, the gateway and each added
  context wrote into the files it rewrites.
- _Fixed_: `keel add dev-container --reapply` after a dev environment
  added as an extra keeps the definition's shape.
- _Changed_: a re-render refuses, as `keel.reapply-conflict`, where a
  later vertical's patch cannot be put back as it was.

`docs/cli.md` → `--reapply` says what a re-render keeps.
`docs/composition.md` says what a re-render is.
`src/domain/core/AGENTS.md` names the posture.

**Leaves out:**

- a user's own edit to a file `v` owns, which is still overwritten and
  shown in the diff, as L has it;
- naming `bounded-context` or a product root's `fullstack` row. The
  contexts come back with the vertical whose files they patch (DS10),
  and the root is U's.

**Landed as the first step that changes what a command writes**, in
one commit. `install.ts`' `installVertical` gains the posture,
`patchesOnto`, a set of paths: each adapter the vertical resolves to
on the manifest it is handed is contributed from what that records
(`recordedContribution`, asking nothing, reading no supplied answer),
and of what it contributes only the patches onto those paths apply, in
the `reapply` apply mode, as a replay: `apply.ts`' `applyContribution`
takes `replaying`, under which an adapter claims once more, once, a
region it claimed earlier in the run. It writes no whole file, collects
no harness element, queues no action, reports no resolved adapter and
records nothing, and onto an empty set it contributes nothing at all.
`installVerticals` takes the positions it replays so (`replays`, each
a `ReplayAt`), each from what it records — the manifest its own step
left, where it installed or re-rendered at an earlier position, else
the one the run starts from, or the one the caller seeds, with the
adapters it names — and onto `Ownership.rewritten`, which `apply.ts`
fills: a `reapply` whole-file write records its path where the bytes differ
from the Tree's, or the Tree holds none, and not where it skips them as
identical or writes a mode back alone (`writeWholeFile` now says
which). `converge.ts`' `reapply` plan, and its `add` plan where
`--refresh` names anything, gain a `replay` step for every other
vertical the project records, in recorded order after the first
re-render, each as soon as every re-render still to come is of a
vertical recorded after it, so a later named vertical re-renders at
its own rank among them; and, after the last re-render, one for each
vertical the run re-rendered ahead of one recorded before it, at its
rank, then for each it installed before it, in run order
(`withReplays`). Among the recorded ones, they gain a `replay` step of
keel's `bounded-context` for each context `keel add module` added,
naming it (`ConvergeStep.context`), by every adapter the tags match
with the marker, where it arrived (`contextReplays`): just before the
first vertical recorded after the `bounded-context` row that is not
older than it, after them all where none is, never before a context
recorded before it. `converge-run.ts` runs every replay by position,
a context's on the manifest the run starts from, seeded with its
inputs as `keel add module` seeds them (`contextReplayed`), and
`wireModules` only wires, as before. A replayed vertical is not one that
ran, so the harness retrofit still replays its harness elements and a
refresh proposal still reads it, as before.
`handlers/add-vertical.ts` leaves the replays out of the verticals it
holds supplied answers against and of its empty plan. And
`adapters/dev-container.ts`' `devContainerDefinition`, handed its
adapter's id, renders the attached shape by the tags: without
`arch.server-http`, the standalone render passed through
`attachDevContainerToDevEnv`, as `dev-env` attaches it in place.

**The golden moves**, on the cells the text lists and no other. Each
golden was regenerated with `KEEL_UPDATE_GOLDEN=1`, in the order
`tests/AGENTS.md` gives, and compared with HEAD's by a script, cell by
cell and field by field. The paths golden moved on 466 cells, each in
its tree and its report, or, as a dry run, its report alone:

- **`paths-reapply`, 82 of 731:**
  - `keel new --stack <preset> <opening dials> && keel add
walking-skeleton --reapply`, and the same after `--with <whole menu>`,
    on the 19 presets the text counts, 38 cells: the twelve JVM REST
    presets and `ts-http` and `ts-cli-http` in `application`, `go-http`
    and `go-cli-http` in `cmd`, `rust-http` and `rust-cli-http` in
    `Cargo.toml` and `src`, and `web-components` in `package.json`,
    where code-style writes its scripts;
  - `keel new --stack <product> … --layout <layout> && cd <service> &&
keel add walking-skeleton --reapply` in all 24 services: the twelve
    front ends in `application`, `domain` and `package.json`, the
    gateway and code-style, and the twelve back ends in `application`
    (8), `cmd` (2) or `Cargo.toml` and `src` (2);
  - `keel new --stack <preset> <opening dials> --with <whole menu> &&
keel add dev-container --reapply` in `.devcontainer`, and the whole
    re-render in its report, on the ten presets where the dev
    environment is an extra: `go-cli`, `rust-cli`, `ts-cli`, the
    Quarkus, Spring and Micronaut CLIs in Java and Kotlin, and
    `web-components`. 20 cells.
- **`paths-grow`, 384 of 690:** `keel new --stack <preset> <modulith
dials> && keel add module orders --consumes greeting && keel add
module shipping --consumes orders && keel add walking-skeleton
--reapply` on 196 of the 200 histories, every one but `go-cli`'s
  four, and the whole re-render after 188 of them, every one but Go's
  twelve.
- **`paths-new` and `paths-add`:** none of 689 and 1,326.

Every single re-render that moved now leaves its scaffold's tree, byte
for byte. The converge golden moved on 1,091 of its 3,436 cells, each
a re-render gaining its replay steps and nothing else (the script held
each cell's order, placement and re-rendered steps to HEAD's): the 651
single re-renders of `paths-reapply`, the 200 bootstraps and 200 whole
re-renders after a history, which also replay each context, a step
at the end of the run (`bounded-context replay orders …`, then
`shipping`), since no history adds a vertical after one; the 18 grown
projects' `keel add dev-container --reapply`, the 20 pairs taking
`--refresh distribution`, which also replay what the add installs
ahead of the re-render after the recorded verticals (persistence on
18, containerization on two), and Q3.4's two `keel add distribution
--reapply`. The 80 whole re-renders with no history replay nothing,
since every recorded vertical re-renders, and did not move.

What they stage was read by a scratch sweep, not kept, that ran the
last command of all 1,171 re-render cells of the three families, on
HEAD's sources and on these. HEAD's staged files on 258 bootstrap
re-renders (19, 19, 24 and 196), 198 whole re-renders (10 and 188) and
the ten `dev-container` ones. Now none of them stages anything. The
only re-renders alone that still stage are Q3.4's two, which move
distribution onto the image's adapter, as S.9 will say. The 20 pairs
stage what they staged, changes and diffs alike, and every cell
resolves the adapters it resolved. Instrumented in a scratch edit, not
kept, the replays over the re-render and history families put 2,644
patches back, by 1,298 adapters replayed: 2,064 by 1,040 of the
contexts', 380 by 176 of observability's, 92 by 20 of the gateway's,
64 by 18 of persistence's and 44 by 44 of code-style's.

**Held byte for byte:** the greenfield and composite goldens,
`growth.golden.json` (360 cells), `shared-files.golden.json` (498), the
agent-harness, run-skill, planner-readiness and stack-registry goldens,
and the four known files: brownfield's `{"I5": {}}`, `{}` for the
others. I10 holds on all 320 growth cells, and every greenfield byte
with it: no `keel new` cell of the paths golden moved.

**I11 widens, hard.** `holdRerenders` holds each `reapply:` pair's
install to staging nothing, on brownfield's scaffolds and in every
composite service. The brownfield axis gains `holdWholeMenu`: each
preset whose opening menu offers the dev environment as an extra is
scaffolded again with its whole menu, a setting and not a cell, and
held to I9 and I11 there. `brownfield.golden.json` goes from 1,711
verdicts to 1,891: 10 `fixed:<stack>/menu` cells and 85
`reapply:<stack>/menu+<v>` pairs, all `ok`. The growth axis holds I11
too, on each twin it scaffolds, as `fixed:` and the twin's command
lines: `growth.golden.json` goes from 1,280 verdicts to 1,440, 160
twins, 64 of them with a history, all `ok`. No key was lost or
changed, and none starts with `add:`.

**The proof**, each tried in a scratch edit and undone byte for byte:

- **The replay dropped**, `withReplays` returning what it was handed,
  the contexts' steps with the rest. I11 failed on exactly the cells
  the golden moved: in brownfield on 20 (the 19
  `reapply:<stack>+walking-skeleton` and
  `reapply:web-components/menu+walking-skeleton`), in composite on all
  24 `+walking-skeleton` pairs, and in growth on 60 twins, those of
  every history but Go's four. So did 21 unit cases:
  `converge-run.test.ts`' three new re-renders, ten of
  `converge.test.ts`' plan readings and eight of `add-vertical.test.ts`'
  re-renders.
- **The contexts replayed after everything**, as the text's DS10
  reads it: five unit cases failed, the three plan readings of where a
  context arrived and `add-vertical.test.ts`' two on a vertical added
  after one. Dropped from an add's plan alone (a `--refresh` beside an
  add), three: the plan reading and `add-vertical.test.ts`' two
  modulith refreshes. Placing each context by its row alone, the
  timestamps ignored, fails the plan reading of a context added after a
  `keel add`; by its timestamp alone, the `bounded-context` row
  ignored, four plan readings, a row growth records at rank among
  them.
- **The region reclaimed no more**, `replayPatches` without
  `replaying`: `converge-run.test.ts`' region case failed, refused as
  declaring the region twice.
- **The dev container's rule dropped**, `dev-container.ts` as HEAD has
  it. I11 failed on exactly 20 brownfield cells, `fixed:<stack>/menu`
  and `reapply:<stack>/menu+dev-container` on the ten presets, and
  nothing in composite or growth. So did the 14 of
  `dev-container.test.ts`' 21 new cases that run without the tag, and
  no other.

**Tests.** `apply.test.ts` holds what a `reapply` records as rewritten,
and that an install records nothing, and that a replay claims once
more, once, a region its adapter claimed earlier in the run, and never
another contributor's. `install-verticals.test.ts` holds
the posture in ten cases: it writes the one patch onto the files it
is handed, no whole file, element, action, reported adapter or record;
it reads its answers as recorded, a question left open by its default,
never supplied or asked; a guarded patch is its own fixed point and one
that is not is a divergence; onto no file it contributes nothing; it
replays only the adapters it is handed, where set; it reads a patch's
target as the Tree does (`./main.txt`); and in a run it replays onto
what a re-render rewrote and not onto a file it never wrote, onto no
file a re-render skipped as identical (an append there would refuse),
a vertical installed at an earlier position, after a later re-render,
from the answer its install recorded, and one vertical at several
positions, each from the manifest and adapters it is handed there.
`converge.test.ts` holds the plan in nine new cases and two changed:
the `reapply` plan's replay steps, a later named vertical re-rendering
at its rank among them, one recorded before the vertical re-rendered
replayed after it, none for a vertical no plugin provides or where
every recorded one re-renders; on keel's Go CLI, the contexts replayed
as steps, each where it arrived — before a `keel add` recorded after
it, after one recorded before it or grown at rank, under a pinned
clock too — before a later named vertical that arrived after it, and
after a `--refresh` re-render beside an add, before what the add
installed; the `--refresh` plan's replay steps, an install the planner
runs ahead of the re-render replayed after the recorded ones, a
vertical re-rendered ahead of one recorded before it replayed at its
rank, and none for a plain add. `converge-run.test.ts` gains four
cases on the `acme` family, with a vertical that puts a guarded line
into the file the CLI bootstrap writes, one that appends one, and one
that owns a region of a file another writes whole and reads it: the
line put back, the vertical recorded first, a whole file of its own
left as the user left it; the new refusal (no shipped patch reaches
it); the region put back where the planner installs its owner ahead of
a `--refresh` re-render, as the add alone leaves it (no shipped patch
reaches it either); and a re-render that rewrites no whole file never
reaching the append.
`dev-container.test.ts` gains 21: for each family without a server,
the attached render is what `dev-env` attaching it in place writes
(seven), and a re-render after the dev environment rewrites nothing,
with the tag or without (fourteen), each family without a server
titled apart (`…, as a CLI`). `add-vertical.test.ts` gains ten: on
`go-http`, `keel add walking-skeleton --reapply` over an edited
`cmd/http/main.go` puts back exactly the scaffold's bytes; on a
`ts-cli` modulith after `keel add module orders` it stages nothing,
and on a `ts-http` one that took persistence after the context too,
the context's handler still listed before persistence's; `keel add ci
--refresh walking-skeleton` on the `ts-cli` modulith and `keel add
persistence --refresh walking-skeleton` on the `ts-http` one leave
what the add alone leaves;
`keel add walking-skeleton persistence --reapply` on `go-http --with
persistence` stages nothing; `keel add ci --refresh walking-skeleton`
and `keel add persistence --refresh walking-skeleton` on `go-http`
stage and leave what the add alone does; a `go-cli --with dev-env`
grown HTTP re-renders its definition to `go-cli-http`'s; and a `--set`
for a vertical a re-render only replays is refused as
`keel.frozen-answer`, not as a re-rendered one's. And the growth axis
gains its I11 test.

**Runs.** The four `keel ui` browser suites passed, 44 tests in 75 s
wall, before the fixes below and again after them, and in 69 s on the
sources this step lands with. The `code-style-jvm` e2e suite ran
twice. In the first run its re-render case, `keel add code-style
--reapply` and then `spotlessCheck` on a fresh `quarkus-cli`, passed,
and its other case failed as Maven Central answered 429 _Too Many
Requests_. The retry failed in both cases on the same 429, before
either built. On the sources this step lands with, it ran twice more:
both cases failed on the 429 before building, then the re-render case
passed in 89 s and the other failed on it again. Maven Central
rate-limits this box, so CI's `jvm-basic-quarkus` e2e shard, which
runs the suite on every push, is its record for this step.

**The weekly sweep**, before S.7 as _The measure_ has it. The
`arrival` suite, filtered to one preset per family (`quarkus-cli-rest`,
`go-cli-http`, `rust-cli-http`, `ts-cli-http` and `web-components`:
48 dial settings, 1,302 pairs and 288 arrivals alone, 918 scaffolds and
1,584 adds), found 12 findings on HEAD's sources in 3.8 minutes, all on
`quarkus-cli-rest`: Q3.4's second finding on its six Gradle settings,
`keel add containerization --refresh distribution` leaving the native
release's two workflows and its answers key and tag behind, and its
third on the same six, `keel add iac` refused as `keel.needs-refresh`.
Run again on this step, it found the same 12, line for line, in 3.9
minutes.

**Times**, under `CI=true` on four cores, with another checkout's
suite beside most runs. The run of `CI=true pnpm test` this step lands
with took 344.7 s as vitest reports it (5 min 46 s wall), with 202
files and 3,300 tests passing, 57 more than HEAD's 3,243, at a load
average rising from 0.9 to 6.5. A second run, before each context
replayed where it arrived and a replay claimed its own region again
(below), took 382.4 s (6 min 23 s wall) at 5.1 to 9.3. A first run,
before the replay's order and what an add installs ahead of a
re-render were fixed (below), took 434.4 s (7 min 16 s wall) at a load
average rising from 4.1 to 11.7, and HEAD's, run just after at 7.0 to
8.9, 374.1 s (6 min 15 s wall). Beside the rest, the landing run's
first, then the second's and the first's, with HEAD's in brackets:

- growth's axis 137.6, 148.4 and 151.8 s (131.5 s);
- brownfield 21.5, 27.6 and 28.1 s (19.2 s), and composite 21.3, 18.1
  and 17.0 s (23.7 s);
- the converge golden 66.1, 66.1 and 81.0 s (66.0 s);
- the paths golden's four 37.6, 49.6, 16.0 and 54.4 s, then 42.5,
  57.9, 15.0 and 59.2 s, then 50.1, 64.0, 18.5 and 72.2 s (39.0, 53.3,
  16.8 and 51.2 s; new, add, reapply, grow);
- `converge-run.test.ts` 99, 83 and 142 ms, `install-verticals.test.ts`
  62, 51 and 34 ms, `dev-container.test.ts` 589, 407 and 762 ms, and
  `add-vertical.test.ts` 8.6, 7.2 and 8.9 s.

The twins' I11 costs growth some 7 s. Paired alone in review, HEAD's
sources, then these twice, then HEAD's, at a load average of 2.0 to
3.3, growth took 115.0 and 117.3 s against HEAD's 109.5 and
107.9 s: 7.4 s more, 6.8%. On this machine the load swings more than
that: three more such pairings here read 102.0 to 152.5 s against
HEAD's 112.0 to 143.9 s, at 2.1 to 5.6 alone and at 2.3 to 8.7 beside
brownfield and composite, one pairing faster than HEAD's. Paired alone
at 1.8 to 2.7, `paths-grow` took 49.4 s (44.8 s), its 400 re-renders
after a history now replaying each context, and the converge golden
48.6 s (49.4 s). Paired alone at 3.5 to 4.5, brownfield took 20.7 and
18.1 s against HEAD's 17.2 and 14.3 s, its 180 new cells among them,
and composite, at 2.7 to 3.5, 14.7 and 14.8 s against 14.0 and 15.1 s.

`pnpm lint`, dependency-cruiser among it (306 modules, 1,506
dependencies, as at HEAD), and `pnpm typecheck` pass. The CHANGELOG
entries are the two under _Fixed_ and the one under _Changed_ the text
gives. `docs/cli.md` → `--reapply` says what a re-render keeps,
`docs/composition.md` what a re-render is,
`docs/verticals/dev-container.md` that a re-render keeps the
definition's shape, `docs/plugins.md` that a plugin's patch onto a
file another vertical writes whole must be its own fixed point,
`src/domain/core/AGENTS.md` names the posture, and `tests/AGENTS.md`
what each axis now holds under I11.

Beyond the text above:

- **Each replay goes where one run of the target composition applies
  it.** The text replays every other vertical after `v`. Where several
  are named, each re-renders at its own rank among the replays after
  the first, so what is recorded between two of them patches in before
  the later one. Replayed after the last re-render instead,
  `keel add walking-skeleton persistence --reapply` on a scaffold
  `--with persistence` staged the entrypoint on `go-http` and
  `rust-http`, observability's lines gone where persistence's patch
  had rewritten their anchor, and the build file and the properties on
  `quarkus-rest` and `spring-rest`, their sections swapped; each now
  stages nothing. Beside an add, what the project records replays
  before what the add installs after the re-render. No golden or grid
  cell names two verticals or more but all of them, so none moved on
  this; `add-vertical.test.ts` holds it on `go-http`.
- **What an add installs ahead of a `--refresh` re-render replays
  after it.** The text replays the recorded composition. The planner
  can run an install first, `admit` ordering by id where nothing else
  decides, and the re-render then rewrote what the install had
  patched: `keel add persistence --refresh walking-skeleton` left
  `go-http`, `rust-http`, `quarkus-rest` and `spring-rest` without
  persistence's wiring in the entrypoint or the build files, and
  recorded it installed; each now leaves what the add alone leaves.
  After the last re-render, the recorded replays and the contexts,
  each vertical the run installed before it replays in run order,
  from the manifest its
  install left — so `installVerticals`' `replays` are positions, since
  one vertical installs and replays in one run — and so does a
  vertical re-rendered ahead of one recorded before it, at its rank.
  Where the re-renders run in recorded order, every `--reapply` and a
  lone `--refresh`, that is one run's order exactly. Several `--refresh`
  re-renders the planner orders otherwise, with an install between
  them, still put every patch back after the last, but can apply two
  onto one file out of one run's order; no shipped command line reaches
  it. The converge golden's 20 refresh pairs gain that one step, and no
  paths cell moved, since neither install patches what distribution
  rewrites (below).
- **Each context replays where it arrived.** DS10 replays the
  contexts' wiring after the verticals, measured on histories that add
  no vertical after a context. A vertical added after one patched in
  after its wiring: on a modulith that took `keel add module orders`
  and then persistence, replaying the contexts last staged
  `MediatorFactory.java` on the four Micronaut REST presets,
  `application/http/Cargo.toml` on `rust-http` and `rust-cli-http`,
  and `application/rest/src/main.ts` on `ts-http` and `ts-cli-http`,
  the lines back in another order, and
  `keel add persistence --refresh walking-skeleton` left them so. Each
  context now replays as a step among the recorded verticals, just
  before the first one recorded after the `bounded-context` row that is
  not older than it — the first `keel add module` records that row
  after every other, and a `keel add` appends after it — after them
  all where none is, and never before a context recorded before it; so
  always before what the run installs. A row growth records at rank
  sits before that row, and growth's run wires the contexts after its
  verticals, so the contexts replay after it too. Recorded at one
  instant, as a pinned test clock records, a context goes before every
  row after `bounded-context`: right for the first, not for one added
  after such a row, which a real clock tells apart. S.8 records a new
  row before `bounded-context`, so it needs another reading of arrival
  there; `add-vertical.test.ts`' `ts-http` case holds the one this step
  reads. Measured by a scratch sweep, not kept, on every modulith
  preset (28): `keel add module orders --consumes greeting`, then each
  of eight extras, 143 adds that write something, then
  `keel add walking-skeleton --reapply` as a dry run and, on a twin,
  the add with `--refresh walking-skeleton` against the add alone. On
  HEAD's sources, 140 of the 143 re-renders staged and 140 refreshes
  left other bytes, all but `go-cli`'s three; with the contexts
  replayed last, eight of each, persistence on the eight presets above;
  now none, under an advancing clock and a pinned one alike. Each
  context replays by every adapter of keel's `bounded-context` the
  recorded tags match with the marker, which is what its add ran and
  what growth wired since. No golden or grid cell adds a vertical after
  a context, so none moved on this, and the converge golden's 400 cells
  that replay a context spell it as a step at the end of the run, where
  it sat.
- **A replay claims its own region again.** The replay goes through
  the run's ownership, where a vertical the run installed or
  re-rendered ahead of the re-render has claimed its regions already.
  `keel add P` proposes refreshing a vertical that reads P; where that
  vertical writes a file whole and P owns a region of it, taking the
  proposal installs P first, re-renders the vertical, and was then
  refused as `keel.reapply-conflict`, P's replay declaring the region a
  second time. `applyContribution`'s `replaying` lets an adapter claim
  once more, once, a region it claimed earlier in the run; another
  contributor's claim, or its own twice in one replay, still refuses.
  No shipped vertical reaches it — keel's own region patches target
  `.editorconfig`, `.gitattributes` and `.gitlab-ci.yml`, which no
  vertical writes whole — so a fixture of `converge-run.test.ts` holds
  it.
- **A vertical no loaded plugin provides is not replayed**, since
  nothing can render it. `add-vertical.test.ts`' case planning on a
  project that records one, a `--reapply` among its runs, passes as it
  did.
- **On the tag, the definition still renders the template.** There
  its bytes are what `attachDevContainerToDevEnv` makes of the
  standalone render, as R.1b's suite holds for each HTTP family, so no
  test tells the two apart; the template stays the reference that hold
  is read against, rather than the attach being held to itself.
  `add-vertical.test.ts` holds the one shape the text says a re-render
  moves: `go-cli --with dev-env`, grown HTTP, re-renders its definition
  to `go-cli-http`'s.
- **A pair the text leaves to its reading is confirmed.** A declared
  read is the one way a replay could write something new. On the 20
  pairs that take a refresh, and Q3.4's two `--reapply`, distribution
  re-renders and rewrites `deploy/compose.yaml`, and Q3.4's
  `.github/workflows/release-image.yml` too. The instrumented replay
  met 347 adapters there, none with a patch on either file, and no
  `paths-add` cell moved. Run again once the add's installs replay
  too, it met 413, none with a patch on either file.
- **The grown project's `keel add dev-container --reapply` moved no
  paths cell.** The text lists it where the project took the dev
  environment as an extra. The paths golden runs it on each preset's
  opening scaffold, which has no extra, and growth installs the dev
  environment as the twin's vertical, attached on the grown tags in
  the template's shape already. The converge golden's 18 such cells
  gain their replay steps.
- **The whole-menu scaffolds carry `reapply:` pairs too.** The measure
  names their whole re-render. Each vertical re-rendered alone there is
  the reading S.7 adds on brownfield, and it is the one that holds
  `keel add dev-container --reapply` by itself: 85 pairs, and no
  `refresh:` pairs.
- **A `refresh:` pair stages what its add stages**, so I11 holds it to
  coming back Ok and re-rendering what it names, as S.1b did, and not
  to staging nothing.
- **No shard option.** _The measure_ has one land first where S.7
  finds growth past about 150 s under `CI=true pnpm test`. The first
  full run read it at 151.8 s, at a load average near 11; the run this
  step lands with, 148.4 s at 5.1 to 9.3. The twins' I11 is some 7 s of
  it (_Times_), and the rest of the axis is what HEAD runs. So no shard
  option landed.

### S.8 — One record order (M) ✅

The second behaviour change (DS3). Every caller records a new row
where one run of the target composition records it, at the reference
order's rank:

- the `verticals` rows;
- the `answers` keys;
- the harness `entries`, realized in the reference order.

Where the harness does not re-render, the step finds a new entry's
place without replaying the whole project. It uses the order
realization writes in, and the contributing adapter's rank in the
reference order. So a recorded vertical that no loaded plugin provides
any more refuses nothing new, as a replay would
(`keel.missing-harness-contributor`). The paths golden's cells hold
the result against one run. Nothing recorded moves (DR4). A new row
goes before `bounded-context`, which stays last. Where the drill-down
places no preset, new rows are appended, as today.

**I12 lands hard.** The `arrival` suite normalises only timestamps
now, and runs filtered after the step.

**The golden moves** in the manifest alone:

- the `entries` of the single-extra `keel add` cells (37 measured:
  persistence 18, iac 19);
- the `verticals` of every harness adoption;
- the rows of every pair cell whose arrival order is not one run's.
  The Landed paragraph counts them per preset;
- the rows of `keel add y` after a module history, which now lands
  before `bounded-context`.

No tree digest moves. On the cells adopted after an extra,
`keel docs check` goes from red to green (18 of 143 measured).

**CHANGELOG:**

- _Changed_: `keel add` records what it adds where `keel new` records
  it, in the manifest's verticals, answers and file entries.
- _Fixed_: `keel docs check` is no longer red after
  `keel add agent-harness` on a project that took persistence first.

**Leaves out:** moving any recorded row, and the navigation index's
reading. A manifest an older keel appended keeps its order, and
`keel docs check` stays red on a project adopted before S. Reading the index
in the reference order would change what `keel docs sync` writes on
every appended manifest, and it waits for a step of its own.

**Landed as one record order**, in one commit. `converge.ts` (875 lines
to 915) places what its callers record: `convergeOf` hands the plans of
`add`, `reapply` and `module` to `atReference`, which, where the target
reads back a preset, places each row the run records anew with `placed`
against the target's reference order — before the first recorded row
the reference lists later, so before `bounded-context`, nothing
recorded moving — reads the target again over those rows, and marks the
plan `reference/reference`, a third `Placement` beside growth's
`twin/twin` and `append/run`. Where no preset reads back the plan stays
appended. `converge-run.ts` (612 lines to 763) ranks by the reference
as it ranks growth by its twin (`rankingOf`, `twinOrder`): the harness
buffer is realized in that order, and `atRank` places the rows and the
answers keys by it. A harness entry is placed by a rank `atRank` is
handed: growth's by where the pass realized it (`realizedRank`, as
before); the reference's by `referenceRank`, which replays nothing. It
reads the stage `realizeHarness` writes the entry's file in — a skill's
or a hook's file, whole, where its contributor's vertical declares that
skill or hook; the hook settings; a file a harness patch or a doc
section lands in; a doc's pointer, ranked by the first contributor of
its doc; the index — then the contributor's rank in the order, then
where this run realized it, for one contributor's files. A contributor
the order ranks nothing of ranks nowhere, and its entry stays where it
is: a vertical no loaded plugin provides, and one the tags the run
leaves no longer cover, which `twinOrder` reads with `coverageGap` and
leaves unranked rather than resolve it and refuse the run. The handlers
change in a doc comment each, and the doc comments that named the order
a re-render runs in the install order — `add-vertical.ts`',
`planner.ts`' and `RefreshGap.verticals` — name the recorded one.

- **The golden moves in the manifest alone.** A script compared every
  cell of HEAD's goldens with the regenerated ones, field by field
  (kept outside the repository, re-runnable against any base): no tree
  digest, verdict or action list moved on any of the 3,436 cells, and
  `paths-new` and `paths-reapply` are byte-identical. `paths-add` moved
  on 603 of its 1,326 cells:
  - 74 single-extra adds, in `manifest.entries` alone: the 37 the
    research measured, persistence 18 and iac 19, and the same 37 with
    their questions answered. 24 more are the same adds in product
    services, in `entries` alone: persistence in each backend under
    both layouts, and iac in each polyrepo backend and frontend, on
    the six products;
  - all 171 harness adoptions, in `manifest.verticals` alone,
    `agent-harness` recorded third where it was last. On the 18 after
    `--with persistence`, `keel docs check`'s drift goes from red to 0,
    as measured; no other cell's drift moves;
  - 189 of the 265 pair cells, 21 on each of the nine presets that
    carry both entrypoints. By field, `entries` alone on 43,
    `verticals` alone on 40, `verticals` and `answers` on 43, all three
    on 42, and `verticals` and `entries` on 21. Q3.4's second spelling
    moved too, on its two presets, in `verticals` alone;
  - all 143 adds after a module history, in `manifest.verticals`, the
    row before `bounded-context`; the 37 of persistence and iac in
    `entries` too.

  `paths-grow` moved on the 18 of its 690 cells that adopt the harness
  and then grow, in `manifest.verticals`, and on nine of them in the
  report too (below). The converge golden moved in `placement` alone on
  2,445 cells, `append/run` to `reference/reference`: every `keel add`,
  `--refresh`, `--reapply` and `keel add module` cell that converges,
  but the 54 at monorepo product roots, where no preset reads back. The
  same 18 growth cells moved in `run` alone. `growth.golden.json` (360
  cells) and the shared-files, agent-harness and run-skill goldens are
  byte-identical, and so are the grid's four goldens and its known
  files: brownfield's `{"I5": {}}`, `{}` for the others. I10 and I11
  hold on every cell.

- **I12 lands hard**, in `INVARIANTS` and `HARD`, held by brownfield
  (`holdArrival`) on each preset's opening dials: `keel add y` on a copy
  of the scaffold, with the refresh the `add:` cell's preview proposes,
  against `keel new --with y`, for each of the 143 extras the menus
  offer; `keel add agent-harness` on `keel new --no-agent-harness`
  against the scaffold, on all 28; and the same after `--with y`
  against `keel new --with y`, 143 more. Every file must match byte for
  byte, the manifest among them: 314 pairs over 628 real runs, through
  `Grid.twin`, so no verdict key is added. All 314 hold. The same axis
  on HEAD's sources breaks it on 208: the 37 single extras (iac 19,
  persistence 18) and all 171 adoptions.
- **The weekly sweep, after S.8.** `normalisedManifest` puts the
  timestamps alone to one value, and keeps key order and every list as
  written; `machinery.test.ts`' case of it now reads a record in
  another order as a `record` finding. Filtered as S.7 ran it
  (`quarkus-cli-rest`, `go-cli-http`, `rust-cli-http`, `ts-cli-http`
  and `web-components`: 48 dial settings, 1,302 pairs and 288
  arrivals alone, 918 scaffolds, 1,590 previews and 1,584 adds), the
  `arrival` suite found 12 findings in 4.7 minutes, all on
  `quarkus-cli-rest`: Q3.4's second finding on its six Gradle
  settings, the manifest differing in its tags and answers, and its
  third on the same six — S.7's 12, line for line, but for the order
  that line names the two fields in, the manifest's own key order now
  rather than a sorted one. Run with the same reading on HEAD's
  sources it found 825 in 4.8 minutes (`go-cli-http` and
  `rust-cli-http` 105 each, `web-components` 192, `ts-cli-http` 210,
  `quarkus-cli-rest` 213): besides the 12, a manifest recording the
  same files otherwise.
- **The tests.** `converge.test.ts` goes from 32 cases to 37: a new row
  before the first recorded one the reference lists later, a harness
  adopted later at its preset's rank, a row before `bounded-context`, a
  recorded row kept where an older keel put it, and a project no preset
  reads back appended; the `add`, `reapply` and `module` placements read
  `reference/reference`. `converge-run.test.ts` goes from 25 to 38, on
  presets of its own built from the family's pieces, most holding two
  runs to one byte for byte, manifest included: the notes' skill
  realized before a map's doc they rank after, and appended after it
  under `append/run`; a row and its answers key before the first
  recorded one; the harness adopted, and a harness with a hook, its
  script whole, then the settings, before any doc; a doc the adopted
  harness shares with a vertical run before it, in one run's section
  order; a new doc's pointer before a recorded one the run does not
  realize, and a recorded pointer ranked by the first of its doc's
  contributors, not the last; a recorded vertical no loaded plugin
  provides, whose re-render of the harness is refused as
  `keel.missing-harness-contributor`, while the add goes on and its
  entry stays last; a recorded vertical whose one adapter excludes the
  tag an add promotes, the add going on with its refresh proposed, and a
  later add and a `--reapply` of the promoting vertical after it;
  harness entries an older keel recorded out of the reference order, and
  rows it appended, kept where they are, only the new one placed; a new
  row before `bounded-context`; and what a `--reapply` newly writes
  recorded where one run records it. Every add there also holds the rows
  it wrote to the plan's `target.recorded`, which the run places anew
  rather than reads. `add-vertical.test.ts`' 36th case now puts the rows
  back as an older keel appended them before its `--reapply` beside
  `--refresh` (below).

**The proof**, each tried in a scratch edit of `src/` and undone byte
for byte, run against `converge-run.test.ts`, `converge.test.ts`,
`add-vertical.test.ts`, `add-module.test.ts` and the brownfield axis
(134 tests). Each failed exactly what is named:

- **The rows appended, the harness still realized in the reference
  order:** I12 on the 208 cells HEAD breaks it on, all thirteen new cases
  of `converge-run.test.ts`, the three placements of
  `converge.test.ts` and `add-vertical.test.ts`' 36th.
- **The entries placed by where the pass realized them**, growth's
  rule: I12 on the 37 single extras alone, and five cases: the
  stage's, both pointers', the vertical no plugin provides and the
  entries an older keel recorded out of the reference order.
- **No stage for a contributor's file, its rank alone:** I12 on 189,
  the 171 adoptions and persistence's 18, and seven cases: the
  stage's, the row's, the adoption's, the hook's, the re-render's, the
  vertical no plugin provides and the entries an older keel recorded
  out of the reference order.
- **A hook's file read as landed, not whole:** I12 on all 208, the
  kit's hooks then ranking after the settings, beside code-style's
  format step, and the hook's case.
- **The hook settings ranked with the index:** I12 on the same 189,
  and the hook's case.
- **The harness buffer left in run order:** the case of a doc the
  harness shares with a vertical run before it, alone. I12 holds on all
  314 pairs.
- **A pointer ranked by where the run realized it alone:** the pointer
  case, alone, which was written for it once nothing else failed.
- **A recorded pointer ranked by the last contributor of its doc:** the
  recorded pointer's case, alone.
- **The reference ranked without `bounded-context`:** the case of a
  row before it, alone.
- **Every recorded row put back into the reference order:** the case
  of rows an older keel appended, alone. I12 holds, since every cell's
  record is the current keel's, in that order already.
- **Every recorded entry put back by its rank in the reference
  order:** the case of entries an older keel recorded out of it,
  alone, I12 holding for the same reason.
- **A recorded vertical the run's tags no longer cover resolved, not
  read with `coverageGap`:** its case, alone, the add refused as
  `keel.uncoverable-vertical`.
- **`--reapply` appended:** the re-render's case, and
  `converge.test.ts`' reapply placement.

**Times**, under `CI=true` on four cores. In one run of
`CI=true pnpm test` the suite took 400.2 s as vitest reports it (6 min
41 s wall), with 202 files and 3,268 tests passing, 19 more than S.6's
3,249, from a load average of 4.7 to 8.9, another checkout's work
beside it. Beside the rest: brownfield 67.0 s, growth's axis 132.5 s,
greenfield 40.7 s and composite 20.7 s; the converge golden 69.8 s; the
paths golden's four 49.8, 62.5, 18.5 and 62.9 s (new, add, reapply,
grow); `shared-files.golden.test.ts` 50.4 s; `add-vertical.test.ts`
15.4 s, `converge-run.test.ts` 258 ms and `converge.test.ts` 82 ms. Two
earlier runs, before the last two cases of `converge-run.test.ts`, had
brownfield at 74.5 s (load 2.7 to 6.0, the suite 387.6 s) and 64.0 s
(4.1 to 8.2). I12 is the step's cost: brownfield alone took 51.3 s at a
load average below 1, and, paired with HEAD's copy of the axis at 4 to
7, 53.3 s and 47.8 s against 14.9 s and 16.6 s. The measure put it at
some 330 real runs and about 50 s; it is 628 runs, in that time. It
stays below growth's axis.

No template changed and no preview moves — a preview stages no
manifest — so neither the `keel ui` browser suites nor any e2e suite
was run; the 13 web suites of `tests/application/web` pass, 240
tests. `pnpm lint` and `pnpm typecheck` pass. Dependency-cruiser
cruises 306 modules and 1,512 dependencies, four more than S.6's: the
run imports node's `path` and the doc, hook and skill contracts. The
CHANGELOG entries are under _Changed_ and _Fixed_.
`src/domain/core/AGENTS.md` names the placements and how an entry is
ranked; `tests/AGENTS.md` records I12 and the sweep's reading;
`docs/composition.md`, `docs/cli.md` (`keel add`, `keel docs`),
`docs/verticals/agent-harness.md` and `docs/development.md` say where
a later run records.

Beyond the text above:

- **`keel new` stays `append/run`.** Its run is in the reference order
  already, which the converge golden's round trip holds on every scope
  it reads, onto a seed that records nothing; placed at the reference,
  it would write the same bytes and move 689 cells of the converge
  golden's `placement`.
- **`--reapply` and `keel add module` are placed at the reference
  too.** A re-render records anew only the key of an adapter the
  vertical newly resolves to, or the entry of a harness file newly
  written, and `keel add module` records `bounded-context` last the
  first time, where appending puts it, its `bounded-context` realizing
  no harness file on keel's presets. No cell reaches a difference, so
  on every cell each behaves as appended; the re-render's case holds
  the first.
- **More single-extra cells move than the 37 measured.** The same 37
  adds with their questions answered move alike, and so do 24 adds in
  product services, which the research's 143 pairs did not include:
  each records its skill's entry where one run of the service records
  it.
- **Nine growth reports move.** Growth runs in the order the record
  keeps, placing what it adds at the twin's rank. After an adoption
  that recorded the harness last it re-rendered the harness last, and
  on the nine CLI presets growing HTTP the report listed its adapters
  so. The harness is recorded third now, so it runs third, and the
  report is the one growing the scaffold made with the harness gives,
  on all 18 cells: report, actions, tree and drift alike.
- **The harness buffer is realized in the reference order**, and on
  keel's presets nothing tells: no vertical before the harness shares
  a file with it, as the research found adoptions writing one run's
  files already. The fixture case holds it.
- **A pointer ranks by the first contributor of its doc**, since one
  pass writes the pointers in the order their docs first appear. No
  add of keel's writes a pointer among recorded ones; two fixture cases
  hold it.
- **`add-vertical.test.ts`' 36th case writes the manifest back** as an
  older keel appended it, distribution before persistence: after two
  adds, S.8 records persistence first, as the planner orders a
  `--refresh`, so without it the case could not tell the recorded order
  from the planner's. It also holds that the adds record persistence
  first.
- **The sweep's reading keeps key order too.** It sorted every
  object's keys, the answers' among them, as well as the lists; it now
  normalises the timestamps alone, as _The measure_ says.
- **A recorded vertical the tags no longer cover refuses nothing new
  either**, beside the one no loaded plugin provides that the text
  names. Placed at the reference, every `keel add`, `--refresh`,
  `--reapply` and `keel add module` ranks the recorded verticals, as
  growth alone did before, and the ranking resolved each on the tags
  the run leaves. So one whose only adapter excludes a tag the add
  promotes refused the run as `keel.uncoverable-vertical`, naming a
  vertical the user never asked about, where HEAD proposed its
  refresh, and so was every later add, `--reapply` and dry run on the
  project it left. `twinOrder` now reads each with `coverageGap` first
  and ranks none of one it finds uncovered: the refusal stays with a
  run that runs it. No cell reaches it, since among keel's adapters only
  `quarkus-cli-native` declares `excludes`, and where it is ruled out
  another adapter of `distribution` covers its dimensions. The fixture
  case holds it; a probe through the mediator — `keel new` of a plugin
  preset then `keel add` of the promoting vertical, and the project
  reached so under the plugin's earlier version, then an add, a
  `--reapply` and a dry run under the later — was refused four times
  before and is Ok on all four, as on HEAD.
- **A re-render after `keel add y` on a module history writes what
  one run writes.** S.7 replays a context's wiring where it arrived,
  read off the rows recorded after the `bounded-context` row; this step
  records `y` before that row, where one run records it, so the
  re-render replays `y`'s patches first and the contexts' wiring after
  them, as `keel new --with y` then the same `keel add module` history
  writes them. Every line of both comes back; only their order moves,
  onto one run's, and a second re-render stages nothing. The arrival
  order cannot be read otherwise: timestamps tie under a pinned clock,
  a re-render restamps what it re-renders, and growth records its rows
  at rank too while wiring the contexts after them. No golden cell
  runs that history, so nothing of the goldens moves. S.7's handler
  case of it now holds the bootstrap re-rendered on a `ts-http`
  modulith that took persistence after `orders` to the entrypoint
  `keel new --with persistence` then `keel add module orders` writes,
  a `modify` of it alone, and a fixed point after. On a manifest an
  older keel appended, the context's wiring comes back where it
  arrived, as S.7 has it.
- **Measured again on S.7's sources**, which this step lands after:
  regenerated there, the goldens move on the same 621 cells as above
  and no other (the move script flags none), in the manifest, the
  drift of the 18 adoptions and the 9 reports alone, and the converge
  golden's placement on the same 2,445 cells beside S.7's replay steps.
  `CI=true pnpm test` passes 202 files and 3,325 tests, 19 more than
  S.7's 3,306; brownfield takes about 53 s alone and 58 s in the full
  suite. The filtered `arrival` sweep finds the same 12 findings, all
  on `quarkus-cli-rest`, in 3.8 minutes.

### S.9 — What a re-render leaves behind is said (S)

keel removes nothing, and a re-render now says what it leaves. Where
a re-render moves a vertical off an adapter that ran, the report
names that adapter.

An adapter "ran" by the record, not by a comparison of tags:

- an `answers` key of the vertical's that is not one of the adapters
  the re-render resolves;
- or an adapter of the vertical whose promoted tag the manifest holds
  and the re-render does not promote.

For each such adapter, the report also names:

- the files it wrote that the Tree still holds, from a contribution
  of that adapter on its recorded answers, whatever its predicate now
  says;
- its answers and its tags, which stay.

The report says keel removes nothing it wrote without a merge base
(L), so those are the user's to delete. Nothing else changes: no
file, no manifest, no verdict.

An adapter that recorded no answer and promoted no tag leaves no
trace in the manifest, so this reading cannot find it. The step lists
in its Landed paragraph which of keel's adapters could be moved off
that way. Recording which adapters ran would take a new field (DS2),
and that is not in scope.

**The golden moves**, in notes alone: Q3.4's cells on
`quarkus-cli-rest` and its Kotlin twin under Gradle, in both
spellings. The note reaches the page through the preview's notes, so
the keel ui browser suites run.

**CHANGELOG:** _Changed_: "A re-render that moves a vertical onto
another adapter names the files the first one wrote, which keel leaves
in place."

`docs/cli.md` → `--refresh` and `docs/verticals/distribution.md` say
it. `add-vertical.test.ts` holds both spellings, and a file the user
already deleted, which the note leaves out.

**Leaves out:** deleting anything; and the weekly finding (2), which
stays open, now said by the command itself.

### Decisions on record

Where a decision is genuinely open, the options are listed with a
recommendation.

- **DS1 — What "`new` and `add` become aliases" means.** Q's
  _Successors_ says they become aliases, and Q's _Deliberately kept_
  says they stay two commands.
  - (a) Two front doors of one operation. Each keeps its surface, its
    gates and its words. `keel new` still refuses a directory that
    holds a project (`keel.already-initialised`), and `keel add` still
    refuses one that holds none. What each runs is the same operation:
    `keel new` from its seed manifest, `keel add` from the recorded
    one. I12 proves them aliases in result.
  - (b) Literal aliases. `keel new --stack=X` in a project converges it
    onto X, and `keel add` in an empty directory scaffolds. Both turn a
    refusal into a write, which changes an existing command's output
    and surface.
  - (c) Two pipelines, as today.

  **Recommend (a).** It is what both of Q's sentences say at once, and
  what the research measured: `keel new`, run as `keel add` runs,
  writes the same bytes. (b) would need the user's word first.

- **DS2 — Where the target composition comes from.**
  - (a) Read off the manifest and the request, with no new field. The
    drill-down places every keel preset back on its own dials (300 of
    300), and the manifest rebuilds the project byte for byte (443 of
    443). Where the drill-down places nothing, the recorded order
    stands in for the preset's.
  - (b) Record the composition: a preset id, or which verticals were
    asked for rather than closed over. An older keel reads such a field
    and drops it on its next write, and the manifest records tags, not
    a preset id (Q's and R's _Deliberately kept_).
  - (c) A schema version bump, which every older keel fails to read.

  **Recommend (a).** (b) and (c) are the manifest changes the user
  asked to be consulted on, and (a) needs neither.

- **DS3 — One order for the record.**
  - (a) The reference order: the one `keel new` of the target
    composition records. That is the preset's order, then the extras
    in `admit`'s order, then `bounded-context`. Each new row goes
    before the first recorded row the reference lists later, and
    nothing recorded moves (DR4). Where the drill-down places no
    preset, rows are appended. It lands as its own step (S.8), after
    every caller has moved with its placement unchanged.
  - (b) Two rules kept: rank for growth, append for everything else.
    The manifest keeps saying how the project arrived.
    `keel docs check` stays red after harness adoption, and I12 cannot hold.
  - (c) Re-sort the whole manifest on every write. This moves recorded
    rows, which DR4 rules out.

  **Recommend (a).** It moves `keel add`'s manifest and no project
  file, and S.8 names every cell it moves.

- **DS4 — What a re-render is.**
  - (a) `v` re-rendered within the recorded composition. Every other
    vertical's patches, and each added context's wiring, are replayed
    onto the files `v` rewrote, and onto no other.
  - (b) `v` alone, as today, and R's blocker 8 stays.
  - (c) `v` and everything recorded after it, re-rendered whole. That
    overwrites what those verticals own, against D12.

  **Recommend (a).** S.7 takes it. A whole re-render is what I11
  measures, not what a command does unasked.

- **DS5 — Removal.** Q's _Deliberately kept_: "no removal or
  reconfiguration without L's merge base".
  - (a) Refuse any run that would move an adapter off, under a new
    code. `keel add distribution --reapply` after a container image
    would then be refused for good, and no path would ever give the
    project the image's pipeline. D3 counted on that refresh, and
    Q1.4 proposes it.
  - (b) Removal is refused by construction: a request has no field
    that takes anything away, so no command can ask for one (S.2).
    Where a request would make an adapter stop matching, as growth's
    tag can, it is refused, and S.2 makes that refusal cite L. Where
    the user named the re-render of a vertical that moves off an
    adapter, the run goes on additively and says what stays behind,
    citing L (S.9). That keeps Q1.4's refresh and adds none.
  - (c) Silent, as today.

  **Recommend (b).** keel removes nothing it wrote, no command can ask
  it to, and it says what it leaves.

- **DS6 — Which paths are callers.** The user's request names
  `keel toolchain` and the planner's closure among the callers. The roadmap
  line names neither.
  - (a) The composition's paths are callers: `keel new`, `keel add`
    with `--refresh` and `--reapply`, `keel add entrypoint` and
    `keel add module`. So is the `toolchain` vertical, through `keel add`.
    `keel toolchain install|check` stays a command of its own, for
    three reasons. It converges the toolchain block, lockfiles on disk
    and the managers' answers onto the managers' files and onto the
    machine. Its verdict is machine state (which tools are installed).
    It has no dry run to plan with. The planner's closure is the
    admission the operation calls, since it returns a delta and no
    target, rather than a caller.
  - (b) The block's file-writing half becomes part of the operation's
    plan, through a port in the contract that the provisioning context
    implements and the composition root injects. The machine half
    stays `keel toolchain`. This would end the `go.mod` directive
    that a bootstrap re-render drops. It would also change what
    `keel toolchain install` writes, make the plan depend on the machine
    where a version resolves through a manager, and reach a context N
    built to be extracted.
  - (c) Move the provisioning context into core, which N's seam rules
    out.

  **Recommend (a).** It departs from the user's list for the
  toolchain engine. The Backlog entry records the engine's
  divergences, and (b) is the route it names for them.

- **DS7 — Settling.**
  - (a) A caller settles only where the project's identity changes, as
    growth does (DR5). `keel add` and `keel add module` queue their
    own adapters' actions, as today.
  - (b) Every run settles. This adds the family's fetch and format to
    every `keel add`, and a second `npm install` to a TypeScript
    context's.
  - (c) (a), plus `keel add module` replaying the family's formatter
    (the Backlog's _A JVM context lands formatted_).

  **Recommend (a).** (c) is the Backlog entry's, and it can land on
  the operation once S has.

- **DS8 — A re-render that changes nothing.**
  - (a) As today: it queues its adapters' actions and records
    `updatedAt`. Nothing records whether an action like
    `gradle wrapper` is still due.
  - (b) Queue nothing and write nothing where nothing was staged.

  **Recommend (a).** (b) is an output change with no defect behind it.

- **DS9 — Where I11 and I12 live.**
  - (a) In the axes that already write projects. I11 goes in
    brownfield, composite and growth (the twins), and I12 in
    brownfield. Both are hard, and no known file moves. The projects
    they need that the grid does not write yet are named, with their
    cost:
    - S.1b: 28 modulith scaffolds;
    - S.7: 10 whole-menu scaffolds;
    - S.8: 28 `--no-agent-harness` scaffolds, 143 `keel new --with y`
      projects and their adds, about 50 s measured.
  - (b) A fifth axis, with a known file of its own. The user asked for
    the four to stay as they are, so a fifth would need their word.

  **Recommend (a).** If growth outgrows its budget, the shard option
  in _The measure_ splits it with no new known file.

- **DS10 — The contexts on a re-render.**
  - (a) An added context comes back with the vertical whose files it
    patches (S.7). `bounded-context`, the row `keel add module`
    records, stays one no command names.
  - (b) `bounded-context` becomes nameable under `--reapply`, and
    re-renders every added context whole.
  - (c) Record which vertical wrote each module. That is a new field,
    which an older keel strips.

  **Recommend (a).** It needs no new surface, and the history cells
  measured it. Replaying the contexts' wiring after the verticals is a
  fixed point on every family.

- **DS11 — What "planned against disk" means.**
  - (a) The target comes from the manifest and the request. The plan is
    that composition's render, staged against the Tree over the
    project's files. The disk decides what is written, what is
    refused as `keel.path-conflict`, and what a re-render leaves
    behind (S.9 names only files still there). The record is trusted
    for what is realized: a context whose files the user deleted is
    not written again unless its vertical re-renders.
  - (b) Also read what is realized off the disk, adapter by adapter.
    That would need the render of every recorded adapter on every run,
    and a base to tell a deletion from a file never written, which is
    L's missing merge base.

  **Recommend (a).** It is what every path does today, and what
  growth's old-manifest check reads files for.

### Not in scope for S

- **Removing anything:** a file, a tag, an answer or a toolchain need
  that a render no longer produces. That needs L's merge base.
- **A product root, a converge across scopes, and `keel add service`.**
  These are U's.
- **Facets over presets, or recording a preset id.** That is T's.
- **A new command or flag:** no `keel converge`, and no `--all`.
- **The page's targets and the web API.** Their four targets stay the
  request vocabulary. What a re-render previews changes in S.7 and
  S.9, and reaches the page through the preview it already reads.
- **`keel toolchain install|check`**, and its divergences, which the
  Backlog records:
  - it overwrites a user's own `mise.toml` on its first run;
  - it has no dry run and no preview;
  - it records no entry and bumps no `updatedAt`;
  - it has no generation gate;
  - its `go.mod` directive comes off under
    `keel add walking-skeleton --reapply`.
- **Byte identity where an extra is also a vertical of the twin**
  (`dev-env` on a CLI project that grows HTTP). That was R's, and it
  stays out.
- **The plain `Error`s** some context adapters throw for an anchor
  they cannot find. These are the adapters' own.
- **Naming `bounded-context` or a product root's `fullstack` row**
  under `--reapply` (DS10).
- **A re-render that changes nothing writing nothing.** It still
  queues its adapters' actions and records `updatedAt` (DS8).
- **The navigation index read in the reference order**, which would
  turn `keel docs check` green on a project adopted before S (S.8).
- **Two sentences of L that the code has moved past.** L says
  `--reapply` takes one vertical per invocation, and that `--set` with
  `--reapply` is refused. The code takes several, and an adapter the
  vertical newly resolves to takes `--set` (`add-vertical.test.ts`).
  L's section stays as history, and `docs/cli.md` already says what
  the code does.

### Deliberately kept

- **The manifest records tags, not a preset id.** S adds no field and
  bumps no version (DS2).
- **`keel new` and `keel add` stay two commands**, as two front doors
  of one operation (DS1).
- **D12: a refresh is proposed, never automatic.** A re-render
  re-renders only what is named, and its replay writes into nothing
  but the files that re-render rewrote.
- **DR4: nothing recorded moves.** A new row goes where one run
  records it. A row already there stays where it is.
- **One e2e suite per cell, and presets as the entry vocabulary.** S
  adds no cell.

---

## Backlog (unordered)

- ~~**A second bounded context in the modulith skeleton**~~ —
  **shipped** as `keel add module <name>`, across all five stack
  families and both JVM build systems.

  The entry's stated justification no longer holds and is worth
  correcting rather than ticking. It read "would make the seam
  demonstrable rather than merely present" — but **I.6** did that,
  with `--with-peer-context` on every family: a second context that
  reaches the first only through its seam, and an e2e per family
  proving the wall fires. By the time this item was built, the seam
  was demonstrated.

  What this item is _for_ is the other half: that a user can **add** a
  context, not merely observe the one keel ships. `--with-peer-context`
  is a flag on `keel new` and therefore fires once, at scaffold time,
  on a name keel chose. Growing a modulith afterwards — the thing a
  modulith exists to make cheap — needed a command that takes a name.

  It also bought a class of proof the flag could not. `--with-peer-context`
  produces exactly two contexts, where the consumed one is always the
  skeleton: a context whose core takes no dependencies and whose seam
  therefore self-assembles. Three contexts is where that stops being
  true, and it is where the emitters' real branches live — an added
  context's seam is built by that context's own wiring, Go's
  `package service` alias collision fires, and TypeScript's
  `peers-meet-at-the-service-seam` backreference is asked to tell two
  _added_ contexts apart for the first time. Each family's
  `add-module-*` e2e builds three.

  **Coverage since closed to the full JVM grid.** It shipped with one
  JVM combination built on CI — Quarkus REST, Java, both build systems
  — and the other fifteen resting on assertions over emitted text.
  There are now 24 cells (12 stacks × 2 build systems), one file and
  one CI job each, because typology turned out to be a real axis: it
  picks the assembly the wiring class renders into and the build file
  the dependencies anchor in, and on Spring it moves `@ComponentScan`
  between `Main` and `Application`. That supersedes **J**'s "the split
  stops at nine" — true of the modulith half, which is floor-bound,
  and not of this one, where each cell is a single file and the axis
  under test is which framework/language/typology broke.

Each entry carries an issue, so "backlog" means tracked-but-unordered
rather than remembered-in-a-file.

- **Persistence: more engines and migration tools**
  ([#72](https://github.com/rgoussu-dev/keel/issues/72)) — both dials
  now exist and are exercised: MariaDB as a second spec record on the
  sticky `engine` question (served on the six JVM stacks, where JDBC
  keeps it a spec record) and a Liquibase (YAML) alternative behind
  the sticky `migrations` question (served on Go/Rust/TS, whose
  emitted replay paths are tool-agnostic). What remains, each a
  choice its predicate keeps off the menu today (Q1.11): MariaDB on
  Go/Rust/TS (their drivers speak the PostgreSQL wire protocol — a
  second driver per stack, not a spec record) and Liquibase on the
  JVM (the `%dev`/`%test` replay is wired through each framework's
  Flyway integration; Quarkus's Liquibase extension reads
  classpath-only changelogs, so this needs design, not just config).
  Serving one is dropping or widening that predicate.
- **A TypeScript context declares the context it consumes** — found in
  R.3c, and not yet filed as an issue. The `package.json` a
  `keel add module --consumes` context gets declares the kernel alone,
  while its gateway imports `@<scope>/<consumed>/service`: npm's
  hoisting resolves that, pnpm's isolated store does not, so on pnpm
  `pnpm run typecheck` fails with a `TS2307` in the context and in each
  assembly wiring it, while its tests pass, vitest resolving what tsc
  does not. It wants the consumed context declared on that manifest
  (`workspaceDep`, as the assemblies declare theirs), and a pnpm cell
  beside `add-module-ts`, which builds on npm alone
  (`tests/e2e/AGENTS.md`). Growth changes nothing here: a grown pnpm
  modulith with such a history fails as its twin does.
- **A JVM context lands formatted** — found in R.3d, and not yet filed
  as an issue. `keel add module` on a JVM modulith queues no
  formatter, as `keel new` does, so the context it adds — its modules
  and each assembly's `<Name>Wiring` and test — stays as the templates
  render it, which is not `spotlessApply`'s output (the formatter
  drops the blank lines between import groups and after a class's
  opening brace). It builds, and the Claude pre-commit hook formats it
  at the next commit, as does any `spotlessApply`. Growing an
  entrypoint queues one, so on disk a grown project has those files
  formatted where its twin, given the same history, has them as
  rendered; I10 compares staged trees and cannot see it. It wants
  `keel add module` to replay the family's formatter for its actions,
  as growth does (DR5), or the templates to be the formatter's fixed
  points.
- **`keel toolchain install` keeps keel's rules for a file** — found by
  S's research, and not yet filed as an issue. The provisioning engine
  converges the manifest's toolchain block onto the managers' own files
  and the machine, and S leaves it a command of its own (DS6). It does
  not follow the rules the composition's writers do:
  - its first run overwrites a `mise.toml`, `.tool-versions`,
    `.sdkmanrc`, `.nvmrc` or `rust-toolchain.toml` the user already had,
    where `keel add` would refuse it as `keel.path-conflict`;
  - it has no dry run and no preview;
  - it writes the manifest to record a provider without the generation
    gate, without bumping `updatedAt`, and without recording its files
    in `entries`;
  - switching provider leaves the first one's file behind.

  Two further gaps are between it and the composition:
  - `keel add walking-skeleton --reapply` rewrites `go.mod` and drops
    the `toolchain` directive go-native merged in, so `keel toolchain
check` goes red until the next install;
  - a pin bump takes four commands (`keel add toolchain --reapply`,
    `keel add dev-container --reapply`, `keel add ci --reapply`,
    `keel toolchain install`), and the first reports no change though
    the block moved.

  It wants the engine to take the first-write rule and a `--dry-run`,
  and a port in the contract, implemented by the provisioning context,
  through which a re-render keeps what the engine merged into a
  project file.

- ~~**Per-service build systems in composite stacks**~~
  ([#73](https://github.com/rgoussu-dev/keel/issues/73)) — **shipped**:
  composites ask the build-system question per service (pin with
  `--build-system backend=maven,frontend=pnpm`), the choice is
  recorded on the product manifest's service refs, and the compose
  Dockerfiles + product README follow it; the `ci` and
  `distribution` verticals follow via the service manifest's `pkg.*`
  tag, as verified by the composite handler tests.
- ~~**`ts-cli` stack**~~
  ([#71](https://github.com/rgoussu-dev/keel/issues/71)) —
  **shipped**: the CLI twin of `ts-http`, completing the family's
  CLI/HTTP pairing. The entrypoint-neutral half of the bootstrap
  moved into a shared `ts-domain` tree (the `jvm-domain` move), the
  CLI shape serves both module layouts and both package managers, and
  `--with-peer-context` / `keel add module` went entrypoint-agnostic
  (`tsAssemblies`, the Rust/Go pattern) so the pairing carries the
  whole modulith story rather than the happy half. Two new e2e cells
  (`modulith-ts-cli-{npm,pnpm}`) plus a basic walking-skeleton suite,
  all in the `web` shard.
- ~~**Composable entrypoints under the modulith**~~
  ([#108](https://github.com/rgoussu-dev/keel/issues/108)) —
  **shipped**. The CLI/HTTP pairing landed under `basic` first: the
  root build files became a shared seed plus an idempotent per-arch
  `apply` (`jvm-shared-root.ts`, `ts-shared-root.ts`), which is what
  lets two entrypoints resolve onto one path. The modulith needed its
  own pass rather than a port, because an entrypoint there
  contributes a driving adapter _inside_ the bounded context
  (`user-side/cli`, `user-side/api/{contract,adapters}`) as well as an
  assembly under `application/`, so the seeded module list is
  per-context and grows sideways rather than downwards.
  `jvm-shared-root-modulith.ts` holds that shape; the seed builders
  are shared with `basic`, which is where the two layouts genuinely
  agree (the reactor pom, the toolchain pins, plugin management).
  Three things came out of it that were not obvious going in: the
  modulith's `archiveBaseName` rename is unconditional rather than
  Spring/Micronaut's concern alone (leaf names repeat by
  construction), Micronaut's reactor root needs its platform BOM
  imported where `basic` needs none, and the four per-arch
  `jvm-domain-modulith` trees collapsed to two per-language ones on
  the richer REST shape — the same unification `basic` did. The
  peer-context and `keel add module` adapters went entrypoint-agnostic
  in the same change (`jvmAssemblies`, the `tsAssemblies` pattern), so
  a composed modulith gets both assemblies wired rather than whichever
  one an `if` picked.
- ~~**`keel add --reapply` / update path**~~ — promoted to item
  **L** above ([#68](https://github.com/rgoussu-dev/keel/issues/68)).
- ~~**IaC vertical (OpenTofu)**~~ — promoted to item **M** above
  ([#69](https://github.com/rgoussu-dev/keel/issues/69)).
- ~~**Mutation testing in this repo**~~
  ([#74](https://github.com/rgoussu-dev/keel/issues/74)) — **landed**
  as sketched: Stryker over `src/domain` with the vitest runner,
  report-only (`thresholds.break` null until the baseline settles),
  running on `main` — incremental per push, full weekly — rather
  than in `verify` or on PRs, since a full run is hours. One
  deviation, recorded in `docs/development.md`: static mutants
  (25% of the total, an estimated 71% of the run — the module-level
  adapter tables, whose guard is the emitted-tree assertions and the
  e2e grid) are ignored. Still open, deliberately: the break
  threshold once the baseline settles, and the wider layers.
- ~~**Version currency**~~
  ([#75](https://github.com/rgoussu-dev/keel/issues/75)) — shipped:
  the per-family pin registry
  (`assets/composition/version-pins.json`), its offline guard
  (`tests/version-pins.test.ts`, in `verify`, shaped like
  `tests/ci-workflow.test.ts`), and the weekly `version-currency`
  workflow running the opt-in drift report under `tests/currency/`
  (never a PR gate — upstream releases must not turn unrelated PRs
  red). Bumps stay human-reviewed; the e2e grid is what proves them.
  The first run already had real findings waiting — the Gradle
  Quarkus stacks pinning 3.16.0 against Maven's 3.34.6, the Flyway
  image major lagging the library pin — and the first full sweep
  cleared the board: every reachable feed's drift bumped in one
  reviewed change, with two deliberate holds recorded in the sweep's
  PR (`jakarta.inject-api` staying 2.0.1 over the `.MR` re-tag, and
  `@types/node` tracking the pinned Node major rather than npm's
  latest).
