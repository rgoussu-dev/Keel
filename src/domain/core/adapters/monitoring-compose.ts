/**
 * `observability/monitoring-compose` adapter — the crossover between
 * observability and the dev environment: supplements the `dev-env`
 * vertical's `dev/compose.yaml` with a monitoring stack wired to the
 * service's OTLP export, as a worked example and a base for the real
 * production setup.
 *
 * Language- and framework-agnostic: it fires for every HTTP service
 * (`arch.server-http`) alongside the per-stack observability
 * adapter, and covers the vertical's `monitoring-stack` dimension.
 * The service side needs no extra wiring — the per-stack adapters
 * already export OTLP to `localhost:4317/4318`, exactly where the
 * stack's collector listens.
 *
 * One sticky question — `stack` — picks the shape:
 *
 *   - `granular` (default): one service per concern, the shape a
 *     production deployment grows from — an OpenTelemetry Collector
 *     (the single OTLP entrypoint, fanning out per signal), Tempo
 *     for traces, Prometheus for metrics (OTLP via remote-write),
 *     Loki for logs, and Grafana provisioned with all three
 *     datasources. Config files land under `dev/observability/`,
 *     ready to edit.
 *   - `lgtm`: the all-in-one `grafana/otel-lgtm` dev container —
 *     same ports, one service, zero config files.
 *
 * No install-order coupling with the `dev-env` vertical: the compose
 * patch carries the shared base as its `seed`, so when
 * `dev/compose.yaml` is already there (greenfield stacks run
 * `dev-env` first) the stack composes into it, and when it is not
 * (`keel add observability` alone) the patch creates the base with
 * just the monitoring services — each vertical stands on its own.
 */

import {
  addComposeService,
  addComposeVolumes,
  devComposeSeed,
  DEV_COMPOSE_TARGET,
} from './dev-env-compose.js';
import type { Adapter, Contribution } from '../../contract/composition.js';

export const MONITORING_COMPOSE_ID = 'observability/monitoring-compose';

const TEMPLATE_ROOT = 'composition/observability/monitoring-compose';

/** Directory the stack's config files land in. */
export const MONITORING_CONFIG_DIR = 'dev/observability';

const README_MARKER = '\n### Monitoring stack\n';

const readmeSection = (): string =>
  `${README_MARKER}
The dev environment (\`docker compose -f dev/compose.yaml up\`)
includes a monitoring stack listening where the service already
exports: OTLP on \`localhost:4317\` (gRPC) / \`4318\` (HTTP). Run the
service with telemetry enabled (see the Observability section — in
dev profiles where the SDK ships disabled, remove that override),
send a few requests, and open Grafana at http://localhost:3000
(anonymous admin — dev only). The stack is a worked example and a
base for the production setup: pin real auth and retention, add
container healthchecks, and keep the collector as the single OTLP
entrypoint so the service never learns backend addresses.
`;

const GRANULAR_SERVICES = `  # --- monitoring (observability vertical) -----------------------------
  # One service per concern, the shape a production deployment grows
  # from: the collector is the single OTLP entrypoint (the service
  # never learns backend addresses), fanning each signal out to its
  # store. Config files live in dev/observability/. Before
  # production: real Grafana auth, retention on the stores, container
  # healthchecks mirroring the service's own probe doctrine.
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.158.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./observability/otel-collector.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "4317:4317" # OTLP gRPC — the service pushes here
      - "4318:4318" # OTLP HTTP
    depends_on:
      - tempo
      - prometheus
      - loki

  tempo:
    image: grafana/tempo:2.9.4
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ./observability/tempo.yaml:/etc/tempo.yaml:ro
      - tempo-data:/var/tempo

  prometheus:
    image: prom/prometheus:v3.13.2
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      # Accept the collector's remote-write pushes (OTLP metrics
      # arrive through the collector, not by scraping the service).
      - --web.enable-remote-write-receiver
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus

  loki:
    image: grafana/loki:3.7.6
    command: ["-config.file=/etc/loki/local-config.yaml"]
    volumes:
      - loki-data:/loki

  grafana:
    image: grafana/grafana:13.0.6
    environment:
      # Dev-only: anonymous admin. Wire real auth before production.
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
      GF_AUTH_DISABLE_LOGIN_FORM: "true"
    volumes:
      - ./observability/grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml:ro
      - grafana-data:/var/lib/grafana
    ports:
      - "3000:3000"
    depends_on:
      - tempo
      - prometheus
      - loki`;

