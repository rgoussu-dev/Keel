/**
 * Integration test for `keel docs sync` and `keel docs check` over a
 * real scaffold.
 *
 * Four claims, each one of #138's acceptance criteria:
 *
 *   - a fresh scaffold is already in sync, and a sync over it writes
 *     nothing — the projection inside `keel new` and the projection
 *     `sync` runs are the same computation;
 *   - `check` is red on each of the three drifts a person can cause
 *     (a reworded row, an indexed file that is gone, a hand-edited
 *     region) and green again after `sync`;
 *   - rows and prose *outside* the regions survive both;
 *   - `keel add persistence` keeps the family kit's rows it never
 *     saw, and adds the row for the document it did contribute.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  docsSyncCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import { docsCheckQuery } from '../../../../src/domain/contract/queries.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-docs-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const mediator = () => installMediator({ runDeferred: async () => {} });

async function scaffold(moduleLayout = 'modulith'): Promise<void> {
  expectOk(
    await mediator().dispatch(
      newProjectCommand({
        cwd,
        stack: 'go-http',
        moduleLayout,
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
}

const root = () => path.join(cwd, 'AGENTS.md');

async function editRoot(edit: (text: string) => string): Promise<void> {
  await fs.writeFile(root(), edit(await fs.readFile(root(), 'utf8')));
}

describe('keel docs', () => {
  it('finds a fresh scaffold in sync, and writes nothing over it', async () => {
    await scaffold();
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toEqual([]);
    const before = await fs.readFile(root(), 'utf8');
    const sync = expectOk(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: false })));
    expect(sync.changes).toEqual([]);
    expect(await fs.readFile(root(), 'utf8')).toBe(before);
  });

  it('is red on a reworded row and green after a sync', async () => {
    await scaffold();
    await editRoot((text) => text.replace('one directory per deployment unit', 'reworded'));
    const drifted = expectOk(await mediator().dispatch(docsCheckQuery({ cwd })));
    expect(drifted.drift).toEqual([
      expect.objectContaining({
        target: 'AGENTS.md',
        detail: expect.stringContaining("reads 'reworded"),
      }),
    ]);
    expectOk(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: false })));
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toEqual([]);
  });

  it('is red on a row whose file is gone, and stays red after a sync', async () => {
    await scaffold();
    await fs.remove(path.join(cwd, 'cmd/AGENTS.md'));
    const gone = expect.objectContaining({
      detail: "row '`cmd/`' points at 'cmd/AGENTS.md', which this project does not have",
    });
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toContainEqual(gone);
    // A sync rewrites the rows; it does not put the file back, and
    // saying the index is fine would be the lie the check exists for.
    expectOk(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: false })));
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toContainEqual(gone);
  });

  it('is red on a hand-edited region and green after a sync', async () => {
    await scaffold();
    await editRoot((text) => text.replace('**Map** —', '**My own heading** —'));
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toEqual([
      expect.objectContaining({ detail: expect.stringContaining('hand-edited') }),
    ]);
    expectOk(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: false })));
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toEqual([]);
  });

  it('leaves rows and prose outside the regions exactly as they are', async () => {
    await scaffold();
    const mine = '\nMy own note.\n\n- [`notes/`](notes/) — my own row, outside the markers\n';
    await editRoot((text) => text.replace('## Architecture', `${mine}\n## Architecture`));
    expectOk(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: false })));
    expect(await fs.readFile(root(), 'utf8')).toContain(mine);
  });

  it('writes nothing under --dry-run', async () => {
    await scaffold();
    await editRoot((text) => text.replace('**Map** —', '**My own heading** —'));
    const before = await fs.readFile(root(), 'utf8');
    const report = expectOk(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: true })));
    expect(report.committed).toBe(false);
    expect(report.changes.map((c) => c.path)).toEqual(['AGENTS.md']);
    expect(await fs.readFile(root(), 'utf8')).toBe(before);
  });

  it('keeps the rows a later install never saw, and adds its own', async () => {
    await scaffold('basic');
    expectOk(
      await mediator().dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'persistence',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const text = await fs.readFile(root(), 'utf8');
    // `internal/domain` is the family kit's row, contributed by a
    // vertical this install never ran; `internal/infra` is where the
    // persistence section landed.
    expect(text).toContain('](internal/domain/AGENTS.md)');
    expect(text).toContain('](internal/infra/AGENTS.md)');
    expect(expectOk(await mediator().dispatch(docsCheckQuery({ cwd }))).drift).toEqual([]);
  });

  it('refuses a directory with no keel project', async () => {
    expect(expectErr(await mediator().dispatch(docsCheckQuery({ cwd }))).code).toBe(
      'keel.not-initialised',
    );
    expect(expectErr(await mediator().dispatch(docsSyncCommand({ cwd, dryRun: false }))).code).toBe(
      'keel.not-initialised',
    );
  });
});
