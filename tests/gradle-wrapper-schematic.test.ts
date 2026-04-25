import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { gradleWrapperSchematic } from '../src/schematics/gradle-wrapper/factory.js';
import { logger } from '../src/util/log.js';

describe('gradle-wrapper schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-gw-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('emits gradlew, gradlew.bat, wrapper jar, and properties with the default version', async () => {
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await engine.run(
      'gradle-wrapper',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    for (const f of [
      'gradlew',
      'gradlew.bat',
      'gradle/wrapper/gradle-wrapper.jar',
      'gradle/wrapper/gradle-wrapper.properties',
    ]) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    const props = readFileSync(
      path.join(workDir, 'gradle/wrapper/gradle-wrapper.properties'),
      'utf8',
    );
    expect(props).toContain('gradle-8.11.1-bin.zip');
    expect(props).toContain('distributionBase=GRADLE_USER_HOME');
  });

  it('preserves the wrapper jar as a real ZIP archive (binary-safe copy)', async () => {
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await engine.run(
      'gradle-wrapper',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const jar = readFileSync(path.join(workDir, 'gradle/wrapper/gradle-wrapper.jar'));
    expect(jar.slice(0, 4).toString('hex')).toBe('504b0304');
    expect(jar.length).toBeGreaterThan(10_000);
  });

  it('keeps gradlew executable on POSIX', () => {
    if (process.platform === 'win32') return;
    return (async () => {
      const engine = new HomegrownEngine();
      engine.register(gradleWrapperSchematic);

      await engine.run(
        'gradle-wrapper',
        {},
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      );

      const mode = statSync(path.join(workDir, 'gradlew')).mode & 0o111;
      expect(mode).not.toBe(0);
    })();
  });

  it('accepts a custom gradle version', async () => {
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await engine.run(
      'gradle-wrapper',
      { gradleVersion: '8.12.0' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const props = readFileSync(
      path.join(workDir, 'gradle/wrapper/gradle-wrapper.properties'),
      'utf8',
    );
    expect(props).toContain('gradle-8.12.0-bin.zip');
  });

  it('rejects a malformed gradle version', async () => {
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await expect(
      engine.run(
        'gradle-wrapper',
        { gradleVersion: '../evil' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      ),
    ).rejects.toThrow(/invalid gradleVersion/);
  });
});
