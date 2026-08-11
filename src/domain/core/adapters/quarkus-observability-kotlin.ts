/**
 * `observability/quarkus-observability-kotlin` adapter — the Kotlin
 * twin of `observability/quarkus-observability`: health probes
 * (SmallRye Health), the correlation-id request context + MDC, and
 * OpenTelemetry onto the Kotlin Quarkus REST walking skeleton.
 *
 * One of the JVM observability family built by
 * {@link jvmObservabilityAdapter}; the resolver picks it on
 * `framework.quarkus + arch.server-http + lang.kotlin`.
 */

import { jvmObservabilityAdapter } from './jvm-observability.js';

export const QUARKUS_OBSERVABILITY_KOTLIN_ID = 'observability/quarkus-observability-kotlin';

export const quarkusObservabilityKotlinAdapter = jvmObservabilityAdapter({
  id: QUARKUS_OBSERVABILITY_KOTLIN_ID,
  framework: 'quarkus',
  language: 'kotlin',
  templateDir: 'quarkus-observability-kotlin',
});
