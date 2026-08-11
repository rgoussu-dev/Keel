/**
 * `observability/ts-observability` adapter — layers observability
 * onto the TypeScript `node:http` walking skeleton:
 *
 *   - `application/rest/src/observability/`: an `AsyncLocalStorage`
 *     request context (the Node MDC equivalent) feeding a small
 *     structured JSON logger, OpenTelemetry NodeSDK wiring
 *     (OTLP/HTTP trace + metric exporters), and an `instrument`
 *     decorator that wraps the bootstrap's `http.Server` — serving
 *     `/health/live` + `/health/ready`, extracting-or-minting
 *     `X-Correlation-Id` (optional `X-Tenant-Id`), echoing it on
 *     the response, opening a server span, and counting requests;
 *   - patches `application/rest/src/main.ts` at the bootstrap's
 *     anchors (the assembly point is exactly where cross-cutting
 *     concerns decorate the server), `application/rest/package.json`
 *     with the OpenTelemetry dependencies, and the README;
 *   - defers an install action so brownfield `keel add
 *     observability` fetches the new dependencies (greenfield
 *     re-runs the bootstrap's install — a fast no-op).
 */

import { tsWorkspaceVars } from './ts-workspace.js';
import { TS_HTTP_BOOTSTRAP_ID } from './ts-http-bootstrap.js';
import type {
  Adapter,
  DeferredAction,
  DeferredActionEnv,
  ManifestV2,
} from '../../contract/composition.js';
import { eolAware } from '../util.js';

export const TS_OBSERVABILITY_ID = 'observability/ts-observability';

const TEMPLATE_ID = 'composition/observability/ts-observability/templates';

const PACKAGE_TARGET = 'application/rest/package.json';
const MAIN_TARGET = 'application/rest/src/main.ts';

const OTEL_DEPENDENCIES: Readonly<Record<string, string>> = {
  '@opentelemetry/api': '^1.9.1',
  '@opentelemetry/exporter-metrics-otlp-http': '^0.221.0',
  '@opentelemetry/exporter-trace-otlp-http': '^0.221.0',
  '@opentelemetry/resources': '^2.10.0',
  '@opentelemetry/sdk-metrics': '^2.10.0',
  '@opentelemetry/sdk-node': '^0.221.0',
  '@opentelemetry/semantic-conventions': '^1.43.0',
};

const SERVER_IMPORT = "import { createGreetServer } from './server.ts';";
const LISTEN_PLAIN = `createGreetServer(mediator).listen(port, () => {
  console.log(\`listening on http://localhost:\${port} — try /greet?name=World\`);
});`;
const LISTEN_OBSERVED = `const server = instrument(createGreetServer(mediator));
server.listen(port, () => {
  markReady();
  console.log(\`listening on http://localhost:\${port} — try /greet?name=World\`);
});`;

const README_MARKER = '\n### Observability\n';

const readmeSection = (): string =>
  `${README_MARKER}
Liveness \`GET /health/live\` (process up — restart on failure) and
readiness \`GET /health/ready\` (dependencies ok — gate traffic on it;
register checks with \`addReadinessCheck\`). Every request gets a
correlation id: \`X-Correlation-Id\` is accepted or minted, echoed on the
response, stamped on every \`logger.*\` line via the AsyncLocalStorage
request context, the OpenTelemetry span, and the \`app.http.requests\`
counter. Add more propagated fields (e.g. a tenant id —
\`X-Tenant-Id\` ships as the example) in
\`application/rest/src/observability/context.ts\`. Telemetry exports over
OTLP/HTTP to \`OTEL_EXPORTER_OTLP_ENDPOINT\` (default
\`http://localhost:4318\`); set \`OTEL_SDK_DISABLED=true\` to switch it off.
`;

export const tsObservabilityAdapter: Adapter = {
  id: TS_OBSERVABILITY_ID,
  vertical: 'observability',
  covers: ['health', 'request-context', 'telemetry'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  async contribute(ctx) {
    const projectName = tsBootstrapProjectName(ctx.manifest);
    const { pm } = tsWorkspaceVars(ctx.manifest.tags);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { projectName });
    const action: DeferredAction = {
      id: TS_OBSERVABILITY_ID,
      description: `${pm} install (fetch the OpenTelemetry packages)`,
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        logger.info(`observability: running ${pm} install`);
        const args = pm === 'npm' ? ['install', '--no-fund', '--no-audit'] : ['install'];
        const r = processes.run(pm, args, { cwd });
        if (r.startFailure?.code === 'ENOENT') {
          throw new Error(
            `${TS_OBSERVABILITY_ID}: '${pm}' is not on PATH — install it, then run \`${pm} install\` in the project yourself`,
          );
        }
        if (r.status !== 0) {
          const detail = [r.stderr.trim(), r.stdout.trim()].filter(Boolean).join('\n');
          throw new Error(`${TS_OBSERVABILITY_ID}: '${pm} install' failed: ${detail}`);
        }
        return Promise.resolve();
      },
    };
    return {
      files,
      patches: [
        {
          target: PACKAGE_TARGET,
          apply: eolAware(addOtelDependencies),
        },
        {
          target: MAIN_TARGET,
          apply: eolAware(patchMainTs),
        },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection()}`;
          }),
        },
      ],
      actions: [action],
    };
  },
};

function tsBootstrapProjectName(manifest: ManifestV2): string {
  const projectName = manifest.answers[TS_HTTP_BOOTSTRAP_ID]?.projectName;
  if (!projectName) {
    throw new Error(
      `${TS_OBSERVABILITY_ID}: requires '${TS_HTTP_BOOTSTRAP_ID}' to have run first; projectName not in manifest`,
    );
  }
  return projectName;
}

/**
 * Adds the OpenTelemetry packages to the rest unit's dependency map.
 * Parses + re-serializes (2-space, trailing newline — the repo's
 * prettier shape) so the patch stays idempotent and key-stable.
 * Exported for direct unit-testing.
 */
export function addOtelDependencies(existing: string): string {
  const pkg = JSON.parse(existing) as Record<string, unknown>;
  const deps = { ...((pkg.dependencies as Record<string, string> | undefined) ?? {}) };
  let changed = false;
  for (const [name, version] of Object.entries(OTEL_DEPENDENCIES)) {
    if (deps[name] === undefined) {
      deps[name] = version;
      changed = true;
    }
  }
  if (!changed) return existing;
  pkg.dependencies = deps;
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Rewrites the bootstrap's `main.ts` at two anchors: the imports
 * (telemetry starts before anything else runs) and the listen call
 * (server decorated, readiness flipped once the port is bound).
 * Guarded: a hand-edited file is left unchanged, with the README
 * documenting the manual wiring. Exported for direct unit-testing.
 */
export function patchMainTs(existing: string): string {
  if (existing.includes('./observability/')) return existing;
  if (!existing.includes(SERVER_IMPORT) || !existing.includes(LISTEN_PLAIN)) {
    return existing;
  }
  return existing
    .replace(
      SERVER_IMPORT,
      `${SERVER_IMPORT}
import './observability/otel.ts';
import { instrument, markReady } from './observability/http.ts';`,
    )
    .replace(LISTEN_PLAIN, LISTEN_OBSERVED);
}
