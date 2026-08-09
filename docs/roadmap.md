# Roadmap — growing the scaffold surface

The previous roadmap (composition engine: A3 gradle-wrapper, B
distribution vertical, C1 `keel add`, C2 legacy retirement) landed in
full in v0.4.0-alpha. Since then the repo has been trisected to
dogfood its own binding spec and the skeleton emits the spec as
`AGENTS.md` (see `CHANGELOG.md [Unreleased]`); cutting v0.5.0-alpha
to ship that work is the standing housekeeping item.

This roadmap covers what comes next: widening what the scaffold can
produce. Items are lettered continuing the old sequence. D is the
recommended next step; E pairs with it; the rest are ordered by
leverage, not by commitment.

## D — REST entrypoint: `quarkus-rest` stack ✅ (landed)

**Goal.** The composition engine's core promise is that the
`entrypoint` dimension is _selected by predicate_, not hard-coded —
`quarkus-cli-bootstrap` even documents its future sibling: "A REST
sibling adapter will cover the same dimension under
`arch.server-http`." Nothing has cashed that promise yet; today there
is exactly one bootstrap and one stack. A REST entrypoint is the
first real proof that a second project shape composes out of the
same vertical, and it is the shape most consumers actually want.

It also unlocks the parts of the binding spec a CLI cannot exercise:
the earned-pair `application/rest/contract` + `executable` split
(a REST channel _does_ have a consumable API artifact, unlike the
CLI's single module) and domain-error → RFC 9457 Problem Details
mapping in the interface adapter.

**Adapter.** `walking-skeleton/quarkus-rest-bootstrap`

- `covers: ['entrypoint']` — same dimension as the CLI bootstrap;
  the resolver picks whichever predicate matches the tag set.
- `predicate: { requires: ['framework.quarkus', 'arch.server-http'] }`
- Same sticky questions as the CLI bootstrap (`basePackage`,
  `projectName`) so downstream adapters read them identically.
- Emits the binding-spec layout with a REST channel: the familiar
  `domain/kernel`, `domain/contract` (with `GreetCommand` as the
  sample surface), and `domain/core` (`RegistryMediator` + handler),
  plus `application/rest/contract` (DTOs) and
  `application/rest/executable` (Jakarta REST resource,
  `GET /greet?name=…`, CDI wiring, RFC 9457 error mapper). A
  `@QuarkusTest` + RestAssured test drives the endpoint end to end.

**Stack.** `quarkus-rest` in `src/domain/core/stacks.ts`:

- `tags: ['lang.java', 'runtime.jvm', 'pkg.gradle',
'framework.quarkus', 'arch.hexagonal', 'arch.server-http']`
- `verticals: [vcsVertical, walkingSkeletonVertical]` — unchanged;
  that reuse is the point.

**Ripples in existing adapters.**

- `gradle-wrapper` orders itself `after` the CLI bootstrap by id;
  extend `after` with the REST bootstrap id (absent adapters in
  `after` are already tolerated by the resolver — verify, else gate).
- `sample-port-fake` requires `arch.cli`; loosen to
  `['framework.quarkus', 'arch.hexagonal']` so the sample port lands
  in both shapes. Its `after` needs the same extension.
- `claude-core` fires unconditionally — nothing to do.

**Tests.**

- Resolution: with `arch.server-http` tags the vertical resolves to
  the REST bootstrap, the CLI bootstrap stays out, and all four
  dimensions are covered; with `arch.cli` nothing changes.
- Content: rendered tree contains the two `application/rest` modules,
  the Problem Details mapper, and `settings.gradle.kts` includes.
- E2E, mirroring `tests/e2e/walking-skeleton.test.ts`: scaffold with
  `--stack=quarkus-rest`, `./gradlew build`, then run the jar and hit
  `/greet` (same `KEEL_RUN_E2E` / `KEEL_SKIP_E2E` gating).

**Commit.** `feat(walking-skeleton): add quarkus-rest-bootstrap and the quarkus-rest stack`

---

## E — Distribution for REST: container image

**Goal.** `distribution`'s only adapter
(`quarkus-cli-native`) requires `arch.cli`, so `keel add
distribution` on a `quarkus-rest` project hard-fails with uncovered
dimensions. Add the REST-shaped sibling so the brownfield story
holds for both stacks.

**Adapter.** `distribution/quarkus-rest-container`

- `covers: ['build', 'release-channel']`
- `predicate: { requires: ['framework.quarkus', 'arch.server-http',
'pkg.gradle'] }`
- Emits GitHub Actions workflows that build a container image via the
  Quarkus container-image extension and push to GHCR on tag push;
  one sticky question for the base-image / jvm-vs-native flavour.
- `tagsAdd: ['dist.container-image']` — the tag a future IaC or
  deploy vertical keys on.

**Commit.** `feat(distribution): add quarkus-rest-container adapter`

---

## F — CI vertical (`ci/github-actions`)

**Goal.** The binding spec's "done means green gates" has no scaffold
backing — projects leave `keel new` with no pipeline. A `ci` vertical
is small, applies to every stack, and is the most broadly useful
`keel add` target.

**Sketch.** Vertical `ci`, `dimensions: ['pipeline']`; first adapter
`ci/gradle-github-actions` predicated on `pkg.gradle`, emitting a
build-and-test workflow on push. A future `pnpm` sibling covers the
same dimension for TypeScript stacks (see H).

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

## H — Second language: a TypeScript stack

**Goal.** Binding spec §2 now states settled per-language dispatch
stances; nothing outside the JVM proves them. A `ts-cli` (or
fastify-based `ts-rest`) stack scaffolding the trisected layout with
a registry Mediator — exactly the shape keel's own source uses —
would demonstrate that the conventions, not the templates, are the
product. Largest item here; do it after D–F so the second language
arrives with entrypoint, distribution, and CI patterns to mirror.

---

## Backlog (unordered)

- **`keel add --reapply` / update path** — today adding an installed
  vertical errors; there is no way to re-render after a template fix
  or answer change.
- **IaC vertical (OpenTofu)** — the spec mandates IaC; the skeleton
  emits none. Natural after E (deploy target implies infra).
- **Mutation testing in this repo** — `AGENTS.md §7` marks it "on
  the roadmap; not yet wired". Stryker over `src/domain` first.
- **Java version bump in `quarkus-cli`** — the stack description
  says Java 21 while the spec's stance is latest LTS (25). Verify
  the template's toolchain pin and align.
