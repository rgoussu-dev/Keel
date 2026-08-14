/**
 * `walking-skeleton/go-cli-bootstrap` adapter — layers the CLI
 * deployment unit onto the Go skeleton: `cmd/cli` (the assembly
 * point, wiring the hexagon by hand) and `internal/app/cli` (the
 * primary adapter mapping flags → greet command → driving port →
 * streams + exit code, with a fake-backed adapter test). Appends the
 * unit's build-and-run instructions to the README.
 *
 * Covers the `entrypoint` dimension under `arch.cli`. The HTTP
 * sibling covers the same dimension under `arch.server-http`; the
 * resolver picks whichever predicates match, and a project tagged
 * with both ships both deployment units — the house Go reference
 * expects one `cmd/` directory per primary adapter.
 */

import { GO_BOOTSTRAP_ID, goBootstrapAnswers } from './go-bootstrap.js';
import { goLayout, goTemplateVars, type GoLayoutPaths } from './go-module-layout.js';
import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';

export const GO_CLI_BOOTSTRAP_ID = 'walking-skeleton/go-cli-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/go-cli-bootstrap/templates';

const README_MARKER = '\n### cli\n';

const readmeSection = (projectName: string): string =>
  `${README_MARKER}
\`\`\`sh
go build -o bin/${projectName} ./cmd/cli
./bin/${projectName} --name World
\`\`\`
`;

export const goCliBootstrapAdapter: Adapter = {
  id: GO_CLI_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.go', 'arch.cli'] },
  after: [GO_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { modulePath, projectName } = goBootstrapAnswers(ctx.manifest, GO_CLI_BOOTSTRAP_ID);
    const layout = goLayout(ctx.manifest.tags, modulePath);
    const vars = { modulePath, projectName, ...goTemplateVars(layout) };
    const [main, adapter] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/main`, '', {
        ...vars,
        projectImports: mainImports(layout),
      }),
      ctx.templates.render(`${TEMPLATE_ROOT}/adapter`, layout.app('cli'), {
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
  return [layout.importPath(layout.app('cli')), layout.importPath(layout.facade)]
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
  return [layout.importPath(layout.app('cli')), layout.importPath(layout.domain)]
    .sort()
    .map((p) => `\t"${p}"`)
    .join('\n');
}
