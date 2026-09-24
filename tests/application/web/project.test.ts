/**
 * What a keel project's page says about the project as a whole, before
 * any card is picked: what it is, on the read-only Project step its
 * rail has where a new project's preset steps are, and what stops every
 * card alike.
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
import {
  harnessNotice,
  projectHeadline,
  projectSummary,
  stampsHarnessGeneration,
} from '../../../assets/web/src/project.js';
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

/** Scaffolds `stack` here, in-process, with its actions faked. */
async function scaffold(
  stack: string,
  more: { layout?: 'monorepo'; moduleLayout?: string } = {},
): Promise<void> {
  expectOk(
    await mediator.dispatch(
      newProjectCommand({ cwd, stack, answers: {}, interactive: false, dryRun: false, ...more }),
    ),
  );
}

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

describe('stampsHarnessGeneration', () => {
  it('reads an empty re-render of the harness on an older generation as a change', async () => {
    await scaffold('ts-cli');
    await stamp(null);
    const stale = await status();
    expect(stampsHarnessGeneration(stale, 'agent-harness')).toBe(true);
    expect(stampsHarnessGeneration(stale, 'ci')).toBe(false);
    expect(stampsHarnessGeneration(stale, null)).toBe(false);

    // The engine is the oracle: the re-render plans nothing to write or
    // run, and still brings the project forward — the marker it stamps
    // is what lets every other card through.
    const report = expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['agent-harness'],
          reapply: true,
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect([report.changes, report.actions]).toEqual([[], []]);
    expect(harnessNotice(await status())).toBeNull();
    expect(stampsHarnessGeneration(await status(), 'agent-harness')).toBe(false);

    // A newer marker is not one to stamp over.
    await stamp(HARNESS_GENERATION + 1);
    expect(stampsHarnessGeneration(await status(), 'agent-harness')).toBe(false);
  });
});

describe('projectSummary', () => {
  it('says what a project is, in words, where a new one’s preset steps would ask it', async () => {
    expect(projectSummary(await status())).toEqual({ rows: [], installed: [] });
    await scaffold('go-http', { moduleLayout: 'modulith' });
    const reported = await status();
    const summary = projectSummary(reported);
    // The preset its manifest reads as, then the choices that made it,
    // as the status words them — no tag reaches the page.
    expect(summary.rows).toEqual([
      { label: 'Preset', value: 'go-http' },
      { label: 'Building', value: 'Backend or tool' },
      { label: 'Language', value: 'Go' },
      { label: 'Adapters', value: 'HTTP server' },
      { label: 'Module layout', value: 'modulith' },
      { label: 'Bounded context', value: 'greeting' },
    ]);
    expect(summary.installed).toEqual(
      reported.installed.map((vertical) => ({ id: vertical.id, title: vertical.title })),
    );
    expect(projectHeadline(reported)).toBe('go-http');
  });

  it('names a product root’s services, and a monorepo service’s gifts beside its own', async () => {
    await scaffold('fullstack-ts', { layout: 'monorepo' });
    const root = projectSummary(await status());
    expect(root.rows[0]).toEqual({ label: 'Preset', value: 'fullstack-ts' });
    expect(root.rows.slice(-2)).toEqual([
      { label: 'backend/', value: 'ts-http · npm' },
      { label: 'frontend/', value: 'web-components · npm' },
    ]);

    const backend = expectOk(
      await mediator.dispatch(projectStatusQuery({ cwd: path.join(cwd, 'backend') })),
    );
    // What the product gives it is part of what it has.
    expect(projectSummary(backend).installed.slice(-2)).toEqual([
      { id: 'containerization', title: 'Container image' },
      { id: 'vcs', title: 'Version control' },
    ]);
  });

  it('heads a review row with the preset, else what the project builds in what', () => {
    const facts = [
      { label: 'Building', value: 'Backend' },
      { label: 'Language', value: 'COBOL' },
    ];
    expect(projectHeadline({ profile: { preset: null, facts } })).toBe('Backend, COBOL');
    expect(projectHeadline({ profile: { preset: null, facts: [] } })).toBe('—');
    expect(projectHeadline(null)).toBe('—');
  });
});
