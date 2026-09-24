/**
 * `keel.project-status` — what a front end reads before it offers
 * anything, and what `keel add --list` prints.
 *
 * The point of the query is that every field here is the answer the
 * brownfield command's own front door would give, read before it is
 * run. So the tests scaffold real projects and hold the status to what
 * `keel add` actually does:
 *
 *   - a vertical already installed is not in `available`, and every
 *     other one is, with its readiness — `ready`, `needs` with what it
 *     needs first, or `unavailable` carrying the refusal `keel add`
 *     gives it, code and sentence alike (the composition grid holds
 *     every card of every stack to that; these pin the shape);
 *   - `canAddModule` is false in exactly the cases `add module`
 *     refuses before it looks at the name, and `moduleRefusal` is that
 *     refusal;
 *   - `harnessGeneration` reports the marker once, beside the one this
 *     keel writes;
 *   - an installed vertical is `reapplicable` exactly where
 *     `keel add <id> --reapply` names something it can re-render — not
 *     a product's glue, not a bounded context.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  projectScopeRoot,
} from '../../../../src/domain/contract/manifest.js';
import { projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import type {
  AvailableVerticalDescriptor,
  ProjectStatus,
} from '../../../../src/domain/contract/queries.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import type { Mediator } from '../../../../src/domain/kernel/mediator.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;
let mediator: Mediator;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-status-'));
  mediator = installMediator({ runDeferred: discardDeferred() });
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function scaffold(options: { stack?: string; moduleLayout?: string } = {}): Promise<void> {
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: options.stack ?? 'ts-cli',
        answers: {},
        interactive: false,
        dryRun: false,
        ...(options.moduleLayout === undefined ? {} : { moduleLayout: options.moduleLayout }),
      }),
    ),
  );
}

const status = async (at: string = cwd): Promise<ProjectStatus> =>
  expectOk(await mediator.dispatch(projectStatusQuery({ cwd: at })));

const card = (reported: ProjectStatus, id: string): AvailableVerticalDescriptor | undefined =>
  reported.available.find((vertical) => vertical.id === id);

/** What `keel add <id>` answers here — as a dry run, unless told otherwise. */
const add = (id: string, dryRun = true) =>
  mediator.dispatch(
    addVerticalCommand({ cwd, verticals: [id], answers: {}, interactive: false, dryRun }),
  );

