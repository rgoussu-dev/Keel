/**
 * Shared factory for the JVM observability adapters.
 *
 * Every JVM observability adapter — Quarkus, Spring, Micronaut, in
 * Java or Kotlin — layers the same three capabilities onto the REST
 * walking skeleton, each with the framework's idiomatic machinery:
 *
 *   - **health**: liveness + readiness probe endpoints (SmallRye
 *     Health `/q/health/*`, Actuator `/actuator/health/*`, Micronaut
 *     Management `/health/*`) plus a template readiness check to
 *     hang real dependency checks on;
 *   - **request-context**: one filter that extracts-or-mints the
 *     `X-Correlation-Id` (and optional `X-Tenant-Id`) header into a
 *     request-scoped context + the MDC, and echoes it on the
 *     response — so every log line of a request is correlated;
 *   - **telemetry**: OpenTelemetry wiring (traces + metrics over
 *     OTLP) with one example span enrichment and one example counter
 *     in the filter.
 *
 * The adapter renders a language+framework template tree under
 * `assets/composition/observability/` and patches what the
 * walking-skeleton bootstraps wrote: the executable module's build
 * file (Gradle or Maven, selected from the manifest's `pkg.*` tag)
 * gains the framework's observability dependencies, and the runtime
 * config gains probe/telemetry settings and an MDC-bearing log
 * format. Patch anchors are the lines the `jvm-build` trees emit;
 * every patch is guarded so re-installing is a no-op.
 *
 * Reads `basePackage`/`projectName` from the matching REST bootstrap
 * adapter's manifest answers — the vertical therefore requires the
 * walking skeleton to have run first (greenfield stacks order it so;
 * brownfield `keel add observability` finds the answers in the
 * manifest).
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { jvmLayout, type JvmLayoutPaths } from './jvm-module-layout.js';
import { eolAware, packageToPath } from '../util.js';
import type { JvmLanguage } from './jvm-bootstrap.js';
import type { Adapter, ContributionPatch, ManifestV2 } from '../../contract/composition.js';

/** JVM frameworks the observability vertical ships adapters for. */
export type JvmObservabilityFramework = 'quarkus' | 'spring' | 'micronaut';

/** Declaration of one JVM observability combination. */
export interface JvmObservabilitySpec {
  /** Full adapter id, e.g. `observability/quarkus-observability`. */
  readonly id: string;
  readonly framework: JvmObservabilityFramework;
  readonly language: JvmLanguage;
  /**
   * Directory of the template tree under
   * `assets/composition/observability/`.
   */
  readonly templateDir: string;
}

/**
 * Observability is assembly-level: correlation, probes and telemetry
 * belong to the deployment unit, not to any one bounded context. Both
 * layouts therefore target the module that runs — `application/…` under
 * the modulith, the lone executable under the flat trisection.
 */
const gradleTarget = (l: JvmLayoutPaths): string => `${l.restRuntime}/build.gradle.kts`;
const mavenTarget = (l: JvmLayoutPaths): string => `${l.restRuntime}/pom.xml`;
const propertiesTarget = (l: JvmLayoutPaths): string =>
  `${l.restRuntime}/src/main/resources/application.properties`;
const logbackTarget = (l: JvmLayoutPaths): string =>
  `${l.restRuntime}/src/main/resources/logback.xml`;

/** Per-framework build + config wiring. */
interface FrameworkWiring {
  /** Substring proving the build patch already applied. */
  readonly guard: string;
  /** Line in the executable Gradle build file to insert after. */
  readonly gradleAnchor: string;
  /** Dependency lines inserted into the Gradle build file. */
  readonly gradleDeps: string;
  /** `<artifactId>` line in the executable pom to insert after. */
  readonly mavenAnchor: string;
  /** `<dependency>` blocks inserted into the pom. */
  readonly mavenDeps: string;
  /** The framework's liveness probe path, for the README section. */
  readonly livenessPath: string;
  /** The framework's readiness probe path, for the README section. */
  readonly readinessPath: string;
  /** Patches against the runtime configuration files. */
  configPatches(layout: JvmLayoutPaths): readonly ContributionPatch[];
}

const README_MARKER = '\n### Observability\n';

