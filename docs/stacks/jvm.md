# JVM stacks — Quarkus, Spring Boot, Micronaut

Twelve stacks share this page: three frameworks × two shapes × two
languages. The domain trisection is **byte-for-byte identical across
the three frameworks per language** — only the application layer and
the build wiring change.

| Framework     | CLI (Java)      | REST (Java)      | CLI (Kotlin)           | REST (Kotlin)           |
| ------------- | --------------- | ---------------- | ---------------------- | ----------------------- |
| Quarkus 3     | `quarkus-cli`   | `quarkus-rest`   | `quarkus-cli-kotlin`   | `quarkus-rest-kotlin`   |
| Spring Boot 4 | `spring-cli`    | `spring-rest`    | `spring-cli-kotlin`    | `spring-rest-kotlin`    |
| Micronaut 4   | `micronaut-cli` | `micronaut-rest` | `micronaut-cli-kotlin` | `micronaut-rest-kotlin` |

All target **Java 25** (Kotlin twins on JVM 25), build with **Gradle
or Maven**, and scaffold on either **module layout** — `basic` (the
flat trisection) or `modulith`. Both are your pick.

### A second bounded context

`--with-peer-context` adds a consumer beside the skeleton's own
context, so the seam is demonstrable rather than merely present:

```
modules/
  greeting/                       the provider
    user-side/service/            the in-process API peers consume
  guestbook/                      the consumer
    domain/contract/              declares Welcome, in its own words
    domain/core/                  SignHandler, uses the port
    infra/greeting-gateway/       the ONE class naming two contexts
```

`guestbook` never sees `greeting`'s domain: the service module
declares its own contract non-transitively (`implementation` under
Gradle, `optional` under Maven), so an import of
`greeting.domain.contract` from the gateway does not compile.
Replacing the gateway with an HTTP twin built on
`greeting/user-side/api/contract` is the whole of carving greeting
out into its own service.

Available on all twelve stacks. The guestbook tree itself is
framework-independent — what differs is how each assembly binds the
`Welcome` port, and every binding resolves the peer through its
container's deferred handle (CDI `Instance`, Spring `ObjectProvider`,
Micronaut `BeanProvider`) rather than eagerly. Resolving it during
construction closes a cycle: mediator → `SignHandler` → `Welcome` →
`GreetingService` → mediator.

| Stack             | Binding                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| Quarkus (Java/KT) | `@Produces` method on `MediatorProducer` + a `beans.xml` for the peer core       |
| Spring (Java/KT)  | `@Bean` on `MediatorConfig` — **and** the peer package added to `@ComponentScan` |
| Micronaut (Java)  | `@Factory` method — **and** the peer package added to `@Import(packages = …)`    |
| Micronaut (KT)    | `@Factory` method + `SignHandler` added to the explicit handler list             |

The two bold halves are the ones with no compile-time consequence:
Spring's scan list and Micronaut's `@Import` list both name packages
one by one, and a context missing from either is simply never
discovered — no error, and an application that starts perfectly.
That is why every combination also emits a `GuestbookWiringTest` in
the assembly, which dispatches a `SignCommand` through the real
container. It is the only thing in the project that goes red when a
handler was never found.

## How to

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=quarkus-rest              # interactive
npx @rgoussu.dev/keel new --stack=spring-rest --build-system maven
npx @rgoussu.dev/keel new --stack=micronaut-cli-kotlin --yes
npx @rgoussu.dev/keel new --stack=quarkus-rest --module-layout modulith
```

## Prerequisites

| Requirement          | Why                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git` on PATH        | The [`vcs`](../verticals/vcs.md) vertical initialises the repository.                                                                             |
| JDK 25 (`JAVA_HOME`) | The generated project targets Java 25; the wrapper generation below runs on your JDK.                                                             |
| `gradle` on PATH     | **If you choose Gradle** (the default): keel runs `gradle wrapper --gradle-version=9.4.1` — the wrapper is generated, never vendored as a binary. |
| `mvn` on PATH        | **If you choose Maven**: keel runs `mvn -N wrapper:wrapper -Dmaven=3.9.16`.                                                                       |

No environment variables beyond a working JDK setup are needed at
scaffold time.

