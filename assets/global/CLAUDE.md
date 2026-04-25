# Universal engineering conventions (keel)

These are **non-negotiable** defaults installed by `@rgoussu.dev/keel`.
Project-level `CLAUDE.md` may extend these; it must not contradict them
without an explicit, documented reason.

---

## 1. Architecture — Hexagonal, always

Every project uses ports & adapters, **including frontends**.

```
application/<channel>/contract   # DTOs, schemas (OpenAPI, GraphQL, CLI spec)
application/<channel>/executable # runnable; framework chosen at walking-skeleton time
domain/contract                  # ports (primary + secondary), domain DTOs,
                                 # and the mediator kernel (Action / Command /
                                 # Query / Result / Error / Handler / Mediator) —
                                 # kept here, not in domain/core, so
                                 # application/* can dispatch without violating
                                 # the dependency rule.
domain/core/<aggregate>          # business logic (concrete commands, queries,
                                 # handlers, errors)
infrastructure/<port>/<impl>     # real adapter (e.g., postgres, kafka)
infrastructure/<port>/fake       # fake module — test-dep always, prod-dep opt-in
```

- **Interface layer (`application/<channel>/contract`) is dumb.** It maps transport DTOs to actions, dispatches via the mediator, and maps the `Result` back. **Zero business logic.** Its sibling `application/<channel>/executable` is the channel's composition root and wires the runtime (see §1.1).
- **Infrastructure is dumb.** Adapters only. **Zero business logic.**
- Business logic lives exclusively in `domain/core`.
- Multiple executables per project are expected (`rest`, `cli`, `worker`, `ui`, …).

### 1.1 Dependency rule

- `domain/*` depends on **nothing outside `domain/`**.
- `application/<channel>/contract` depends on `domain/contract` (ports, DTOs, mediator kernel) only — never on `domain/core` or `infrastructure/*`.
- `application/<channel>/executable` is the **composition root** for that channel: it may depend on `domain/contract`, `domain/core`, `application/<channel>/contract`, and any `infrastructure/<port>/*` strictly so it can instantiate concrete handlers and adapters and hand them to the mediator. **It must contain no logic** — it only wires and runs. Any non-wiring behaviour belongs in `domain/core`; any adapter behaviour belongs in the relevant `infrastructure/<port>/*`.
- `infrastructure/<port>/*` depends on `domain/contract` (the port it implements) — never on other adapters, never on `domain/core`, never on `application/*`.
- Enforced at build time (ArchUnit in Java, dependency-cruiser in TS, cargo-deny in Rust, etc.). The architecture rules pin the composition-root exception to `application/<channel>/executable` only — violating it from `application/<channel>/contract` is still a build failure.

### 1.2 Framework choice

**Deferred.** No framework is chosen before walking-skeleton scaffolding. The choice is made per executable when `/executable <channel>` runs.

---

## 2. Business logic — Command/Query + Mediator

All business operations go through the mediator. No service-layer god objects.

### 2.1 Core types (language-agnostic, applied everywhere)

```text
Action<R>              sealed marker
  Command<R>           write-side action, produces side effects
  Query<R>             read-side action, pure read
Result<T>              sealed: Success(value) | Failure(Error)
Error                  sealed hierarchy per aggregate
Handler<B : Action<?>> declares supports() → Set<Class<? extends B>>;
                       handles actions whose runtime type descends from B
Mediator               constructed from Collection<Handler>; builds its own
                       registry; dispatch(Action<R>) → Result<R>
ReactiveMediator       async variant; dispatch(Action<R>) → Future/Uni/Promise<Result<R>>
```

### 2.2 Rules

- Mediator is constructed with a **single collection of handlers**. It builds its registry internally from each handler's `supports()`. **Never inject a `Map`.**
- Handlers self-declare supported actions via `supports()`, all descending from a shared sealed base.
- Multi-action handlers are allowed **only** when all actions descend from the same sealed base.
- Duplicate registrations are errors at construction time.
- Handlers **never throw** for expected failures. They return `Result.Failure(error)`. Only truly exceptional conditions (bugs, infrastructure failures) propagate as exceptions.
- No reflection, no annotation scanning, no service locators. Wiring is explicit.

### 2.3 Error mapping

- Domain defines a **sealed `Error` hierarchy** per aggregate.
- REST adapters map `Error` → **RFC 9457 Problem Details**.
- CLI adapters map `Error` → exit code + structured stderr.
- Messaging adapters map `Error` → CloudEvents error extension.
- gRPC adapters map `Error` → `google.rpc.Status`.
- Domain **never** knows about transport-specific error formats.

---

## 3. Tests — DIP-strict, fakes not mocks

Every test depends on three things and nothing else:

1. A **Scenario** — encapsulates all test data.
2. A **Factory** — wires the System Under Test with test doubles.
3. The **port interface** under test.

Concretely: tests **never** import concrete adapter classes, nor concrete handler implementations, nor mocking frameworks. They build via the factory and assert against port behavior.

### 3.1 Fakes, not mocks

- Every secondary port ships with a **fake module** (e.g., `infrastructure/user-repository/fake`).
- Fakes are **always** a test dependency and **optionally** a production dependency (prototype mode).
- Mocking libraries (Mockito, sinon, mockall) are **not used** in standard testing.
- Fakes are the canonical reference implementation of the port's contract.

### 3.2 Shape

```text
tests/
  <aggregate>/
    <Behavior>Test        # depends on: Scenario + Factory + port interface
    <Behavior>Scenario    # data builder / fixtures
    <Behavior>Factory     # wires SUT + fakes
```

