/**
 * Integration test for `keel add module <name>` — the front door.
 *
 * Every case here is a *refusal*, and that is the point of the file.
 * A bounded-context adapter declares `covers: []`, so the resolver's
 * uncovered-dimension hard-fail cannot catch a project no adapter
 * serves: without these gates the command exits 0 having written
 * nothing, which is the bug I.6 found behind `--with-peer-context`.
 * What the emitted context *contains* is asserted per family
 * alongside that family's adapter; what belongs here is that nothing
 * is emitted in silence.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addModuleCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { expectErr, installMediator } from '../../../support/factory.js';

/**
 * Every case here refuses before a file is written, so no deferred
 * action is part of what is under test — and running the real ones
 * would make the composite case a `npm install` per assertion.
 */
const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-module-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Scaffolds a project to add a context to. */
async function scaffold(options: {
  stack?: string;
  moduleLayout?: string;
  withPeerContext?: boolean;
}): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  const result = await mediator.dispatch(
    newProjectCommand({
      cwd,
      stack: options.stack ?? 'rust-cli',
      answers: {},
      interactive: false,
      dryRun: false,
      ...(options.moduleLayout === undefined ? {} : { moduleLayout: options.moduleLayout }),
      withPeerContext: options.withPeerContext ?? false,
    }),
  );
  if (!result.ok) throw new Error(`scaffold failed: ${result.error.message}`);
}

/** Dispatches an add-module against the scaffolded project. */
function addModule(module: string, consumes?: string) {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  return mediator.dispatch(
    addModuleCommand({
      cwd,
      module,
      ...(consumes === undefined ? {} : { consumes }),
      answers: {},
      interactive: false,
      dryRun: true,
    }),
  );
}

describe('keel add module front door', () => {
  it('rejects a name that is not a lowercase word, before touching the project', async () => {
    const error = expectErr(await addModule('Order-Taking'));
    expect(error.code).toBe('keel.invalid-module-name');
  });

  it('rejects an uninitialised directory, naming the command that would fix it', async () => {
    const error = expectErr(await addModule('ordering'));
    expect(error.code).toBe('keel.not-initialised');
    expect(error.message).toMatch(/--module-layout=modulith/);
  });

  /**
   * The one refusal here that is a declaration rather than a branch,
   * so it is asserted the way every other violated rule is: the
   * shared code, the rule's own sentence, and the evidence naming the
   * tag that matched. `canAddModule` filters on the same declaration
   * — see the project-status suite.
   */
  it('rejects the flat layout, naming the rule that says so', async () => {
    await scaffold({ moduleLayout: 'basic' });
    const error = expectErr(await addModule('ordering'));
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toMatch(/needs the modulith layout/);
    expect(error.message).toMatch(/--module-layout=modulith/);
    expect(error.message).toMatch(/bounded-context\/context-needs-modulith/);
    expect(error.message).toMatch(/modules\.context/);
  });

  it('rejects a composite product root, pointing at the service directory', async () => {
    await scaffold({ stack: 'fullstack-rust' });
    const error = expectErr(await addModule('ordering'));
    expect(error.code).toBe('keel.invalid-module');
    expect(error.message).toMatch(/inside the service directory/);
  });

  it('rejects the skeleton context by name, rather than colliding on disk', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const error = expectErr(await addModule('greeting'));
    expect(error.code).toBe('keel.invalid-module');
    expect(error.message).toMatch(/already has a bounded context named 'greeting'/);
  });

  it('rejects the peer context by name too, and says where it came from', async () => {
    await scaffold({ moduleLayout: 'modulith', withPeerContext: true });
    const error = expectErr(await addModule('guestbook'));
    expect(error.message).toMatch(/--with-peer-context scaffolded/);
  });

  describe('--consumes', () => {
    it('rejects a context that does not exist, listing the ones that do', async () => {
      await scaffold({ moduleLayout: 'modulith' });
      const error = expectErr(await addModule('ordering', 'inventory'));
      expect(error.message).toMatch(/no such bounded context/);
      expect(error.message).toMatch(/greeting/);
    });

    it('rejects the context being added — a peer is not oneself', async () => {
      await scaffold({ moduleLayout: 'modulith' });
      const error = expectErr(await addModule('ordering', 'ordering'));
      expect(error.message).toMatch(/names the context being added/);
    });

    /**
     * The check the `seam` field on the manifest record exists for.
     * `guestbook` is a real context and an impossible target: it is a
     * pure consumer, publishing no user-side/service of its own, so a
     * gateway would bind to a package that is not there.
     */
    it('rejects a context that publishes no seam, and names the ones that do', async () => {
      await scaffold({ moduleLayout: 'modulith', withPeerContext: true });
      const error = expectErr(await addModule('ordering', 'guestbook'));
      expect(error.message).toMatch(/publishes no user-side\/service seam/);
      expect(error.message).toMatch(/consumed here are greeting/);
    });
  });
});

/**
 * The gate that has no counterpart anywhere else in keel.
 *
 * A bounded-context adapter contributes a *context*, not a capability
 * dimension, so it declares `covers: []` and the resolver's
 * uncovered-dimension hard-fail — which catches "no adapter for this
 * stack" for every ordinary vertical — structurally cannot fire. A
 * language with no context adapter therefore resolves cleanly and
 * emits nothing, and without this check the user is told nothing.
 *
 * Written as the invariant rather than against a named unsupported
 * language, because the named version goes stale in the commit that
 * gives that language its adapter — which is exactly how the first
 * version of the `--with-peer-context` list died.
 */
describe('the coverage gate', () => {
  it('never accepts in silence: either a context is emitted or the command refuses', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const result = await addModule('ordering');
    const outcome = result.ok
      ? result.value.changes.some((change) => change.path.includes('ordering'))
        ? 'scaffolded'
        : 'accepted in silence'
      : result.error.code === 'keel.invalid-module' &&
          /would scaffold nothing at all/.test(result.error.message)
        ? 'refused, naming the gap'
        : `failed with ${result.error.code}`;

    expect(['scaffolded', 'refused, naming the gap']).toContain(outcome);
  });
});
