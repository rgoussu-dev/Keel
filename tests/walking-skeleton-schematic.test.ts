import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { portSchematic } from '../src/schematics/port/factory.js';
import { walkingSkeletonSchematic } from '../src/schematics/walking-skeleton/factory.js';
import { logger } from '../src/util/log.js';

describe('walking-skeleton schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-ws-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('scaffolds gradle shell + kernel and composes port for a starter port', async () => {
    const engine = new HomegrownEngine();
    engine.register(portSchematic);
    engine.register(walkingSkeletonSchematic);

    await engine.run(
      'walking-skeleton',
      { basePackage: 'com.example', projectName: 'acme-svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    // Root files
    for (const f of ['settings.gradle.kts', 'build.gradle.kts', 'README.md', '.gitignore']) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    // build-logic convention plugins
    for (const f of [
      'build-logic/settings.gradle.kts',
      'build-logic/build.gradle.kts',
      'build-logic/src/main/kotlin/keel.java-conventions.gradle.kts',
      'build-logic/src/main/kotlin/keel.test-conventions.gradle.kts',
      'build-logic/src/main/kotlin/keel.quality-conventions.gradle.kts',
    ]) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    // Kernel
    for (const cls of [
      'Action',
      'Command',
      'Query',
      'Result',
      'Error',
      'Handler',
      'Mediator',
      'DuplicateHandlerException',
      'NoHandlerError',
    ]) {
      expect(
        existsSync(path.join(workDir, `domain/core/src/main/java/com/example/kernel/${cls}.java`)),
      ).toBe(true);
    }

    // IaC
    expect(existsSync(path.join(workDir, 'infrastructure/iac/main.tf'))).toBe(true);

    // Composed port
    expect(
      existsSync(
        path.join(workDir, 'domain/contract/src/main/java/com/example/user/UserRepository.java'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          workDir,
          'infrastructure/user-repository/fake/src/main/java/com/example/user/fake/UserRepositoryFake.java',
        ),
      ),
    ).toBe(true);

    // settings.gradle.kts auto-amended with starter port include
    const settings = readFileSync(path.join(workDir, 'settings.gradle.kts'), 'utf8');
    expect(settings).toContain('include(":infrastructure:user-repository:fake")');
    expect(settings).toContain('rootProject.name = "acme-svc"');

    // Kernel sanity: Mediator injects Collection<Handler>, not Map
    const mediator = readFileSync(
      path.join(workDir, 'domain/core/src/main/java/com/example/kernel/Mediator.java'),
      'utf8',
    );
    expect(mediator).toContain('public Mediator(Collection<Handler<?>> handlers)');
    expect(mediator).not.toMatch(/public\s+Mediator\s*\(\s*Map</);
  });

  it('rejects missing required parameters', async () => {
    const engine = new HomegrownEngine();
    engine.register(portSchematic);
    engine.register(walkingSkeletonSchematic);
    await expect(
      engine.run(
        'walking-skeleton',
        { projectName: 'x' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/basePackage.*required/);
  });
});
