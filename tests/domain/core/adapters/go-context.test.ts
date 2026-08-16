/**
 * Tests for the Go bounded-context adapter.
 *
 * The one worth reading is the alias group. Every context spells its
 * seam `package service`, so a file naming two of them does not
 * compile — and an added context, unlike the `--with-peer-context`
 * one, publishes a seam of its own. That brings the collision forward
 * from three contexts to two, which is why it is asserted here rather
 * than left to the e2e.
 *
 * Whether the result builds is `tests/e2e/add-module-go.test.ts`,
 * which runs `go build` over three added contexts and proves the wall
 * with a real `use of internal package … not allowed`.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-go-context-'));
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
        stack: 'go-cli',
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

describe('the Go added context', () => {
  it('puts the domain behind the context internal/, which is the wall', async () => {
    await scaffold();
    await addModule('ordering');

    expect(
      await fs.pathExists(path.join(cwd, 'internal/modules/ordering/internal/domain/domain.go')),
    ).toBe(true);
  });

  it('publishes a seam, which the peer context does not', async () => {
    await scaffold();
    await addModule('ordering');

    expect(await read('internal/modules/ordering/userside/service/service.go')).toMatch(
      /type OrderingService interface/,
    );
  });

  it('names the wiring file after the context, so two of them cannot collide', async () => {
    await scaffold();
    await addModule('ordering');
    await addModule('shipping');

    expect(await fs.pathExists(path.join(cwd, 'cmd/cli/ordering.go'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'cmd/cli/shipping.go'))).toBe(true);
  });

  it('emits a Go test file per context, not a literal __module___test.go', async () => {
    await scaffold();
    await addModule('ordering');

    expect(await fs.pathExists(path.join(cwd, 'cmd/cli/ordering_test.go'))).toBe(true);
  });

  describe('the seam alias', () => {
    /**
     * The hazard `goLayout`'s module doc has warned about since the
     * dial landed, arriving one context earlier than it expected: the
     * wiring names this context's own seam *and* the consumed one,
     * both `package service`.
     */
    it('aliases both seams when one file reaches two of them', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      const wiring = await read('cmd/cli/ordering.go');

      expect(wiring).toMatch(/orderingservice "[^"]*\/ordering\/userside\/service"/);
      expect(wiring).toMatch(/greetingservice "[^"]*\/greeting\/userside\/service"/);
    });

    it('aliases the lone seam too, so the rule never needs applying by hand', async () => {
      await scaffold();
      await addModule('billing');

      expect(await read('cmd/cli/billing.go')).toMatch(
        /billingservice "[^"]*\/billing\/userside\/service"/,
      );
    });
  });

  describe('the consumed seam', () => {
    /**
     * The skeleton's facade factory is an agent noun — `NewGreeter`,
     * not `NewGreeting` — so it is the one name no rule derives from
     * the context string.
     */
    it('builds the skeleton seam through its own agent-noun factory', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');

      expect(await read('cmd/cli/ordering.go')).toMatch(
        /greetingservice\.New\(greeting\.NewGreeter\(\)\)/,
      );
    });

    it('takes an added context seam from that context wiring instead', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');

      expect(await read('cmd/cli/shipping.go')).toMatch(/wireOrderingService\(\)/);
    });

    /**
     * Go treats an unused import as a compile error, so the wiring
     * that consumes an added context must name neither its seam nor
     * its facade — the built seam arrives from the sibling wiring
     * function and no package name is ever written.
     */
    it('imports nothing of an added context it consumes', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');
      const wiring = await read('cmd/cli/shipping.go');

      const importBlock = /import \(([\s\S]*?)\n\)/.exec(wiring)?.[1] ?? '';
      expect(importBlock).not.toMatch(/modules\/ordering/);
    });
  });

  it('declares the gateway edge on the consumed seam and nothing else of it', async () => {
    await scaffold();
    await addModule('ordering', 'greeting');
    const gateway = await read('internal/modules/ordering/infra/greetinggateway/gateway.go');

    expect(gateway).toMatch(/greeting\/userside\/service/);
    expect(gateway).not.toMatch(/greeting\/internal\/domain/);
  });

  it('drops the dash from the gateway package, which Go clauses forbid', async () => {
    await scaffold();
    await addModule('ordering', 'greeting');

    expect(await read('internal/modules/ordering/infra/greetinggateway/gateway.go')).toMatch(
      /^package greetinggateway$/m,
    );
  });
});
