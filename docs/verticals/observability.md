# `observability` — knowing the service is alive

Health probes, correlated structured logging, and OpenTelemetry for
HTTP services — plus the receiving end as a worked example. Installed
by default on every REST/HTTP stack; brownfield:

```sh
keel add observability
```

**HTTP services only** — on a CLI project the install hard-fails with
uncovered dimensions (there is no probe surface to cover).

## The four dimensions

| Dimension          | What lands                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health`           | Liveness ("restart me") + readiness ("route traffic to me") probes: framework-native on the JVM (SmallRye Health, Actuator, Micronaut Management), hand-rolled `/health/live` + `/health/ready` on Go/Rust/TS, plus a template readiness check. |
| `request-context`  | One filter/middleware extracts-or-mints `X-Correlation-Id` (and the optional `X-Tenant-Id`) into a request-scoped context and the MDC/log context, echoes it on the response — the extension point for more propagated fields.                  |
| `telemetry`        | OpenTelemetry traces + metrics over OTLP, with an example span enrichment and an `app.http.requests` counter, configured via the standard `OTEL_*` env vars.                                                                                    |
| `monitoring-stack` | Supplements [`dev-env`](dev-env.md)'s `dev/compose.yaml` with a monitoring stack listening where the service exports.                                                                                                                           |

The first three are covered per stack by **one predicate-selected
adapter** (`quarkus-observability`, `spring-observability`,
`micronaut-observability` — each with a Kotlin twin —
`go-observability`, `rust-observability`, `ts-observability`); the
fourth by the language-agnostic `monitoring-compose` adapter resolving
alongside it.

## The monitoring stack choice

A sticky question picks the shape of the dev-time receiving end:

- **Granular** (default): collector + Tempo + Prometheus + Loki +
  provisioned Grafana — the base a production setup grows from.
- **All-in-one**: the `grafana/otel-lgtm` dev container.

## Prerequisites

| Requirement          | When                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `go` on PATH         | Go stacks at install time — the adapter runs `go mod tidy` for the new deps.                        |
| `npm`/`pnpm` on PATH | TypeScript stacks at install time — the adapter runs the workspace install.                         |
| Docker + Compose     | To run the monitoring stack from `dev/compose.yaml`.                                                |
| `OTEL_*` env vars    | At service runtime, to point the exporter somewhere (the dev stack's defaults work out of the box). |

## Related

- [`dev-env`](dev-env.md) — the Compose file this vertical
  supplements.
- [Verticals catalog](README.md) ·
  [Compatibility matrix](README.md#compatibility-matrix)
