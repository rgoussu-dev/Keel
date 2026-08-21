/**
 * `walking-skeleton/ts-cli-bootstrap` adapter — the CLI twin of
 * `ts-http-bootstrap`, completing the CLI/HTTP pairing every other
 * language family already has. It emits the same shared shell from
 * [`ts-bootstrap.ts`](./ts-bootstrap.js) (the binding-spec domain
 * trisection as packages, both module layouts, both package managers)
 * and swaps the deployment unit: an `application/cli` assembly whose
 * `main.ts` wires the registry mediator and hands `process.argv` to a
 * stream-mapping primary adapter — flags → greet command → `Result` →
 * stdout/stderr + exit code, no business logic.
 *
 * Covers the `entrypoint` dimension under `arch.cli`; the HTTP
 * sibling covers the same dimension under `arch.server-http`. The
 * no-build-step stance, the `exports`-map walls, and the
 * package-manager dial are documented once, on the shell module —
 * `erasableSyntaxOnly` matters doubly here, since the stack that runs
 * its sources directly rejects parameter properties and enums.
 */

import type { Adapter } from '../../contract/composition.js';
import {
  renderTsWorkspaceShell,
  TS_BOOTSTRAP_QUESTIONS,
  TS_HTTP_BOOTSTRAP_ID,
  TS_CLI_BOOTSTRAP_ID,
} from './ts-bootstrap.js';
import { tsEntrypointContribution } from './ts-shared-root.js';

export { TS_CLI_BOOTSTRAP_ID } from './ts-bootstrap.js';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-cli-bootstrap';

export const tsCliBootstrapAdapter: Adapter = {
  id: TS_CLI_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.cli'] },
  questions: TS_BOOTSTRAP_QUESTIONS,
  // A workspace carrying both entrypoints resolves both
  // bootstraps, and they declare the same two sticky questions:
  // without this the user is asked for the scope and the project
  // name twice, and two different answers leave the assembly
  // depending on a scope the context does not publish.
  sharesAnswersWith: [TS_HTTP_BOOTSTRAP_ID],
  async contribute(ctx) {
    const shell = await renderTsWorkspaceShell(ctx, TS_CLI_BOOTSTRAP_ID);
    const own = await ctx.templates.render(
      `${TEMPLATE_ROOT}/templates${shell.suffix}`,
      '',
      shell.vars,
    );
    return tsEntrypointContribution({
      arch: 'cli',
      projectName: shell.projectName,
      shell,
      own,
    });
  },
};
