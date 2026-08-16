/**
 * End-to-end test for the `web-components` peer context —
 * `--module-layout=modulith --with-peer-context`.
 *
 * Not a grid cell: it is the suite that proves the peer-context
 * adapter family is additive on this stack and, more to the point,
 * that the seam is **exercised** rather than merely present.
 *
 * Three things only the real toolchain can settle:
 *
 *   - **The cross-context call runs.** The assembly's wiring test
 *     drives it with no fakes anywhere, so the words the guestbook
 *     records are the ones greeting composed.
 *   - **Both elements upgrade on one page.** This is the assertion
 *     the tag rule exists for: two contexts, two registrations, one
 *     registry. A collision throws `NotSupportedError` on the second
 *     and aborts the rest of that bundle's registrations, so the page
 *     half-renders with nothing in any log anyone reads. A real
 *     browser is the only thing that sees it.
 *   - **The forbidden import fails** — and *which tool* fails is the
 *     point. The `exports` map is the compiler's; the peer rule is
 *     dependency-cruiser's, because greeting's facade legitimately
 *     publishes its contract face. Asserting a clean `tsc` beside a
 *     red `depcruise` keeps that honest.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
  cwd = await mkTempDir('keel-wc-peer-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const GATEWAY = 'modules/guestbook/src/infra/greeting-gateway/index.ts';

const peer = (): Promise<void> =>
  scaffold(
    {
      stack: 'web-components',
      projectName: 'walking-skeleton-e2e',
      buildSystem: 'npm',
      moduleLayout: 'modulith',
      withPeerContext: true,
    },
    cwd,
  );

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

describe.skipIf(skipWebE2E('npm'))('web-components peer-context e2e', () => {
  it(
    'scaffolds a second context that reaches the first only through its seam',
    async () => {
      await peer();

      // The edge that defines the seam. Read as import specifiers,
      // comments stripped: the gateway's doc comment names the
      // specifier it must *not* write, so a substring check matches
      // the prose documenting the rule and fails a file that obeys it.
      const code = (await read(GATEWAY)).replace(/\/\*[\s\S]*?\*\//g, '');
      const specifiers = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(specifiers).toContain('@acme/greeting/service');
      expect(specifiers).not.toContain('@acme/greeting');

      // Bound in all three places, and each one is load-bearing: the
      // ports are published before the element is defined, and the
      // element is on the page at all.
      const main = await read('application/web-app/src/main.ts');
      expect(main.indexOf('...createGuestbookPorts(greet, greetings)')).toBeLessThan(
        main.indexOf("document.addEventListener('context-request'"),
      );
      expect(main.indexOf('defineGuestbookElements();')).toBeGreaterThan(
        main.indexOf("document.addEventListener('context-request'"),
      );
      expect(await read('application/web-app/index.html')).toContain('<acme-guestbook-view>');

      // Typechecks, lints, and every test passes — including the
      // assembly's wiring test, which drives the cross-context call
      // with no fakes anywhere.
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
      runStep(cwd, 'npm test', 'npm', ['test']);
    },
    E2E_TIMEOUT_MS,
  );

  /**
   * Two contexts, two element registrations, one registry — which is
   * the case the `<scope>-<context>-<element>` tag rule exists for and
   * the first time anything has been able to exercise it. A collision
   * would leave one of these two empty.
   */
  it.skipIf(chromium === null)(
    'upgrades both contexts’ elements on one page',
    async () => {
      await peer();
      runStep(cwd, 'npm run build', 'npm', ['run', 'build']);
      const dom = await renderInChromium(path.join(cwd, 'application', 'web-app', 'dist'));

      expect(dom).toMatch(/<acme-greeting-view>[\s\S]*<form>/);
      expect(dom).toMatch(/<acme-guestbook-view>[\s\S]*<form>/);
      // Both asked for their ports and were answered: the emitted
      // element throws rather than rendering empty when nobody is
      // listening, so a rendered form is a provider that replied.
      expect(dom).toContain('Sign the guestbook');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall — and shows which tool holds it',
    async () => {
      await peer();
      const gateway = path.join(cwd, GATEWAY.replace(/\//g, path.sep));
      const original = await fs.readFile(gateway, 'utf8');

      // A deep import past the aperture is the compiler's to refuse.
      await fs.writeFile(
        gateway,
        `import type { Greeting } from '@acme/greeting/src/domain/contract/index';\nexport type Leaked = Greeting;\n${original}`,
      );
      expect(runFails(cwd, 'npm', ['run', 'typecheck'])).toContain('TS2307');

      // The peer rule is not. Greeting's facade publishes its contract
      // face, so this typechecks clean and only the emitted
      // dependency-cruiser rule objects. Asserting both halves is what
      // keeps the docs from drifting into implying tsc holds it.
      await fs.writeFile(
        gateway,
        `import type { Greeting } from '@acme/greeting';\nexport type Leaked = Greeting;\n${original}`,
      );
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      expect(runFails(cwd, 'npm', ['run', 'lint'])).toContain('peers-meet-at-the-service-seam');

      await fs.writeFile(gateway, original);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
    },
    E2E_TIMEOUT_MS,
  );
});