describe('keel.project-status', () => {
  it('reports an empty directory as uninitialised rather than failing', async () => {
    const reported = await status();
    expect(reported.initialised).toBe(false);
    expect(reported.scopeRoot).toBe(path.join(cwd, '.claude'));
    expect(reported.available).toEqual([]);
    expect(reported.canAddModule).toBe(false);
    expect(reported.moduleRefusal?.code).toBe('keel.not-initialised');
    expect(reported).not.toHaveProperty('harnessGeneration');
  });

  it('splits the registry into installed and available', async () => {
    await scaffold();
    const reported = await status();
    expect(reported.initialised).toBe(true);
    const installed = reported.installed.map((vertical) => vertical.id);
    const available = reported.available.map((vertical) => vertical.id);
    expect(installed).toContain('walking-skeleton');
    expect(available).toContain('ci');
    // The two halves never overlap: that is what makes "offer this"
    // and "offer a reapply of this" different controls.
    expect(installed.filter((id) => available.includes(id))).toEqual([]);
    expect(reported.installed[0]?.description).not.toBe('');
  });

  it('reads each card as keel add would: ready, needing others first, or refused in its words', async () => {
    await scaffold({ stack: 'go-http' });
    const reported = await status();

    expect(card(reported, 'ci')).toMatchObject({ readiness: 'ready', requires: [] });
    expect(card(reported, 'ci')).not.toHaveProperty('refusal');
    // Installed with what it needs, in the order they install.
    expect(card(reported, 'iac')).toMatchObject({
      readiness: 'needs',
      requires: ['containerization', 'distribution'],
    });
    expect(card(reported, 'iac')).not.toHaveProperty('refusal');
    expectOk(await add('iac'));

    // A gateway with nothing linked to wire is a card too, now: it says
    // why before the click, exactly as the click would.
    const gateway = card(reported, 'gateway');
    const refused = expectErr(await add('gateway'));
    expect(gateway?.readiness).toBe('unavailable');
    expect(gateway?.refusal).toEqual({
      code: refused.code,
      message: refused.message,
      refusal: expect.objectContaining({ kind: 'unavailable', vertical: 'gateway' }),
    });
  });

  it('carries on an unavailable card the refusal keel add gives, code and sentence', async () => {
    await scaffold();
    const reported = await status();
    const observability = card(reported, 'observability');
    const refused = expectErr(await add('observability'));
    expect(observability).toMatchObject({ readiness: 'unavailable', requires: [] });
    expect(observability?.refusal?.code).toBe(refused.code);
    expect(observability?.refusal?.message).toBe(refused.message);
    expect(observability?.refusal?.message).toBe(
      'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    );
    expect(observability?.refusal?.refusal).toMatchObject({
      kind: 'unavailable',
      missing: { entrypoint: ['arch.server-http'] },
    });
  });

  it('reports the harness generation once, beside the one this keel writes', async () => {
    await scaffold();
    expect((await status()).harnessGeneration).toEqual({
      found: HARNESS_GENERATION,
      expected: HARNESS_GENERATION,
    });

    const file = path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);
    const { harnessGeneration: _dropped, ...unmarked } = JSON.parse(
      await fs.readFile(file, 'utf8'),
    ) as Record<string, unknown>;
    await fs.writeFile(file, JSON.stringify(unmarked));
    const stale = await status();
    expect(stale.harnessGeneration).toEqual({ found: null, expected: HARNESS_GENERATION });
    // Not on every card: the gate refuses them all alike, and the one
    // field says so once.
    expect(card(stale, 'ci')).toMatchObject({ readiness: 'ready' });
    expect(expectErr(await add('ci')).code).toBe('keel.harness-generation');
  });

  it('refuses a context on the flat layout, exactly as the handler does', async () => {
    await scaffold({ moduleLayout: 'basic' });
    const reported = await status();
    expect(reported.canAddModule).toBe(false);
    const refused = expectErr(
      await mediator.dispatch(
        addModuleCommand({
          cwd,
          module: 'billing',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(refused.code).toBe('keel.incompatible');
    expect(reported.moduleRefusal).toEqual({ code: refused.code, message: refused.message });
  });

  it('allows a context on the modulith, and names the ones already taken', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const reported = await status();
    expect(reported.moduleLayout).toBe('modulith');
    expect(reported.canAddModule).toBe(true);
    expect(reported).not.toHaveProperty('moduleRefusal');
    expect(reported.modules).toEqual([expect.objectContaining({ name: 'greeting', seam: true })]);
  });

  it('says which installed verticals keel add --reapply can re-render', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const before = await status();
    expect(before.installed.every((vertical) => vertical.reapplicable)).toBe(true);
    expectOk(await add('ci', false));
    expect((await status()).installed.find((vertical) => vertical.id === 'ci')).toMatchObject({
      reapplicable: true,
    });

    // `keel add module` records the context as installed, and no
    // `keel add <id>` names it: a re-render of it is refused as unknown,
    // so the status says it is not one to offer.
    expectOk(
      await mediator.dispatch(
        addModuleCommand({
          cwd,
          module: 'billing',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const after = await status();
    const context = after.installed.find((vertical) => vertical.id === 'bounded-context');
    expect(context).toMatchObject({ title: 'Bounded context', reapplicable: false });
    expect(
      expectErr(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['bounded-context'],
            answers: {},
            interactive: false,
            dryRun: true,
            reapply: true,
          }),
        ),
      ).code,
    ).toBe('keel.unknown-vertical');
  });

  it('refuses a context at a composite product root', async () => {
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack-ts',
          answers: {},
          interactive: false,
          dryRun: false,
          layout: 'monorepo',
        }),
      ),
    );
    const reported = await status();
    expect(reported.services.map((service) => service.path)).toEqual(['backend', 'frontend']);
    expect(reported.canAddModule).toBe(false);
    expect(reported.moduleRefusal).toMatchObject({ code: 'keel.invalid-module' });
    expect(reported.moduleRefusal?.message).toContain(
      "run 'keel add module <name>' inside the service directory",
    );
    // The product's glue is recorded as installed, by title, and no
    // `keel add` re-renders it.
    expect(reported.installed.find((vertical) => vertical.id === 'fullstack')).toMatchObject({
      title: 'Product root',
      reapplicable: false,
    });
    // At the root, a card is the root's redirect: the capability goes in
    // a service, and the card names which.
    const persistence = card(reported, 'persistence');
    const refused = expectErr(await add('persistence'));
    expect(persistence?.readiness).toBe('unavailable');
    expect(persistence?.refusal).toMatchObject({
      code: refused.code,
      message: refused.message,
      refusal: { kind: 'elsewhere', vertical: 'persistence' },
    });
  });
});
