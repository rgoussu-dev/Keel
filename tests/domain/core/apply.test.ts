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
  collectHarness,
  newOwnership,
  realizeHarness,
  regionKey,
  type ApplyMode,
  type HarnessContribution,
} from '../../../src/domain/core/apply.js';
import type { HookSpec } from '../../../src/domain/contract/hook.js';
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

  describe('hook staging', () => {
    const run = (
      adapters: readonly Adapter[],
      tree: FsTree,
      mode: ApplyMode = 'install',
      tags: readonly string[] = ['agentic.harness'],
    ) =>
      applyContributions({
        adapters,
        answers: {},
        manifest: { ...emptyManifestV2('now', '0.4.0'), tags: [...tags] },
        tree,
        logger: new FakeLogger(),
        cwd: tmp,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        mode,
      });
    const failure = (promise: Promise<unknown>) =>
      promise.then(
        () => null,
        (e: unknown) => e as ContributionConflictError,
      );
    const step = hashRegion('format-step');
    const gate = (over: Partial<HookSpec> = {}): HookSpec => ({
      name: 'gate',
      event: 'PreToolUse',
      matcher: 'Bash',
      script: `#!/usr/bin/env bash\nset -eu\n${step.begin}\n# none\n${step.end}\nexit 0\n`,
      reminders: ['gate: failed.'],
      slots: [step],
      ...over,
    });
    const SCRIPT = '.claude/hooks/gate.sh';
    const SETTINGS = '.claude/settings.json';

    it('stages the script executable and wires it into a seeded settings file', async () => {
      const tree = new FsTree(tmp);
      await run([adapter('kit', { hooks: [gate()] })], tree);
      await tree.commit();
      expect(tree.read(SCRIPT)?.toString()).toBe(gate().script);
      expect((await fs.stat(path.join(tmp, SCRIPT))).mode & 0o111).not.toBe(0);
      expect(JSON.parse(tree.read(SETTINGS)!.toString())).toEqual({
        $schema: 'https://json.schemastore.org/claude-code-settings.json',
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'bash .claude/hooks/gate.sh' }],
            },
          ],
        },
      });
    });

    it('records the script under its adapter and the settings under the engine', () => {
      const tree = new FsTree(tmp);
      const pending: HarnessContribution[] = [];
      const kit = adapter('kit', { hooks: [gate()] });
      collectHarness(kit, { hooks: [gate()] }, pending);
      const realized = realizeHarness(
        pending,
        tree,
        ['agentic.harness'],
        new FakeLogger(),
        newOwnership(),
      );
      expect(realized.files).toEqual([
        { adapterId: 'kit', path: SCRIPT, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
        {
          adapterId: ENGINE_CONTRIBUTOR_ID,
          path: SETTINGS,
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ]);
    });

    it('refuses a hook name two adapters contribute, naming both origins', async () => {
      const error = await failure(
        run(
          [adapter('a', { hooks: [gate()] }), adapter('b', { hooks: [gate()] })],
          new FsTree(tmp),
        ),
      );
      expect(error).toBeInstanceOf(ContributionConflictError);
      expect(error?.kind).toBe('hook-collision');
      expect(error?.message).toContain("adapter 'b' contributes hook 'gate', which adapter 'a'");
      const twice = await failure(
        run([adapter('a', { hooks: [gate(), gate()] })], new FsTree(tmp)),
      );
      expect(twice?.message).toContain("contributes hook 'gate' twice");
    });

    it('refuses a malformed hook naming the adapter, before anything is staged', async () => {
      const tree = new FsTree(tmp);
      const plugin = adapter('bad-plugin/hook', {
        hooks: [gate({ script: '#!/usr/bin/env node\nprocess.exit(0)\n', slots: [] })],
      });
      await expect(run([plugin], tree)).rejects.toThrow(
        /adapter 'bad-plugin\/hook' contributes a malformed hook — script: must start with a sh or bash shebang/,
      );
      expect(tree.changes()).toEqual([]);
    });

    it('conflicts on install over an existing script, and reapplies pristine around its slot', async () => {
      const onDisk = gate()
        .script.replace('# none', 'fmt --all')
        .replace('set -eu', 'set -eu # hand-edited');
      await fs.outputFile(path.join(tmp, SCRIPT), onDisk);
      const kit = adapter('kit', { hooks: [gate()] });
      expect((await failure(run([kit], new FsTree(tmp))))?.kind).toBe('overwrite');
      const tree = new FsTree(tmp);
      await run([kit], tree, 'reapply');
      expect(tree.read(SCRIPT)?.toString()).toBe(gate().script.replace('# none', 'fmt --all'));
    });

    it('lands a harness patch in a hook an adapter resolving after it stages', async () => {
      const tree = new FsTree(tmp);
      const styler = adapter('style', {
        harnessPatches: [
          regionPatch({ target: SCRIPT, region: step, body: 'fmt --all', whenAbsent: 'keep' }),
        ],
      });
      await run([styler, adapter('kit', { hooks: [gate()] })], tree);
      expect(tree.read(SCRIPT)?.toString()).toBe(gate().script.replace('# none', 'fmt --all'));
    });

    it('refuses a run whose hooks may inject more than five reminders, naming each share', async () => {
      const tree = new FsTree(tmp);
      const three = ['one.', 'two.', 'three.'];
      const error = await failure(
        run(
          [
            adapter('a', { hooks: [gate({ name: 'first', reminders: three })] }),
            adapter('b', { hooks: [gate({ name: 'second', reminders: three })] }),
          ],
          tree,
        ),
      );
      expect(error?.kind).toBe('reminder-budget');
      expect(error?.message).toContain("may inject 6 reminders ('a' 3, 'b' 3) — at most 5");
      expect(tree.changes()).toEqual([]);
    });

    it('suppresses hooks without the harness tag, counting them', async () => {
      const tree = new FsTree(tmp);
      const result = await run([adapter('kit', { hooks: [gate()] })], tree, 'install', []);
      expect(result.skippedHarnessElements).toBe(1);
      expect(tree.changes()).toEqual([]);
    });

    it('leaves the project’s settings as they are, and a hook it disabled unwired', async () => {
      const own = `${JSON.stringify(
        { permissions: { allow: ['Bash(ls)'] }, env: { KEEL_DISABLED_HOOKS: 'gate' } },
        null,
        2,
      )}\n`;
      await fs.outputFile(path.join(tmp, SETTINGS), own);
      const tree = new FsTree(tmp);
      await run([adapter('kit', { hooks: [gate()] })], tree);
      expect(tree.read(SETTINGS)?.toString()).toBe(own);
      expect(tree.changes()).toEqual([{ kind: 'create', path: SCRIPT }]);
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

    it('lets the engine re-render a pre-owned slot once a run, and refuses its second claim', async () => {
      const tree = new FsTree(tmp);
      const slot = ENGINE_REGIONS[0]!;
      await fs.writeFile(path.join(tmp, slot.target), `${slot.region.begin}\n${slot.region.end}\n`);
      const projection = (body: string) =>
        adapter(ENGINE_CONTRIBUTOR_ID, {
          patches: [regionPatch({ target: slot.target, region: slot.region, body })],
        });
      const error = await failure(apply([projection('- one'), projection('- two')], tree));
      expect(error?.kind).toBe('region-collision');
      expect(error?.adapterId).toBe(ENGINE_CONTRIBUTOR_ID);
      expect(error?.message).toContain('twice');
      const inOnePatchList = adapter(ENGINE_CONTRIBUTOR_ID, {
        patches: [
          regionPatch({ target: slot.target, region: slot.region, body: '- one' }),
          regionPatch({ target: `./${slot.target}`, region: slot.region, body: '- two' }),
        ],
      });
      expect((await failure(apply([inOnePatchList], new FsTree(tmp))))?.kind).toBe(
        'region-collision',
      );
    });

    it('holds whitespace beside an existing region at the file edge as content', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'hook.sh'), `user\n${step.begin}\nold\n${step.end}\n`);
      const padding = adapter('kit', {
        patches: [
          {
            target: 'hook.sh',
            regions: [step],
            apply: (s) => s.replace('old', 'new').replace('user\n', 'user \n'),
          },
        ],
      });
      const error = await failure(apply([padding], tree));
      expect(error?.kind).toBe('region-escape');
      expect(error?.message).toContain('changed content outside the region');
    });

    it('refuses a transform that removed a region the file carried, and keeps a markerless slot legal', async () => {
      const tree = new FsTree(tmp);
      await fs.writeFile(path.join(tmp, 'hook.sh'), `set -e\n${step.begin}\nfmt\n${step.end}\n`);
      const deleting = adapter('kit', {
        patches: [
          {
            target: 'hook.sh',
            regions: [step],
            apply: (s) => s.replace(`${step.begin}\nfmt\n${step.end}\n`, ''),
          },
        ],
      });
      const error = await failure(apply([deleting], tree));
      expect(error?.kind).toBe('region-escape');
      expect(error?.adapterId).toBe('kit');
      expect(error?.message).toContain(`removed a region it declares ('${step.begin}')`);
      expect(tree.changes()).toEqual([]);

      await fs.writeFile(path.join(tmp, 'hook.sh'), 'set -e\n');
      const keep = adapter('kit', {
        patches: [
          regionPatch({ target: 'hook.sh', region: step, body: 'fmt', whenAbsent: 'keep' }),
        ],
      });
      const kept = new FsTree(tmp);
      await apply([keep], kept);
      expect(kept.read('hook.sh')?.toString()).toBe('set -e\n');
    });

    it('keys ownership by target and marker as a tuple, so a space in either cannot alias another pair', async () => {
      expect(regionKey('a', { begin: 'b c', end: 'e' })).not.toBe(
        regionKey('a b', { begin: 'c', end: 'e' }),
      );
      const tree = new FsTree(tmp);
      const one = adapter('one', {
        patches: [
          regionPatch({ target: 'a', seed: '', region: { begin: '# b c', end: '# e' }, body: '1' }),
        ],
      });
      const two = adapter('two', {
        patches: [
          regionPatch({ target: 'a b', seed: '', region: { begin: '# c', end: '# e' }, body: '2' }),
        ],
      });
      await apply([one, two], tree);
      expect(tree.read('a')?.toString()).toContain('1');
      expect(tree.read('a b')?.toString()).toContain('2');
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
