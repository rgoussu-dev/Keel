/**
 * `observability/go-observability` adapter — layers observability
 * onto the Go HTTP walking skeleton with the stdlib-first house
 * style:
 *
 *   - `internal/app/observability/`: `log/slog` JSON logging whose
 *     handler pulls the request context into every line (the Go MDC
 *     equivalent), the `RequestContext` middleware
 *     (extract-or-mint `X-Correlation-Id`, optional `X-Tenant-Id`,
 *     response echo, an OpenTelemetry server span + request
 *     counter), OTel SDK setup (OTLP/HTTP trace + metric exporters),
 *     and hand-rolled `/health/live` + `/health/ready` endpoints
 *     with an extensible readiness checker registry.
 *   - patches `cmd/http/main.go` at the exact anchors the bootstrap
 *     emitted — wiring logging, OTel, the middleware chain, and the
 *     health mux around the existing handler. Every patch is
 *     guarded: if the file was hand-edited past recognition the
 *     patches leave it unchanged, and the README section documents
 *     the manual wiring instead.
 *   - defers a `go mod tidy` action to fetch the OpenTelemetry
 *     modules once files are on disk (greenfield installs also run
 *     the bootstrap's own tidy — the second run is a no-op).
 */

import { goBootstrapAnswers } from './go-bootstrap.js';
import { goLayout, type GoLayoutPaths } from './go-module-layout.js';
import type { Adapter, DeferredAction, DeferredActionEnv } from '../../contract/composition.js';
import { eolAware } from '../util.js';

export const GO_OBSERVABILITY_ID = 'observability/go-observability';

const TEMPLATE_ID = 'composition/observability/go-observability/templates/pkg';

const README_MARKER = '\n### Observability\n';

const readmeSection = (pkg: string): string =>
  `${README_MARKER}
Liveness \`GET /health/live\` (process up — restart on failure) and
readiness \`GET /health/ready\` (dependencies ok — gate traffic on it;
register checks with \`health.AddReadinessCheck\`). Every request gets a
correlation id: \`X-Correlation-Id\` is accepted or minted, echoed on the
response, stamped on every \`observability.Logger(ctx)\` log line, the
OpenTelemetry span, and the \`app.http.requests\` counter. Add more
propagated fields (e.g. a tenant id — \`X-Tenant-Id\` ships as the
example) in \`${pkg}/context.go\`. Telemetry exports
over OTLP/HTTP to \`OTEL_EXPORTER_OTLP_ENDPOINT\` (default
\`http://localhost:4318\`); set \`OTEL_SDK_DISABLED=true\` to switch it off.
`;

export const goObservabilityAdapter: Adapter = {
  id: GO_OBSERVABILITY_ID,
  vertical: 'observability',
  covers: ['health', 'request-context', 'telemetry'],
  predicate: { requires: ['lang.go', 'arch.server-http'] },
  async contribute(ctx) {
    const { modulePath, projectName } = goBootstrapAnswers(ctx.manifest, GO_OBSERVABILITY_ID);
    const layout = goLayout(ctx.manifest.tags, modulePath);
    // Correlation ids, probes and telemetry belong to the deployment
    // unit, not to any bounded context — so under the modulith they
    // land in platform/ rather than inside modules/<ctx>/.
    const pkg = layout.crossCutting('observability');
    const files = await ctx.templates.render(TEMPLATE_ID, pkg, {
      modulePath,
      projectName,
      observabilityImport: layout.importPath(pkg),
    });
    const action: DeferredAction = {
      id: GO_OBSERVABILITY_ID,
      description: 'go mod tidy (fetch the OpenTelemetry modules)',
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        logger.info('observability: running go mod tidy');
        const r = processes.run('go', ['mod', 'tidy'], { cwd });
        if (r.startFailure?.code === 'ENOENT') {
          throw new Error(
            `${GO_OBSERVABILITY_ID}: 'go' is not on PATH — install Go, then run \`go mod tidy\` in the project yourself`,
          );
        }
        if (r.status !== 0) {
          const detail = [r.stderr.trim(), r.stdout.trim()].filter(Boolean).join('\n');
          throw new Error(`${GO_OBSERVABILITY_ID}: 'go mod tidy' failed: ${detail}`);
        }
        return Promise.resolve();
      },
    };
    return {
      files,
      patches: [
        {
          target: layout.main('http'),
          apply: eolAware((existing) => patchMain(existing, layout, projectName)),
        },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(pkg)}`;
          }),
        },
      ],
      actions: [action],
    };
  },
};

/**
 * Rewrites the bootstrap's `cmd/http/main.go` at three anchors:
 * stdlib + app imports, telemetry setup at the top of `main`, and
 * the serve line wrapped with health mux + request-context
 * middleware. Exported for direct unit-testing of the anchors.
 */
export function patchMain(existing: string, layout: GoLayoutPaths, projectName: string): string {
  const observabilityPath = layout.importPath(layout.crossCutting('observability'));
  if (existing.includes(`"${observabilityPath}"`)) return existing;

  const restImport = `"${layout.importPath(layout.app('resthttp'))}"`;
  const serveLine = 'log.Fatal(http.Serve(listener, resthttp.NewHandler(greeter)))';
  const mainOpen = 'func main() {\n';
  if (
    !existing.includes(restImport) ||
    !existing.includes(serveLine) ||
    !existing.includes(mainOpen) ||
    !existing.includes('\t"log"\n')
  ) {
    // The file drifted from the bootstrap's shape — leave it alone;
    // the README section documents the manual wiring.
    return existing;
  }

  return (
    existing
      .replace('\t"log"\n', '\t"context"\n\t"log"\n')
      // Which of the two sorts first flips with the layout: under the
      // modulith the context's adapter is under modules/ and the
      // platform package is not, so gofmt wants them the other way
      // round. Sort rather than assume.
      .replace(restImport, [`"${observabilityPath}"`, restImport].sort().join('\n\t'))
      .replace(
        mainOpen,
        `${mainOpen}\tobservability.SetupLogging()
\totelShutdown, err := observability.SetupOTel(context.Background(), "${projectName}")
\tif err != nil {
\t\tlog.Fatal(err)
\t}
\tdefer otelShutdown(context.Background())

`,
      )
      .replace(
        serveLine,
        `health := observability.NewHealth()
\tmux := http.NewServeMux()
\thealth.Register(mux)
\tmux.Handle("/", observability.RequestContext(resthttp.NewHandler(greeter)))

\thealth.SetReady(true)
\tlog.Fatal(http.Serve(listener, mux))`,
      )
  );
}