const GRANULAR_VOLUMES = ['tempo-data', 'prometheus-data', 'loki-data', 'grafana-data'] as const;

const LGTM_SERVICE = `  # --- monitoring (observability vertical) -----------------------------
  # The all-in-one dev shape: grafana/otel-lgtm bundles a collector,
  # Tempo, Prometheus, Loki, and Grafana in one container on the same
  # ports the granular stack would use. The production base is the
  # granular shape (re-run \`keel add observability\` and pick
  # \`granular\`).
  lgtm:
    image: grafana/otel-lgtm:0.30.1
    ports:
      - "3000:3000" # Grafana
      - "4317:4317" # OTLP gRPC — the service pushes here
      - "4318:4318" # OTLP HTTP`;

export const monitoringComposeAdapter: Adapter = {
  id: MONITORING_COMPOSE_ID,
  vertical: 'observability',
  covers: ['monitoring-stack'],
  predicate: { requires: ['arch.server-http'] },
  questions: [
    {
      id: 'stack',
      prompt: 'Which monitoring stack shape?',
      doc: 'Both listen on the OTLP ports the service already exports to; both serve Grafana on :3000.',
      default: 'granular',
      memory: 'sticky',
      choices: [
        {
          value: 'granular',
          label: 'granular — collector + Tempo + Prometheus + Loki + Grafana',
          doc: 'One service per concern with editable config files; the shape a production deployment grows from.',
        },
        {
          value: 'lgtm',
          label: 'all-in-one — grafana/otel-lgtm',
          doc: 'A single dev container bundling the same stack; zero config files, fastest start.',
        },
      ],
    },
  ],
  async contribute(ctx): Promise<Contribution> {
    const stack = ctx.answer('stack');
    if (stack !== 'granular' && stack !== 'lgtm') {
      throw new Error(
        `${MONITORING_COMPOSE_ID}: unsupported stack '${stack}'; supported: granular, lgtm`,
      );
    }
    const readmePatch = {
      target: 'README.md',
      apply: (existing: string): string => {
        if (existing.includes(README_MARKER)) return existing;
        return `${existing.trimEnd()}\n${readmeSection()}`;
      },
    };
    const seed = await devComposeSeed(ctx);
    if (stack === 'lgtm') {
      return {
        patches: [
          {
            target: DEV_COMPOSE_TARGET,
            seed,
            apply: (existing) => {
              if (existing.includes('grafana/otel-lgtm')) return existing;
              if (existing.includes('otel-collector:')) {
                throw new Error(
                  `${MONITORING_COMPOSE_ID}: dev/compose.yaml already carries the granular monitoring stack — remove those services (and their volumes) before switching the sticky 'stack' answer to 'lgtm', or keep the granular shape`,
                );
              }
              return addComposeService(existing, LGTM_SERVICE);
            },
          },
          readmePatch,
        ],
      };
    }
    const files = await ctx.templates.render(
      `${TEMPLATE_ROOT}/granular`,
      MONITORING_CONFIG_DIR,
      {},
    );
    return {
      files,
      patches: [
        {
          target: DEV_COMPOSE_TARGET,
          seed,
          apply: (existing) => {
            if (existing.includes('otel-collector:')) return existing;
            if (existing.includes('grafana/otel-lgtm')) {
              throw new Error(
                `${MONITORING_COMPOSE_ID}: dev/compose.yaml already carries the all-in-one lgtm monitoring stack — remove that service before switching the sticky 'stack' answer to 'granular', or keep the lgtm shape`,
              );
            }
            return addComposeVolumes(
              addComposeService(existing, GRANULAR_SERVICES),
              GRANULAR_VOLUMES,
            );
          },
        },
        readmePatch,
      ],
    };
  },
};
