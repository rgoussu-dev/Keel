/**
 * What the brownfield half says about the project as a whole, before
 * any card is picked.
 *
 * Same standing as `steps.test.ts` and `extras.test.ts`: a pure module
 * living in `assets/web/`, tested here because it needs no browser. The
 * status it reads is the real `keel.project-status` reply for a real
 * scaffold, its marker then moved as an older or a newer keel would
 * have left it — and the refusal the notice points at is the one
 * `keel add` really gives there.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  projectScopeRoot,
} from '../../../src/domain/contract/manifest.js';
import { projectStatusQuery, type ProjectStatus } from '../../../src/domain/contract/queries.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { harnessNotice } from '../../../assets/web/src/project.js';
import { expectErr, expectOk, installMediator } from '../../support/factory.js';

let cwd: string;
let mediator: Mediator;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-web-project-'));
  mediator = installMediator({ runDeferred: () => Promise.resolve() });
});

afterEach(async () => {
  await fs.remove(cwd);
});

const status = async (): Promise<ProjectStatus> =>
  expectOk(await mediator.dispatch(projectStatusQuery({ cwd })));

/** Rewrites the scaffold's marker: a number, or none at all. */
async function stamp(generation: number | null): Promise<void> {
  const file = path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);
  const { harnessGeneration: _dropped, ...rest } = JSON.parse(
    await fs.readFile(file, 'utf8'),
  ) as Record<string, unknown>;
  await fs.writeFile(
    file,
    JSON.stringify(generation === null ? rest : { ...rest, harnessGeneration: generation }),
  );
}

describe('harnessNotice', () => {
  it('says nothing where there is no project, or its harness is this keel’s', async () => {
    expect(harnessNotice(await status())).toBeNull();
    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: 'ts-cli', answers: {}, interactive: false, dryRun: false }),
      ),
    );
    expect(harnessNotice(await status())).toBeNull();
  });

  it('says once, for every card, what the refusal of each would say', async () => {
    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: 'ts-cli', answers: {}, interactive: false, dryRun: false }),
      ),
    );
    await stamp(null);
    expect(harnessNotice(await status())).toBe(
      `This project’s harness carries no generation marker, and this keel writes generation ${String(HARNESS_GENERATION)}: every card but Agent harness is refused until the harness is brought forward, and the refusal on any of them says how.`,
    );
    const refused = expectErr(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['ci'],
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(refused.code).toBe('keel.harness-generation');

    await stamp(HARNESS_GENERATION + 1);
    expect(harnessNotice(await status())).toContain('upgrade keel before adding to it');
  });
});
