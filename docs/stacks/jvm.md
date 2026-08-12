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

All target **Java 25** (Kotlin twins on JVM 25) and build with
**Gradle or Maven** — your pick.

## How to

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=quarkus-rest              # interactive
npx @rgoussu.dev/keel new --stack=spring-rest --build-system maven
npx @rgoussu.dev/keel new --stack=micronaut-cli-kotlin --yes
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
| `origin` remote | Optional; registered by [`vcs`](../verticals/vcs.md) if given.                       |

## What gets generated

A hexagonal multi-module project (Gradle Kotlin DSL or Maven POMs):

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

## How handlers reach the mediator

Handlers are marked with `@DomainHandler`, an annotation the **domain
owns** (`domain/contract`). No framework stereotype ever appears in
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
