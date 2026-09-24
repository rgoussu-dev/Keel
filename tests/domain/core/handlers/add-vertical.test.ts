/**
 * Integration test for `keel add` — the `keel.add-vertical` command
 * dispatched through the mediator.
 *
 * Runs `keel new` first to seed a project, then layers `distribution`
 * on top and asserts the workflow files land, the manifest gains the
 * new vertical and tags, a second add of it is an empty plan that says
 * so, and the safeguards (unknown id, missing project, a file of the
 * user's in the way or gone) surface as domain errors. Then several
 * verticals at once, with what they need and what is there already,
 * and the installed ones a run re-renders (`--refresh`) or proposes.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { previewQuery, projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { RefusalError } from '../../../../src/domain/contract/refusal.js';
import { FakeClock } from '../../../../src/infrastructure/commons/fake-clock.js';
import type { ManifestStore } from '../../../../src/domain/contract/ports/manifest-store.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import {
  expectErr,
  expectOk,
  installMediator,
  runActionsExcept,
} from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const seedQuarkusCli = async (): Promise<void> => {
  const mediator = installMediator({
    runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'quarkus-cli',
        answers: {
          'walking-skeleton/quarkus-cli-bootstrap': {
            basePackage: 'com.acme.cli',
            projectName: 'shipper',
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
      }),
    ),
  );
};

const addDistribution = (dryRun = false) =>
  installMediator({ clock: new FakeClock('2026-04-27T08:00:00Z') }).dispatch(
    addVerticalCommand({
      cwd,
      verticals: ['distribution'],
      answers: {},
      interactive: false,
      dryRun,
    }),
  );

const reapplyDistribution = (overrides: { dryRun?: boolean; answers?: object } = {}) =>
  installMediator({ clock: new FakeClock('2026-04-28T09:00:00Z') }).dispatch(
    addVerticalCommand({
      cwd,
      verticals: ['distribution'],
      answers: (overrides.answers ?? {}) as Record<string, Record<string, string>>,
      interactive: false,
      dryRun: overrides.dryRun ?? false,
      reapply: true,
    }),
  );

describe('keel.add-vertical (keel add)', () => {
  it('layers distribution onto an existing quarkus-cli project', async () => {
    await seedQuarkusCli();
    const report = expectOk(await addDistribution());
    expect(report.subject).toBe('distribution');
    expect(report.committed).toBe(true);

    expect(await fs.pathExists(path.join(cwd, '.github/workflows/release.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, '.github/workflows/native-build.yml'))).toBe(true);

    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual([
      'agent-harness',
      'code-style',
      'dev-container',
      'distribution',
      'vcs',
      'walking-skeleton',
    ]);
    expect(manifest!.tags).toContain('runtime.graalvm-native');
    expect(manifest!.answers['distribution/quarkus-cli-native']).toEqual({
      targets: 'linux-amd64,linux-arm64,darwin-arm64',
    });
    expect(manifest!.updatedAt).toBe('2026-04-27T08:00:00Z');
  });

  it('adds nothing a second time, says so, and leaves the project untouched', async () => {
    await seedQuarkusCli();
    expectOk(await addDistribution());
    const release = path.join(cwd, '.github/workflows/release.yml');
    await fs.appendFile(release, '# kept by hand\n');

    // The store the project's manifest is persisted through, recording
    // every write it is asked for.
    const written: string[] = [];
    const manifests: ManifestStore = {
      read: (root) => fsManifestStore.read(root),
      write: (root, manifest) => {
        written.push(root);
        return fsManifestStore.write(root, manifest);
      },
    };
    const again = (dryRun: boolean) =>
      installMediator({ clock: new FakeClock('2026-05-01T00:00:00Z'), manifests }).dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['distribution'],
          answers: {},
          interactive: false,
          dryRun,
        }),
      );
    for (const dryRun of [true, false]) {
      expect(expectOk(await again(dryRun))).toEqual({
        subject: 'distribution',
        changes: [],
        actions: [],
        committed: !dryRun,
        notes: [
          "Distribution is already installed; 'keel add distribution --reapply' re-renders it",
        ],
      });
    }
    // Neither re-rendered nor restamped: the edit stands, and the
    // manifest the first add wrote is not written again.
    expect(await fs.readFile(release, 'utf8')).toContain('# kept by hand');
    expect(written).toEqual([]);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.updatedAt).toBe('2026-04-27T08:00:00Z');
  });

  it('rejects an unknown vertical id with available ones listed', async () => {
    await seedQuarkusCli();
    const error = expectErr(
      await installMediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['nonsense-vertical'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.unknown-vertical');
    expect(error.message).toMatch(/unknown vertical 'nonsense-vertical'.*distribution/);
  });

  it('names the vertical a mistyped id most likely meant', async () => {
    await seedQuarkusCli();
    const error = expectErr(
      await installMediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['container'],
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(error.code).toBe('keel.unknown-vertical');
    expect(error.message).toMatch(
      /^unknown vertical 'container' — did you mean 'containerization'\? Available: .*distribution/,
    );
  });

  describe('what the planner reads before anything is written', () => {
    const add = (vertical: string) =>
      installMediator({ runDeferred: async () => {} }).dispatch(
        addVerticalCommand({
          cwd,
          verticals: [vertical],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      );
    const installedIds = async (): Promise<readonly string[]> =>
      (await fsManifestStore.read(projectScopeRoot(cwd)))?.verticals.map((v) => v.id) ?? [];

    it('installs what a vertical needs with it, and says so first', async () => {
      expectOk(
        await installMediator({ runDeferred: async () => {} }).dispatch(
          newProjectCommand({
            cwd,
            stack: 'go-http',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      const before = await installedIds();

      const report = expectOk(await add('iac'));
      expect(report.subject).toBe('iac');
      expect(report.notes?.[0]).toBe(
        'added Container image, Distribution — needed by Infrastructure as code',
      );
      expect(await installedIds()).toEqual([...before, 'containerization', 'distribution', 'iac']);
      expect(await fs.pathExists(path.join(cwd, 'deploy/compose.yaml'))).toBe(true);
    });

    it("refuses what nothing keel can add makes installable, in the menu's words", async () => {
      await seedQuarkusCli();
      const error = expectErr(await add('iac'));
      expect(error.code).toBe('keel.uncoverable-vertical');
      expect(error.message).toBe(
        'Infrastructure as code needs an entrypoint this project does not have: HTTP server — a REST endpoint',
      );
    });
  });

  it('rejects when the project has no manifest', async () => {
    const error = expectErr(await addDistribution());
    expect(error.code).toBe('keel.not-initialised');
    expect(error.message).toMatch(/no project initialised/);
  });

  it('writes nothing under --dry-run', async () => {
    await seedQuarkusCli();
    const report = expectOk(await addDistribution(true));
    expect(report.committed).toBe(false);
    expect(await fs.pathExists(path.join(cwd, '.github/workflows/release.yml'))).toBe(false);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual([
      'agent-harness',
      'code-style',
      'dev-container',
      'vcs',
      'walking-skeleton',
    ]);
  });

  describe('a file the project keeps, or lost', () => {
    const add = (vertical: string, reapply = false) =>
      installMediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: [vertical],
          answers: {},
          interactive: false,
          dryRun: false,
          ...(reapply ? { reapply } : {}),
        }),
      );

    it('refuses a CI workflow the user already keeps, naming it, and writes nothing', async () => {
      await seedQuarkusCli();
      const own = path.join(cwd, '.github/workflows/ci.yml');
      await fs.outputFile(own, 'name: mine\n');

      const error = expectErr(await add('ci'));
      expect(error.code).toBe('keel.path-conflict');
      expect(error.message).toBe(
        "'.github/workflows/ci.yml' already exists, and keel does not overwrite a file this run did not write",
      );
      // No advice to move it: here the file may be keel's, and the
      // adapter that wanted it travels as data rather than in words.
      expect(error.message).not.toContain('move it aside');
      expect((error as RefusalError).refusal).toMatchObject({
        kind: 'path-conflict',
        path: '.github/workflows/ci.yml',
        adapterId: expect.stringMatching(/^ci\//) as unknown,
      });
      expect(await fs.readFile(own, 'utf8')).toBe('name: mine\n');
      const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
      expect(manifest!.verticals.map((v) => v.id)).not.toContain('ci');
    });

    it('refuses a patch target the user deleted, naming it', async () => {
      await seedQuarkusCli();
      await fs.remove(path.join(cwd, 'README.md'));

      const error = expectErr(await add('toolchain'));
      expect(error.code).toBe('keel.path-missing');
      expect(error.message).toBe(
        "'README.md' is missing — keel patches it and does not recreate it; restore it",
      );
      expect((error as RefusalError).refusal).toMatchObject({
        kind: 'path-missing',
        path: 'README.md',
        adapterId: expect.stringMatching(/^toolchain\//) as unknown,
      });
      expect(await fs.pathExists(path.join(cwd, 'README.md'))).toBe(false);
    });

    it('refuses a build script keel did not write as a path conflict, reapply or not', async () => {
      await seedQuarkusCli();
      await fs.writeFile(path.join(cwd, 'build.gradle.kts'), '// hand-written\n');

      const error = expectErr(await add('code-style', true));
      expect(error.code).toBe('keel.path-conflict');
      expect(error.message).toBe(
        "'build.gradle.kts' has no 'plugins {' block — keel adds its lines inside it and does not rewrite the file; add one, then re-run",
      );
      expect(await fs.readFile(path.join(cwd, 'build.gradle.kts'), 'utf8')).toBe(
        '// hand-written\n',
      );
    });
  });

  describe('--reapply', () => {
    const workflow = () => path.join(cwd, '.github/workflows/release.yml');

    it('is a no-op when the working tree matches the re-render', async () => {
      await seedQuarkusCli();
      expectOk(await addDistribution());
      const report = expectOk(await reapplyDistribution());
      expect(report.subject).toBe('distribution');
      expect(report.committed).toBe(true);
      expect(report.changes).toEqual([]);
      expect(report.diffs).toEqual([]);

      const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
      expect(manifest!.verticals.filter((v) => v.id === 'distribution')).toEqual([
        { id: 'distribution', installedAt: '2026-04-27T08:00:00Z' },
      ]);
      expect(manifest!.tags.filter((t) => t === 'runtime.graalvm-native')).toHaveLength(1);
      expect(manifest!.updatedAt).toBe('2026-04-28T09:00:00Z');
    });

    it('restores an edited template-owned file and reports the diff', async () => {
      await seedQuarkusCli();
      expectOk(await addDistribution());
      const pristine = await fs.readFile(workflow(), 'utf8');
      await fs.writeFile(workflow(), `${pristine}# local tweak\n`);

      const report = expectOk(await reapplyDistribution());
      expect(report.changes).toEqual([{ kind: 'modify', path: '.github/workflows/release.yml' }]);
      expect(report.diffs).toHaveLength(1);
      expect(report.diffs![0]!.path).toBe('.github/workflows/release.yml');
      expect(report.diffs![0]!.diff).toContain('-# local tweak');
      expect(report.diffs![0]!.diff).toMatch(/^@@ /);
      expect(await fs.readFile(workflow(), 'utf8')).toBe(pristine);
    });

    it('shows the diff but writes nothing under --dry-run', async () => {
      await seedQuarkusCli();
      expectOk(await addDistribution());
      const pristine = await fs.readFile(workflow(), 'utf8');
      await fs.writeFile(workflow(), `${pristine}# local tweak\n`);

      const report = expectOk(await reapplyDistribution({ dryRun: true }));
      expect(report.committed).toBe(false);
      expect(report.diffs).toHaveLength(1);
      expect(await fs.readFile(workflow(), 'utf8')).toBe(`${pristine}# local tweak\n`);
    });

    it('re-renders what it owns of AGENTS.md and the hook, and nothing else', async () => {
      await seedQuarkusCli();
      const agents = path.join(cwd, 'AGENTS.md');
      const hook = path.join(cwd, '.claude/hooks/pre-commit-format.sh');
      const settings = path.join(cwd, '.claude/settings.json');
      const pristine = await fs.readFile(agents, 'utf8');
      const hookWired = await fs.readFile(hook, 'utf8');
      expect(pristine).toContain('<!-- keel:stack-runbook:begin -->\n\n## Stack');
      // code-style wired the formatter into the hook's owned step at scaffold time.
      expect(hookWired).toContain('spotlessApply');
      const reapplyHarness = () =>
        installMediator({
          clock: new FakeClock('2026-04-28T09:00:00Z'),
          runDeferred: () => Promise.resolve(),
        }).dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['agent-harness'],
            answers: {},
            interactive: false,
            dryRun: false,
            reapply: true,
          }),
        );

      // Nothing edited: nothing to report — the section is already
      // rendered and the hook keeps the formatter code-style wired in.
      const untouched = expectOk(await reapplyHarness());
      expect(untouched.changes).toEqual([]);
      expect(await fs.readFile(hook, 'utf8')).toBe(hookWired);

      // Edited inside the section and outside it: keel re-renders its
      // region (reported, diffed) and leaves the project's note where
      // the spec told it to keep one. Same for the hook: the skeleton
      // is keel's, the format step stays as code-style left it.
      await fs.writeFile(
        agents,
        `${pristine.replace('## Stack', '## Stack (hand-edited)')}\n<!-- local note -->\n`,
      );
      await fs.writeFile(hook, hookWired.replace('set -euo pipefail', 'set -eu # hand-edited'));
      // And the project's own settings beside keel's hook entry.
      const own = JSON.parse(await fs.readFile(settings, 'utf8')) as Record<string, unknown>;
      await fs.writeFile(
        settings,
        `${JSON.stringify({ ...own, permissions: { allow: ['Bash(pnpm test)'] } }, null, 2)}\n`,
      );
      const report = expectOk(await reapplyHarness());
      expect(report.changes.map((c) => c.path)).toEqual([
        '.claude/hooks/pre-commit-format.sh',
        'AGENTS.md',
      ]);
      expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toMatchObject({
        permissions: { allow: ['Bash(pnpm test)'] },
      });
      expect(report.diffs!.map((d) => d.path)).toContain('AGENTS.md');
      expect(await fs.readFile(agents, 'utf8')).toBe(`${pristine}\n<!-- local note -->\n`);
      expect(await fs.readFile(hook, 'utf8')).toBe(hookWired);
    });

    it('refuses to reapply a vertical that is not installed', async () => {
      await seedQuarkusCli();
      const error = expectErr(
        await installMediator().dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['ci'],
            answers: {},
            interactive: false,
            dryRun: false,
            reapply: true,
          }),
        ),
      );
      expect(error.code).toBe('keel.vertical-not-installed');
      expect(error.message).toMatch(/nothing to reapply/);
    });

    it('refuses --set overrides: recorded answers are frozen', async () => {
      await seedQuarkusCli();
      expectOk(await addDistribution());
      const error = expectErr(
        await reapplyDistribution({
          answers: { 'distribution/quarkus-cli-native': { targets: 'linux-amd64' } },
        }),
      );
      expect(error.code).toBe('keel.reapply-frozen-answers');
      expect(error.message).toBe(
        "--set cannot change distribution/quarkus-cli-native's answers: re-rendering 'distribution' reads them as the manifest recorded them, and changing one is not supported yet",
      );
    });

    it('refuses --set for an adapter nothing re-rendered reads, as any install would', async () => {
      await seedQuarkusCli();
      expectOk(await addDistribution());
      const error = expectErr(
        await reapplyDistribution({ answers: { 'ci/jvm-pipeline': { provider: 'gitlab-ci' } } }),
      );
      expect(error.code).toBe('keel.unknown-answer');
    });
  });

  describe('several verticals in one run, and what it re-renders', () => {
    /** Deferred actions shell out to gradle and git; the plan and the files are what is asserted. */
    const mediator = () => installMediator({ runDeferred: async () => {} });
    const scaffold = async (dir: string, stack: string, buildSystem?: string) =>
      expectOk(
        await mediator().dispatch(
          newProjectCommand({
            cwd: dir,
            stack,
            answers: {},
            interactive: false,
            dryRun: false,
            ...(buildSystem === undefined ? {} : { buildSystem }),
          }),
        ),
      );
    const add = (
      dir: string,
      verticals: readonly string[],
      more: Partial<Parameters<typeof addVerticalCommand>[0]> = {},
    ) =>
      mediator().dispatch(
        addVerticalCommand({
          cwd: dir,
          verticals,
          answers: {},
          interactive: false,
          dryRun: false,
          ...more,
        }),
      );
    /** Every file under `dir`, relative, with its bytes. */
    const snapshot = async (dir: string, rel = ''): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
        const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) Object.assign(out, await snapshot(dir, child));
        else out[child] = (await fs.readFile(path.join(dir, child))).toString('base64');
      }
      return out;
    };
    const composeOf = (dir: string) => fs.readFile(path.join(dir, 'deploy/compose.yaml'), 'utf8');

    let twin: string;
    beforeEach(async () => {
      twin = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-twin-'));
    });
    afterEach(async () => {
      await fs.remove(twin);
    });

    it('writes what three adds in a row write, from one add of all three or of the last alone', async () => {
      await scaffold(cwd, 'quarkus-rest');
      const pristine = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-pristine-'));
      try {
        await fs.copy(cwd, pristine);
        for (const vertical of ['containerization', 'distribution', 'iac']) {
          expectOk(await add(cwd, [vertical]));
        }
        const sequential = await snapshot(cwd);

        await fs.copy(pristine, twin);
        const all = expectOk(await add(twin, ['iac', 'containerization', 'distribution']));
        expect(all.subject).toBe('iac containerization distribution');
        expect(all.notes).toEqual([
          'installed in dependency order: containerization, distribution, iac',
        ]);
        expect(await snapshot(twin)).toEqual(sequential);

        await fs.remove(twin);
        await fs.copy(pristine, twin);
        expectOk(await add(twin, ['iac']));
        expect(await snapshot(twin)).toEqual(sequential);
      } finally {
        await fs.remove(pristine);
      }
    });

    it('adopts the harness beside another vertical as two adds in a row would', async () => {
      // The harness replays what was installed before the run into its
      // buffer; what the run installs beside it is there already, and
      // replayed a second time its skill would collide with itself.
      expectOk(
        await mediator().dispatch(
          newProjectCommand({
            cwd,
            stack: 'go-http',
            answers: {},
            interactive: false,
            dryRun: false,
            agentHarness: false,
          }),
        ),
      );
      await fs.copy(cwd, twin);
      expectOk(await add(cwd, ['agent-harness']));
      expectOk(await add(cwd, ['persistence']));
      expectOk(await add(twin, ['persistence', 'agent-harness']));

      const MANIFEST = '.claude/.keel-manifest.json';
      const files = async (dir: string) => {
        const { [MANIFEST]: _, ...rest } = await snapshot(dir);
        return rest;
      };
      expect(await files(twin)).toEqual(await files(cwd));
      // The manifest records the same install; only the provenance of a
      // harness document persistence patches differs, as it does
      // between `keel new --with` and `keel new` then `keel add`: in
      // one run it ships already patched.
      const record = async (dir: string) => {
        const manifest = await fsManifestStore.read(projectScopeRoot(dir));
        return {
          verticals: manifest?.verticals,
          tags: manifest?.tags,
          answers: manifest?.answers,
          entries: manifest?.entries.map((entry) => `${entry.source} ${entry.target}`).sort(),
        };
      };
      expect(await record(twin)).toEqual(await record(cwd));
    });

    it('is one set: none named, or one named twice, is refused before anything is written', async () => {
      await scaffold(cwd, 'go-http');
      const before = await snapshot(cwd);
      const error = expectErr(await add(cwd, ['ci', 'toolchain', 'ci']));
      expect(error.code).toBe('keel.invalid-verticals');
      expect(error.message).toBe("vertical 'ci' is named twice");
      expect(expectErr(await add(cwd, [])).code).toBe('keel.invalid-verticals');
      expect(await snapshot(cwd)).toEqual(before);
    });

    it('installs the rest of a set, noting each vertical named that is there already', async () => {
      await scaffold(cwd, 'go-http');
      await fs.copy(cwd, twin);
      const alone = expectOk(await add(twin, ['ci']));

      const report = expectOk(await add(cwd, ['vcs', 'ci', 'code-style']));
      expect(report.subject).toBe('vcs ci code-style');
      expect(report.notes).toEqual([
        "Version control is already installed; 'keel add vcs --reapply' re-renders it",
        "Code style is already installed; 'keel add code-style --reapply' re-renders it",
        ...(alone.notes ?? []),
      ]);
      expect(report.changes).toEqual(alone.changes);
      expect(await snapshot(cwd)).toEqual(await snapshot(twin));

      // Run again, all of it is there: an empty plan, and nothing moves.
      const again = expectOk(await add(cwd, ['vcs', 'ci', 'code-style']));
      expect(again.changes).toEqual([]);
      expect(again.notes).toHaveLength(3);
      expect(await snapshot(cwd)).toEqual(await snapshot(twin));
    });

    it('holds an answer to an empty plan too: nothing reads it', async () => {
      await scaffold(cwd, 'go-http');
      const before = await snapshot(cwd);
      const frozen = expectErr(
        await add(cwd, ['vcs'], { answers: { 'vcs/git-init': { defaultBranch: 'trunk' } } }),
      );
      expect(frozen.code).toBe('keel.frozen-answer');
      const unknown = expectErr(
        await add(cwd, ['vcs'], { answers: { 'ci/go-pipeline': { provider: 'gitlab-ci' } } }),
      );
      expect(unknown.code).toBe('keel.unknown-answer');
      expect(await snapshot(cwd)).toEqual(before);
    });

    it('re-renders a vertical named and refreshed, rather than noting it is there', async () => {
      await scaffold(cwd, 'go-http');
      expectOk(await add(cwd, ['distribution']));
      const compose = path.join(cwd, 'deploy/compose.yaml');
      const pristine = await fs.readFile(compose, 'utf8');
      await fs.writeFile(compose, 'edited by hand\n');

      const report = expectOk(await add(cwd, ['distribution'], { refresh: ['distribution'] }));
      expect(report.notes).toBeUndefined();
      expect(report.diffs?.map((d) => d.path)).toContain('deploy/compose.yaml');
      expect(await fs.readFile(compose, 'utf8')).toBe(pristine);
    });

    it('proposes re-rendering what reads an incoming vertical, and --refresh takes it up', async () => {
      await scaffold(cwd, 'go-http');
      expectOk(await add(cwd, ['distribution']));
      expect(await composeOf(cwd)).not.toContain('DB_URL');
      await fs.copy(cwd, twin);

      // Taken no further, the report says what is now out of date —
      // and, while nothing is written yet, that this very run can
      // take it up.
      const planned = expectOk(await add(cwd, ['persistence'], { dryRun: true }));
      expect(planned.refreshProposals).toEqual([
        { vertical: 'distribution', reads: ['persistence'] },
      ]);
      expect(planned.notes).toEqual([
        "refresh proposed: Distribution reads Persistence, which it was rendered without — re-render it in this run with --refresh distribution, or afterwards with 'keel add distribution --reapply'",
      ]);
      // Once written, persistence is there — naming it again would
      // only be noted — so the plain re-render is what is left to offer.
      const plain = expectOk(await add(cwd, ['persistence']));
      expect(plain.refreshProposals).toEqual(planned.refreshProposals);
      expect(plain.notes).toEqual([
        "refresh proposed: Distribution reads Persistence, which it was rendered without — re-render it with 'keel add distribution --reapply'",
      ]);
      expect(await composeOf(cwd)).not.toContain('DB_URL');

      // Taken up, distribution re-renders after persistence, in one run.
      const refreshed = expectOk(await add(twin, ['persistence'], { refresh: ['distribution'] }));
      expect(refreshed.refreshProposals).toBeUndefined();
      expect(refreshed.diffs?.map((d) => d.path)).toContain('deploy/compose.yaml');
      expect(await composeOf(twin)).toContain('DB_URL');
    });

    it('asks a newly matching adapter its questions in a refresh, and takes --set for it', async () => {
      await scaffold(cwd, 'quarkus-cli-rest', 'gradle');
      expectOk(await add(cwd, ['distribution']));
      const recorded = async (dir: string) =>
        (await fsManifestStore.read(projectScopeRoot(dir)))?.answers ?? {};
      expect(await recorded(cwd)).not.toHaveProperty(['distribution/jvm-container']);
      await fs.copy(cwd, twin);

      // A JVM image changes which adapters distribution resolves to.
      const plain = expectOk(await add(twin, ['containerization'], { dryRun: true }));
      expect(plain.refreshProposals).toEqual([
        {
          vertical: 'distribution',
          reads: [],
          adapters: {
            before: ['distribution/quarkus-cli-native'],
            after: ['distribution/jvm-container'],
          },
        },
      ]);

      const preview = expectOk(
        await mediator().dispatch(
          previewQuery({
            cwd,
            target: {
              kind: 'add-vertical',
              verticals: ['containerization'],
              refresh: ['distribution'],
            },
            answers: {},
          }),
        ),
      );
      const asked = preview.questions.map((q) =>
        q.binding.kind === 'answer' ? `${q.binding.adapter}:${q.binding.question}` : q.binding.kind,
      );
      expect(asked).toEqual(
        expect.arrayContaining([
          'distribution/jvm-container:provider',
          'distribution/jvm-container:deploy',
        ]),
      );
      // Its recorded adapter is re-rendered from what it recorded, unasked.
      expect(asked.some((key) => key.startsWith('distribution/quarkus-cli-native:'))).toBe(false);

      expectOk(
        await add(cwd, ['containerization'], {
          refresh: ['distribution'],
          answers: { 'distribution/jvm-container': { provider: 'gitlab-ci' } },
        }),
      );
      expect((await recorded(cwd))['distribution/jvm-container']).toMatchObject({
        provider: 'gitlab-ci',
      });
    });

    it('plans a refreshed vertical with the ones it adds, ahead of what needs it', async () => {
      // A native-only distribution, then a JVM image added without the
      // refresh it proposed: no installed vertical builds the image
      // iac deploys, until distribution re-renders — first, in the
      // same run.
      await scaffold(cwd, 'quarkus-cli-rest', 'gradle');
      expectOk(await add(cwd, ['distribution']));
      expectOk(await add(cwd, ['containerization']));
      const refused = expectErr(await add(cwd, ['iac']));
      // Something keel has — the installed Distribution, re-rendered —
      // makes it install, so it is not "nothing can": the refusal says
      // what, and a re-render stays the user's to ask for.
      expect(refused.code).toBe('keel.needs-refresh');
      expect(refused.message).toBe(
        'Infrastructure as code needs Distribution re-rendered — as it was rendered, Distribution does not add what Infrastructure as code needs',
      );
      expect((refused as RefusalError).refusal).toMatchObject({
        kind: 'unavailable',
        vertical: 'iac',
        refresh: { verticals: ['distribution'], prerequisites: [] },
      });

      // `--refresh` names no order, so going first is no move to report.
      const report = expectOk(await add(cwd, ['iac'], { refresh: ['distribution'] }));
      expect(report.notes).toBeUndefined();
      expect(await fs.pathExists(path.join(cwd, 'deploy/compose.yaml'))).toBe(true);
    });

    it('reads a native-only distribution as a re-render away from iac, on the card and the click alike', async () => {
      await scaffold(cwd, 'quarkus-cli-rest', 'gradle');
      expectOk(await add(cwd, ['distribution']));
      const status = expectOk(await mediator().dispatch(projectStatusQuery({ cwd })));
      const card = status.available.find((vertical) => vertical.id === 'iac');
      const sentence =
        'Infrastructure as code needs Container image, then Distribution re-rendered — as it was rendered, Distribution does not add what Infrastructure as code needs';
      expect(card).toMatchObject({
        readiness: 'unavailable',
        refusal: { code: 'keel.needs-refresh', message: sentence },
      });
      const refused = expectErr(await add(cwd, ['iac'], { dryRun: true }));
      expect([refused.code, refused.message]).toEqual(['keel.needs-refresh', sentence]);
      // Naming the image it lacks leaves the re-render alone to ask for.
      const named = expectErr(await add(cwd, ['containerization', 'iac'], { dryRun: true }));
      expect(named.code).toBe('keel.needs-refresh');
      expect((named as RefusalError).refusal).toMatchObject({
        refresh: { verticals: ['distribution'], prerequisites: [] },
      });
      // And the re-render it names is what installs it, the image first.
      const report = expectOk(await add(cwd, ['iac'], { refresh: ['distribution'], dryRun: true }));
      expect(report.notes).toEqual(['added Container image — needed by Distribution']);
    });

    it('releases the JVM image a refreshed distribution now ships, not the native binaries it shipped', async () => {
      // Distribution alone went native, and left its native-runtime tag
      // behind; re-rendered beside a JVM image, its pipeline builds the
      // fast-jar that image's Dockerfile copies, as a fresh project's does.
      await scaffold(cwd, 'quarkus-cli-rest', 'gradle');
      expectOk(await add(cwd, ['distribution']));
      expectOk(await add(cwd, ['containerization'], { refresh: ['distribution'] }));
      const release = await fs.readFile(
        path.join(cwd, '.github/workflows/release-image.yml'),
        'utf8',
      );
      expect(release).toContain('actions/setup-java');
      expect(release).not.toContain('graalvm');
      expect(release).not.toContain('quarkus.native.enabled');
    });

    it('says what it adds unasked before what it found there already', async () => {
      await scaffold(cwd, 'go-http');
      expectOk(await add(cwd, ['persistence']));
      const report = expectOk(await add(cwd, ['persistence', 'iac'], { dryRun: true }));
      expect(report.notes).toEqual([
        'added Container image, Distribution — needed by Infrastructure as code',
        "Persistence is already installed; 'keel add persistence --reapply' re-renders it",
      ]);
    });

    it('reports a move among the verticals named, and never a refreshed one as installed', async () => {
      await scaffold(cwd, 'go-http');
      expectOk(await add(cwd, ['persistence']));
      const report = expectOk(
        await add(cwd, ['distribution', 'containerization'], {
          refresh: ['persistence'],
          dryRun: true,
        }),
      );
      expect(report.notes).toEqual([
        'installed in dependency order: containerization, distribution',
      ]);
    });

    it('re-renders a recorded adapter from its answers, unasked, even interactively', async () => {
      // A question the adapter grew since it was installed has nothing
      // recorded; the rest of its answers are, so it stays frozen and
      // the new question takes its default — the prompt is never asked.
      await scaffold(cwd, 'go-http');
      expectOk(await add(cwd, ['distribution']));
      const root = projectScopeRoot(cwd);
      const manifest = await fsManifestStore.read(root);
      if (manifest === null) throw new Error('no manifest');
      const { deploy: _grown, ...recorded } = manifest.answers['distribution/go-container'] ?? {};
      expect(recorded).toEqual({ provider: 'github-actions' });
      await fsManifestStore.write(root, {
        ...manifest,
        answers: { ...manifest.answers, 'distribution/go-container': recorded },
      });

      expectOk(await add(cwd, ['distribution'], { reapply: true, interactive: true }));
      expect((await fsManifestStore.read(root))?.answers['distribution/go-container']).toEqual({
        provider: 'github-actions',
        deploy: 'compose',
      });
    });

    it('holds an answer to the adapters the run resolved, not the ones it could have', async () => {
      // The native release is reachable when the run starts, and the
      // image the run adds first rules it out: its answer would reach
      // nothing, so it is refused once the run is staged, before a
      // file is written.
      await scaffold(cwd, 'quarkus-cli-rest', 'gradle');
      const before = await snapshot(cwd);
      const error = expectErr(
        await add(cwd, ['containerization', 'distribution'], {
          answers: { 'distribution/quarkus-cli-native': { targets: 'linux-amd64' } },
        }),
      );
      expect(error.code).toBe('keel.unknown-answer');
      expect(await snapshot(cwd)).toEqual(before);
    });

    it('refuses to refresh a vertical that is not installed', async () => {
      await scaffold(cwd, 'go-http');
      const error = expectErr(await add(cwd, ['persistence'], { refresh: ['distribution'] }));
      expect(error.code).toBe('keel.vertical-not-installed');
      expect(error.message).toMatch(/nothing to refresh/);
    });
  });
});
