/**
 * `walking-skeleton/ts-http-bootstrap` adapter — emits a runnable
 * TypeScript HTTP service as a Node workspace: the shared shell from
 * [`ts-bootstrap.ts`](./ts-bootstrap.js) (the binding-spec domain
 * trisection as packages) plus this adapter's own deployment unit —
 * an `application/rest` `node:http` server whose `main.ts` is the
 * assembly point, wiring the registry mediator per the binding spec's
 * TypeScript-backend stance (the same shape keel itself is built on).
 *
 * The CLI twin is `ts-cli-bootstrap`; both cover the `entrypoint`
 * dimension and differ only in the deployment unit they layer onto
 * the shell. The no-build-step stance, the `exports`-map walls, and
 * the package-manager dial are documented once, on the shell module.
 */

import type { Adapter } from '../../contract/composition.js';
import {
  renderTsWorkspaceShell,
  TS_BOOTSTRAP_QUESTIONS,
  TS_CLI_BOOTSTRAP_ID,
  TS_HTTP_BOOTSTRAP_ID,
} from './ts-bootstrap.js';
import { tsEntrypointContribution } from './ts-shared-root.js';

export { TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-http-bootstrap';

export const tsHttpBootstrapAdapter: Adapter = {
  id: TS_HTTP_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  questions: TS_BOOTSTRAP_QUESTIONS,
  // A workspace carrying both entrypoints resolves both
  // bootstraps, and they declare the same two sticky questions:
  // without this the user is asked for the scope and the project
  // name twice, and two different answers leave the assembly
  // depending on a scope the context does not publish.
  sharesAnswersWith: [TS_CLI_BOOTSTRAP_ID],
  async contribute(ctx) {
    const shell = await renderTsWorkspaceShell(ctx, TS_HTTP_BOOTSTRAP_ID);
    const own = await ctx.templates.render(
      `${TEMPLATE_ROOT}/templates${shell.suffix}`,
      '',
      shell.vars,
    );
    return tsEntrypointContribution({
      arch: 'rest',
      projectName: shell.projectName,
      shell,
      own,
    });
  },
};
