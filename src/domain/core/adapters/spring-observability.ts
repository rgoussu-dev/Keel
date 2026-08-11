/**
 * `observability/spring-observability` adapter — layers health
 * probes (Actuator availability groups), the correlation-id request
 * context + MDC, and OpenTelemetry (micrometer-tracing OTel bridge +
 * OTLP registries) onto the Java Spring Boot REST walking skeleton.
 *
 * One of the JVM observability family built by
 * {@link jvmObservabilityAdapter}; the resolver picks it on
 * `framework.spring + arch.server-http + lang.java`.
 */

import { jvmObservabilityAdapter } from './jvm-observability.js';

export const SPRING_OBSERVABILITY_ID = 'observability/spring-observability';

export const springObservabilityAdapter = jvmObservabilityAdapter({
  id: SPRING_OBSERVABILITY_ID,
  framework: 'spring',
  language: 'java',
  templateDir: 'spring-observability',
});
