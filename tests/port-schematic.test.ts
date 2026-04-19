import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { portSchematic } from '../src/schematics/port/factory.js';
import { logger } from '../src/util/log.js';

describe('port schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-port-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('scaffolds port, fake, contract test, and fake module build file', async () => {
    const engine = new HomegrownEngine();
    engine.register(portSchematic);

    await engine.run(
      'port',
      { name: 'UserRepository', basePackage: 'com.example', aggregate: 'user' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const expected = [
      'domain/contract/src/main/java/com/example/user/UserRepository.java',
      'infrastructure/user-repository/fake/build.gradle.kts',
      'infrastructure/user-repository/fake/src/main/java/com/example/user/fake/UserRepositoryFake.java',
      'infrastructure/user-repository/fake/src/test/java/com/example/user/fake/UserRepositoryFakeContractTest.java',
    ];
    for (const rel of expected) expect(existsSync(path.join(workDir, rel))).toBe(true);

    const port = readFileSync(
      path.join(workDir, 'domain/contract/src/main/java/com/example/user/UserRepository.java'),
      'utf8',
    );
    expect(port).toContain('package com.example.user;');
    expect(port).toContain('public interface UserRepository');

    const fake = readFileSync(
      path.join(
        workDir,
        'infrastructure/user-repository/fake/src/main/java/com/example/user/fake/UserRepositoryFake.java',
      ),
      'utf8',
    );
    expect(fake).toContain('package com.example.user.fake;');
    expect(fake).toContain('public final class UserRepositoryFake implements UserRepository');

    const build = readFileSync(
      path.join(workDir, 'infrastructure/user-repository/fake/build.gradle.kts'),
      'utf8',
    );
    expect(build).toContain('id("keel.java-conventions")');
    expect(build).toContain('implementation(project(":domain:contract"))');
  });

  it('rejects missing required parameters', async () => {
    const engine = new HomegrownEngine();
    engine.register(portSchematic);
    await expect(
      engine.run(
        'port',
        { basePackage: 'com.example', aggregate: 'user' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/name.*required/);
  });

  it('rejects unsupported language', async () => {
    const engine = new HomegrownEngine();
    engine.register(portSchematic);
    await expect(
      engine.run(
        'port',
        { name: 'X', basePackage: 'com.example', aggregate: 'u', language: 'rust' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/not supported/);
  });
});
