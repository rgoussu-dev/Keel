/**
 * End-to-end test for the `ts-http` peer context —
 * `--module-layout=modulith --with-peer-context`.
 *
 * Not a grid cell: it is the suite that proves the peer-context
 * adapter family is additive on `ts-http` and, more to the point,
 * that the seam is **exercised** rather than merely present.
 *
 * The negative case is where this stack differs from Go and Rust, and
 * the suite is built to make the difference visible rather than to
 * paper over it. Two walls, two tools:
 *
 *   - the **aperture** is held by the `exports` map, so a deep import
 *     is a `TS2307` from tsc;
 *   - the **peer rule** is held by nothing tsc knows about. Greeting's
 *     facade legitimately publishes its contract face, so a gateway
 *     importing `@acme/greeting` whole typechecks perfectly. This
 *     asserts exactly that — a clean `tsc` and a red `depcruise` — so
 *     that "TypeScript's peer seam is a lint" is a fact this suite
 *     re-establishes rather than a claim in a doc.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  mkTempDir,
  runFails,
  runStep,
  scaffold,
  skipWebE2E,
} from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-ts-peer-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const GATEWAY = 'modules/guestbook/src/infra/greeting-gateway/index.ts';

const peer = (): Promise<void> =>
  scaffold(
    {
      stack: 'ts-http',
      projectName: 'walking-skeleton-e2e',
      buildSystem: 'npm',
      moduleLayout: 'modulith',
      withPeerContext: true,
    },
    cwd,
  );

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

describe.skipIf(skipWebE2E('npm'))('ts-http peer-context e2e', () => {
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

      // Emitted is not the same as loaded. An unimported TypeScript
      // module runs in nothing, so this import is the difference
      // between a bound context and an orphaned package.
      const main = await read('application/rest/src/main.ts');
      expect(main).toContain("import { createGuestbookHandler } from './guestbook.ts';");
      expect(main).toContain('createGuestbookHandler()');

      // Everything typechecks, lints, and every test passes —
      // including the assembly's wiring test, which drives the
      // cross-context call with no fakes anywhere.
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm run lint', 'npm', ['run', 'lint']);
      runStep(cwd, 'npm test', 'npm', ['test']);
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
        `import type { Greeting } from '@acme/greeting/src/domain/contract/index.ts';\nexport type Leaked = Greeting;\n${original}`,
      );
      expect(runFails(cwd, 'npm', ['run', 'typecheck'])).toContain('TS2307');

      // The peer rule is not. Greeting's facade publishes its contract
      // face, so this typechecks clean — and the emitted
      // dependency-cruiser rule is the only thing that objects. That
      // asymmetry is the honest state of TypeScript's peer seam, and
      // asserting both halves is what keeps the docs from drifting
      // into implying the compiler holds it.
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
