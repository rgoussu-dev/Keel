/**
 * `Adapter.sharesAnswersWith` — the engine half of composable
 * entrypoints.
 *
 * Sticky memory is keyed per adapter, which is right while one
 * question belongs to one adapter and wrong the moment two adapters
 * cover the same dimension of the same project and declare the same
 * question. The composable entrypoint bootstraps are that case: a tag
 * set carrying both `arch.cli` and `arch.server-http` resolves two of
 * them, and without this the user is asked for the project's identity
 * twice with nothing reconciling two different answers.
 *
 * Two properties matter and they are separate: the borrowing adapter
 * must not be *asked*, and the borrowed value must be *recorded*
 * under its own id — downstream adapters read the manifest, so an
 * unrecorded answer puts their output under a stale default while the
 * rest of the project sits under the answered one.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import { installVertical } from '../../../src/domain/core/install.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../src/infrastructure/process/spawn-process-runner.js';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';
import type { Adapter, Question, Vertical } from '../../../src/domain/contract/composition.js';
import type { Prompt } from '../../../src/domain/contract/ports/prompt.js';

const NAME: Question = {
  id: 'projectName',
  prompt: 'Project name',
  doc: '',
  default: 'the-default',
  memory: 'sticky',
};

/** Answers the first ask and fails every later one. */
const askedOnce = (reply: string): Prompt => {
  let asks = 0;
  return {
    ask: () => {
      asks += 1;
      if (asks > 1) throw new Error(`asked ${asks} times; the sibling's answer was not borrowed`);
      return Promise.resolve(reply);
    },
  };
};

const seen: Record<string, string> = {};

const first: Adapter = {
  id: 'test/first',
  vertical: 'test',
  covers: ['entrypoint'],
  predicate: { requires: ['test.on'] },
  questions: [NAME],
  contribute: (ctx) => {
    seen['test/first'] = ctx.answer('projectName');
    return {};
  },
};

const second: Adapter = {
  id: 'test/second',
  vertical: 'test',
  covers: [],
  predicate: { requires: ['test.on'] },
  questions: [NAME],
  after: ['test/first'],
  sharesAnswersWith: ['test/first'],
  contribute: (ctx) => {
    seen['test/second'] = ctx.answer('projectName');
    return {};
  },
};

const vertical: Vertical = {
  id: 'test',
  description: 'two adapters, one project identity',
  dimensions: ['entrypoint'],
  adapters: [first, second],
};

const cwds: string[] = [];

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
  cwds.length = 0;
});

const install = async (prompt: Prompt): Promise<Record<string, Record<string, string>>> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-shared-answers-'));
  cwds.push(cwd);
  const result = await installVertical({
    vertical,
    manifest: { ...emptyManifestV2('2026-08-21T00:00:00Z', '0.5.0-alpha'), tags: ['test.on'] },
    tree: new FsTree(cwd),
    mode: 'interactive',
    prompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-21T12:00:00Z',
  });
  return result.manifest.answers as Record<string, Record<string, string>>;
};

describe('sharesAnswersWith', () => {
  it('asks once and hands the answer to the sibling', async () => {
    const answers = await install(askedOnce('answered-once'));

    expect(seen).toEqual({
      'test/first': 'answered-once',
      'test/second': 'answered-once',
    });
    // Recorded under both ids: the manifest is what downstream
    // adapters read, and `the-default` there is the bug.
    expect(answers['test/first']).toEqual({ projectName: 'answered-once' });
    expect(answers['test/second']).toEqual({ projectName: 'answered-once' });
  });

  it("prefers the adapter's own recorded answer over the sibling's", async () => {
    // Reapplying an adapter that already has an answer must not be
    // retro-fitted with its sibling's.
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-shared-answers-'));
    cwds.push(cwd);
    const result = await installVertical({
      vertical,
      manifest: {
        ...emptyManifestV2('2026-08-21T00:00:00Z', '0.5.0-alpha'),
        tags: ['test.on'],
        answers: {
          'test/first': { projectName: 'from-first' },
          'test/second': { projectName: 'its-own' },
        },
      },
      tree: new FsTree(cwd),
      mode: 'interactive',
      prompt: {
        ask: () => Promise.reject(new Error('nothing should be asked')),
      },
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-21T12:00:00Z',
    });

    expect(seen['test/second']).toBe('its-own');
    expect(result.manifest.answers['test/second']).toEqual({ projectName: 'its-own' });
  });
});
