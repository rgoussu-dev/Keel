/**
 * The `observability` vertical — answers "how do we know this
 * service is alive, ready, and what it is doing?"
 *
 * Three dimensions, each covered per-stack by one adapter selected
 * on `framework.* / lang.* + arch.server-http`:
 *
 *   - `health` — liveness ("restart me") and readiness ("route
 *     traffic to me") probe endpoints, framework-native where the
 *     framework has them (SmallRye Health, Actuator, Micronaut
 *     Management), hand-rolled `/health/live` + `/health/ready` on
 *     the stdlib stacks — plus a template readiness check to hang
 *     real dependency checks on. Liveness stays dependency-free by
 *     design: a dead database must not restart-storm the fleet.
 *   - `request-context` — one filter/middleware at the HTTP edge
 *     extracts-or-mints `X-Correlation-Id` (and the optional
 *     `X-Tenant-Id`) into a request-scoped context and the log
 *     context (MDC or equivalent), and echoes the id on the
 *     response. The context type is the extension point for more
 *     propagated fields.
 *   - `telemetry` — OpenTelemetry across the stack: traces + metrics
 *     over OTLP with one example span enrichment and one example
 *     counter, configured through the standard `OTEL_*` env vars.
 *   - `monitoring-stack` — the receiving end, as a worked example:
 *     supplements the `dev-env` vertical's `dev/compose.yaml` with a
 *     monitoring stack (granular collector + Tempo + Prometheus +
 *     Loki + Grafana, or the all-in-one `grafana/otel-lgtm`)
 *     listening exactly where the service exports — the base the
 *     production setup grows from. Order-independent: the patch is
 *     seeded with the shared base, so without `dev-env` it creates
 *     the file with just the monitoring services.
 *
 * The vertical applies to HTTP services only (`arch.server-http`);
 * CLIs and SPAs have no probe surface. Greenfield REST stacks list
 * it after `walking-skeleton` (its adapters patch the bootstrap's
 * build + config files); brownfield installs run `keel add
 * observability`.
 */

import { goObservabilityAdapter } from '../adapters/go-observability.js';
import { micronautObservabilityAdapter } from '../adapters/micronaut-observability.js';
import { monitoringComposeAdapter } from '../adapters/monitoring-compose.js';
import { micronautObservabilityKotlinAdapter } from '../adapters/micronaut-observability-kotlin.js';
import { quarkusObservabilityAdapter } from '../adapters/quarkus-observability.js';
import { quarkusObservabilityKotlinAdapter } from '../adapters/quarkus-observability-kotlin.js';
import { rustObservabilityAdapter } from '../adapters/rust-observability.js';
import { springObservabilityAdapter } from '../adapters/spring-observability.js';
import { springObservabilityKotlinAdapter } from '../adapters/spring-observability-kotlin.js';
import { tsObservabilityAdapter } from '../adapters/ts-observability.js';
import type { Vertical } from '../../contract/composition.js';

export const observabilityVertical: Vertical = {
  id: 'observability',
  description: 'Health probes, correlated structured logging, and OpenTelemetry for HTTP services.',
  dimensions: ['health', 'request-context', 'telemetry', 'monitoring-stack'],
  adapters: [
    quarkusObservabilityAdapter,
    quarkusObservabilityKotlinAdapter,
    springObservabilityAdapter,
    springObservabilityKotlinAdapter,
    micronautObservabilityAdapter,
    micronautObservabilityKotlinAdapter,
    goObservabilityAdapter,
    rustObservabilityAdapter,
    tsObservabilityAdapter,
    monitoringComposeAdapter,
  ],
};