## What you'll be asked

| Question        | Notes                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Base package    | e.g. `com.acme.tool` — the root package of every module.                             |
| Project name    | Used for artifact ids and the root directory naming inside build files.              |
| Build system    | `gradle` (default) or `maven`; pin with `--build-system`, skip prompts with `--yes`. |
| Module layout   | `basic` (default) or `modulith`; pin with `--module-layout`. See below.              |
| `origin` remote | Optional; registered by [`vcs`](../verticals/vcs.md) if given.                       |

## What gets generated

A hexagonal multi-module project (Gradle Kotlin DSL or Maven POMs).
Its shape follows the **module layout** you picked; the `basic` layout
is shown here, the `modulith` one in the [next section](#module-layout).

```
my-service/
  domain/
    kernel/          # Command/Query, Result, Handler, Mediator — depends on nothing
    contract/        # concrete commands, ports (e.g. Clock), read models,
                     # @DomainHandler — the domain's own wiring marker
    core/            # handlers + RegistryMediator, reachable only via factories
  application/
    cli/             # CLI shape: picocli entrypoint with a sample subcommand
    rest/            # REST shape: contract/ + executable/ — GET /greet with
                     # RFC 9457 Problem Details errors
  infrastructure/    # Clock: real adapter + canonical fake module
  gradlew | mvnw     # wrapper, generated at scaffold time
  AGENTS.md          # the binding spec; CLAUDE.md is a pointer to it
```

Plus: a framework-native test (Quarkus/Spring/Micronaut) driving the
slice end to end, git initialised on the requested default branch, and
the manifest recording tags + answers for later `keel add` runs.

The REST stacks additionally install
[`dev-env`](../verticals/dev-env.md) (a `dev/compose.yaml` seed) and
[`observability`](../verticals/observability.md) (health probes,
correlation ids, OpenTelemetry, and a Grafana monitoring stack wired
into the dev compose) by default.

## Module layout

`basic` is the flat trisection above: one hexagon, one `domain/`, one
`application/` per entrypoint. It is the right shape while the service
holds a single bounded context, and it stays the default.

`--module-layout=modulith` scaffolds the same walking skeleton carved
one bounded context at a time:

```
my-service/
  platform/
    kernel/                      # Command, Handler, Mediator, RegistryMediator,
                                 # @DomainHandler — depends on nothing
  modules/
    greeting/                    # one bounded context, one whole hexagon
      domain/
        contract/                # commands, domain errors, driven ports
        core/                    # handlers, entities
      user-side/                 # driving adapters — libraries, never runnable
        api/
          contract/              # transport DTOs; the artifact a client consumes
          adapters/              # the HTTP resource + error mapper  (REST stacks)
        cli/                     # the picocli subcommand              (CLI stacks)
        service/                 # the in-process API a PEER MODULE consumes
      infra/
        clock/fake/              # driven adapters; the port example lands here
  application/
    api/ | cli/                  # the runnable assembly: main class, composition
                                 # roots, runtime config, Dockerfile
```

What actually changes, beyond the directories:

- **The deployment unit is the assembly, not the adapter.** `application/api`
  mounts the user-side adapters of every module it composes; nothing
  under `modules/` produces a runnable artifact. Six contexts exposing
  HTTP still ship one container.
- **The dispatch seam is per module.** Each context gets its own
  mediator over its own handlers; `platform/kernel` holds the
  vocabulary and the registry implementation, and no repository-wide
  command bus exists.
- **`user-side/service` is the composition seam.** A second context
  reaches this one by declaring a driven port in _its own_ vocabulary
  and implementing it in _its own_ `infra/` over `GreetingService`.
  That is the only dependency edge allowed between modules — the
  service module's build declares the greeting domain as
  `implementation`, so a peer physically cannot compile against it.
  Swapping that implementation for an HTTP client built from
  `user-side/api/contract` is the whole of extracting the context into
  its own service.
- **Observability follows the assembly**, because correlation ids,
  probes and telemetry belong to the deployment unit rather than to
  any one context: its classes land in `application/api`.

- **Persistence follows the context**, because a repository port is a
  bounded context's concern: `keel add persistence` puts the
  `GreetingLog` and `UnitOfWork` ports in
  `modules/greeting/domain/contract`, their JDBC and transaction
  adapters in `modules/greeting/infra/`, the `/greetings` resource in
  `modules/greeting/user-side/api/adapters`, and only the datasource
  and migration config in `application/api`. Extracting the context
  therefore takes its persistence with it. See
  [the vertical's page](../verticals/persistence.md#module-layout).

### The other stacks

The Go stacks carry the same dial —
→ [Go module layout](go.md#module-layout). `ts-http`,
`web-components` and the Rust stacks ship `basic` only for now; their
idiomatic modulith realizations are on [the roadmap](../roadmap.md).

## How handlers reach the mediator

Handlers are marked with `@DomainHandler`, an annotation the **domain
owns** (`domain/contract` under `basic`, `platform/kernel` under
`modulith`). No framework stereotype ever appears in
domain code. The marker carries only annotation-level Jakarta
specification APIs (`jakarta.inject`, `jakarta.enterprise.cdi-api`),
declared `compileOnly`/`provided` so neither reaches a runtime
classpath.

Each composition root then reads that same marker in its own idiom:

| Stack             | Mechanism                                                               |
| ----------------- | ----------------------------------------------------------------------- |
| Quarkus (Java/KT) | `@DomainHandler` is a CDI stereotype; domain modules ship a `beans.xml` |
| Spring (Java/KT)  | `@ComponentScan` include filter naming `DomainHandler.class`            |
| Micronaut (Java)  | `@Import(packages = …, annotated = "…DomainHandler")` on the factory    |
| Micronaut (KT)    | explicit list in `MediatorFactory` — see below                          |

The mediator factory then takes the discovered collection
(`List<Handler<?, ?>>` on Spring, CDI `Instance` on Quarkus), so
adding an aggregate to the domain needs no edit in the composition
root.

Micronaut Java is the one that reads differently: an `@Import`ed bean
definition carries no resolved generic arguments, so it satisfies no
parameterized injection point and an injected `List<Handler<?, ?>>`
would arrive empty. Its factory gathers handlers through `BeanContext`
instead — a lookup deliberately confined to the composition root.

**Micronaut Kotlin is the exception.** Micronaut resolves DI at
compile time, so discovery needs its annotation processor to run over
`domain/core` — which would put the framework inside the domain's own
build. The Java bootstrap dodges that with `@Import`, but `@Import` is
documented as Java-only, so the Kotlin bootstrap hand-wires its
handler list instead. The domain stays framework-free; the list is
explicit.

**Dispatching from inside a handler.** `@Singleton` is a pseudo-scope,
so beans get no client proxy and a handler that injected a `Mediator`
directly would close a construction cycle (Quarkus rejects it at build
time). Take a `Provider<Mediator>` instead — the one lazy seam CDI,
Spring and Micronaut all honour:

```java
@DomainHandler
public final class TransferHandler implements Handler<TransferCommand, Receipt> {

    private final Provider<Mediator> mediator;

    public TransferHandler(Provider<Mediator> mediator) {
        this.mediator = mediator;
    }
    // … mediator.get().dispatch(…) inside handle()
}
```

The pseudo-scope is also what keeps Kotlin's final-by-default classes
usable as beans without the all-open compiler plugin.

## Verify it runs

```sh
./gradlew test    # or ./mvnw verify
```

## Add next

| Goal                           | Command                                     | Notes                                                                                |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Container image                | `keel add containerization`                 | REST shapes; sticky JVM-vs-native flavor, Spring gets Native Build Tools patched in. |
| Native CLI binaries on release | `keel add distribution`                     | `quarkus-cli` on Gradle today — see [distribution](../verticals/distribution.md).    |
| Local dev infra                | `keel add dev-env`                          | Already default on REST stacks.                                                      |
| Pair with a frontend           | `keel link ../frontend && keel add gateway` | See [gateway](../verticals/gateway.md).                                              |

## Related

- [Stack catalog](README.md) · [CLI reference](../cli.md) ·
  [Composition model](../composition.md)
- Fullstack twins: [`fullstack`, `fullstack-spring`,
  `fullstack-micronaut`](fullstack.md)
