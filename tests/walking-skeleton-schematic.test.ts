import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cliPrompt } from '../src/engine/homegrown.js';
import { buildEngine } from '../src/schematics/registry.js';
import { logger } from '../src/util/log.js';

/**
 * End-to-end integration test for the walking-skeleton orchestrator.
 * Uses {@code buildEngine()} so every sub-schematic the orchestrator
 * invokes (git-init, gradle-wrapper, port, executable-rest,
 * iac-cloudrun, ci-github) is registered just like at runtime.
 */
describe('walking-skeleton schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-ws-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('scaffolds the full end-to-end slice (git → gradle → domain → REST → IaC → CI)', async () => {
    const engine = buildEngine();

    await engine.run(
      'walking-skeleton',
      { basePackage: 'com.example', projectName: 'acme-svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    // git-init
    expect(existsSync(path.join(workDir, '.git'))).toBe(true);

    // gradle-wrapper
    for (const f of [
      'gradlew',
      'gradlew.bat',
      'gradle/wrapper/gradle-wrapper.jar',
      'gradle/wrapper/gradle-wrapper.properties',
    ]) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    // Root + build-logic
    for (const f of [
      'settings.gradle.kts',
      'build.gradle.kts',
      'README.md',
      '.gitignore',
      'build-logic/settings.gradle.kts',
      'build-logic/build.gradle.kts',
      'build-logic/src/main/kotlin/keel.java-conventions.gradle.kts',
      'build-logic/src/main/kotlin/keel.test-conventions.gradle.kts',
      'build-logic/src/main/kotlin/keel.quality-conventions.gradle.kts',
      'gradle/libs.versions.toml',
      'gradle.properties',
    ]) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    // The release workflow reads `projectVersion=` from gradle.properties
    // (the same key the root build.gradle.kts reads via
    // `providers.gradleProperty("projectVersion")`); the walking-skeleton
    // template must ship it or the first release fails.
    const gradleProps = readFileSync(path.join(workDir, 'gradle.properties'), 'utf8');
    expect(gradleProps).toMatch(/^projectVersion\s*=\s*\d+\.\d+\.\d+/m);

    // Kernel lives in domain/contract, never domain/core.
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
        existsSync(
          path.join(workDir, `domain/contract/src/main/java/com/example/kernel/${cls}.java`),
        ),
      ).toBe(true);
      expect(
        existsSync(path.join(workDir, `domain/core/src/main/java/com/example/kernel/${cls}.java`)),
      ).toBe(false);
    }

    // port (starter secondary port + fake)
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

    // executable-rest (Quarkus + /ping slice)
    for (const f of [
      'application/rest/contract/build.gradle.kts',
      'application/rest/contract/src/main/resources/openapi/service.yaml',
      'application/rest/executable/build.gradle.kts',
      'application/rest/executable/src/main/resources/application.properties',
      'application/rest/executable/src/main/java/com/example/application/rest/executable/resources/PingResource.java',
      'application/rest/executable/src/main/java/com/example/application/rest/executable/wiring/MediatorProducer.java',
      'domain/contract/src/main/java/com/example/ping/PingQuery.java',
      'domain/core/src/main/java/com/example/ping/PingHandler.java',
    ]) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    // iac-cloudrun — lifecycle-split: bootstrap owns WIF + AR + SA,
    // cloudrun owns just the service.
    for (const f of [
      'iac/cloudrun/main.tf',
      'iac/cloudrun/Dockerfile',
      'iac/bootstrap/bootstrap.sh',
      'iac/bootstrap/wif.tf',
      'iac/bootstrap/main.tf',
    ]) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }
    expect(existsSync(path.join(workDir, 'iac/cloudrun/wif.tf'))).toBe(false);

    // The old walking-skeleton stubs are gone — only iac-cloudrun output now.
    expect(existsSync(path.join(workDir, 'iac/main.tf'))).toBe(false);

    // ci-github
    for (const f of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }

    // Settings auto-amended by both walking-skeleton and executable-rest.
    const settings = readFileSync(path.join(workDir, 'settings.gradle.kts'), 'utf8');
    expect(settings).toContain('rootProject.name = "acme-svc"');
    expect(settings).toContain('include(":infrastructure:user-repository:fake")');
    expect(settings).toContain('include(":application:rest:contract")');
    expect(settings).toContain('include(":application:rest:executable")');

    // Version catalog carries the Quarkus upserts.
    const catalog = readFileSync(path.join(workDir, 'gradle/libs.versions.toml'), 'utf8');
    expect(catalog).toContain('quarkus-bom');
    expect(catalog).toContain('id = "io.quarkus"');

    // Service name flowed into ci.yml.
    const ci = readFileSync(path.join(workDir, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('-var service_name=acme-svc');
  });

  it('rejects missing required parameters', async () => {
    const engine = buildEngine();
    await expect(
      engine.run(
        'walking-skeleton',
        { projectName: 'x' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/basePackage.*required/);
  });

  it('rejects an invalid projectName (Cloud Run naming rules)', async () => {
    const engine = buildEngine();
    await expect(
      engine.run(
        'walking-skeleton',
        { basePackage: 'com.example', projectName: 'Invalid_Name' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/invalid projectName/);
  });
});
