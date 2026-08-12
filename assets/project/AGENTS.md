# Universal engineering conventions (keel)

These are **non-negotiable** defaults installed by `@rgoussu.dev/keel`. They
are the binding spec for any project keel scaffolds. The project's own
agent instructions (its `AGENTS.md`) may extend these conventions; they
must not contradict them without an explicit, documented reason. Stack-specific runbooks (build, test, run,
format, troubleshoot) ship as **skills** alongside this file when the
matching stack profile is installed.

---

## 1. Architecture — Hexagonal, always

Every project uses ports & adapters, **including frontends**. The domain
is a three-module DAG: `kernel ← contract ← core`. Adapters depend on
kernel and contract; the application layer is split between a dumb
interface adapter and a composition root.

- `application/<channel>/contract` — the dumb interface adapter. Maps
  transport DTOs to actions, dispatches via the mediator, maps the
  `Result` back. **Zero business logic.** Depends on `domain/kernel`
  (Mediator interface, `Result`) and `domain/contract` (concrete
  commands, DTOs).
- `application/<channel>/executable` — the channel's **composition
  root**. Instantiates concrete handlers, concrete adapters, and the
  mediator implementation; hands the wired graph to the runtime
  (Quarkus/Spring startup bean, `main` method, etc.). May depend on
  `domain/kernel`, `domain/contract`, `domain/core`, the sibling
  `application/<channel>/contract`, and any `infrastructure/<port>/*`
  — strictly so it can wire them. **It must contain no logic.**
- `domain/kernel` — higher abstractions only: sealed `Action` /
  `Command` / `Query` / `Result` / `Error` bases, the `Handler`
  interface, the `Mediator` interface, kernel-level errors. Depends on
  nothing.
- `domain/contract` — the system's public surface: concrete `Command`
  and `Query` subtypes that name each supported operation, concrete
  per-aggregate `Error` subtypes, domain DTOs, primary and secondary
  port interfaces. Depends only on `domain/kernel`.
- `domain/core` — the implementations: handlers in
  `domain/core/<aggregate>` and the Mediator implementation
  (`RegistryMediator`). Depends on `domain/kernel` and
  `domain/contract`.
- `infrastructure/<port>/<impl>` — real adapters. **Zero business
  logic.** Each port also ships an `infrastructure/<port>/fake` module.
  Depends on `domain/kernel` and `domain/contract`; never on
  `domain/core`.

Multiple executables per project are expected (`rest`, `cli`, `worker`,
`ui`, …). Framework choice is **deferred** until walking-skeleton time.
Dependency rule is enforced at build time (ArchUnit, dependency-cruiser,
cargo-deny, …); the composition-root exception is pinned to
`application/<channel>/executable` only — violating it from
`application/<channel>/contract` is still a build failure.

---

## 2. Business logic — commands through one dispatch seam

Business operations enter the domain as **Command/Query data** through
one explicit dispatch seam: primary adapters construct commands and
never import concrete handlers. The mechanism behind the seam is
per-language (settled 2026-08-09):

- **JVM — and server-side TypeScript, keel itself included: registry
  Mediator.** The sealed `Action` / `Command` / `Query` / `Result` /
  `Error` bases plus the `Handler` and `Mediator` interfaces live in
  `domain/kernel/`. The concrete `Command` and `Query` subtypes that
  name each supported operation live in `domain/contract/`. The
  Mediator implementation (`RegistryMediator`) and the handlers live
  in `domain/core/`. Handlers self-declare via `supports()`. The
  Mediator implementation is constructed from a `Collection<Handler>`
  and builds its own registry — **never inject a Map**. No reflection,
  no service locators.

  **Handler discovery (amended 2026-08-12).** How that
  `Collection<Handler>` is assembled is the composition root's
  business, and container discovery is permitted under all four of
  these constraints — otherwise wire the collection by hand:
  1. The marker is **owned by the domain** — a project annotation
     such as `@DomainHandler` in `domain/contract`, never a framework
     stereotype (`@Component`, `@ApplicationScoped`, …) in domain
     code.
  2. Any annotation the marker itself carries is a **specification
     API, not a framework**: `jakarta.inject` /
     `jakarta.enterprise.cdi-api` and nothing else. They are declared
     `compileOnly`/`provided` and never reach a runtime classpath.
  3. Each composition root names the domain's marker in **its own**
     idiom — a component-scan include filter, a CDI stereotype, an
     explicit import — so no framework annotation is ever authored
     inside the domain, and the domain's **build** never depends on
     a container. A stack whose DI is resolved at compile time and
     therefore needs its processor to run over `domain/core` fails
     this constraint: hand-wire it. Where a container will only
     surrender the collection through a lookup rather than an
     injection point, that lookup is permitted **inside the
     composition root and nowhere else** — the ban on service
     locators governs domain and adapter code, which is precisely
     what the composition root exists to keep clean.
  4. Scope is a **pseudo-scope** (`@Singleton`), so beans need no
     client proxy — which also keeps Kotlin's final-by-default classes
     usable without the all-open compiler plugin. A handler that must
     dispatch therefore takes a `Provider<Mediator>`, never a
     `Mediator`: the pseudo-scope has no proxy to break the cycle
     with, and `Provider` is the one lazy seam CDI, Spring and
     Micronaut all honour.

  Discovery buys one thing — a new aggregate needs no edit in the
  composition root. It costs the single readable list of what is
  wired. Both are legitimate; hand-wiring remains fully conformant.

