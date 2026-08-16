/**
 * End-to-end test for `keel add module` on the `web-components`
 * modulith.
 *
 * Not a grid cell — same status as `modulith-wc-peer-context`. What it
 * covers is the shape nothing else has ever built: **three** bounded
 * contexts, where the third reaches the second and the second reaches
 * the skeleton.
 *
 * Three is what makes two of these assertions possible at all:
 *
 *   - **The wiring order is a real constraint here.** Each context's
 *     ports must be published before any element is defined, and a
 *     context consuming an added peer must be wired *after* it —
 *     `createShippingWiring(ordering.service)` cannot run before
 *     `createOrderingWiring(…)`. With two contexts the consumed one is
 *     always the skeleton, whose ports come from the bootstrap, so
 *     nothing orders anything.
 *   - **Three registrations, one registry.** The
 *     `<scope>-<context>-<element>` tag rule exists so contexts do not
 *     collide, and a collision throws `NotSupportedError` on the
 *     second registration and aborts the rest of that bundle's — the
 *     page half-renders with nothing in any log anyone reads. A real
 *     browser is the only thing that sees it, and a third context is
 *     more of the pressure the rule was written for.
 *
 * The negative is `modulith-wc-peer-context`'s, re-aimed between two
 * *added* contexts: the aperture is the compiler's to hold, the peer
 * rule is dependency-cruiser's.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModule,
  chromium,
  E2E_TIMEOUT_MS,
  mkTempDir,
  renderInChromium,
  runFails,
  runStep,
  scaffold,
  skipWebE2E,
} from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-wc-add-module-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const GATEWAY = 'modules/shipping/src/infra/ordering-gateway/index.ts';

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

/** greeting ← ordering ← shipping. */
async function threeContexts(): Promise<void> {
  await scaffold(
    {
      stack: 'web-components',
      projectName: 'walking-skeleton-e2e',
      buildSystem: 'npm',
      moduleLayout: 'modulith',
    },
    cwd,
  );
  await addModule('ordering', 'greeting', cwd);
  await addModule('shipping', 'ordering', cwd);
}

describe.skipIf(skipWebE2E('npm'))('web-components add-module e2e', () => {
  it(
    'builds three contexts, the third reaching the first through the second',
    async () => {
      await threeContexts();

      const main = await read('application/web-app/src/main.ts');
      // The branch three contexts exists to reach: shipping consumes
      // an *added* context, so it is handed that context's own seam
      // rather than a port from the bootstrap.
      expect(main).toContain('createShippingWiring(ordering.service)');
      // And the order is real: the consumed context must be wired
      // first, every context's ports published before any element is
      // defined.
      expect(main.indexOf('createOrderingWiring(')).toBeLessThan(
        main.indexOf('createShippingWiring('),
      );
      expect(main.indexOf('...shipping.ports')).toBeLessThan(
        main.indexOf("document.addEventListener('context-request'"),
      );
      expect(main.indexOf('defineShippingElements();')).toBeGreaterThan(
        main.indexOf("document.addEventListener('context-request'"),
      );

      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
      runStep(cwd, 'npm test', 'npm', ['test']);
    },
    E2E_TIMEOUT_MS,
  );

  it.skipIf(chromium === null)(
    'upgrades all three contexts’ elements on one page',
    async () => {
      await threeContexts();
      runStep(cwd, 'npm run build', 'npm', ['run', 'build']);
      const dom = await renderInChromium(path.join(cwd, 'application', 'web-app', 'dist'));

      // The emitted element throws rather than rendering empty when
      // nobody answers its context request, so a rendered form is a
      // provider that replied.
      for (const tag of ['acme-greeting-view', 'acme-ordering-view', 'acme-shipping-view']) {
        expect(dom).toMatch(new RegExp(`<${tag}>[\\s\\S]*<form>`));
      }
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
        `import type { OrderingRecord } from '@acme/ordering/src/domain/contract/index';\nexport type Leaked = OrderingRecord;\n${original}`,
      );
      expect(runFails(cwd, 'npm', ['run', 'typecheck'])).toContain('TS2307');

      // The peer rule is not — and this is the first time its
      // `pathNot` backreference has been asked to tell two *added*
      // contexts apart.
      await fs.writeFile(
        gateway,
        `import type { OrderingRecord } from '@acme/ordering';\nexport type Leaked = OrderingRecord;\n${original}`,
      );
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      expect(runFails(cwd, 'npm', ['run', 'lint'])).toContain('peers-meet-at-the-service-seam');

      await fs.writeFile(gateway, original);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
    },
    E2E_TIMEOUT_MS,
  );
});
