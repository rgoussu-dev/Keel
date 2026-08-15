# Development guide

For working on keel itself. The contribution workflow (forks, PRs) is
in [CONTRIBUTING.md](../CONTRIBUTING.md); this page is the technical
side.

## Requirements

- Node 22+
- pnpm 10+
- For the JVM e2e suites: **JDK 25** on `JAVA_HOME`, **Gradle 9.4.1**
  on PATH, and Maven. Those three are coupled and none of them is
  arbitrary — see [End-to-end tests](#end-to-end-tests).

### Claude Code on the web

`.claude/hooks/session-start.sh` provisions the above on session start,
so a web session's toolchain matches CI's rather than the image's. It
runs only when `CLAUDE_CODE_REMOTE=true`, so it never touches a
developer's own `/opt`, and it is idempotent — a warm container
re-runs it in about a second.

It fixes two things the image gets wrong for this repo:

- **Gradle 8.14.3 ships on the image and cannot start on JDK 25.**
  `/opt/gradle` is a symlink already on PATH, so the hook downloads the
  version keel pins and repoints it. That version is read from
  `GRADLE_VERSION` in `src/domain/core/adapters/gradle-wrapper.ts` —
  the constant every generated wrapper gets — rather than being a
  third copy of the number to keep in sync.
- **`JAVA_HOME` lands on 21**, because the image's shell profile
  exports it and beats the `env` block in `.claude/settings.json`. That
  one is quietly expensive: the Maven e2e suites skip themselves below
  JDK 25, so a stale `JAVA_HOME` does not fail the Maven half of the
  modulith grid, it runs none of it — and a skipped suite reads exactly
  like a passing one. The hook writes `JAVA_HOME` to
  `$CLAUDE_ENV_FILE`, which does apply.

**On the pinned Gradle checksum.** `GRADLE_SHA256` in the hook makes
the download reproducible and catches corruption or substitution, and
the install aborts on a mismatch. Note what it is: a hash of the
artifact that was downloaded and validated when the pin was added, not
a value fetched from Gradle. The published checksums
(`https://services.gradle.org/distributions/gradle-<version>-bin.zip.sha256`,
or <https://gradle.org/release-checksums/>) are not reachable from the
web sandbox — the proxy 403s them, while the distribution URL itself
redirects to an allowlisted host — so verifying a pin against upstream
has to happen from an unrestricted network. Bumping `GRADLE_VERSION`
without adding a matching entry warns loudly and continues rather than
bricking every session.

## The dev loop

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests) + prettier --check . + depcruise src
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:watch    # vitest watch mode
pnpm build         # compile to dist/ via tsconfig.build.json
pnpm format        # prettier --write .
```

`pnpm lint` covers eslint, prettier, **and dependency-cruiser** — the
hexagonal dependency rule fails the same gate as code style.

Every commit must pass `pnpm lint && pnpm typecheck && pnpm test` on
its own.

## Trying the CLI locally

The CLI entry is `bin/keel.js`, which loads
`dist/application/cli/executable/main.js` — **build before trying it**:

```sh
pnpm build
mkdir /tmp/playground && cd /tmp/playground
node /path/to/keel/bin/keel.js new --stack=go-cli --dry-run
```

## Repository layout

keel dogfoods its own [binding spec](../assets/project/AGENTS.md):
hexagonal trisection with the dependency rule enforced by
dependency-cruiser. Every layer directory carries a `README.md` +
`AGENTS.md` with its local conventions.

```
src/
  domain/
    kernel/               # Action/Command/Query, Result, Handler,
                          # Mediator — depends on nothing
    contract/             # commands + InstallReport, composition
                          # vocabulary (Adapter, Vertical, …),
                          # manifest types + zod schemas, ports/
    core/                 # the engine (predicate, resolver, answers,
                          # apply, install, actions), composition
                          # adapters/ + verticals/ + stacks,
                          # handlers/, RegistryMediator
  application/
    cli/
      contract/           # commander → commands → mediator → Result
                          # rendered; zero business logic
      executable/         # composition root: wires infra adapters +
                          # handlers + mediator; no logic
  infrastructure/         # one directory per port, real adapter +
                          # canonical fake side by side (tree, prompt,
                          # manifest, template, process, commons)
assets/
  composition/            # adapter template trees (ejs), one directory
                          # per <vertical>/<adapter>/
  project/                # the binding spec (AGENTS.md) — source of
                          # truth for the universal conventions
tests/                    # vitest; mirrors src/; support/factory.ts is
                          # the shared test Factory
bin/keel.js               # npm bin entry → dist/application/cli/executable
.dependency-cruiser.cjs   # the dependency rule, enforced in pnpm lint
```

Naming note: a _composition adapter_ (`git-init`,
`quarkus-cli-bootstrap`, …) is keel **domain content** — a unit
contributing files to a scaffolded project — not a hexagonal adapter
of keel itself; those implement `src/domain/contract/ports/` and live
under `src/infrastructure/`.

## Testing approach

- Vitest, run via `pnpm test`; test files live under `tests/`
  mirroring `src/`.
- **Scenario + Factory + port pattern** from the
  [binding spec §3](../assets/project/AGENTS.md): no mocking libraries
  — fakes are built directly, side by side with the real adapters.
- Every public API change is accompanied by a test change.

### End-to-end tests

The suites under `tests/e2e/` scaffold a real project into a temp
directory, build it with the generated wrapper, boot it, and drive it
over the wire. They are the only tests that can catch a template which
renders but does not compile.

They are **opt-in**: skipped on CI unless `KEEL_RUN_E2E=1`, skipped
anywhere when the toolchain is missing, and opted out with
`KEEL_SKIP_E2E=1`. Run one with:

```sh
KEEL_RUN_E2E=1 pnpm test:e2e     # all of them
KEEL_RUN_E2E=1 pnpm vitest run tests/e2e/walking-skeleton-modulith.test.ts
```

Most of a JVM suite is shared. `tests/support/jvm-e2e.ts` carries the
three steps every one of them runs — scaffold through the real
mediator, build with the generated wrapper, locate the runnable jar —
behind a `JvmProjectSpec`. What happens next is the only difference:
`jvm-rest-e2e.ts` boots the jar and drives the `/greet` wire contract,
`jvm-cli-e2e.ts` runs it once with an argv and asserts on stdout. A new
JVM stack is usually a spec object and a `describe`.

CI runs them too, in a second job — the `verify` matrix stays the fast
gate. That job is **sharded by toolchain**, so each shard provisions
only what its suites probe for and a failure names the stack in the
check title. The JVM is sharded again along the grid its suites
populate, and the two typologies take different shapes because their
volumes differ. `e2e (jvm-basic-quarkus)`, `e2e (jvm-basic-spring)`
and `e2e (jvm-basic-micronaut)` each take that framework's four
`basic` stacks (CLI and REST, Java and Kotlin). The modulith is 25
files and splits by framework **and language** —
`e2e (jvm-modulith-quarkus-java)`, `…-quarkus-kotlin`,
`…-spring-java`, and so on, four cells each. `e2e (go)`,
`e2e (rust)` and `e2e (web)` are unchanged.

Language is an axis on the modulith half only, and the grid is what
made it one. A shard that runs nothing is worse than no shard, since
the check name asserts coverage that does not exist — and before the
modulith's Kotlin cells were built, `jvm-modulith-*-kotlin` would
have been precisely that. On the `basic` half it stays out: those
shards already sit near their longest-file floor, so splitting them
by language would buy attribution and no wall clock, at the price of
three more JDK provisionings.

Measured on 4 vCPUs with cold caches, the modulith shards run
160–415s against sequential totals of 359–1015s — a divisor of
2.22–2.45, never near the 4 the core count suggests, because each
Gradle build is itself parallel and concurrent ones contend.
`jvm-modulith-micronaut-kotlin` is already floor-bound (252s wall
against a 249s longest file), which is where splitting stops paying.

Each shard lists its files explicitly in `.github/workflows/ci.yml`,
which means **a new suite must be added to a shard or it never runs**.
That is enforced, not remembered: `tests/ci-workflow.test.ts` parses the
workflow and fails in `verify` when the matrix and `tests/e2e/` disagree.

One scheduling detail shapes how these files are split. Vitest runs
files in parallel workers but the tests _inside_ a file in sequence, so
the slowest single file is the floor for the whole job — which is why
the modulith cases live in three files (`-modulith`, `-persistence`,
`-maven`) rather than four `it`s in one. When adding a long case, prefer
a new file over another `it` in a long one.

The other half of that detail is that parallel workers do not divide the
work by their number. Each Gradle build is itself parallel, so
concurrent ones contend on a 4-vCPU runner: measured, the divisor is
about 2.3 inside a four-file JVM shard and 2.8 across a sixteen-file
one — it climbs with the file count and never approaches 4. The
practical consequence is for measurement rather than for design — a file
timed while sixteen neighbours race it reads far slower than the same
file timed against three, so **re-measure on the shard shape you intend
to ship** before rebalancing the matrix.

Locally you are more likely to have one JDK than two, which is where the
next paragraph bites.

**Maven cases need more than Gradle ones.** A JVM stack scaffolds onto
either build system, and the e2e harness follows the spec's
`buildSystem`. Maven cases additionally require `mvn` on PATH — the
wrapper is generated by `mvn -N wrapper:wrapper` — and a `JAVA_HOME`
pointing at **JDK 25 or newer**. Gradle needs no such thing:
`settings.gradle.kts` carries the foojay resolver and provisions a
matching toolchain itself, while Maven compiles with whatever JDK runs
it, so an older `JAVA_HOME` fails with `release version 25 not
supported`. Maven cases skip themselves rather than fail when either
prerequisite is missing.

The catch is that the host `gradle` — the one that generates the
wrapper — **cannot start on JDK 25 before Gradle 9**: 8.x fails with
the version string as the entire error message. So a single-JDK box
running Gradle 8.x has to choose, and the usual choice is an older
`JAVA_HOME` (Gradle green, Maven skipping). Two ways out: point
`JAVA_HOME` at a 25+ JDK for the Maven cases alone —

```sh
KEEL_RUN_E2E=1 JAVA_HOME=/path/to/jdk-25 \
  pnpm vitest run tests/e2e/walking-skeleton-modulith-maven.test.ts
```

— or install a host Gradle 9.x, which is what CI does, and run
everything on one JDK 25.

## Adding surface

- **A stack** is a couple of lines in
  [`src/domain/core/stacks.ts`](../src/domain/core/stacks.ts) — tags +
  verticals.
- **An adapter** lives in `src/domain/core/adapters/` with its
  template tree under `assets/composition/<vertical>/<adapter>/`, and
  registers in its vertical's adapter list.
- **A vertical** lives in `src/domain/core/verticals/` and declares
  the dimensions its adapters must cover.

See the [composition model](composition.md) for the vocabulary, and
the [roadmap](roadmap.md) for what's wanted next.

## Related

- [CONTRIBUTING](../CONTRIBUTING.md) — fork workflow, commit
  conventions, PR expectations.
- [Release process](release.md) — for maintainers.
- [Contributor guide for coding agents](../AGENTS.md).
