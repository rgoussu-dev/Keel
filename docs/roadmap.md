# Roadmap — growing the scaffold surface

Two waves have landed since this roadmap was first written. The
composition engine itself (gradle-wrapper, the `distribution`
vertical, `keel add`, legacy retirement) shipped in v0.4.0-alpha, and
the repo trisection + emitted binding spec shipped in v0.5.0-alpha.
Since then the surface widened far past the original plan — see
"Landed since v0.5.0-alpha" below and the `[Unreleased]` section of
`CHANGELOG.md` for the details.

Items are lettered continuing the old sequence. E and F are the
recommended next steps for breadth; **I** is the recommended next step
for depth and is the only item here sized end-to-end. The rest are
ordered by leverage, not by commitment.

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
  below (CI-built images pushed to a registry) remains open and can
  reuse these Dockerfiles.

What that wave proved: the per-language dispatch stances of binding
spec §2 are exercised outside the JVM (Go, Rust, frontend
TypeScript), and cross-service elements resolve through the same
predicate machinery as everything else.

---

## E — Distribution for REST: container image

**Goal.** `distribution`'s only adapter (`quarkus-cli-native`)
requires `arch.cli`, so `keel add distribution` on any REST project
hard-fails with uncovered dimensions. Add the server-shaped sibling
so the brownfield story holds for both shapes.

The container know-how partially exists — `fullstack/product-compose`
already emits Dockerfiles for every backend — but that vertical is
orchestrator-only glue for composite monorepos. E is the
_distribution_ story: CI-built images pushed to a registry on tag
push, addable to a standalone service.

**Adapter.** `distribution/quarkus-rest-container`

- `covers: ['build', 'release-channel']`
- `predicate: { requires: ['framework.quarkus', 'arch.server-http',
'pkg.gradle'] }`
- Emits GitHub Actions workflows that build a container image via the
  Quarkus container-image extension and push to GHCR on tag push;
  one sticky question for the base-image / jvm-vs-native flavour.
- `tagsAdd: ['dist.container-image']` — the tag a future IaC or
  deploy vertical keys on.

Quarkus first; Spring/Micronaut/Go/Rust siblings then cover the same
dimensions under their own predicates, reusing the Dockerfile
patterns `product-compose` established.

**Commit.** `feat(distribution): add quarkus-rest-container adapter`

---

## F — CI vertical (`ci/github-actions`)

**Goal.** The binding spec's "done means green gates" has no scaffold
backing — projects leave `keel new` with no pipeline. A `ci` vertical
is small, applies to every stack, and is the most broadly useful
`keel add` target.

**Sketch.** Vertical `ci`, `dimensions: ['pipeline']`; first adapter
`ci/gradle-github-actions` predicated on `pkg.gradle`, emitting a
build-and-test workflow on push. Siblings for `pkg.npm`, Go, and
Cargo cover the same dimension for the other stacks.

**Commit.** `feat(ci): add ci vertical with gradle-github-actions adapter`

---

## G — Stack-specific AGENTS.md addenda

**Goal.** Named as a roadmap item in `AGENTS.md §1`: the emitted
binding spec is universal, and stack adapters should append their
runbook (build/test/run commands, layout notes) under a
sentinel-marked section of the scaffolded `AGENTS.md` — the same
sentinel-append pattern the legacy `claude-quarkus` schematic used.
Requires a patch-style contribution against the `claude-core` output,
so it exercises the patch path of the composition contract.

---

## H — Close the JVM e2e grid, then shard CI along it

**Goal.** keel emits **twelve JVM stacks** — three frameworks × two
languages × two entrypoint shapes — and `tests/e2e/` covers **four of
them**. The gap is not cosmetic: every JVM defect that reached `main`
so far was found by a build, never by a file assertion, and the two
Maven modulith defects were found the week a build first ran that
combination. Seven stacks currently ship on the strength of unit tests
over emitted files.

|           | Java CLI | Java REST | Kotlin CLI | Kotlin REST |
| --------- | -------- | --------- | ---------- | ----------- |
| Quarkus   | ✅       | ✅        | ❌         | ✅          |
| Spring    | ❌       | ✅        | ❌         | ❌          |
| Micronaut | ❌       | ✅        | ❌         | ❌          |

The CI shape follows from this, not the other way round. `e2e (jvm)` is
one job because the grid is too sparse to shard along: a
framework × language matrix over today's files would mint
`e2e (spring-kotlin)` as a green job that runs nothing, which asserts
coverage that does not exist. **Populate the grid first; shard second.**

### H.1 — The two missing REST stacks (S)