- **Rust**: per-use-case driving-port traits by default; where a
  unified seam is justified, commands become an enum dispatched by one
  exhaustive `match` — the compiler is the registry. A runtime
  registry of trait objects probed via `supports()` is ruled out.
- **Go**: no mediator object — commands as structs, per-use-case
  driving-port interfaces wired explicitly in `main`, cross-cutting
  concerns as decorator functions around the ports.
- **Frontend**: no mediator — per-use-case driving ports delivered by
  typed context keys; cross-cutting via factory decoration at the
  assembly point (a central dispatcher defeats tree-shaking and
  subtree scoping).

In every language: adapters at the application layer map domain
`Error` to transport-shaped representations (RFC 9457 for REST, exit
code + stderr for CLI, etc.); domain code never knows about transport.

---

## 3. Tests — DIP-strict, fakes not mocks

Every test depends on three things and nothing else: a **Scenario** (test
data), a **Factory** (wires the SUT with fakes), and the **port
interface** under test. Tests never import concrete adapters, concrete
handlers, or mocking frameworks. Every secondary port ships with a
**fake module** that is the canonical reference implementation of the
contract. Mutation testing runs on every domain module; a regression of
the mutation-score threshold (defined in `build-logic`/equivalent) fails
the build.

---

## 4. Walking skeleton first

Every project begins with a **walking skeleton**: the thinnest end-to-end
slice that exercises every architectural layer and every piece of
infrastructure, from user input to deployed runtime. Greenfield: build
it before any feature. Brownfield: assess; if missing, build it before
shipping more features. The skeleton includes one primary adapter, one
primary port, one handler, one secondary port (with fake), one real
secondary adapter, and an IaC deployment.

---

## 5. Infrastructure as Code — OpenTofu

All infrastructure is defined in **OpenTofu**. No infrastructure lives
outside IaC. No manual cloud-console changes. IaC modules live at the
**repo root** in `/iac/<target>/` (e.g. `/iac/cloudrun/`,
`/iac/hetzner/`); IaC is **not** a hexagonal adapter, so it does **not**
live under `infrastructure/` (that path is reserved for adapters
implementing a `domain/contract` port). One state per environment
(`dev`, `staging`, `prod`); state is remote by default with a one-shot
`bootstrap.sh` to provision the state bucket. Secrets never land in
state files; use a secret manager. Container registry is a separate
choice from the deploy target (e.g. Cloud Run + GAR is the scaffolded
default; ghcr.io and external are recognised concepts).

---

## 6. Workflow — Trunk-based + XP

No branches, no pull requests, continuous integration on `main`. Feature
flags ship incomplete work dark. Conventional Commits for every commit.
Frequent `git pull --rebase`. Pair/mob programming is the default for
non-trivial work. One commit = one logical unit; every commit passes
format, typecheck, lint, unit tests, and public-API docs check.

---

## 7. Principles

- **XP** — fast feedback, simple design, courage, pair programming,
  collective ownership, refactor mercilessly.
- **SOLID** — applied rigorously. DIP is the most important; it is the
  foundation of the hexagonal + fakes + factory pattern.
- **12-Factor App** — config via env, stateless processes, disposable,
  logs as streams, etc.
- **Always latest stable** — latest LTS for languages, latest stable for
  frameworks, build tools, runtimes. Review quarterly.

---

## 8. Comments and documentation

- **Public API only:** exported classes, interfaces, methods, functions,
  and types get doc comments describing _what_ they do and _why_ a caller
  would use them. Parameters, returns, errors, and invariants are
  documented.
- **Private code:** no comments by default. If the "why" is non-obvious
  (workaround, subtle invariant, surprising behavior), a one-line
  comment is acceptable.
- **Never** restate what well-named code already says. **Never** reference
  task IDs, PR numbers, or authors in comments.

**Command:** `/docs-check` audits the full surface.

---

## 9. Claude behavior

- **Verbosity: very terse.** Tokens don't grow on trees. One sentence per
  update. No running commentary, apologies, or preamble.
- **Before claiming done:** run typecheck + tests. If you can't run them,
  say so explicitly.
- **Never:** bypass pre-commit hooks, skip `git` verify flags, force-push
  trunk, disable tests to make them pass, commit generated files, commit
  secrets.
- **Always:** small commits, Conventional Commits format, respect the hex
  architecture when generating code, apply the Scenario+Factory+fakes
  pattern when writing tests, add public-API docs when creating public
  symbols.
- **When unsure which layer a change belongs in:** stop and ask.
  Misplacing logic is worse than asking.
