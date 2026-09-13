import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand, addVerticalCommand } from '../../../../src/domain/contract/commands.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { hashRegion, regionPatch } from '../../../../src/domain/contract/region.js';
import { registryOf } from '../../../../src/domain/core/registry.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const producer: Vertical = {
  id: 'producer',
  description: 'A domain contributor with harness elements',
  dimensions: [],
  skills: ['inspect'],
  adapters: [
    {
      id: 'producer/files',
      vertical: 'producer',
      covers: [],
      predicate: {},
      contribute: () => ({
        files: [{ path: 'domain.txt', content: 'domain content\n' }],
        skills: [
          { name: 'inspect', description: 'Inspect the domain.', body: 'Read domain.txt.\n' },
        ],
        harnessPatches: [
          regionPatch({
            target: '.claude/hook.sh',
            region: hashRegion('inspect'),
            body: 'echo inspect',
          }),
        ],
      }),
    },
  ],
};
const harness: Vertical = {
  id: 'agent-harness',
  description: 'Harness activation',
  dimensions: [],
  promotes: ['agentic.harness'],
  adapters: [
    {
      id: 'agent-harness/core',
      vertical: 'agent-harness',
      covers: [],
      predicate: {},
      contribute: () => ({
        files: [{ path: '.claude/hook.sh', content: '#!/bin/sh\n' }],
        tagsAdd: ['agentic.harness'],
      }),
    },
  ],
};
let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-harness-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});
function scenario(verticals: readonly Vertical[], registered: readonly Vertical[] = verticals) {
  const logger = new FakeLogger();
  const mediator = installMediator({
    logger,
    registry: registryOf([
      {
        origin: 'harness-test',
        verticals: registered,
        stacks: [{ id: 'fixture', description: 'Harness ordering fixture', tags: [], verticals }],
      },
    ]),
    runDeferred: () => Promise.resolve(),
  });
  return { mediator, logger };
}
async function scaffold(mediator: ReturnType<typeof installMediator>, agentHarness?: boolean) {
  return expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'fixture',
        answers: {},
        interactive: false,
        dryRun: false,
        ...(agentHarness === undefined ? {} : { agentHarness }),
      }),
    ),
  );
}

describe('harness realization at the end of the run', () => {
  it('realizes earlier skills and region patches once the final tags activate the harness', async () => {
    const { mediator } = scenario([producer, harness]);
    await scaffold(mediator);
    expect(await fs.readFile(path.join(cwd, '.claude/skills/inspect/SKILL.md'), 'utf8')).toContain(
      'Read domain.txt.',
    );
    expect(await fs.readFile(path.join(cwd, '.claude/hook.sh'), 'utf8')).toContain('echo inspect');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'producer/files',
          target: '.claude/skills/inspect/SKILL.md',
        }),
        expect.objectContaining({ source: 'producer/files', target: '.claude/hook.sh' }),
      ]),
    );
  });
  it('suppresses skills and hook patches together, reports once, and still installs domain files', async () => {
    const { mediator, logger } = scenario([producer]);
    const report = await scaffold(mediator);
    expect(report.skippedHarnessElements).toBe(2);
    expect(await fs.readFile(path.join(cwd, 'domain.txt'), 'utf8')).toBe('domain content\n');
    expect(await fs.pathExists(path.join(cwd, '.claude/skills'))).toBe(false);
    expect(await fs.pathExists(path.join(cwd, '.claude/hook.sh'))).toBe(false);
    expect(
      logger.entries.filter((m) => m.message.includes('skipped 2 harness elements')),
    ).toHaveLength(1);
  });
  it('the opt-out removes the harness from a preset without suppressing domain content', async () => {
    const { mediator } = scenario([producer, harness]);
    await scaffold(mediator, false);
    expect(await fs.pathExists(path.join(cwd, '.claude/hook.sh'))).toBe(false);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).not.toContain('agentic.harness');
    expect(manifest?.verticals.map((v) => v.id)).toEqual(['producer']);
  });
  it('adopts a harness later without rewriting existing domain files', async () => {
    const { mediator } = scenario([producer], [producer, harness]);
    await scaffold(mediator);
    await fs.writeFile(path.join(cwd, 'domain.txt'), 'user domain changes\n');
    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'agent-harness',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await fs.readFile(path.join(cwd, 'domain.txt'), 'utf8')).toBe('user domain changes\n');
    expect(await fs.readFile(path.join(cwd, '.claude/skills/inspect/SKILL.md'), 'utf8')).toContain(
      'Read domain.txt.',
    );
    expect(await fs.readFile(path.join(cwd, '.claude/hook.sh'), 'utf8')).toContain('echo inspect');
  });
  it('records hashes of the final shared file for every region contributor', async () => {
    const second: Vertical = {
      id: 'second',
      description: 'A second region',
      dimensions: [],
      adapters: [
        {
          id: 'second/patch',
          vertical: 'second',
          covers: [],
          predicate: {},
          contribute: () => ({
            harnessPatches: [
              regionPatch({
                target: '.claude/hook.sh',
                region: hashRegion('second'),
                body: 'echo second',
              }),
            ],
          }),
        },
      ],
    };
    const { mediator } = scenario([producer, harness, second]);
    await scaffold(mediator);
    const content = await fs.readFile(path.join(cwd, '.claude/hook.sh'));
    const hash = createHash('sha256').update(content).digest('hex');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    const entries = manifest!.entries.filter((entry) => entry.target === '.claude/hook.sh');
    expect(entries).toHaveLength(2);
    expect(
      entries.every((entry) => entry.sha256Current === hash && entry.sha256Shipped === hash),
    ).toBe(true);
  });
});
