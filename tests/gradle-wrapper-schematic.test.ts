import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { gradleWrapperSchematic } from '../src/schematics/gradle-wrapper/factory.js';
import * as download from '../src/schematics/gradle-wrapper/download.js';
import { logger } from '../src/util/log.js';

/**
 * Minimal valid ZIP buffer used to stand in for the real wrapper jar
 * (which is itself a zip archive). The first four bytes are the local
 * file header signature `PK\x03\x04`; the trailing zeroes give the
 * buffer enough length to satisfy the existing `> 10_000` size guard.
 */
const FAKE_JAR = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20_000)]);

describe('gradle-wrapper schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-gw-'));
    vi.spyOn(download, 'downloadWrapperJar').mockResolvedValue(FAKE_JAR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(props).toContain('gradle-9.4.1-bin.zip');
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
      { gradleVersion: '9.4.0' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const props = readFileSync(
      path.join(workDir, 'gradle/wrapper/gradle-wrapper.properties'),
      'utf8',
    );
    expect(props).toContain('gradle-9.4.0-bin.zip');
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

  it('downloads the wrapper jar for the resolved gradle version', async () => {
    const spy = vi.spyOn(download, 'downloadWrapperJar').mockResolvedValue(FAKE_JAR);
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await engine.run(
      'gradle-wrapper',
      { gradleVersion: '9.4.1' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    expect(spy).toHaveBeenCalledWith('9.4.1');
  });

  it('propagates download failures so a bad install never ships an unverified jar', async () => {
    vi.spyOn(download, 'downloadWrapperJar').mockRejectedValue(new Error('sha256 mismatch'));
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await expect(
      engine.run(
        'gradle-wrapper',
        {},
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      ),
    ).rejects.toThrow(/sha256 mismatch/);
  });

  it('does not perform any network I/O on dry-run', async () => {
    const spy = vi.spyOn(download, 'downloadWrapperJar').mockResolvedValue(FAKE_JAR);
    const engine = new HomegrownEngine();
    engine.register(gradleWrapperSchematic);

    await engine.run(
      'gradle-wrapper',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      { dryRun: true },
    );

    expect(spy).not.toHaveBeenCalled();
    // Engine drops the dry-run tree without committing — nothing on disk.
    expect(existsSync(path.join(workDir, 'gradle/wrapper/gradle-wrapper.jar'))).toBe(false);
  });
});
