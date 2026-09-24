/**
 * `installVerticals` — the one loop both front doors install through:
 * `keel new` over a scope's stack verticals and extras, `keel add` over
 * a list of one.
 *
 * What makes it a *run* rather than repeated calls is what the
 * verticals share: the running manifest (a later vertical resolves
 * against the tags an earlier one promoted), one ownership memory (a
 * region two verticals both claim collides), and one harness buffer
 * realized once, after the last vertical — unless the caller supplies
 * the buffer, in which case finalizing is the caller's, as `keel add
 * agent-harness` needs to replay earlier contributors into it first.
 */

import { describe, expect, it } from 'vitest';
import { finalizeHarness, installVerticals } from '../../../src/domain/core/install.js';
import {
  ContributionConflictError,
  newOwnership,
  type HarnessContribution,
} from '../../../src/domain/core/apply.js';
import { RefusalError } from '../../../src/domain/contract/refusal.js';
import { emptyManifestV2, type ManifestV2 } from '../../../src/domain/contract/manifest.js';
import { AGENT_HARNESS_TAG, type Vertical } from '../../../src/domain/contract/composition.js';
import { hashRegion, regionPatch } from '../../../src/domain/contract/region.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';
import { FakeTemplateSource } from '../../../src/infrastructure/template/fake.js';
import { FakeTree } from '../../../src/infrastructure/tree/fake.js';

const BASE_TAG = 'test.base';
const SKILL = '.claude/skills/base-skill/SKILL.md';

/** Promotes {@link BASE_TAG}, writes a file, defers an action and ships a skill. */
const base: Vertical = {
  id: 'base',
  description: 'the base vertical',
  dimensions: ['only'],
  promotes: [BASE_TAG],
  skills: ['base-skill'],
  adapters: [
    {
      id: 'base/adapter',
      vertical: 'base',
      covers: ['only'],
      predicate: {},
      contribute: () => ({
        files: [{ path: 'base.txt', content: 'base' }],
        tagsAdd: [BASE_TAG],
        actions: [{ id: 'base', description: 'base action', run: () => Promise.resolve() }],
        skills: [{ name: 'base-skill', description: 'Run the base.', body: 'Run it.' }],
      }),
    },
  ],
};

/** Resolves only once {@link BASE_TAG} is on the manifest. */
const upper: Vertical = {
  id: 'upper',
  description: 'the upper vertical',
  dimensions: ['only'],
  adapters: [
    {
      id: 'upper/adapter',
      vertical: 'upper',
      covers: ['only'],
      predicate: { requires: [BASE_TAG] },
      contribute: () => ({
        files: [{ path: 'upper.txt', content: 'upper' }],
        actions: [{ id: 'upper', description: 'upper action', run: () => Promise.resolve() }],
      }),
    },
  ],
};

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

const harnessed = (): ManifestV2 => ({
  ...emptyManifestV2('now', '0.5.0'),
  tags: [AGENT_HARNESS_TAG],
});

const run = (verticals: readonly Vertical[], tree: FakeTree, harness?: HarnessContribution[]) =>
  installVerticals({
    verticals,
    manifest: harnessed(),
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: '/project',
    templates: new FakeTemplateSource(),
    processes: new FakeProcessRunner(),
    now: () => 'now',
    ...(harness !== undefined ? { harness } : {}),
  });

describe('installVerticals', () => {
  it('installs each vertical against the manifest the ones before it produced, in order', async () => {
    const tree = new FakeTree();
    const result = await run([base, upper], tree);

    expect(result.adapters.map((a) => a.id)).toEqual(['base/adapter', 'upper/adapter']);
    expect(result.manifest.verticals.map((v) => v.id)).toEqual(['base', 'upper']);
    expect(result.manifest.tags).toContain(BASE_TAG);
    expect(result.applyResult.tagsAdded).toEqual([BASE_TAG]);
    expect(result.applyResult.actions.map((a) => a.description)).toEqual([
      'base action',
      'upper action',
    ]);
    expect(tree.read('upper.txt')?.toString()).toBe('upper');
  });

  it('refuses a vertical the ones before it have not yet made resolvable', async () => {
    const failure = await run([upper, base], new FakeTree()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(RefusalError);
  });

  it('is one ownership scope: a region two of its verticals claim collides, naming both', async () => {
    const failure = await run([claiming('one'), claiming('two')], new FakeTree()).then(
      () => null,
      (e: unknown) => e as ContributionConflictError,
    );
    expect(failure).toBeInstanceOf(ContributionConflictError);
    expect(failure?.kind).toBe('region-collision');
    expect(failure?.message).toContain("adapter 'two/adapter' declares region");
    expect(failure?.message).toContain("adapter 'one/adapter' already owns");
  });

  it('realizes the run’s harness declarations itself when no buffer is supplied', async () => {
    const tree = new FakeTree();
    const result = await run([base, upper], tree);

    expect(result.applyResult.skills.map((s) => s.name)).toEqual(['base-skill']);
    expect(tree.read(SKILL)).not.toBeNull();
    expect(result.manifest.entries.map((e) => e.target)).toContain(SKILL);
  });

  it('leaves a supplied buffer to the caller, who finalizes it once the run is over', async () => {
    const tree = new FakeTree();
    const harness: HarnessContribution[] = [];
    const result = await run([base, upper], tree, harness);

    expect(result.applyResult.skills).toEqual([]);
    expect(tree.read(SKILL)).toBeNull();
    expect(harness).not.toEqual([]);

    const finalized = finalizeHarness({
      manifest: result.manifest,
      harness,
      tree,
      owners: newOwnership(),
      logger: new FakeLogger(),
      now: () => 'now',
    });
    expect(finalized.skills.map((s) => s.name)).toEqual(['base-skill']);
    expect(tree.read(SKILL)).not.toBeNull();
  });
});
