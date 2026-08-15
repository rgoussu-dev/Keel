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
  This cell is the new floor: all six files on a 4-core box give
  477.97s of test time in 196.68s wall (divisor 2.43) against a
  longest single file of 195.29s — the wall _is_ that file. Unlike
  the old shape, where every file paid the same cold axum compile,
  peeling this one out would cut real wall clock rather than relabel
  it. Kept as one shard pending a measurement on the runner, whose
  own divisor has been 2.86–2.92; the workflow comment records both
  the number and what to re-measure. This is the first time the Rust
  shard's split has had a case for it.

### I.6 — the peer context beyond the JVM and Rust (M)

`--with-peer-context` now exists on the twelve JVM stacks and on the
two Rust ones. Go, `ts-http` and `web-components` shipped their
modulith without it, which leaves their seam asserted rather than
exercised — the same hole I.4 closed for Rust. Worth closing for the
same reason, and it is the natural predecessor of `keel add module
<name>` rather than a competitor to it: a second context emitted by
flag is most of the machinery a second context emitted by command
would need.

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
