import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../src/infrastructure/process/spawn-process-runner.js';
import { ContributionConflictError, applyContributions } from '../../../src/domain/core/apply.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';
import type { Adapter, Contribution } from '../../../src/domain/contract/composition.js';

const adapter = (
  id: string,
  contribution: Contribution,
  questions?: Adapter['questions'],
): Adapter => ({
  id,
  vertical: 'test',
  covers: [],
  predicate: {},
  ...(questions !== undefined ? { questions } : {}),
  contribute: () => contribution,
});

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-apply-'));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe('applyContributions', () => {
  it('writes files declared by adapters to the tree', async () => {
    const tree = new FsTree(tmp);
    const a = adapter('a', {
      files: [{ path: 'src/app.java', content: 'class App {}' }],
    });
    await applyContributions({
      adapters: [a],
      answers: {},
      manifest: emptyManifestV2('now', '0.4.0'),
      tree,
      logger: new FakeLogger(),
      cwd: tmp,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
    });
    expect(tree.read('src/app.java')?.toString()).toBe('class App {}');
  });

  it('chains patches across adapters', async () => {
    const tree = new FsTree(tmp);
    const seed = adapter('seed', {
      files: [{ path: 'pom.xml', content: '<project></project>' }],
    });
    const patcher1 = adapter('p1', {
      patches: [{ target: 'pom.xml', apply: (s) => s.replace('</project>', '<a/></project>') }],
    });
    const patcher2 = adapter('p2', {
      patches: [{ target: 'pom.xml', apply: (s) => s.replace('</project>', '<b/></project>') }],
    });
    await applyContributions({
      adapters: [seed, patcher1, patcher2],
      answers: {},
      manifest: emptyManifestV2('now', '0.4.0'),
      tree,
      logger: new FakeLogger(),
      cwd: tmp,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
    });
    expect(tree.read('pom.xml')?.toString()).toBe('<project><a/><b/></project>');
  });

  it('conflicts when two adapters write the same file', async () => {
    const tree = new FsTree(tmp);
    const a = adapter('a', { files: [{ path: 'x.txt', content: 'a' }] });
    const b = adapter('b', { files: [{ path: 'x.txt', content: 'b' }] });
    await expect(
      applyContributions({
        adapters: [a, b],
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
      }),
    ).rejects.toBeInstanceOf(ContributionConflictError);
  });

  it('conflicts when a file write would overwrite an on-disk file', async () => {
    const tree = new FsTree(tmp);
    await fs.writeFile(path.join(tmp, 'README.md'), 'hello');
    const a = adapter('a', { files: [{ path: 'README.md', content: 'goodbye' }] });
    await expect(
      applyContributions({
        adapters: [a],
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
      }),
    ).rejects.toBeInstanceOf(ContributionConflictError);
  });

  it('errors when a patch targets a missing file', async () => {
    const tree = new FsTree(tmp);
    const a = adapter('a', {
      patches: [{ target: 'nope.txt', apply: (s) => s }],
    });
    await expect(
      applyContributions({
        adapters: [a],
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
      }),
    ).rejects.toBeInstanceOf(ContributionConflictError);
  });

  it('seeds a missing patch target instead of erroring (the shared-file upsert)', async () => {
    const tree = new FsTree(tmp);
    const a = adapter('a', {
      patches: [
        {
          target: 'shared.yaml',
          seed: 'services: {}\n',
          apply: (s) => s.replace('services: {}', 'services:\n  redis: {}'),
        },
      ],
    });
    await applyContributions({
      adapters: [a],
      answers: {},
      manifest: emptyManifestV2('now', '0.4.0'),
      tree,
      logger: new FakeLogger(),
      cwd: tmp,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
    });
    expect(tree.read('shared.yaml')?.toString()).toBe('services:\n  redis: {}\n');
  });

  it('a seeded patch still transforms the existing file when the target is present', async () => {
    const tree = new FsTree(tmp);
    tree.write('shared.yaml', 'services:\n  postgres: {}\n');
    const a = adapter('a', {
      patches: [
        {
          target: 'shared.yaml',
          seed: 'services: {}\n',
          apply: (s) => `${s}  redis: {}\n`,
        },
      ],
    });
    await applyContributions({
      adapters: [a],
      answers: {},
      manifest: emptyManifestV2('now', '0.4.0'),
      tree,
      logger: new FakeLogger(),
      cwd: tmp,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
    });
    expect(tree.read('shared.yaml')?.toString()).toBe('services:\n  postgres: {}\n  redis: {}\n');
  });

  it('aggregates tagsAdd across adapters, deduplicated', async () => {
    const tree = new FsTree(tmp);
    const a = adapter('a', { tagsAdd: ['runtime.graalvm-native', 'feature.foo'] });
    const b = adapter('b', { tagsAdd: ['feature.foo', 'feature.bar'] });
    const r = await applyContributions({
      adapters: [a, b],
      answers: {},
      manifest: emptyManifestV2('now', '0.4.0'),
      tree,
      logger: new FakeLogger(),
      cwd: tmp,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
    });
    expect([...r.tagsAdded].sort()).toEqual([
      'feature.bar',
      'feature.foo',
      'runtime.graalvm-native',
    ]);
  });

  describe('skill staging', () => {
    const run = (adapters: readonly Adapter[], tree: FsTree) =>
      applyContributions({
        adapters,
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
      });

    it('stages SKILL.md and supporting files, returning provenance records', async () => {
      const tree = new FsTree(tmp);
      const a = adapter('a', {
        skills: [
          {
            name: 'debug',
            description: 'Debug the native build. Use when a native build fails.',
            body: '# Debug\n\nsteps',
            supporting: [{ path: 'reference.md', content: 'lookup table\n' }],
          },
        ],
      });
      const r = await run([a], tree);

      expect(tree.read('.claude/skills/debug/SKILL.md')?.toString()).toBe(
        '---\nname: debug\ndescription: Debug the native build. Use when a native build fails.\n---\n\n# Debug\n\nsteps\n',
      );
      expect(tree.read('.claude/skills/debug/reference.md')?.toString()).toBe('lookup table\n');
      expect(r.skills).toEqual([
        {
          adapterId: 'a',
          name: 'debug',
          files: [
            {
              path: '.claude/skills/debug/SKILL.md',
              sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            },
            {
              path: '.claude/skills/debug/reference.md',
              sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            },
          ],
        },
      ]);
    });

    it('refuses a skill name two adapters contribute, naming both origins', async () => {
      const tree = new FsTree(tmp);
      const skill = { name: 'run', description: 'd', body: 'b' };
      const failure = await run(
        [adapter('a', { skills: [skill] }), adapter('b', { skills: [skill] })],
        tree,
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(failure).toBeInstanceOf(ContributionConflictError);
      expect((failure as ContributionConflictError).kind).toBe('skill-collision');
      expect((failure as Error).message).toContain("adapter 'b'");
      expect((failure as Error).message).toContain("adapter 'a'");
      expect((failure as Error).message).toContain("skill 'run'");
    });

    it('refuses a malformed spec naming the adapter that contributed it', async () => {
      const tree = new FsTree(tmp);
      const a = adapter('bad-plugin/skill', {
        skills: [{ name: 'Not A Name', description: 'd', body: 'b' }],
      });
      await expect(run([a], tree)).rejects.toThrow(
        /adapter 'bad-plugin\/skill' contributes a malformed skill/,
      );
    });

    it('refuses a supporting path that escapes the skill directory', async () => {
      const tree = new FsTree(tmp);
      const a = adapter('a', {
        skills: [
          {
            name: 'esc',
            description: 'd',
            body: 'b',
            supporting: [{ path: '../../settings.json', content: '{}' }],
          },
        ],
      });
      await expect(run([a], tree)).rejects.toThrow(/malformed skill/);
    });

    it('reapply rewrites an edited skill file pristine', async () => {
      const tree = new FsTree(tmp);
      await fs.outputFile(path.join(tmp, '.claude/skills/run/SKILL.md'), 'edited by hand\n');
      const a = adapter('a', { skills: [{ name: 'run', description: 'd', body: 'b' }] });
      await applyContributions({
        adapters: [a],
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        mode: 'reapply',
      });
      expect(tree.read('.claude/skills/run/SKILL.md')?.toString()).toBe(
        '---\nname: run\ndescription: d\n---\n\nb\n',
      );
    });

    it('conflicts on install when the skill file already exists on disk', async () => {
      const tree = new FsTree(tmp);
      await fs.outputFile(path.join(tmp, '.claude/skills/run/SKILL.md'), 'already there\n');
      const a = adapter('a', { skills: [{ name: 'run', description: 'd', body: 'b' }] });
      await expect(run([a], tree)).rejects.toBeInstanceOf(ContributionConflictError);
    });
  });

  it('exposes resolved answers via ctx.answer', async () => {
    const tree = new FsTree(tmp);
    const a: Adapter = {
      id: 'a',
      vertical: 'test',
      covers: [],
      predicate: {},
      questions: [{ id: 'targets', prompt: '', doc: '', default: 'linux', memory: 'sticky' }],
      contribute: (ctx) => ({
        files: [{ path: 'targets.txt', content: ctx.answer('targets') }],
      }),
    };
    await applyContributions({
      adapters: [a],
      answers: { a: { targets: 'darwin-arm64' } },
      manifest: emptyManifestV2('now', '0.4.0'),
      tree,
      logger: new FakeLogger(),
      cwd: tmp,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
    });
    expect(tree.read('targets.txt')?.toString()).toBe('darwin-arm64');
  });

  describe('reapply mode', () => {
    const reapply = (adapters: readonly Adapter[], tree: FsTree) =>
      applyContributions({
        adapters,
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        mode: 'reapply',
      });

    it('overwrites a divergent on-disk file instead of conflicting', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'README.md'), 'edited by hand\n');
      await reapply(
        [adapter('a', { files: [{ path: 'README.md', content: 'pristine\n' }] })],
        tree,
      );
      expect(tree.read('README.md')?.toString()).toBe('pristine\n');
      expect(tree.changes()).toEqual([{ kind: 'modify', path: 'README.md' }]);
    });

    it('skips byte-identical file writes so staged changes stay an honest diff', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'README.md'), 'pristine\n');
      await reapply(
        [adapter('a', { files: [{ path: 'README.md', content: 'pristine\n' }] })],
        tree,
      );
      expect(tree.changes()).toEqual([]);
    });

    it('treats an idempotent patch as a no-op', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, '.gitignore'), 'node_modules\nbuild\n');
      const guarded = adapter('a', {
        patches: [
          {
            target: '.gitignore',
            apply: (s) => (s.includes('build') ? s : `${s}build\n`),
          },
        ],
      });
      await reapply([guarded], tree);
      expect(tree.changes()).toEqual([]);
    });

    it('conflicts when a patch would change an already-patched file', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'build.gradle'), 'dependencies {\n}\n');
      const blind = adapter('a', {
        patches: [{ target: 'build.gradle', apply: (s) => `${s}// appended again\n` }],
      });
      const failure = await reapply([blind], tree).then(
        () => null,
        (e: unknown) => e,
      );
      expect(failure).toBeInstanceOf(ContributionConflictError);
      expect((failure as ContributionConflictError).kind).toBe('reapply-divergence');
      expect(tree.changes()).toEqual([]);
    });

    it('still seeds a patch target the working tree lost', async () => {
      const tree = new FsTree(tmp);
      const a = adapter('a', {
        patches: [
          {
            target: 'shared.yaml',
            seed: 'services: {}\n',
            apply: (s) => s.replace('services: {}', 'services:\n  redis: {}'),
          },
        ],
      });
      await reapply([a], tree);
      expect(tree.read('shared.yaml')?.toString()).toBe('services:\n  redis: {}\n');
    });
  });

  it('rejects ctx.answer for an undeclared question id', async () => {
    const tree = new FsTree(tmp);
    const a: Adapter = {
      id: 'a',
      vertical: 'test',
      covers: [],
      predicate: {},
      contribute: (ctx) => {
        ctx.answer('not-declared');
        return {};
      },
    };
    await expect(
      applyContributions({
        adapters: [a],
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
      }),
    ).rejects.toThrow(/did not declare it/);
  });
});
