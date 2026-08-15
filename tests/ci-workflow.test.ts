/**
 * The consumer for the CI e2e matrix.
 *
 * `.github/workflows/ci.yml` shards the end-to-end suite by toolchain,
 * and each shard names its files explicitly — a matrix cannot glob a
 * directory, and grouping by toolchain is a judgement no glob encodes
 * anyway. The hazard that creates is silent: add `tests/e2e/foo.test.ts`,
 * forget the matrix, and the suite simply never runs. Nothing goes red.
 * CI reports the same green it reported before, over strictly less
 * coverage — the identical failure mode the shards' toolchain-probe step
 * exists to prevent, one level up.
 *
 * So the matrix gets a test. This is the thing that fails when the wall
 * is absent, and it runs in `verify` — the fast gate — so the answer
 * arrives in a minute rather than after a JVM build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
const e2eDir = path.join(repoRoot, 'tests', 'e2e');

interface Shard {
  id: string;
  tools: string;
  files: string;
}

/**
 * The shard list as CI will actually expand it — parsed, not
 * regex-matched, so a change to the workflow's shape surfaces here as a
 * failure rather than as a quietly empty result.
 */
const shards = (): Shard[] => {
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as {
    jobs: { e2e: { strategy: { matrix: { shard: Shard[] } } } };
  };
  return workflow.jobs.e2e.strategy.matrix.shard;
};

const claimedFiles = (shard: Shard): string[] => shard.files.trim().split(/\s+/);

describe('the CI e2e matrix', () => {
  it('claims every suite in tests/e2e/', () => {
    const onDisk = fs
      .readdirSync(e2eDir)
      .filter((entry) => entry.endsWith('.test.ts'))
      .map((entry) => `tests/e2e/${entry}`)
      .sort();
    const claimed = shards().flatMap(claimedFiles).sort();

    expect(claimed).toEqual(onDisk);
  });

  it('claims each suite exactly once', () => {
    const claimed = shards().flatMap(claimedFiles);
    const duplicated = claimed.filter((file, index) => claimed.indexOf(file) !== index);

    expect(duplicated).toEqual([]);
  });

  it('names a toolchain to probe for in every shard', () => {
    // The probe step is what turns an under-provisioned runner into a
    // red build; a shard with nothing to probe has opted out of it.
    for (const shard of shards()) {
      expect(shard.tools.trim(), `shard ${shard.id}`).not.toBe('');
    }
  });
});
