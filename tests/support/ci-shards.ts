/**
 * The CI e2e matrix, as `.github/workflows/ci.yml` expands it: each
 * shard's id, the toolchain it probes for and the suites it runs.
 *
 * A module of its own so every guard that holds the matrix to
 * something else reads it one way — `tests/ci-workflow.test.ts` holds
 * it to `tests/e2e/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');

/** One shard of the `e2e` job's matrix, as the workflow spells it. */
export interface Shard {
  readonly id: string;
  /** The binaries the shard probes for, space-separated. */
  readonly tools: string;
  /** The suites it runs, space-separated, each from the repository's root. */
  readonly files: string;
}

/**
 * The shard list as CI will actually expand it — parsed, not
 * regex-matched, so a change to the workflow's shape surfaces as a
 * failure rather than as a quietly empty result.
 */
export function e2eShards(): readonly Shard[] {
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as {
    jobs: { e2e: { strategy: { matrix: { shard: Shard[] } } } };
  };
  return workflow.jobs.e2e.strategy.matrix.shard;
}

/** The suites `shard` runs, each as `tests/e2e/<name>.test.ts`. */
export function claimedFiles(shard: Shard): readonly string[] {
  return shard.files.trim().split(/\s+/);
}
