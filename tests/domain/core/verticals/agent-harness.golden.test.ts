/**
 * Every default single-service preset, byte-identical across the
 * agent-harness extraction. SHA256 values were captured at 26c6bf5,
 * before any production changes, using real templates and FsTree.
 *
 * Deferred actions are faked: this pins every staged project file,
 * without installing toolchains or generating external build outputs.
 * The manifest and generation marker are bookkeeping persisted outside
 * the Tree and deliberately excluded. Permission bits are not hashed,
 * so the filesystem umask cannot change the result.
 *
 * Legitimate template changes must update the affected golden entries
 * in the same change. The default dials and project name stay fixed.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { expectOk, installMediator } from '../../../support/factory.js';
import golden from './agent-harness.golden.json' with { type: 'json' };

const scenarios = Object.keys(golden) as (keyof typeof golden)[];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.remove(directory)));
});

describe('agent-harness extraction preserves default project files', () => {
  it('covers every single-service preset', () => {
    expect(
      Object.values(STACKS)
        .filter((stack) => !stack.services)
        .map((stack) => stack.id)
        .sort(),
    ).toEqual(scenarios);
  });

  it.each(scenarios)('preserves every emitted byte for %s', async (stack) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-agent-harness-golden-'));
    directories.push(directory);
    const cwd = path.join(directory, 'demo');
    await fs.ensureDir(cwd);
    const mediator = installMediator({ runDeferred: async () => {} });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack,
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const files: Record<string, string> = {};
    for (const change of report.changes) {
      if (change.path === '.claude/.keel-manifest.json') continue;
      files[change.path] = createHash('sha256')
        .update(await fs.readFile(path.join(cwd, change.path)))
        .digest('hex');
    }
    if (process.env['KEEL_UPDATE_GOLDEN'] === '1') {
      updated[stack] = files;
      return;
    }
    expect(files).toEqual(golden[stack]);
  });
});

// `KEEL_UPDATE_GOLDEN=1` rewrites the golden from this run — for a
// deliberate template change, reviewed in the diff like any other.
const updated: Record<string, Record<string, string>> = {};
afterAll(async () => {
  if (process.env['KEEL_UPDATE_GOLDEN'] !== '1') return;
  const sorted = Object.fromEntries(
    Object.keys(updated)
      .sort()
      .map((stack) => [
        stack,
        Object.fromEntries(Object.entries(updated[stack]!).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
  await fs.writeJson(new URL('./agent-harness.golden.json', import.meta.url), sorted, {
    spaces: 2,
  });
});
