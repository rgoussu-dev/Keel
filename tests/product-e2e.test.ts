/**
 * The product e2e harness's own logic, pinned in `verify`.
 *
 * `tests/support/product-e2e.ts` fakes a deferred action by the scope
 * that queues it, and checks that each image a product's `compose.yaml`
 * builds has a `Dockerfile`. Both rot silently: a fake keyed on the
 * wrong scope runs the real install and the suite still passes, only
 * slower, and a compose check that cannot go red passes the very
 * product it is there to stop. The suites that call them run behind the
 * e2e opt-in, so neither would show on a PR.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeferredAction } from '../src/domain/contract/composition.js';
import { FakeLogger } from '../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../src/infrastructure/process/fake.js';
import {
  expectComposeBuildContexts,
  stubInScopes,
  type FakesByScope,
} from './support/product-e2e.js';

const INSTALL = 'walking-skeleton/npm-install';

describe('stubInScopes', () => {
  const root = path.join(os.tmpdir(), 'keel-product');

  /** Runs `ids` queued in `scope` through the stub, and returns those that really ran. */
  const ranIn = async (
    fakes: FakesByScope,
    scope: string,
    ids: readonly string[],
  ): Promise<readonly string[]> => {
    const ran: string[] = [];
    await stubInScopes(
      root,
      fakes,
    )({
      actions: ids.map(
        (id): DeferredAction => ({
          id,
          description: id,
          run: () => {
            ran.push(id);
            return Promise.resolve();
          },
        }),
      ),
      cwd: path.join(root, scope),
      logger: new FakeLogger(),
      processes: new FakeProcessRunner(),
      dryRun: false,
    });
    return ran;
  };

  it.each([
    ['in the scope that names it', { frontend: [INSTALL] }, 'frontend', [INSTALL], []],
    ['nowhere else', { frontend: [INSTALL] }, 'backend', [INSTALL], [INSTALL]],
    ['reading `.` as the product root', { '.': [INSTALL] }, '.', [INSTALL], []],
    [
      'only the id it names, not the rest of that scope',
      { '.': ['vcs/git-init'] },
      '.',
      ['vcs/git-init', 'vcs/commit-conventions'],
      ['vcs/commit-conventions'],
    ],
  ] as const)('fakes an id %s', async (_, fakes, scope, ids, ran) => {
    expect(await ranIn(fakes, scope, ids)).toEqual(ran);
  });
});

describe('expectComposeBuildContexts', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-product-compose-'));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  const compose = (yaml: string): Promise<void> =>
    fs.writeFile(path.join(root, 'compose.yaml'), yaml);

  it('holds when each image it builds finds its Dockerfile, in either form', async () => {
    await compose(
      [
        'services:',
        '  backend:',
        '    build: ./backend',
        '  frontend-assets:',
        '    build:',
        '      context: ./frontend',
        '      dockerfile: Assets.Dockerfile',
        '  frontend:',
        '    image: nginx:alpine',
      ].join('\n'),
    );
    await fs.outputFile(path.join(root, 'backend', 'Dockerfile'), 'FROM scratch\n');
    await fs.outputFile(path.join(root, 'frontend', 'Assets.Dockerfile'), 'FROM scratch\n');

    await expectComposeBuildContexts(root);
  });

  it('fails naming the service whose context has no Dockerfile', async () => {
    await compose('services:\n  backend:\n    build: ./backend\n');
    await fs.ensureDir(path.join(root, 'backend'));

    await expect(expectComposeBuildContexts(root)).rejects.toThrow(
      'backend builds ./backend with no Dockerfile there',
    );
  });

  it('fails a compose.yaml that builds nothing', async () => {
    await compose('services:\n  frontend:\n    image: nginx:alpine\n');

    await expect(expectComposeBuildContexts(root)).rejects.toThrow(
      'compose.yaml builds no service',
    );
  });
});
