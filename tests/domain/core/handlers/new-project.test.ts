/**
 * Integration test for `keel new` — the `keel.new-project` command
 * dispatched through the mediator.
 *
 * Drives the full flow against a real temp directory: stack lookup,
 * vertical install, tree commit, action execution (real `git init`),
 * and manifest persistence. Scenario data lives in each test; the
 * wiring comes from the shared Factory.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakePrompt } from '../../../../src/infrastructure/prompt/fake.js';
import {
  expectErr,
  expectOk,
  installMediator,
  runActionsExcept,
} from '../../../support/factory.js';

const bootstrapAnswers = {
  'walking-skeleton/quarkus-cli-bootstrap': {
    basePackage: 'com.acme.cli',
    projectName: 'demo',
  },
  'vcs/git-init': { remote: '', defaultBranch: 'main' },
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-new-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe('keel.new-project (keel new)', () => {
  it('bootstraps a Quarkus CLI project end-to-end', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('quarkus-cli');
    expect(report.committed).toBe(true);
    expect(report.changes.length).toBeGreaterThan(0);

    // Tree-emitted files landed on disk.
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'settings.gradle.kts'))).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'application/cli/src/main/java/com/acme/cli/cli/Main.java'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'domain/kernel/src/main/java/com/acme/cli/kernel/Mediator.java'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'domain/core/src/main/java/com/acme/cli/core/greet/GreetHandler.java'),
      ),
    ).toBe(true);

    // Binding spec landed at the project root, with its pointer.
    const agentsMd = await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(await fs.readFile(path.join(cwd, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');

    // Action ran: git repo exists, branch is main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('main');

    // Manifest was persisted with the stack's tags + verticals + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(
      [
        'arch.cli',
        'arch.hexagonal',
        'framework.quarkus',
        'lang.java',
        'pkg.gradle',
        'runtime.jvm',
      ].sort(),
    );
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual(['vcs', 'walking-skeleton']);
    expect(manifest!.answers['walking-skeleton/quarkus-cli-bootstrap']).toEqual({
      basePackage: 'com.acme.cli',
      projectName: 'demo',
    });
  });

  it('bootstraps a Go CLI project end-to-end', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/go-bootstrap']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'go-cli',
          answers: {
            'walking-skeleton/go-bootstrap': {
              modulePath: 'github.com/acme/shipper',
              projectName: 'shipper',
            },
            'vcs/git-init': { remote: '', defaultBranch: 'main' },
          },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('go-cli');
    expect(report.committed).toBe(true);

    // The Go reference tree landed on disk: assembly point, contract
    // face, hidden core, primary adapter, port fake.
    for (const p of [
      'go.mod',
      'cmd/cli/main.go',
      'internal/domain/greet.go',
      'internal/domain/internal/greet/greet.go',
      'internal/app/cli/app.go',
      'internal/infra/clockfake/clock.go',
      'AGENTS.md',
    ]) {
      expect(await fs.pathExists(path.join(cwd, p)), `missing ${p}`).toBe(true);
    }

    // Action ran: git repo exists on main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);

    // Manifest was persisted with the stack's tags + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(
      ['arch.cli', 'arch.hexagonal', 'lang.go', 'pkg.go-modules'].sort(),
    );
    expect(manifest!.answers['walking-skeleton/go-bootstrap']).toEqual({
      modulePath: 'github.com/acme/shipper',
      projectName: 'shipper',
    });
  });

  it('bootstraps a Rust CLI project end-to-end', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/rust-bootstrap']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'rust-cli',
          answers: {
            'walking-skeleton/rust-bootstrap': { projectName: 'shipper' },
            'vcs/git-init': { remote: '', defaultBranch: 'main' },
          },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('rust-cli');
    expect(report.committed).toBe(true);

    // The Rust reference tree landed on disk: assembly point, contract
    // face, hidden core, primary adapter, port fake.
    for (const p of [
      'Cargo.toml',
      'src/bin/cli/main.rs',
      'src/bin/cli/app.rs',
      'src/domain.rs',
      'src/domain/greet.rs',
      'src/infra/clock_fake.rs',
      'AGENTS.md',
    ]) {
      expect(await fs.pathExists(path.join(cwd, p)), `missing ${p}`).toBe(true);
    }

    // Action ran: git repo exists on main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);

    // Manifest was persisted with the stack's tags + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(['arch.cli', 'arch.hexagonal', 'lang.rust', 'pkg.cargo'].sort());
    expect(manifest!.answers['walking-skeleton/rust-bootstrap']).toEqual({
      projectName: 'shipper',
    });
  });

  it('writes nothing under --dry-run', async () => {
    const mediator = installMediator();
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(report.committed).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
    expect(await fs.pathExists(path.join(projectScopeRoot(cwd), '.keel-manifest.json'))).toBe(
      false,
    );
  });

  it('refuses to run if a manifest already exists', async () => {
    await fs.ensureDir(projectScopeRoot(cwd));
    await fs.writeJson(path.join(projectScopeRoot(cwd), '.keel-manifest.json'), {
      version: 2,
      keelVersion: '0.4.0-alpha',
      installedAt: 'x',
      updatedAt: 'x',
      tags: [],
      verticals: [],
      versions: {},
      answers: {},
      entries: [],
    });
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.already-initialised');
    expect(error.message).toMatch(/already initialised/);
  });

  it('rejects an unknown stack id', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'imaginary-stack',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.unknown-stack');
    expect(error.message).toMatch(/unknown stack/);
  });
});

describe('keel.new-project build-system selection', () => {
  it('scaffolds quarkus-cli on Maven with an explicit build-system id', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/maven-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
          buildSystem: 'maven',
        }),
      ),
    );
    expect(report.committed).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'application/cli/pom.xml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
    expect(report.actions.some((a) => a.startsWith('mvn -N wrapper:wrapper'))).toBe(true);

    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('pkg.maven');
    expect(manifest?.tags).not.toContain('pkg.gradle');
  });

  it('defaults to Gradle when no build system is chosen non-interactively', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(false);

    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('pkg.gradle');
  });

  it('asks interactively and honours the chosen build system', async () => {
    const prompt = new FakePrompt({
      buildSystem: 'maven',
      remote: '',
      defaultBranch: 'main',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/maven-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: false,
        }),
      ),
    );
    expect(prompt.asked).toContain('buildSystem');
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
  });

  it('rejects a build system the stack does not offer', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'pnpm',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/does not support build system 'pnpm'/);
    expect(error.message).toMatch(/gradle, maven/);
  });

  it('rejects --build-system for a stack with a fixed build system', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'go-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'maven',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/fixed build system/);
  });

  it('rejects --build-system on composite stacks', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'maven',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/composite/);
  });
});
