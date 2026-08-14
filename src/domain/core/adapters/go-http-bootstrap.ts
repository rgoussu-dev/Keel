/**
 * `walking-skeleton/go-http-bootstrap` adapter — layers the HTTP
 * deployment unit onto the Go skeleton: `cmd/http` (the assembly
 * point; PORT from the environment per 12-factor) and
 * `internal/app/resthttp` (the primary adapter mapping
 * `GET /greet?name=…` → greet command → driving port → JSON, with
 * domain errors rendered as RFC 9457 problem documents and a
 * fake-backed `httptest` adapter test). Appends the unit's
 * build-and-run instructions to the README.
 *
 * Covers the `entrypoint` dimension under `arch.server-http` — the
 * CLI sibling covers it under `arch.cli`, and a project tagged with
 * both ships both deployment units.
 */

import { GO_BOOTSTRAP_ID, goBootstrapAnswers } from './go-bootstrap.js';
import { goLayout, goTemplateVars, type GoLayoutPaths } from './go-module-layout.js';
import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';

export const GO_HTTP_BOOTSTRAP_ID = 'walking-skeleton/go-http-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/go-http-bootstrap/templates';

const README_MARKER = '\n### http\n';

const readmeSection = (projectName: string): string =>
  `${README_MARKER}
\`\`\`sh
go build -o bin/${projectName}-http ./cmd/http
PORT=8080 ./bin/${projectName}-http
curl 'http://localhost:8080/greet?name=World'
\`\`\`
`;

export const goHttpBootstrapAdapter: Adapter = {
  id: GO_HTTP_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.go', 'arch.server-http'] },
  after: [GO_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { modulePath, projectName } = goBootstrapAnswers(ctx.manifest, GO_HTTP_BOOTSTRAP_ID);
    const layout = goLayout(ctx.manifest.tags, modulePath);
    const vars = { modulePath, projectName, ...goTemplateVars(layout) };
    const [main, adapter] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/main`, '', {
        ...vars,
        projectImports: mainImports(layout),
      }),
      ctx.templates.render(`${TEMPLATE_ROOT}/adapter`, layout.app('resthttp'), {
        ...vars,
        projectImports: adapterTestImports(layout),
      }),
    ]);
    const files = [...main, ...adapter];
    return {
      files,
      patches: [
        {
          target: 'README.md',
          apply: (existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}${withEol(`\n${readmeSection(projectName)}`, eolOf(existing))}`;
          },
        },
      ],
    };
  },
};

/**
 * The assembly's project imports, sorted the way gofmt sorts them.
 * Under the modulith the facade's path is a prefix of the adapter's,
 * so it sorts first — the reverse of the flat layout, which is
 * exactly the kind of derivation a template must not attempt.
 */
function mainImports(layout: GoLayoutPaths): string {
  return [layout.importPath(layout.app('resthttp')), layout.importPath(layout.facade)]
    .sort()
    .map((p) => `\t"${p}"`)
    .join('\n');
}

/**
 * The adapter test's project imports, gofmt-sorted. It imports the
 * package under test and the domain it depends on, and which of the
 * two sorts first flips with the layout.
 */
function adapterTestImports(layout: GoLayoutPaths): string {
  return [layout.importPath(layout.app('resthttp')), layout.importPath(layout.domain)]
    .sort()
    .map((p) => `\t"${p}"`)
    .join('\n');
}
