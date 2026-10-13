/**
 * Integration test for `keel add module <name>` — the front door.
 *
 * Every case here but the run past the gates is a *refusal*, and that
 * is the point of the file. A bounded-context adapter declares `covers: []`, so the
 * resolver's uncovered-dimension hard-fail cannot catch a project no
 * adapter serves: without these gates the command exits 0 having
 * written nothing, which is the bug I.6 found behind
 * `--with-peer-context`. What the emitted context *contains* is
 * asserted per family alongside that family's adapter; what belongs
 * here is that nothing is emitted in silence, and, last, that what
 * runs past the gates is the converge operation's reading of one
 * context (`convergeOf`), which the converge golden holds on every
 * module history, recorded at one instant.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addModuleCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import type { Clock } from '../../../../src/domain/contract/ports/clock.js';
import { RefusalError } from '../../../../src/domain/contract/refusal.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { convergeOf } from '../../../../src/domain/core/converge.js';
import { shippedRegistry } from '../../../../src/domain/core/registry.js';
import { FakeClock } from '../../../../src/infrastructure/commons/fake-clock.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectErr, expectOk, installMediator, PINNED_NOW } from '../../../support/factory.js';

/**
 * No deferred action is part of what is under test here: the refusals
 * write nothing, and the run past the gates is held on its tree and
 * manifest. Running the real ones would make the composite case a
 * `npm install` per assertion.
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

/** Dispatches an add-module against the scaffolded project, as a dry run unless `dryRun` is false. */
function addModule(module: string, consumes?: string, dryRun = true) {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  return mediator.dispatch(
    addModuleCommand({
      cwd,
      module,
      ...(consumes === undefined ? {} : { consumes }),
      answers: {},
      interactive: false,
      dryRun,
    }),
  );
}

/** The manifest the scaffolded project records. */
async function recorded(): Promise<ManifestV2> {
  const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
  if (manifest === null) throw new Error('no manifest recorded');
  return manifest;
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
   * so it is asserted as a violated rule: the shared code and the
   * rule's own reason — and no tag. The page shows this sentence under
   * the tab it disables, so it reads as a sentence: capitalised, and
   * with the rule's id in the refusal's data rather than its words. A
   * tag is a word no command takes. `canAddModule` filters on the same
   * declaration — see the project-status suite.
   */
  it('rejects the flat layout in the rule’s own words, its id kept as data', async () => {
    await scaffold({ moduleLayout: 'basic' });
    const error = expectErr(await addModule('ordering'));
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toMatch(/^A bounded context needs the modulith layout/);
    expect(error.message).toMatch(/--module-layout=modulith$/);
    expect(error.message).not.toMatch(/rule '|modules\.context|layout\.basic/);
    expect(error).toBeInstanceOf(RefusalError);
    expect((error as RefusalError).refusal).toMatchObject({
      kind: 'unavailable',
      vertical: 'bounded-context',
      rules: ['bounded-context/context-needs-modulith'],
    });
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

/**
 * Past the gates, the command runs the converge operation's reading of
 * one context: every adapter of keel's `bounded-context` the tags
 * match, as the report resolves them; the vertical's row recorded
 * once, after every other; the context recorded after the others,
 * consuming what it names; the root map it re-indexes recorded as
 * written; the transient inputs gone; and one instant for it all.
 */
describe('the run past the gates', () => {
  it('wires what the reading of the context plans, records the row once and the context last, and proposes nothing', async () => {
    await scaffold({ stack: 'go-cli', moduleLayout: 'modulith' });
    const before = await recorded();
    const plan = convergeOf(shippedRegistry, before, {
      kind: 'module',
      name: 'orders',
      consumes: 'greeting',
    });
    if (plan.kind !== 'converges') throw new Error('the reading of a context refused');

    const report = expectOk(await addModule('orders', 'greeting', false));

    expect(report.resolvedAdapters?.map(({ id }) => id)).toEqual(plan.modules[0]?.adapters);
    // The root map re-indexed after the run is among what it reports.
    expect(report.changes).toContainEqual({ kind: 'modify', path: 'AGENTS.md' });
    expect(report.notes).toBeUndefined();
    expect(report.refreshProposals).toBeUndefined();
    const after = await recorded();
    expect(after.verticals.map(({ id }) => id)).toEqual(plan.target.recorded);
    expect(after.verticals.at(-1)?.id).toBe('bounded-context');
    expect(after.modules).toEqual([
      ...before.modules,
      { name: 'orders', installedAt: PINNED_NOW, seam: true, consumes: 'greeting' },
    ]);
    expect(after.updatedAt).toBe(PINNED_NOW);
    expect(after.tags).toEqual(before.tags);
    expect(Object.keys(after.answers)).toEqual(Object.keys(before.answers));
    // The re-index rewrote the root map after the run's harness pass
    // recorded it: its entries hash what is on disk.
    const onDisk = createHash('sha256')
      .update(await fs.readFile(path.join(cwd, 'AGENTS.md')))
      .digest('hex');
    const rows = after.entries.filter(({ target }) => target === 'AGENTS.md');
    expect(rows).not.toEqual([]);
    expect(rows.map((row) => [row.sha256Shipped, row.sha256Current])).toEqual(
      rows.map(() => [onDisk, onDisk]),
    );

    expectOk(await addModule('shipping', undefined, false));
    const again = await recorded();
    expect(again.verticals).toEqual(after.verticals);
    expect(again.modules.at(-1)).toEqual({ name: 'shipping', installedAt: PINNED_NOW, seam: true });
  });

  it('records the context, its row and the manifest at one instant, however often the clock is read', async () => {
    await scaffold({ stack: 'go-cli', moduleLayout: 'modulith' });
    const pinned = new FakeClock(PINNED_NOW);
    let reads = 0;
    const ticking: Clock = {
      nowIso: () => {
        const now = pinned.nowIso();
        reads += 1;
        pinned.set(new Date(Date.parse(PINNED_NOW) + reads * 1000).toISOString());
        return now;
      },
    };

    expectOk(
      await installMediator({ runDeferred: discardDeferred(), clock: ticking }).dispatch(
        addModuleCommand({ cwd, module: 'orders', answers: {}, interactive: false, dryRun: false }),
      ),
    );

    const after = await recorded();
    expect(after.modules.at(-1)?.installedAt).toBe(after.updatedAt);
    expect(after.verticals.find(({ id }) => id === 'bounded-context')?.installedAt).toBe(
      after.updatedAt,
    );
  });
});
