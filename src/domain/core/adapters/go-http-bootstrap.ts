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
import type { Adapter } from '../../contract/composition.js';

export const GO_HTTP_BOOTSTRAP_ID = 'walking-skeleton/go-http-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/go-http-bootstrap/templates';

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
