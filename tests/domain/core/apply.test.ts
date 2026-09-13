import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../src/infrastructure/process/spawn-process-runner.js';
import {
  ContributionConflictError,
  ENGINE_REGIONS,
  applyContributions,
  type ApplyMode,
} from '../../../src/domain/core/apply.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { hashRegion, regionPatch } from '../../../src/domain/contract/region.js';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';
import {
  ENGINE_CONTRIBUTOR_ID,
  type Adapter,
  type Contribution,
} from '../../../src/domain/contract/composition.js';

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
        manifest: { ...emptyManifestV2('now', '0.4.0'), tags: ['agentic.harness'] },
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
        manifest: { ...emptyManifestV2('now', '0.4.0'), tags: ['agentic.harness'] },
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

    it('re-renders a region an idempotent patch owns, and reports the write', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(
        path.join(tmp, 'AGENTS.md'),
        '# prose\n<!-- begin -->\nedited by hand\n<!-- end -->\nmore prose\n',
      );
      const owned = adapter('a', {
        patches: [
          {
            target: 'AGENTS.md',
            apply: (s) =>
              s.replace(
                /<!-- begin -->[\s\S]*<!-- end -->/,
                '<!-- begin -->\nrendered\n<!-- end -->',
              ),
          },
        ],
      });
      await reapply([owned], tree);
      expect(tree.read('AGENTS.md')?.toString()).toBe(
        '# prose\n<!-- begin -->\nrendered\n<!-- end -->\nmore prose\n',
      );
      expect(tree.changes()).toEqual([{ kind: 'modify', path: 'AGENTS.md' }]);
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

    it('gives a byte-identical whole file its declared mode back on reapply', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'run.sh'), '#!/bin/sh\n', { mode: 0o644 });
      const a = adapter('a', { files: [{ path: 'run.sh', content: '#!/bin/sh\n', mode: 0o755 }] });
      await reapply([a], tree);
      expect(tree.changes()).toEqual([{ kind: 'modify', path: 'run.sh' }]);
      await tree.commit();
      expect((await fs.stat(path.join(tmp, 'run.sh'))).mode & 0o111).not.toBe(0);

      const again = new FsTree(tmp);
      await reapply([a], again);
      expect(again.changes()).toEqual([]);
    });

    it('gives a byte-identical script its declared mode back on reapply', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'hook.sh'), '#!/bin/sh\n', { mode: 0o644 });
      const a = adapter('a', {
        patches: [{ target: 'hook.sh', seed: '#!/bin/sh\n', mode: 0o755, apply: (s) => s }],
      });
      await reapply([a], tree);
      expect(tree.changes()).toEqual([{ kind: 'modify', path: 'hook.sh' }]);
      await tree.commit();
      expect((await fs.stat(path.join(tmp, 'hook.sh'))).mode & 0o111).not.toBe(0);

      // And nothing at all once disk carries it.
      const again = new FsTree(tmp);
      await reapply([a], again);
      expect(again.changes()).toEqual([]);
    });

    it('seeds a patch target with the mode the patch declares', async () => {
      const tree = new FsTree(tmp);
      const a = adapter('a', {
        patches: [{ target: 'hook.sh', seed: '#!/bin/sh\n', mode: 0o755, apply: (s) => s }],
      });
      await reapply([a], tree);
      await tree.commit();
      expect((await fs.stat(path.join(tmp, 'hook.sh'))).mode & 0o111).not.toBe(0);
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

  describe('owned regions', () => {
    const apply = (adapters: readonly Adapter[], tree: FsTree, mode: ApplyMode = 'install') =>
      applyContributions({
        adapters,
        answers: {},
        manifest: emptyManifestV2('now', '0.4.0'),
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        mode,
      });
    const failure = (run: Promise<unknown>) =>
      run.then(
        () => null,
        (e: unknown) => e as ContributionConflictError,
      );
    const step = hashRegion('step');
    const other = hashRegion('other');

    it('lets a region-owning patch land its region on install and re-render it on reapply', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'hook.sh'), 'set -e\n');
      const first = adapter('a', {
        patches: [regionPatch({ target: 'hook.sh', region: step, body: 'fmt' })],
      });
      await apply([first], tree);
      await tree.commit();
      expect(tree.read('hook.sh')?.toString()).toBe(`set -e\n\n${step.begin}\nfmt\n${step.end}\n`);

      const second = adapter('a', {
        patches: [regionPatch({ target: 'hook.sh', region: step, body: 'fmt --all' })],
      });
      await apply([second], tree, 'reapply');
      expect(tree.read('hook.sh')?.toString()).toBe(
        `set -e\n\n${step.begin}\nfmt --all\n${step.end}\n`,
      );
      expect(tree.changes()).toEqual([{ kind: 'modify', path: 'hook.sh' }]);
    });

    it('refuses a transform that changed anything outside its declared region, naming the adapter', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'hook.sh'), `set -e\n${step.begin}\nold\n${step.end}\n`);
      const escaping = adapter('kit', {
        patches: [
          {
            target: 'hook.sh',
            regions: [step],
            apply: (s) => s.replace('old', 'new').replace('set -e', 'set -eu'),
          },
        ],
      });
      const error = await failure(apply([escaping], tree));
      expect(error).toBeInstanceOf(ContributionConflictError);
      expect(error?.kind).toBe('region-escape');
      expect(error?.adapterId).toBe('kit');
      expect(error?.message).toContain(
        "adapter 'kit': its patch on 'hook.sh' changed content outside the region it declares",
      );
      expect(error?.message).toContain(`'${step.begin}'`);
      expect(tree.changes()).toEqual([]);
    });

    it('holds each declared region as its own boundary on a file carrying several', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(
        path.join(tmp, 'ci.yml'),
        `${step.begin}\na\n${step.end}\nmine: 1\n${other.begin}\nb\n${other.end}\n`,
      );
      const strays = adapter('ci', {
        patches: [
          {
            target: 'ci.yml',
            regions: [step],
            apply: (s) => s.replace('\nb\n', '\nB\n'),
          },
        ],
      });
      expect((await failure(apply([strays], tree)))?.kind).toBe('region-escape');
      const owner = adapter('ci', {
        patches: [
          { target: 'ci.yml', regions: [step, other], apply: (s) => s.replace('\nb\n', '\nB\n') },
        ],
      });
      await apply([owner], tree);
      expect(tree.read('ci.yml')?.toString()).toContain(`${other.begin}\nB\n`);
    });

    it('refuses a region two adapters of the run both declare on one target, naming both', async () => {
      const tree = new FsTree(tmp);
      const seeded = (id: string) =>
        adapter(id, {
          patches: [regionPatch({ target: 'shared.ini', seed: '', region: step, body: id })],
        });
      const error = await failure(apply([seeded('one'), seeded('two')], tree));
      expect(error?.kind).toBe('region-collision');
      expect(error?.adapterId).toBe('two');
      expect(error?.message).toContain("adapter 'two' declares region");
      expect(error?.message).toContain("adapter 'one' already owns");
      // The same region of a different file is a different region.
      const elsewhere = adapter('two', {
        patches: [regionPatch({ target: 'other.ini', seed: '', region: step, body: 'two' })],
      });
      await apply([seeded('one'), elsewhere], new FsTree(tmp));
    });

    it('takes two spellings of one path as one file, as the Tree does', async () => {
      const tree = new FsTree(tmp);
      const one = adapter('one', {
        patches: [regionPatch({ target: 'shared.ini', seed: '', region: step, body: 'one' })],
      });
      const alias = adapter('two', {
        patches: [regionPatch({ target: './shared.ini', seed: '', region: step, body: 'two' })],
      });
      const error = await failure(apply([one, alias], tree));
      expect(error?.kind).toBe('region-collision');
      expect(error?.message).toContain("adapter 'one' already owns");
      const slashed = adapter('three', {
        patches: [regionPatch({ target: '/shared.ini', seed: '', region: step, body: 'three' })],
      });
      expect((await failure(apply([one, slashed], new FsTree(tmp))))?.kind).toBe(
        'region-collision',
      );
    });

    it('treats a transform that breaks its own sentinel pair as an escape, not an unclassified error', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'hook.sh'), `set -e\n${step.begin}\nold\n${step.end}\n`);
      const breaking = adapter('kit', {
        patches: [{ target: 'hook.sh', regions: [step], apply: (s) => s.replace(step.end, '') }],
      });
      const error = await failure(apply([breaking], tree));
      expect(error).toBeInstanceOf(ContributionConflictError);
      expect(error?.kind).toBe('region-escape');
      expect(error?.message).toContain("adapter 'kit': its patch on 'hook.sh' left the sentinels");
      // A pair already broken on disk is the file's fault, reported as the fix-it message.
      await fs.writeFile(path.join(tmp, 'hook.sh'), `set -e\n${step.begin}\norphan\n`);
      const honest = adapter('kit', {
        patches: [regionPatch({ target: 'hook.sh', region: step, body: 'x' })],
      });
      await expect(apply([honest], new FsTree(tmp))).rejects.toThrow(/sentinels are broken/);
    });

    it('lets the engine, under its own identity, re-render a slot it pre-owns', async () => {
      const tree = new FsTree(tmp);
      const slot = ENGINE_REGIONS[0]!;
      await fs.writeFile(path.join(tmp, slot.target), `${slot.region.begin}\n${slot.region.end}\n`);
      const projection = adapter(ENGINE_CONTRIBUTOR_ID, {
        patches: [
          regionPatch({
            target: slot.target,
            region: slot.region,
            body: '- map',
            padding: 'blank',
          }),
        ],
      });
      await apply([projection], tree);
      expect(tree.read(slot.target)?.toString()).toBe(
        `${slot.region.begin}\n\n- map\n\n${slot.region.end}\n`,
      );
    });

    it('refuses an adapter declaring a region twice — one patch owns a region', async () => {
      const tree = new FsTree(tmp);
      const twice = adapter('a', {
        patches: [
          regionPatch({ target: 'f', seed: '', region: step, body: 'x' }),
          regionPatch({ target: 'f', seed: '', region: step, body: 'y' }),
        ],
      });
      const error = await failure(apply([twice], tree));
      expect(error?.kind).toBe('region-collision');
      expect(error?.message).toContain("adapter 'a' declares region");
      expect(error?.message).toContain('twice');
    });

    it('attributes the engine’s own regions to the engine: an adapter claiming one is refused naming it', async () => {
      const tree = new FsTree(tmp);
      const slot = ENGINE_REGIONS[0]!;
      await fs.writeFile(path.join(tmp, slot.target), `${slot.region.begin}\n${slot.region.end}\n`);
      const squatter = adapter('plugin/index', {
        patches: [regionPatch({ target: slot.target, region: slot.region, body: 'my map' })],
      });
      const error = await failure(apply([squatter], tree));
      expect(error?.kind).toBe('region-collision');
      expect(error?.adapterId).toBe('plugin/index');
      expect(error?.message).toContain(
        `'${slot.region.begin}' of '${slot.target}', which the engine already owns`,
      );
      expect(ENGINE_CONTRIBUTOR_ID).toBe('keel:engine');
      expect(ENGINE_REGIONS.map((r) => `${r.target} ${r.region.begin}`)).toEqual([
        'AGENTS.md <!-- keel:map:begin -->',
        'AGENTS.md <!-- keel:skills-index:begin -->',
      ]);
    });

    it('refuses a malformed region naming the adapter, before running its transform', async () => {
      const tree = new FsTree(tmp);
      let ran = false;
      const malformed = adapter('p', {
        patches: [
          {
            target: 'f',
            seed: '',
            regions: [{ begin: '# same', end: '# same' }],
            apply: (s) => {
              ran = true;
              return s;
            },
          },
        ],
      });
      await expect(apply([malformed], tree)).rejects.toThrow(
        /adapter 'p', patch on 'f': a region's 'begin' and 'end' markers must differ/,
      );
      expect(ran).toBe(false);
    });

    it('a patch declaring no region is an ordinary transform, free to change the whole file', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'f'), 'a\n');
      await apply([adapter('a', { patches: [{ target: 'f', apply: (s) => `${s}b\n` }] })], tree);
      expect(tree.read('f')?.toString()).toBe('a\nb\n');
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