const readmeSection = (wiring: FrameworkWiring, layout: JvmLayoutPaths): string =>
  `${README_MARKER}
Liveness \`GET ${wiring.livenessPath}\` (process up — restart on failure)
and readiness \`GET ${wiring.readinessPath}\` (dependencies ok — gate
traffic on it; grow the shipped service-ready check with real
dependency checks). Every request gets a correlation id:
\`X-Correlation-Id\` is accepted or minted, echoed on the response, and
stamped on every log line (MDC), the OpenTelemetry span, and the
\`app.http.requests\` counter. Add more propagated fields (e.g. a tenant
id — \`X-Tenant-Id\` ships as the example) in the
\`${layout.restRuntimePkg.split('.').join('/')}/observability/RequestContext\` + filter
pair. Telemetry exports
over OTLP; point it at a collector with the standard \`OTEL_*\` env vars.
`;

const OBSERVABILITY_PROPERTIES_GUARD = '--- observability (installed by keel)';

const QUARKUS_PROPERTIES_BLOCK = `# --- observability (installed by keel) ---------------------------------
# Health probes (SmallRye Health): liveness = /q/health/live,
# readiness = /q/health/ready — point the orchestrator's probes there.
# OpenTelemetry ships traces + metrics over OTLP; configure the target
# with the standard env vars (OTEL_EXPORTER_OTLP_ENDPOINT, defaults to
# http://localhost:4317) — nothing to change here per environment.
quarkus.otel.metrics.enabled=true
quarkus.otel.logs.enabled=true
# No collector runs in dev/test, so keep the SDK quiet there. Remove
# the %dev override to watch telemetry from \`quarkus dev\` against a
# local collector.
%dev.quarkus.otel.sdk.disabled=true
%test.quarkus.otel.sdk.disabled=true
`;

const QUARKUS_LOG_FORMAT_PLAIN = 'quarkus.log.console.format=%-5p %m%n';
const QUARKUS_LOG_FORMAT_MDC = 'quarkus.log.console.format=%-5p [corr=%X{correlationId}] %m%n';

const SPRING_PROPERTIES_BLOCK = `# --- observability (installed by keel) ---------------------------------
# Health probes (Actuator): liveness = /actuator/health/liveness,
# readiness = /actuator/health/readiness — point the orchestrator's
# probes there. The custom ServiceReadyHealthIndicator gates readiness
# alongside the application's own readiness state.
management.endpoint.health.probes.enabled=true
management.endpoints.web.exposure.include=health
management.endpoint.health.group.readiness.include=readinessState,serviceReady
# Correlated logs: every line carries the request's correlation id
# (MDC) next to the trace/span ids micrometer-tracing already adds.
logging.pattern.level=%5p [corr=%X{correlationId:-}]
# OpenTelemetry: traces via the micrometer-tracing OTel bridge, metrics
# via the OTLP registry — both target http://localhost:4318 unless
# overridden (management.otlp.*.export.url / OTEL_* env at deploy time).
management.tracing.sampling.probability=1.0
management.otlp.metrics.export.step=30s
`;

const MICRONAUT_PROPERTIES_BLOCK = `# --- observability (installed by keel) ---------------------------------
# Health probes (Micronaut Management): liveness = /health/liveness,
# readiness = /health/readiness — point the orchestrator's probes there.
endpoints.health.enabled=true
endpoints.health.sensitive=false
endpoints.health.details-visible=ANONYMOUS
# Micrometer metrics exported over OTLP/HTTP (collector at
# localhost:4318 unless overridden).
micronaut.metrics.enabled=true
micronaut.metrics.export.otlp.enabled=true
micronaut.metrics.export.otlp.url=http://localhost:4318/v1/metrics
# OpenTelemetry traces over OTLP; endpoint via the standard env vars
# (OTEL_EXPORTER_OTLP_ENDPOINT). Keep the probe endpoints out of traces.
otel.exclusions=/health,/health/liveness,/health/readiness
`;

const MICRONAUT_LOGBACK_PATTERN_PLAIN = '%d{HH:mm:ss.SSS} %-5level %logger{36} - %msg%n';
const MICRONAUT_LOGBACK_PATTERN_MDC =
  '%d{HH:mm:ss.SSS} %-5level [corr=%X{correlationId}] %logger{36} - %msg%n';

