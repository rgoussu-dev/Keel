/**
 * Tests for the `web-components` bounded-context adapter.
 *
 * The two spellings no compiler checks get the most attention here,
 * because they are the two that fail silently: a duplicate element tag
 * renders an unknown element as an empty inline box with every build
 * green, and a duplicate context key raises `NotSupportedError` from
 * `createContext`, which aborts the rest of that bundle's
 * registrations and leaves a half-rendered page.
 *
 * Whether the result typechecks, tests, lints and builds is
 * `tests/e2e/add-module-web-components-*.test.ts`.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wc-context-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function scaffold(): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'web-components',
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

describe('the web-components added context', () => {
  describe('the two spellings no compiler checks', () => {
    it('puts the context in the element tag, so two contexts cannot collide', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');

      expect(await read('modules/ordering/src/element-tags.ts')).toMatch(/'acme-ordering-view'/);
      expect(await read('modules/shipping/src/element-tags.ts')).toMatch(/'acme-shipping-view'/);
    });

    /**
     * A duplicate key is worse than a duplicate tag: `createContext`
     * raises `NotSupportedError`, which aborts the rest of that
     * bundle's registrations rather than degrading one element.
     */
    it('puts the context in every context key too', async () => {
      await scaffold();
      await addModule('ordering');
      const keys = await read('modules/ordering/src/context-keys.ts');

      expect(keys).toMatch(/'acme\.ordering\.ordering'/);
      expect(keys).toMatch(/'acme\.ordering\.ordering-records'/);
    });

    it('registers each context view on the page', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const markup = await read('application/web-app/index.html');

      expect(markup).toMatch(/<acme-ordering-view><\/acme-ordering-view>/);
      expect(markup).toMatch(/<acme-shipping-view><\/acme-shipping-view>/);
    });
  });

  it('publishes ./service beside ./elements, which the peer context does not', async () => {
    await scaffold();
    await addModule('ordering');
    const manifest = JSON.parse(await read('modules/ordering/package.json')) as {
      exports: Record<string, string>;
    };

    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './elements', './service']);
  });

  describe('the assembly patch', () => {
    /**
     * The import block is where this went wrong first: `main.ts` opens
     * with a doc comment, so inserting after the first line put the
     * imports inside it — inert, and reported as TS2304 at the use.
     */
    it('puts the wiring imports outside the leading doc comment', async () => {
      await scaffold();
      await addModule('ordering');
      const main = await read('application/web-app/src/main.ts');

      const wiringImport = main.indexOf('import { createOrderingWiring }');
      const docClose = main.indexOf('*/');
      expect(wiringImport).toBeGreaterThan(docClose);
    });

    it('accumulates one ports entry per context rather than replacing the map', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const main = await read('application/web-app/src/main.ts');

      expect(main).toMatch(/\.\.\.ordering\.ports,/);
      expect(main).toMatch(/\.\.\.shipping\.ports,/);
      expect(main).toMatch(/\[greetContext, greet\],/);
    });

    /**
     * Defining an element upgrades parsed markup and fires
     * `connectedCallback` synchronously, so a registration above the
     * `context-request` listener would have the view ask for ports
     * nobody is answering yet.
     */
    it('registers elements after the context provider is listening', async () => {
      await scaffold();
      await addModule('ordering');
      const main = await read('application/web-app/src/main.ts');

      expect(main.indexOf('defineOrderingElements();')).toBeGreaterThan(
        main.indexOf("document.addEventListener('context-request'"),
      );
    });

    it('declares each context on the app manifest exactly once', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const manifest = await read('application/web-app/package.json');

      expect(manifest.match(/"@acme\/ordering":/g)).toHaveLength(1);
      expect(manifest.match(/"vitest":/g)).toHaveLength(1);
    });
  });

  describe('the consumed seam', () => {
    it('takes the skeleton by its two assembled ports', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');

      expect(await read('application/web-app/src/main.ts')).toMatch(
        /createOrderingWiring\(greet, greetings\)/,
      );
    });

    it('takes an added context by the seam its wiring already built', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');

      expect(await read('application/web-app/src/main.ts')).toMatch(
        /createShippingWiring\(ordering\.service\)/,
      );
    });

    it('calls the skeleton by its agent-verb seam method', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');

      expect(await read('modules/ordering/src/infra/greeting-gateway/index.ts')).toMatch(
        /greeting\.greet\(subject\)/,
      );
    });
  });

  it('emits no gateway directory when nothing was consumed', async () => {
    await scaffold();
    await addModule('billing');

    expect(await fs.pathExists(path.join(cwd, 'modules/billing/src/infra'))).toBe(false);
  });
});
