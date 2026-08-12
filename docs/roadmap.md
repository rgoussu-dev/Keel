# Roadmap — growing the scaffold surface

Two waves have landed since this roadmap was first written. The
composition engine itself (gradle-wrapper, the `distribution`
vertical, `keel add`, legacy retirement) shipped in v0.4.0-alpha, and
the repo trisection + emitted binding spec shipped in v0.5.0-alpha.
Since then the surface widened far past the original plan — see
"Landed since v0.5.0-alpha" below and the `[Unreleased]` section of
`CHANGELOG.md` for the details.

Items are lettered continuing the old sequence. E and F are the
recommended next steps; the rest are ordered by leverage, not by
commitment.

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

## Backlog (unordered)

- **Persistence siblings** — the `persistence` vertical ships
  Quarkus/Java first (mirroring how `quarkus-rest` proved the
  entrypoint dimension). Next: the Kotlin twin, then
  Spring/Micronaut/Go/Rust/TS adapters covering the same
  `datasource`/`unit-of-work`/`repository-example` dimensions behind
  their own predicates (an adapter factory à la
  `jvm-observability.ts` once the second JVM combination lands), a
  second RDBMS via the engine dial in `persistence-engine.ts` (one
  spec record + a sticky question), and a Liquibase (YAML)
  alternative to the Flyway migrations adapter.
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
