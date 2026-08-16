/**
 * End-to-end test for `keel add module` on the `ts-http` modulith.
 *
 * Not a grid cell — same status as `modulith-ts-peer-context`. What it
 * covers is the shape nothing else has ever built: **three** bounded
 * contexts, where the third reaches the second and the second reaches
 * the skeleton.
 *
 * Three is the number that matters. With two contexts the consumed one
 * is always `greeting`, whose seam is built from a handler that takes
 * no dependencies; an added context's handler may hold a gateway to a
 * third, so its seam can only come from its own wiring module. That
 * branch is unreachable at two contexts.
 *
 * **The peer rule gets its first real test here.** The emitted
 * `peers-meet-at-the-service-seam` dependency-cruiser rule is written
 * with a `pathNot` backreference so a context may import its own
 * package freely; whether that backreference distinguishes *two added*
 * contexts from a context and itself had never been exercised — with
 * two contexts, one side of every peer edge is `guestbook` or
 * `greeting`. At four it is `shipping` importing `@acme/ordering`, and
 * this suite asserts the rule fires on exactly that.
 *
 * The two walls and the two tools are unchanged from the peer suite:
 * the aperture is `exports`, so a deep import is `TS2307` from tsc;
 * the peer rule is held by nothing tsc knows about, so it is a red
 * `depcruise` over a clean typecheck.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModule,
  E2E_TIMEOUT_MS,
  mkTempDir,
  runFails,
  runStep,
  scaffold,
  skipWebE2E,
} from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-ts-add-module-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const GATEWAY = 'modules/shipping/src/infra/ordering-gateway/index.ts';

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

/** greeting ← ordering ← shipping, plus a context consuming nothing. */
async function threeContexts(): Promise<void> {
  await scaffold(
    {
      stack: 'ts-http',
      projectName: 'walking-skeleton-e2e',
      buildSystem: 'npm',
      moduleLayout: 'modulith',
    },
    cwd,
  );
  await addModule('ordering', 'greeting', cwd);
  await addModule('shipping', 'ordering', cwd);
  await addModule('billing', null, cwd);
}

describe.skipIf(skipWebE2E('npm'))('ts-http add-module e2e', () => {
  it(
    'builds three contexts, the third reaching the first through the second',
    async () => {
      await threeContexts();

      // The branch three contexts exists to reach: shipping consumes
      // an *added* context, so its seam arrives from that context's
      // own wiring module rather than being constructed here.
      const shipping = await read('application/rest/src/shipping.ts');
      expect(shipping).toContain('createOrderingContextService()');

      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
      runStep(cwd, 'npm test', 'npm', ['test']);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts — and shows which tool holds it',
    async () => {
      await threeContexts();

      // The edge that defines the seam. Read as import specifiers,
      // comments stripped: the gateway's doc comment names the
      // specifier it must *not* write.
      const code = (await read(GATEWAY)).replace(/\/\*[\s\S]*?\*\//g, '');
      const specifiers = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(specifiers).toContain('@acme/ordering/service');
      expect(specifiers).not.toContain('@acme/ordering');

      const gateway = path.join(cwd, GATEWAY.replace(/\//g, path.sep));
      const original = await fs.readFile(gateway, 'utf8');

      // A deep import past the aperture is the compiler's to refuse.
      await fs.writeFile(
        gateway,
        `import type { OrderingResult } from '@acme/ordering/src/domain/contract/index.ts';\nexport type Leaked = OrderingResult;\n${original}`,
      );
      expect(runFails(cwd, 'npm', ['run', 'typecheck'])).toContain('TS2307');

      // The peer rule is not. Ordering's facade publishes its contract
      // face, so this typechecks clean — and the emitted
      // dependency-cruiser rule is the only thing that objects. This
      // is the first time that rule's `pathNot` backreference has been
      // asked to tell two *added* contexts apart.
      await fs.writeFile(
        gateway,
        `import type { OrderingResult } from '@acme/ordering';\nexport type Leaked = OrderingResult;\n${original}`,
      );
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      expect(runFails(cwd, 'npm', ['run', 'lint'])).toContain('peers-meet-at-the-service-seam');

      await fs.writeFile(gateway, original);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
    },
    E2E_TIMEOUT_MS,
  );
});
