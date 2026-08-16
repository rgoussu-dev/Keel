/**
 * End-to-end test for `keel add module` on the Go modulith.
 *
 * Not a grid cell — same status as `modulith-go-peer-context`. What it
 * covers is the shape nothing else has ever built: **three** bounded
 * contexts, where the third reaches the second and the second reaches
 * the skeleton.
 *
 * Three is the number that matters. With two contexts the consumed one
 * is always `greeting`, whose facade constructor takes no arguments,
 * so its seam can be built inline — `greetingservice.New(greeting
 * .NewGreeter())`. An added context's may hold a gateway to a third,
 * so the only thing that knows how to build it is that context's own
 * `wire<Name>Service()` in the same `package main`. That branch is
 * unreachable at two contexts.
 *
 * **The alias hazard is asserted here rather than argued about.**
 * Every context spells its seam `package service`, so a file naming
 * two of them has two `service` identifiers and does not compile.
 * `ordering`'s wiring file names greeting's seam and its own, which is
 * two — at two contexts, not the three `goLayout`'s module doc
 * predicted. This reads the emitted import block and checks the alias
 * is on every one of them.
 *
 * The negative is `modulith-go-peer-context`'s, re-aimed at an added
 * context: Go's wall is stronger than Rust's, because the consumed
 * domain sits behind `internal/` and cannot be named at all.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addModule,
  E2E_TIMEOUT_MS,
  goRun,
  goRunFails,
  mkTempDir,
  scaffold,
  sharedGoHome,
  skipGoE2E,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await sharedGoHome();
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-go-add-module-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (...rel: readonly string[]): Promise<string> =>
  fs.readFile(path.join(cwd, ...rel), 'utf8');

/** The import specifiers of a Go file, comments stripped. */
function imports(source: string): readonly string[] {
  const block = /^import \(([\s\S]*?)^\)/m.exec(source)?.[1] ?? '';
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

/** greeting ← ordering ← shipping, plus a context consuming nothing. */
async function threeContexts(): Promise<void> {
  await scaffold({ stack: 'go-cli', projectName: 'skel', moduleLayout: 'modulith' }, cwd);
  await addModule('ordering', 'greeting', cwd);
  await addModule('shipping', 'ordering', cwd);
  await addModule('billing', null, cwd);
}

describe.skipIf(skipGoE2E)('go add-module e2e', () => {
  it(
    'builds three contexts, the third reaching the first through the second',
    async () => {
      await threeContexts();

      // The branch three contexts exists to reach: shipping consumes
      // an *added* context, so its seam arrives from that context's
      // own wiring function rather than being constructed here.
      const shipping = await read('cmd', 'cli', 'shipping.go');
      expect(shipping).toContain('wireOrderingService()');
      // …and the skeleton's still is constructed inline, because its
      // facade constructor takes no arguments.
      expect(await read('cmd', 'cli', 'ordering.go')).toContain(
        'greetingservice.New(greeting.NewGreeter())',
      );

      goRun(cwd, goHome, ['build', './...']);
      goRun(cwd, goHome, ['test', './...']);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'aliases every seam import, so two contexts in one file compile',
    async () => {
      await threeContexts();

      // ordering's wiring names greeting's seam and its own. Both end
      // in `/userside/service`, so both would bind the identifier
      // `service` — the collision the alias exists to prevent, and it
      // fires here at two contexts rather than the three the layout's
      // doc predicted.
      const ordering = await read('cmd', 'cli', 'ordering.go');
      const seams = imports(ordering).filter((spec) => spec.endsWith('/userside/service'));
      expect(seams).toHaveLength(2);
      expect(ordering).toContain('greetingservice "');
      expect(ordering).toContain('orderingservice "');

      // Go rejects an unused import outright, so the fact that this
      // builds is also the proof that no alias is decorative.
      goRun(cwd, goHome, ['vet', './...']);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts',
    async () => {
      await threeContexts();

      // The edge that defines the seam, read as imports rather than as
      // a substring: the gateway's doc comment names what it must not
      // import, so a substring check matches the prose documenting the
      // rule and fails a file that obeys it.
      const gateway = await read(
        'internal',
        'modules',
        'shipping',
        'infra',
        'orderinggateway',
        'gateway.go',
      );
      const specifiers = imports(gateway);
      expect(specifiers.some((s) => s.endsWith('/modules/ordering/userside/service'))).toBe(true);
      expect(specifiers.some((s) => s.includes('/modules/ordering/internal/'))).toBe(false);

      const file = path.join(
        cwd,
        'internal/modules/shipping/infra/orderinggateway/gateway.go'.replace(/\//g, path.sep),
      );
      const original = await fs.readFile(file, 'utf8');
      await fs.writeFile(
        file,
        original.replace(
          'import (',
          'import (\n\t_ "example.com/skel/internal/modules/ordering/internal/domain"',
        ),
      );

      expect(goRunFails(cwd, goHome, ['build', './...'])).toContain('not allowed');
    },
    E2E_TIMEOUT_MS,
  );
});
