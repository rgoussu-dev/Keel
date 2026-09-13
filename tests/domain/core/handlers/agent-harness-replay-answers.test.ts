import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { registryOf } from '../../../../src/domain/core/registry.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakePrompt, rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const plugin: Vertical = {
  id: 'acme',
  description: 'A plugin with a repeat question',
  dimensions: [],
  skills: ['inspect'],
  adapters: [
    {
      id: 'acme/content',
      vertical: 'acme',
      covers: [],
      predicate: {},
      questions: [
        {
          id: 'destination',
          prompt: 'Destination',
          doc: '',
          default: 'default-target',
          memory: 'repeat',
        },
      ],
      contribute: (ctx) => ({
        files: [{ path: 'domain.txt', content: ctx.answer('destination') }],
        skills: [
          {
            name: 'inspect',
            description: 'Inspect the installed destination.',
            body: `Inspect ${ctx.answer('destination')}.`,
          },
        ],
      }),
    },
  ],
};
const harness: Vertical = {
  id: 'agent-harness',
  description: 'Activates declared skills',
  dimensions: [],
  promotes: ['agentic.harness'],
  adapters: [
    {
      id: 'agent-harness/core',
      vertical: 'agent-harness',
      covers: [],
      predicate: {},
      contribute: () => ({ tagsAdd: ['agentic.harness'] }),
    },
  ],
};
const registry = registryOf([
  {
    origin: 'replay-test',
    verticals: [plugin, harness],
    stacks: [{ id: 'empty', description: 'Empty fixture', tags: [], verticals: [] }],
  },
]);
let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-replay-answers-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});

describe('harness replay of a plugin repeat question', () => {
  it('uses the recorded install answer without asking again or rewriting domain files', async () => {
    const prompt = new FakePrompt({ destination: 'warehouse' });
    const mediator = installMediator({ registry, prompt, runDeferred: async () => {} });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: 'empty', answers: {}, interactive: false, dryRun: false }),
      ),
    );
    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'acme',
          answers: {},
          interactive: true,
          dryRun: false,
        }),
      ),
    );
    expect(await fs.readFile(path.join(cwd, 'domain.txt'), 'utf8')).toBe('warehouse');
    const before = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
    expect(before.answers['acme/content']).toEqual({ destination: 'warehouse' });
    await fs.writeFile(path.join(cwd, 'domain.txt'), 'user changes');
    const replay = installMediator({
      registry,
      prompt: rejectingPrompt,
      runDeferred: async () => {},
    });
    expectOk(
      await replay.dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'agent-harness',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await fs.readFile(path.join(cwd, '.claude/skills/inspect/SKILL.md'), 'utf8')).toContain(
      'Inspect warehouse.',
    );
    expect(await fs.readFile(path.join(cwd, 'domain.txt'), 'utf8')).toBe('user changes');
    expect((await fsManifestStore.read(projectScopeRoot(cwd)))!.answers).toEqual(before.answers);
  });
});
