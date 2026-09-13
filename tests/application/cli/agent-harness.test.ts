import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { fsManifestStore } from '../../../src/infrastructure/manifest/fs-manifest-store.js';
import { projectScopeRoot } from '../../../src/domain/contract/manifest.js';
import { installMediator } from '../../support/factory.js';

let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-harness-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});

describe('CLI harness opt-out', () => {
  it.each([false, true])(
    'maps --no-agent-harness=%s through the real install command',
    async (optOut) => {
      const program = buildProgram({
        mediator: installMediator({ runDeferred: async () => {} }),
        logger: new FakeLogger(),
        version: 'test',
        availableStacks: [],
        availableVerticals: [],
        cwd: () => cwd,
        serveUi: () => {
          throw new Error('unexpected UI start');
        },
      });
      await program.parseAsync(
        ['new', '--stack=go-cli', '--yes', ...(optOut ? ['--no-agent-harness'] : [])],
        { from: 'user' },
      );
      const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
      expect(manifest?.tags.includes('agentic.harness')).toBe(!optOut);
      expect(await fs.pathExists(path.join(cwd, 'AGENTS.md'))).toBe(!optOut);
    },
  );
});
