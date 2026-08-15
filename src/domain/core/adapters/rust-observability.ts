/**
 * `observability/rust-observability` adapter — layers observability
 * onto the Rust axum walking skeleton with the tracing-first house
 * style:
 *
 *   - `src/bin/http/observability.rs`: `tracing_subscriber` JSON
 *     logging layered with `tracing-opentelemetry` (span fields are
 *     the Rust MDC equivalent), OTLP trace + metric export, the
 *     axum `request_context` middleware (extract-or-mint
 *     `X-Correlation-Id`, optional `X-Tenant-Id`, response echo, a
 *     per-request span carrying both ids, an `app.http.requests`
 *     counter), and the extensible `RequestContext` extension type;
 *   - `src/bin/http/health.rs`: `/health/live` + `/health/ready`
 *     routes over an atomic readiness flag with a checker registry;
 *   - patches `Cargo.toml` (tracing + OpenTelemetry crates) and
 *     `src/bin/http/main.rs` at the exact anchors the bootstrap
 *     emitted, both guarded so re-installs and hand-edited files
 *     are left unchanged (the README section documents the manual
 *     wiring for that case).
 */

import { rustBootstrapAnswers } from './rust-bootstrap.js';
import { rustLayout } from './rust-module-layout.js';
import type { Adapter } from '../../contract/composition.js';
import { eolAware } from '../util.js';

export const RUST_OBSERVABILITY_ID = 'observability/rust-observability';

const TEMPLATE_ROOT = 'composition/observability/rust-observability/templates';

const DEPENDENCIES_MARKER = '[dependencies]';

const OBSERVABILITY_DEPENDENCIES = `opentelemetry = "0.32"
opentelemetry-otlp = { version = "0.32", features = ["http-proto", "reqwest-blocking-client"] }
opentelemetry_sdk = "0.32"
tracing = "0.1"
tracing-opentelemetry = "0.33"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt", "json"] }
uuid = { version = "1", features = ["v4"] }`;

/** The delivery typology this vertical decorates. */
const TYPOLOGY = 'http';
const MODS_PLAIN = 'mod handler;';
const MODS_OBSERVED = 'mod handler;\nmod health;\nmod observability;';
const MAIN_OPEN = 'async fn main() {\n';
const SERVE_PLAIN = `    let greeter: handler::SharedGreeter = Arc::new(new_greeter());
    axum::serve(listener, handler::router(greeter))
        .await
        .expect("serve HTTP");`;
const SERVE_OBSERVED = `    let greeter: handler::SharedGreeter = Arc::new(new_greeter());
    let ready = health::readiness();
    let app = handler::router(greeter)
        .layer(axum::middleware::from_fn(
            observability::request_context,
        ))
        .merge(health::router(ready.clone()));
    ready.set_ready();
    axum::serve(listener, app)
        .await
        .expect("serve HTTP");`;

const README_MARKER = '\n### Observability\n';

const readmeSection = (): string =>
  `${README_MARKER}
Liveness \`GET /health/live\` (process up — restart on failure) and
readiness \`GET /health/ready\` (dependencies ok — gate traffic on it;
register checks with \`Readiness::add_check\`). Every request gets a
correlation id: \`X-Correlation-Id\` is accepted or minted, echoed on the
response, recorded as a field on the request's tracing span (so every
log line inside it is correlated), and counted on \`app.http.requests\`.
Add more propagated fields (e.g. a tenant id — \`X-Tenant-Id\` ships as
the example) in \`src/bin/http/observability.rs\`. Telemetry exports over
OTLP/HTTP to \`OTEL_EXPORTER_OTLP_ENDPOINT\` (default
\`http://localhost:4318\`); set \`OTEL_SDK_DISABLED=true\` to switch it off.
`;

export const rustObservabilityAdapter: Adapter = {
  id: RUST_OBSERVABILITY_ID,
  vertical: 'observability',
  covers: ['health', 'request-context', 'telemetry'],
  predicate: { requires: ['lang.rust', 'arch.server-http'] },
  async contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_OBSERVABILITY_ID);
    // Both the sibling modules and the manifest carrying their
    // dependencies move with the layout: under the modulith the
    // assembly is its own crate, so the telemetry stack belongs to
    // that crate's manifest rather than to the workspace root.
    const layout = rustLayout(ctx.manifest.tags, projectName);
    const assembly = layout.assembly(TYPOLOGY);
    const mainTarget = assembly.rootFile;
    const manifestTarget = assembly.crate.manifest;
    const files = await ctx.templates.render(
      `${TEMPLATE_ROOT}/unit`,
      mainTarget.slice(0, mainTarget.lastIndexOf('/')),
      { projectName },
    );
    return {
      files,
      patches: [
        {
          target: manifestTarget,
          apply: eolAware((existing) => {
            if (existing.includes('tracing-opentelemetry')) return existing;
            return existing.replace(
              DEPENDENCIES_MARKER,
              `${DEPENDENCIES_MARKER}\n${OBSERVABILITY_DEPENDENCIES}`,
            );
          }),
        },
        {
          target: mainTarget,
          apply: eolAware((existing) => patchMainRs(existing, projectName)),
        },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection()}`;
          }),
        },
      ],
    };
  },
};

/**
 * Rewrites the bootstrap's `src/bin/http/main.rs` at three anchors:
 * the module list, telemetry init at the top of `main`, and the
 * serve expression wrapped with health routes + the request-context
 * middleware. Exported for direct unit-testing of the anchors.
 */
export function patchMainRs(existing: string, projectName: string): string {
  if (existing.includes('mod observability;')) return existing;
  if (
    !existing.includes(MODS_PLAIN) ||
    !existing.includes(MAIN_OPEN) ||
    !existing.includes(SERVE_PLAIN)
  ) {
    // The file drifted from the bootstrap's shape — leave it alone;
    // the README section documents the manual wiring.
    return existing;
  }
  return existing
    .replace(MODS_PLAIN, MODS_OBSERVED)
    .replace(MAIN_OPEN, `${MAIN_OPEN}    observability::init("${projectName}");\n`)
    .replace(SERVE_PLAIN, SERVE_OBSERVED);
}
