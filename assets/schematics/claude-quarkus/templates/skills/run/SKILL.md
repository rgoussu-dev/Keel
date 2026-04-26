---
name: run
description: Run the service locally — Quarkus dev mode, hot reload, debugger attach.
---

# run

Quarkus dev mode is the fast path: hot reload on every save, live
config, and a built-in dev UI.

## Default — dev mode

```sh
./gradlew quarkusDev
```

- Default port: **8080** (`http://localhost:8080`).
- Dev UI: `http://localhost:8080/q/dev`.
- Swagger UI: `http://localhost:8080/q/swagger-ui`.
- OpenAPI spec (live): `http://localhost:8080/q/openapi`.

In the Quarkus console:

| Key | Action                          |
| --- | ------------------------------- |
| `s` | restart the live coding server  |
| `r` | run continuous tests            |
| `o` | toggle continuous testing       |
| `h` | help                            |
| `q` | quit                            |

## Override the port

```sh
./gradlew quarkusDev -Dquarkus.http.port=8081
```

## Attach a debugger

```sh
./gradlew quarkusDev -Ddebug=5005                # listens on 5005
./gradlew quarkusDev -Ddebug=5005 -Dsuspend=true # waits for IDE attach
```

In IntelliJ / VS Code: create a "Remote JVM Debug" run config pointing
at `localhost:5005`.

## Production-mode local run

```sh
./gradlew :application:rest:executable:build
java -jar application/rest/executable/build/quarkus-app/quarkus-run.jar
```

Useful to reproduce a JVM-only issue (no dev-mode tooling) before
deploying.

## Native binary local run

After a native build (see `build`):

```sh
./application/rest/executable/build/<projectName>-<version>-runner
```

## When to use

- User asks to "run", "start the server", "try the endpoint".
- Manual smoke check before pushing.
- Debugging a runtime issue that unit tests don't reproduce.

## Gotchas

- Dev mode shares the JVM with continuous testing — a JVM-affecting
  change (e.g. classpath edit) takes a full `s` restart, not a hot
  reload.
- Port 8080 is the most contested port on a dev machine; if startup
  fails, see `troubleshoot` before guessing.
- Don't deploy what dev mode runs — the artifact is unoptimised.
  Always deploy the `quarkus-run.jar` (or native binary) from a real
  build.