`spring-rest-kotlin` and `micronaut-rest-kotlin` — the only REST cells
still empty. Cheap, because `tests/support/jvm-rest-e2e.ts` already
parameterises everything framework-specific into `JvmRestE2ESpec` —
stack id, jar path, random-port flag, the log line announcing the port,
health paths, telemetry-silencing flags. A new REST suite is a spec
object and a `describe`, on the order of fifty lines, with no harness
change. The two Java siblings are the specs to copy from.

Expect these to fail before they pass. That is the point of the item.

**Commit.** `test(e2e): cover the Kotlin REST stacks end to end`

### H.1b — Modulith beyond Quarkus (S)

The typology axis is sparser than the framework one. `modulith` has an
e2e on Quarkus/Gradle, on Quarkus/Maven and on Spring/Maven — and
nowhere else. **Micronaut has never had its modulith built**, in either
language or either build system, and Spring's has only ever been built
by Maven. Given that the peer-context wiring is the part that differs
per container, and that both defects it has shipped were container
wiring, this is the highest-value gap in the table.

**Commit.** `test(e2e): build the Micronaut and Spring moduliths`

### H.2 — Extract a CLI harness, then the five CLI stacks (M)

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

**Commits.** `refactor(e2e): extract the JVM CLI harness` then
`test(e2e): cover the remaining JVM CLI stacks`

### H.3 — Reshard `e2e (jvm)` along the populated grid (S)

Only once H.1 and H.2 are green. The axes are framework, language, and
**typology** — `basic` against `modulith`, which is the axis that has
actually shipped defects and the one no framework grouping captures.

Sizing, measured on the sharded run of PR #53 (per-file, seconds):
`rest` 228.6 · `modulith-persistence` 204.7 · `kotlin` 194.9 ·
`modulith` 192.2 · `micronaut` 156.8 · `spring` 122.0 ·
`walking-skeleton` + `modulith-maven` 298.1 combined.

Two facts constrain any split. A runner has 4 vCPUs and vitest runs
files in parallel but the tests inside a file in sequence, so a shard's
wall clock is `max(longest file, total / 4)` — **228.6s is the floor
for every arrangement**, and it moves only if the longest file is split
again. And a shard costs about 25 seconds of setup, so shards that
finish under a minute are mostly overhead.

The consequence worth writing down: **beyond two JVM shards you are
buying attribution, not speed.** Two balanced shards already reach the
floor at roughly the current runner cost; six reach the same floor at
nearly double it. Grid-shaped shards are worth having for what a red X
tells you, and that is a real benefit — but justify them on that,
never on wall clock, and re-measure before claiming otherwise.

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

### I.4 — Rust (L) — _dial; `basic` default, and it stays default longest_

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

**Commits.** `feat(walking-skeleton): modulith module layout for the Rust stacks`, then per vertical.

### Not in scope for I

`keel add module <name>` — emitting a _second_ bounded context with
its peer port and gateway wiring — stays a separate backlog item. It
is what makes the seam demonstrable rather than merely present, and it
is worth far more once I.1–I.4 have settled each language's resolver.

---

## Backlog (unordered)

- **A second bounded context in the modulith skeleton** — the
  walking skeleton emits one module plus its `user-side/service`
  seam. A `keel add module <name>` command emitting the second
  context, its peer port and the gateway wiring would make the seam
  demonstrable rather than merely present. Best done after **I**, so
  it can be written once against five layout resolvers rather than
  once per stack. Note it is also the only way the walls get
  _exercised_: a one-context skeleton cannot violate an
  inter-context rule, so today nothing proves the rules fire.
- **Persistence: more engines and migration tools** — the vertical
  covers every HTTP stack (Quarkus/Spring/Micronaut in Java and
  Kotlin, Go, Rust, TS); what remains is a second RDBMS via the
  engine dial in `persistence-engine.ts` (one spec record + a sticky
  question) and a Liquibase (YAML) alternative to the Flyway
  migrations adapter.
- **Per-service build systems in composite stacks** — composites
  scaffold each service on its default today; offering the choice
  per service needs the compose Dockerfiles to follow it.
- **`ts-cli` stack** — the CLI twin of `ts-http`, mirroring the
  other languages' CLI/HTTP pairing.
- **`keel add --reapply` / update path** — today adding an installed
  vertical errors (`keel.vertical-already-installed`); there is no
  way to re-render after a template fix or answer change.
- **IaC vertical (OpenTofu)** — the spec mandates IaC; the skeleton
  emits none. Natural after E (deploy target implies infra).
- **Mutation testing in this repo** — `AGENTS.md §7` marks it "on
  the roadmap; not yet wired". Stryker over `src/domain` first.