const appendBlock = (target: string, guard: string, block: string): ContributionPatch => ({
  target,
  apply: eolAware((existing) => {
    if (existing.includes(guard)) return existing;
    return `${existing.trimEnd()}\n\n${block}`;
  }),
});

const WIRING: Readonly<Record<JvmObservabilityFramework, FrameworkWiring>> = {
  quarkus: {
    guard: 'quarkus-smallrye-health',
    gradleAnchor: 'implementation("io.quarkus:quarkus-rest-jackson")',
    gradleDeps: `    implementation("io.quarkus:quarkus-smallrye-health")
    implementation("io.quarkus:quarkus-opentelemetry")`,
    mavenAnchor: '<artifactId>quarkus-rest-jackson</artifactId>\n    </dependency>',
    mavenDeps: `    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-smallrye-health</artifactId>
    </dependency>
    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-opentelemetry</artifactId>
    </dependency>`,
    livenessPath: '/q/health/live',
    readinessPath: '/q/health/ready',
    configPatches: (layout) => [
      {
        target: propertiesTarget(layout),
        apply: eolAware((existing) => {
          let next = existing;
          if (!next.includes(QUARKUS_LOG_FORMAT_MDC)) {
            next = next.replace(QUARKUS_LOG_FORMAT_PLAIN, QUARKUS_LOG_FORMAT_MDC);
          }
          if (!next.includes(OBSERVABILITY_PROPERTIES_GUARD)) {
            next = `${next.trimEnd()}\n\n${QUARKUS_PROPERTIES_BLOCK}`;
          }
          return next;
        }),
      },
    ],
  },
  spring: {
    guard: 'spring-boot-starter-actuator',
    gradleAnchor: 'implementation("org.springframework.boot:spring-boot-starter-webmvc")',
    gradleDeps: `    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.micrometer:micrometer-registry-otlp")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")`,
    mavenAnchor: '<artifactId>spring-boot-starter-webmvc</artifactId>\n    </dependency>',
    mavenDeps: `    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>io.micrometer</groupId>
      <artifactId>micrometer-tracing-bridge-otel</artifactId>
    </dependency>
    <dependency>
      <groupId>io.micrometer</groupId>
      <artifactId>micrometer-registry-otlp</artifactId>
    </dependency>
    <dependency>
      <groupId>io.opentelemetry</groupId>
      <artifactId>opentelemetry-exporter-otlp</artifactId>
    </dependency>`,
    livenessPath: '/actuator/health/liveness',
    readinessPath: '/actuator/health/readiness',
    configPatches: (layout) => [
      appendBlock(
        propertiesTarget(layout),
        OBSERVABILITY_PROPERTIES_GUARD,
        SPRING_PROPERTIES_BLOCK,
      ),
    ],
  },
  micronaut: {
    guard: 'micronaut-management',
    gradleAnchor: 'implementation("io.micronaut:micronaut-jackson-databind")',
    gradleDeps: `    implementation("io.micronaut:micronaut-management")
    implementation("io.micronaut.tracing:micronaut-tracing-opentelemetry-http")
    implementation("io.micronaut.micrometer:micronaut-micrometer-registry-otlp")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")`,
    mavenAnchor: '<artifactId>micronaut-jackson-databind</artifactId>\n    </dependency>',
    mavenDeps: `    <dependency>
      <groupId>io.micronaut</groupId>
      <artifactId>micronaut-management</artifactId>
    </dependency>
    <dependency>
      <groupId>io.micronaut.tracing</groupId>
      <artifactId>micronaut-tracing-opentelemetry-http</artifactId>
    </dependency>
    <dependency>
      <groupId>io.micronaut.micrometer</groupId>
      <artifactId>micronaut-micrometer-registry-otlp</artifactId>
    </dependency>
    <dependency>
      <groupId>io.opentelemetry</groupId>
      <artifactId>opentelemetry-exporter-otlp</artifactId>
    </dependency>
    <!-- Pinned because Maven and Gradle resolve this differently for
         the same artifact. micronaut-micrometer-registry-otlp ships
         protobuf-generated classes whose gencode version must not
         exceed the protobuf-java runtime on the classpath, and the
         Micronaut platform BOM manages an older runtime than the
         gencode the registry links (5.1.1 manages 4.28.3 against
         gencode 4.32.0); Gradle picks the highest version and gets a
         working classpath, Maven takes the BOM's and the container
         fails to start the meter registry with
         ProtobufRuntimeVersionException. The pin keeps the runtime at
         least as new as the linked gencode. -->
    <dependency>
      <groupId>com.google.protobuf</groupId>
      <artifactId>protobuf-java</artifactId>
      <version>4.35.1</version>
      <scope>runtime</scope>
    </dependency>`,
    livenessPath: '/health/liveness',
    readinessPath: '/health/readiness',
    configPatches: (layout) => [
      appendBlock(
        propertiesTarget(layout),
        OBSERVABILITY_PROPERTIES_GUARD,
        MICRONAUT_PROPERTIES_BLOCK,
      ),
      {
        target: logbackTarget(layout),
        apply: eolAware((existing) => {
          if (existing.includes('%X{correlationId}')) return existing;
          return existing.replace(MICRONAUT_LOGBACK_PATTERN_PLAIN, MICRONAUT_LOGBACK_PATTERN_MDC);
        }),
      },
    ],
  },
};

