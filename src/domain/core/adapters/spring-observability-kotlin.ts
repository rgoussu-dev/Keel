/**
 * `observability/spring-observability-kotlin` adapter — the Kotlin
 * twin of `observability/spring-observability`: Actuator health
 * probes, the correlation-id request context + MDC, and
 * OpenTelemetry onto the Kotlin Spring Boot REST walking skeleton.
 *
 * One of the JVM observability family built by
 * {@link jvmObservabilityAdapter}; the resolver picks it on
 * `framework.spring + arch.server-http + lang.kotlin`.
 */

import { jvmObservabilityAdapter } from './jvm-observability.js';

export const SPRING_OBSERVABILITY_KOTLIN_ID = 'observability/spring-observability-kotlin';

export const springObservabilityKotlinAdapter = jvmObservabilityAdapter({
  id: SPRING_OBSERVABILITY_KOTLIN_ID,
  framework: 'spring',
  language: 'kotlin',
  templateDir: 'spring-observability-kotlin',
});
