/**
 * `observability/quarkus-observability` adapter — layers health
 * probes (SmallRye Health), the correlation-id request context +
 * MDC, and OpenTelemetry (traces + metrics over OTLP) onto the Java
 * Quarkus REST walking skeleton.
 *
 * One of the JVM observability family built by
 * {@link jvmObservabilityAdapter}; the resolver picks it on
 * `framework.quarkus + arch.server-http + lang.java`.
 */

import { jvmObservabilityAdapter } from './jvm-observability.js';

export const QUARKUS_OBSERVABILITY_ID = 'observability/quarkus-observability';

export const quarkusObservabilityAdapter = jvmObservabilityAdapter({
  id: QUARKUS_OBSERVABILITY_ID,
  framework: 'quarkus',
  language: 'java',
  templateDir: 'quarkus-observability',
});
