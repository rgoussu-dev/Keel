/**
 * `observability/micronaut-observability-kotlin` adapter — the
 * Kotlin twin of `observability/micronaut-observability`: Micronaut
 * Management health probes, the correlation-id request context +
 * MDC, and OpenTelemetry onto the Kotlin Micronaut REST walking
 * skeleton.
 *
 * One of the JVM observability family built by
 * {@link jvmObservabilityAdapter}; the resolver picks it on
 * `framework.micronaut + arch.server-http + lang.kotlin`.
 */

import { jvmObservabilityAdapter } from './jvm-observability.js';

export const MICRONAUT_OBSERVABILITY_KOTLIN_ID = 'observability/micronaut-observability-kotlin';

export const micronautObservabilityKotlinAdapter = jvmObservabilityAdapter({
  id: MICRONAUT_OBSERVABILITY_KOTLIN_ID,
  framework: 'micronaut',
  language: 'kotlin',
  templateDir: 'micronaut-observability-kotlin',
});
