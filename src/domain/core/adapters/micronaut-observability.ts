/**
 * `observability/micronaut-observability` adapter — layers health
 * probes (Micronaut Management), the correlation-id request context
 * + MDC, and OpenTelemetry (micronaut-tracing OTel + Micrometer OTLP
 * registry) onto the Java Micronaut REST walking skeleton.
 *
 * One of the JVM observability family built by
 * {@link jvmObservabilityAdapter}; the resolver picks it on
 * `framework.micronaut + arch.server-http + lang.java`.
 */

import { jvmObservabilityAdapter } from './jvm-observability.js';

export const MICRONAUT_OBSERVABILITY_ID = 'observability/micronaut-observability';

export const micronautObservabilityAdapter = jvmObservabilityAdapter({
  id: MICRONAUT_OBSERVABILITY_ID,
  framework: 'micronaut',
  language: 'java',
  templateDir: 'micronaut-observability',
});