/**
 * Reads the answers the matching REST bootstrap recorded. Exported so
 * the observability vertical tests can build fixtures against the
 * same lookup the adapters use.
 */
export function jvmRestBootstrapAnswers(
  manifest: ManifestV2,
  spec: JvmObservabilitySpec,
): { basePackage: string; projectName: string } {
  const suffix = spec.language === 'kotlin' ? '-rest-kotlin-bootstrap' : '-rest-bootstrap';
  const bootstrapId = `walking-skeleton/${spec.framework}${suffix}`;
  const answers = manifest.answers[bootstrapId];
  const basePackage = answers?.basePackage;
  const projectName = answers?.projectName;
  if (!basePackage || !projectName) {
    throw new Error(
      `${spec.id}: requires '${bootstrapId}' to have run first; basePackage/projectName not in manifest`,
    );
  }
  return { basePackage, projectName };
}

/**
 * Builds an observability adapter for one JVM
 * (framework, language) combination.
 */
export function jvmObservabilityAdapter(spec: JvmObservabilitySpec): Adapter {
  const wiring = WIRING[spec.framework];
  const templateId = (suffix: string): string =>
    `composition/observability/${spec.templateDir}/templates${suffix}`;
  return {
    id: spec.id,
    vertical: 'observability',
    covers: ['health', 'request-context', 'telemetry'],
    predicate: {
      requires: [`framework.${spec.framework}`, 'arch.server-http', `lang.${spec.language}`],
    },
    async contribute(ctx) {
      const { basePackage, projectName } = jvmRestBootstrapAnswers(ctx.manifest, spec);
      const vars = { basePackage, projectName, pkgPath: packageToPath(basePackage) };
      const layout = jvmLayout(ctx.manifest.tags);
      const files = await ctx.templates.render(
        templateId(layout.layout === 'modulith' ? '-modulith' : ''),
        '',
        vars,
      );
      const buildPatch: ContributionPatch =
        jvmBuildSystem(ctx.manifest.tags) === 'maven'
          ? {
              target: mavenTarget(layout),
              apply: eolAware((existing) => {
                if (existing.includes(wiring.guard)) return existing;
                return existing.replace(
                  wiring.mavenAnchor,
                  `${wiring.mavenAnchor}\n${wiring.mavenDeps}`,
                );
              }),
            }
          : {
              target: gradleTarget(layout),
              apply: eolAware((existing) => {
                if (existing.includes(wiring.guard)) return existing;
                return existing.replace(
                  wiring.gradleAnchor,
                  `${wiring.gradleAnchor}\n${wiring.gradleDeps}`,
                );
              }),
            };
      return {
        files,
        patches: [
          buildPatch,
          ...wiring.configPatches(layout),
          {
            target: 'README.md',
            apply: eolAware((existing) => {
              if (existing.includes(README_MARKER)) return existing;
              return `${existing.trimEnd()}\n${readmeSection(wiring, layout)}`;
            }),
          },
        ],
      };
    },
  };
}
