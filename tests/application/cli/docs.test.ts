/**
 * `keel docs sync|check` through the real commander program.
 *
 * What the handler tests cannot say: the CLI half of the contract a
 * pipeline wires itself to — `check` throws on drift (the executable
 * turns that into exit 1) and stays silent when the index is right,
 * and `sync` is what makes it silent.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { installMediator } from '../../support/factory.js';

let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-docs-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});

function program(logger: FakeLogger) {
  return buildProgram({
    mediator: installMediator({ runDeferred: async () => {} }),
    logger,
    version: 'test',
    availableStacks: [],
    availableVerticals: [],
    cwd: () => cwd,
    serveUi: () => {
      throw new Error('unexpected UI start');
    },
  });
}

const run = (args: readonly string[]): Promise<unknown> =>
  program(new FakeLogger()).parseAsync([...args], { from: 'user' });

describe('keel docs', () => {
  it('checks green after a scaffold, red after an edit, green after a sync', async () => {
    await run(['new', '--stack=go-cli', '--yes']);
    await expect(run(['docs', 'check'])).resolves.toBeDefined();

    const root = path.join(cwd, 'AGENTS.md');
    const text = await fs.readFile(root, 'utf8');
    await fs.writeFile(root, text.replace('**Map** —', '**Reworded** —'));
    await expect(run(['docs', 'check'])).rejects.toThrow(/out of date/);

    await run(['docs', 'sync']);
    await expect(run(['docs', 'check'])).resolves.toBeDefined();
  });

  it('reports rather than writes under --dry-run', async () => {
    await run(['new', '--stack=go-cli', '--yes']);
    const root = path.join(cwd, 'AGENTS.md');
    const text = await fs.readFile(root, 'utf8');
    await fs.writeFile(root, text.replace('**Map** —', '**Reworded** —'));
    await run(['docs', 'sync', '--dry-run']);
    expect(await fs.readFile(root, 'utf8')).toContain('**Reworded** —');
  });
});
