/**
 * Ownership is a property of the **run**, not of one vertical's
 * install. `keel new` installs a stack's verticals and the extras one
 * `installVertical` call each onto the same tree, so the memory that
 * refuses a second claim on a skill name or a declared region has to
 * outlive a call — one {@link Ownership} threaded through all of
 * them, which is what `owners` on the inputs is for. This pins both
 * halves: a shared scope collides across calls, and a call without
 * one is its own run.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installVertical } from '../../../src/domain/core/install.js';
import { ContributionConflictError, newOwnership } from '../../../src/domain/core/apply.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { hashRegion, regionPatch } from '../../../src/domain/contract/region.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../src/infrastructure/process/spawn-process-runner.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';
import type { Vertical } from '../../../src/domain/contract/composition.js';

const region = hashRegion('shared');

/** A vertical whose one adapter claims `region` of `shared.ini`. */
function claiming(id: string): Vertical {
  return {
    id,
    description: `the ${id} vertical`,
    dimensions: ['only'],
    adapters: [
      {
        id: `${id}/adapter`,
        vertical: id,
        covers: ['only'],
        predicate: {},
        contribute: () => ({
          patches: [regionPatch({ target: 'shared.ini', seed: '', region, body: id })],
        }),
      },
    ],
  };
}

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ownership-'));
});

afterEach(async () => {
  await fs.remove(tmp);
});

const install = (vertical: Vertical, tree: FsTree, owners?: ReturnType<typeof newOwnership>) =>
  installVertical({
    vertical,
    manifest: emptyManifestV2('now', '0.4.0'),
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: tmp,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => 'now',
    ...(owners !== undefined ? { owners } : {}),
  });

describe('installVertical ownership scope', () => {
  it('one Ownership threaded through several installs refuses the second vertical’s claim, naming both', async () => {
    const tree = new FsTree(tmp);
    const owners = newOwnership();
    await install(claiming('one'), tree, owners);
    const failure = await install(claiming('two'), tree, owners).then(
      () => null,
      (e: unknown) => e as ContributionConflictError,
    );
    expect(failure).toBeInstanceOf(ContributionConflictError);
    expect(failure?.kind).toBe('region-collision');
    expect(failure?.message).toContain("adapter 'two/adapter' declares region");
    expect(failure?.message).toContain("adapter 'one/adapter' already owns");
  });

  it('a call without a shared scope is its own run — the standing `keel add` contract', async () => {
    const tree = new FsTree(tmp);
    await install(claiming('one'), tree);
    await install(claiming('two'), tree);
    expect(tree.read('shared.ini')?.toString()).toBe(`${region.begin}\ntwo\n${region.end}\n`);
  });
});
