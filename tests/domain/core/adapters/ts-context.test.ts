/**
 * Tests for the `ts-http` bounded-context adapter.
 *
 * Two things here are worth more than the rest. The mediator patch has
 * to survive being run once per context, which is the property
 * `ts-peer-context`'s anchored line replacement does not have; and the
 * skeleton's names — `greet`, `createGreetHandler` — are agent verbs
 * that no rule derives from the string "greeting", so a gateway
 * reaching it and a gateway reaching an added context spell their call
 * differently.
 *
 * Whether the result typechecks, lints and tests is
 * `tests/e2e/add-module-ts-http-*.test.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { addModuleCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-context-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function scaffold(stack: 'ts-cli' | 'ts-http' = 'ts-http'): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: {},
        interactive: false,
        dryRun: false,
        moduleLayout: 'modulith',
        withPeerContext: false,
      }),
    ),
  );
}

async function addModule(module: string, consumes?: string): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      addModuleCommand({
        cwd,
        module,
        ...(consumes === undefined ? {} : { consumes }),
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
}

const read = (rel: string): Promise<string> => fs.readFile(path.join(cwd, rel), 'utf8');

describe('the ts-http added context', () => {
  it('publishes ./service, which the peer context does not', async () => {
    await scaffold();
    await addModule('ordering');
    const manifest = JSON.parse(await read('modules/ordering/package.json')) as {
      exports: Record<string, string>;
    };

    expect(manifest.exports['./service']).toBe('./src/service.ts');
  });

  it('emits no gateway directory when nothing was consumed', async () => {
    await scaffold();
    await addModule('billing');

    // The bug a shared render root would cause: an unsubstituted
    // `__consumes__` token lands as `src/infra/-gateway/`.
    expect(await fs.pathExists(path.join(cwd, 'modules/billing/src/infra'))).toBe(false);
  });

  describe('the mediator patch', () => {
    /**
     * `ts-peer-context` replaces the whole one-entry mediator line
     * with a two-entry version. Run once per context that finds no
     * match the second time, so this one splices instead.
     */
    it('accumulates one entry per context rather than replacing the line', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const main = await read('application/rest/src/main.ts');

      expect(main).toMatch(/createOrderingContextHandler\(\)/);
      expect(main).toMatch(/createShippingContextHandler\(\)/);
      expect(main).toMatch(/createGreetHandler\(\)/);
    });

    it('imports each context wiring module, without which nothing loads it', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const main = await read('application/rest/src/main.ts');

      expect(main).toMatch(/import \{ createOrderingContextHandler \} from '\.\/ordering\.ts';/);
      expect(main).toMatch(/import \{ createShippingContextHandler \} from '\.\/shipping\.ts';/);
    });

    it('declares each context on the assembly manifest exactly once', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');
      const manifest = await read('application/rest/package.json');

      expect(manifest.match(/"@acme\/greeting":/g)).toHaveLength(1);
      expect(manifest.match(/"@acme\/ordering":/g)).toHaveLength(1);
    });
  });

  describe('the consumed seam', () => {
    /**
     * The skeleton's seam method is `greet` and its handler factory
     * `createGreetHandler` — agent verbs, and the one pair of names no
     * rule produces from "greeting".
     */
    it('calls the skeleton by its agent-verb names', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');

      expect(await read('modules/ordering/src/infra/greeting-gateway/index.ts')).toMatch(
        /greeting\.greet\(subject\)/,
      );
      expect(await read('application/rest/src/ordering.ts')).toMatch(/createGreetHandler\(\)/);
    });

    it('calls an added context by the derived <name>For', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');

      expect(await read('modules/shipping/src/infra/ordering-gateway/index.ts')).toMatch(
        /ordering\.orderingFor\(subject\)/,
      );
    });

    it('takes an added context seam from that context wiring module', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');
      const wiring = await read('application/rest/src/shipping.ts');

      expect(wiring).toMatch(/import \{ createOrderingContextService \} from '\.\/ordering\.ts';/);
      expect(wiring).toMatch(/createOrderingContextService\(\)/);
    });
  });

  it('imports only the consumed seam entry point in the gateway', async () => {
    await scaffold();
    await addModule('ordering', 'greeting');
    const gateway = await read('modules/ordering/src/infra/greeting-gateway/index.ts');

    expect(gateway).toMatch(/from '@acme\/greeting\/service'/);
    expect(gateway).not.toMatch(/from '@acme\/greeting'/);
  });
});

describe('the ts-cli added context', () => {
  /**
   * The adapter names no assembly path: `tsAssemblies` derives the
   * wiring targets from the arch tags, so on the CLI twin the same
   * context lands in `application/cli` — with no `application/rest`
   * anywhere for the patches to have missed.
   */
  it('wires the context into the CLI assembly', async () => {
    await scaffold('ts-cli');
    await addModule('ordering', 'greeting');

    const main = await read('application/cli/src/main.ts');
    expect(main).toMatch(/import \{ createOrderingContextHandler \} from '\.\/ordering\.ts';/);
    expect(main).toMatch(/createOrderingContextHandler\(\)/);

    const manifest = await read('application/cli/package.json');
    expect(manifest.match(/"@acme\/ordering":/g)).toHaveLength(1);
    expect(manifest.match(/"@acme\/greeting":/g)).toHaveLength(1);

    expect(await read('application/cli/src/ordering.ts')).toMatch(/createGreetHandler\(\)/);
    expect(await fs.pathExists(path.join(cwd, 'application/rest'))).toBe(false);
  });
});
