/**
 * `keel.project-status` — what a front end reads before it offers
 * anything.
 *
 * The point of the query is that every field here mirrors a refusal
 * the brownfield handlers would issue. So the tests scaffold real
 * projects and check that the status agrees with what `keel add`
 * actually does: a vertical already installed is not in `available`,
 * and `canAddModule` is false in exactly the cases `add module`
 * refuses before it looks at the name.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addModuleCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import type { ProjectStatus } from '../../../../src/domain/contract/queries.js';
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

describe('keel.project-status', () => {
  it('reports an empty directory as uninitialised rather than failing', async () => {
    const reported = await status();
    expect(reported.initialised).toBe(false);
    expect(reported.scopeRoot).toBe(path.join(cwd, '.claude'));
    expect(reported.available).toEqual([]);
    expect(reported.canAddModule).toBe(false);
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

  it('refuses a context on the flat layout, exactly as the handler does', async () => {
    await scaffold({ moduleLayout: 'basic' });
    expect((await status()).canAddModule).toBe(false);
    expect(
      expectErr(
        await mediator.dispatch(
          addModuleCommand({
            cwd,
            module: 'billing',
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        ),
      ).code,
    ).toBe('keel.incompatible');
  });

  it('allows a context on the modulith, and names the ones already taken', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const reported = await status();
    expect(reported.moduleLayout).toBe('modulith');
    expect(reported.canAddModule).toBe(true);
    expect(reported.modules).toEqual([expect.objectContaining({ name: 'greeting', seam: true })]);
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
  });
});
