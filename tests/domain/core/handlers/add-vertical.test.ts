/**
 * Integration test for `keel add` — the `keel.add-vertical` command
 * dispatched through the mediator.
 *
 * Runs `keel new` first to seed a project, then layers `distribution`
 * on top and asserts the workflow files land, the manifest gains the
 * new vertical and tags, and the safeguards (duplicate, unknown id,
 * missing project) surface as domain errors.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { FakeClock } from '../../../../src/infrastructure/commons/fake-clock.js';
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
      vertical: 'distribution',
      answers: {},
      interactive: false,
      dryRun,
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

  it('refuses to install the same vertical twice', async () => {
    await seedQuarkusCli();
    expectOk(await addDistribution());
    const error = expectErr(await addDistribution());
    expect(error.code).toBe('keel.vertical-already-installed');
    expect(error.message).toMatch(/already installed/);
  });

  it('rejects an unknown vertical id with available ones listed', async () => {
    await seedQuarkusCli();
    const error = expectErr(
      await installMediator().dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'nonsense-vertical',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.unknown-vertical');
    expect(error.message).toMatch(/unknown vertical 'nonsense-vertical'.*distribution/);
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
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual(['vcs', 'walking-skeleton']);
  });
});
