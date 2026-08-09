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
import type { Adapter } from '../../contract/composition.js';

export const GO_CLI_BOOTSTRAP_ID = 'walking-skeleton/go-cli-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/go-cli-bootstrap/templates';

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
    const files = await ctx.templates.render(TEMPLATE_ID, '', { modulePath, projectName });
    return {
      files,
      patches: [
        {
          target: 'README.md',
          apply: (existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(projectName)}`;
          },
        },
      ],
    };
  },
};