### 3.3 Mutation testing

Every domain module runs mutation testing on its own code (PIT, Stryker, cargo-mutants, go-mutesting). A mutation-score threshold is enforced in `build-logic` / equivalent.

---

## 4. Walking skeleton first

Every project must begin with a **walking skeleton**: the thinnest end-to-end
slice that exercises every architectural layer and every piece of
infrastructure, from user input to deployed runtime.

- **Greenfield:** build the walking skeleton _before_ any feature.
- **Brownfield:** assess whether one exists. If not, building it is the first order of business. Features wait.
- The walking skeleton includes: one primary adapter, one primary port, one handler, one secondary port (with fake), one real secondary adapter, **and an IaC deployment** via OpenTofu.
- Run `/walking-skeleton init` or `/walking-skeleton check` to scaffold or audit.

---

## 5. Infrastructure as Code — OpenTofu

- All infrastructure is defined in **OpenTofu** (Terraform-compatible, fully OSS).
- No infrastructure lives outside IaC. No manual cloud-console changes.
- IaC modules live at the **repo root** in `/iac/<target>/` (e.g. `/iac/cloudrun/`, `/iac/hetzner/`), or a sibling repo, depending on scope. IaC is **not** a hexagonal adapter, so it does **not** live under `infrastructure/` — that path is reserved for adapters implementing a `domain/contract` port.
- Multiple `/iac/<target>/` modules may coexist; the walking skeleton picks a default at scaffold time.
- Every environment (dev, staging, prod) is a separate state. State is remote by default (provider-native backend, e.g. GCS); the state bucket is provisioned by a one-shot `bootstrap.sh` so the chicken-and-egg is explicit.
- Secrets never land in state files; use a secret manager.

### 5.1 Container registry — first-class, orthogonal to deploy target

- The container registry is conceptually a **separate choice** from the deploy target. A project may deploy to Cloud Run but push images to `ghcr.io`, or run on a VPS while publishing images via GitHub Container Registry.
- Currently scaffolded out of the box: `gar` (GCP Artifact Registry, wired automatically by `iac-cloudrun` so the WIF pool is reused). Other registries — `ghcr.io` (GitHub) and `external` (Docker Hub, quay.io, self-hosted) — are recognised concepts but require project-specific CI/CD customisation until explicit scaffold support lands.
- A project without an IaC target (`target=none`) may still choose an image-publishing release flow, but that is not implied to be auto-scaffolded for every registry.

---

## 6. Workflow — Trunk-based + XP

- **No branches.** Commit to `main` in small, logical units.
- **No pull requests.** Integration is continuous.
- **Feature flags** let incomplete work ship dark and keep parallel work from interfering.
- **Conventional Commits** format for every commit.
- **Frequent sync** (`git pull --rebase`) is mandatory.
- **Pair / mob programming** is the default for non-trivial work.

### 6.1 Commit discipline

- One commit = one logical unit of work. Never mix refactor + feature + fix.
- Every commit passes: format, typecheck, lint, unit tests, public-API docs check.
- A commit that breaks trunk must be rolled back within minutes. Forward-fix only when safely faster.

### 6.2 Done means:

1. Code is formatted and lints clean.
2. Typecheck passes.
3. Tests (unit + affected integration) pass.
4. Mutation score not regressed.
5. Public API has docs (see §8).
6. Architecture boundaries hold (hex-check).
7. Committed in Conventional Commits format, pushed to trunk.

**Never claim "done" without having actually run steps 1–4.**

---

## 7. Principles

- **XP** — fast feedback, simple design, courage, pair programming, collective ownership, refactoring mercilessly.
- **SOLID** — applied rigorously. DIP is the most important; it's the foundation of the hexagonal + fakes + factory pattern.
- **12-Factor App** — config via env, stateless processes, disposable, logs as streams, etc.
- **Always latest stable** — latest LTS for languages; latest stable for frameworks, build tools, runtimes. Review quarterly.

---

## 8. Comments and documentation

- **Public API only:** exported classes, interfaces, methods, functions, and types get doc comments describing _what_ they do and _why_ a caller would use them. Parameters, returns, errors, and invariants are documented.
- **Private code:** no comments by default. If the "why" is non-obvious (workaround, subtle invariant, surprising behavior), a one-line comment is acceptable.
- **Never** write comments that restate what well-named code already says.
- **Never** reference task IDs, PR numbers, or authors in comments.
- Language-specific rendering:

| Language   | Doc format                                             |
| ---------- | ------------------------------------------------------ |
| Java       | JavaDoc `/** … */`                                     |
| Kotlin     | KDoc `/** … */`                                        |
| TypeScript | TSDoc `/** … */`                                       |
| Rust       | rustdoc `///`                                          |
| Go         | doc comment (`// PackageName …` / `// ExportedName …`) |

The `public-api-docs` skill nudges you to add docs on creation.
The `/docs-check` command audits the full surface.

---

## 9. Claude behavior

- **Verbosity: very terse.** Tokens don't grow on trees. One sentence per update. No running commentary. No apologies. No preamble.
- **Before claiming done:** run typecheck + tests. If you can't run them, say so explicitly.
- **Never:** bypass pre-commit hooks, skip `git` verify flags, force-push trunk, disable tests to make them pass, commit generated files, commit secrets.
- **Always:** small commits, Conventional Commits format, respect the hex architecture when generating code, apply the Scenario+Factory+fakes pattern when writing tests, add public-API docs when creating public symbols.
- **When unsure which layer a change belongs in:** stop and ask. Misplacing logic is worse than asking.
