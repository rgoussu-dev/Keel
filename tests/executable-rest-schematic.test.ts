import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { executableRestSchematic } from '../src/schematics/executable-rest/factory.js';
import { logger } from '../src/util/log.js';

/**
 * The schematic is scenario-tested against a real {@code InMemoryTree}
 * committed to a tmpdir: the three groups (contract, executable, ping
 * slice) must materialise together with the Quarkus wiring intact.
 */
describe('executable-rest schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-exec-rest-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('scaffolds the three groups and wires Quarkus + mediator correctly', async () => {
    seedWalkingSkeletonShell(workDir);

    const engine = new HomegrownEngine();
    engine.register(executableRestSchematic);

    await engine.run(
      'executable-rest',
      { basePackage: 'com.example', projectName: 'acme-svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const expected = [
      'application/rest/contract/build.gradle.kts',
      'application/rest/contract/src/main/resources/openapi/service.yaml',
      'application/rest/contract/src/main/java/com/example/application/rest/contract/PingResponseDto.java',
      'application/rest/executable/build.gradle.kts',
      'application/rest/executable/src/main/resources/application.properties',
      'application/rest/executable/src/main/java/com/example/application/rest/executable/resources/PingResource.java',
      'application/rest/executable/src/main/java/com/example/application/rest/executable/wiring/MediatorProducer.java',
      'application/rest/executable/src/main/java/com/example/application/rest/executable/errors/ProblemDetails.java',
      'domain/contract/src/main/java/com/example/ping/PingQuery.java',
      'domain/contract/src/main/java/com/example/ping/Ping.java',
      'domain/core/src/main/java/com/example/ping/PingHandler.java',
    ];
    for (const rel of expected) expect(existsSync(path.join(workDir, rel))).toBe(true);

    const resource = readFileSync(
      path.join(
        workDir,
        'application/rest/executable/src/main/java/com/example/application/rest/executable/resources/PingResource.java',
      ),
      'utf8',
    );
    expect(resource).toContain('@Path("/ping")');
    expect(resource).toContain('mediator.dispatch(new PingQuery())');

    const producer = readFileSync(
      path.join(
        workDir,
        'application/rest/executable/src/main/java/com/example/application/rest/executable/wiring/MediatorProducer.java',
      ),
      'utf8',
    );
    expect(producer).toContain('List.of(new PingHandler())');
    // Three-module split: producer constructs the impl (RegistryMediator)
    // and exposes it via the Mediator interface from domain/kernel.
    expect(producer).toContain('new RegistryMediator(handlers)');
    expect(producer).toContain('public Mediator mediator()');

    const handler = readFileSync(
      path.join(workDir, 'domain/core/src/main/java/com/example/ping/PingHandler.java'),
      'utf8',
    );
    expect(handler).toContain('implements Handler<PingQuery>');
    expect(handler).toContain('Result.success(new Ping("pong"');

    const openapi = readFileSync(
      path.join(workDir, 'application/rest/contract/src/main/resources/openapi/service.yaml'),
      'utf8',
    );
    expect(openapi).toContain('title: acme-svc');
    expect(openapi).toContain('/ping:');

    const props = readFileSync(
      path.join(workDir, 'application/rest/executable/src/main/resources/application.properties'),
      'utf8',
    );
    expect(props).toContain('quarkus.swagger-ui.always-include=true');
  });

  it('amends settings.gradle.kts with the two new module includes', async () => {
    seedWalkingSkeletonShell(workDir);

    const engine = new HomegrownEngine();
    engine.register(executableRestSchematic);

    await engine.run(
      'executable-rest',
      { basePackage: 'com.example', projectName: 'svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const settings = readFileSync(path.join(workDir, 'settings.gradle.kts'), 'utf8');
    expect(settings).toContain('include(":application:rest:contract")');
    expect(settings).toContain('include(":application:rest:executable")');
  });

  it('upserts quarkus entries into the version catalog', async () => {
    seedWalkingSkeletonShell(workDir);

    const engine = new HomegrownEngine();
    engine.register(executableRestSchematic);

    await engine.run(
      'executable-rest',
      { basePackage: 'com.example', projectName: 'svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const catalog = readFileSync(path.join(workDir, 'gradle/libs.versions.toml'), 'utf8');
    expect(catalog).toMatch(/quarkus\s*=\s*"3\.33\.1"/);
    expect(catalog).toContain('quarkus-bom');
    expect(catalog).toContain('id = "io.quarkus"');
  });

  it('is idempotent on re-run (no duplicate includes or catalog entries)', async () => {
    seedWalkingSkeletonShell(workDir);

    const engine = new HomegrownEngine();
    engine.register(executableRestSchematic);
    const ctx = { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false };

    await engine.run('executable-rest', { basePackage: 'com.example', projectName: 'svc' }, ctx);
    await engine.run('executable-rest', { basePackage: 'com.example', projectName: 'svc' }, ctx);

    const settings = readFileSync(path.join(workDir, 'settings.gradle.kts'), 'utf8');
    const includeCount = settings
      .split('\n')
      .filter((l) => l.includes('include(":application:rest:contract")')).length;
    expect(includeCount).toBe(1);

    const catalog = readFileSync(path.join(workDir, 'gradle/libs.versions.toml'), 'utf8');
    // `quarkus =` legitimately appears twice — once in [versions] with a
    // string value, once in [plugins] with the plugin descriptor — but
    // each occurrence must still appear exactly once.
    const quarkusVersionLine = catalog.match(/^\s*quarkus\s*=\s*"3\.33\.1"/gm)?.length ?? 0;
    const quarkusPluginLine =
      catalog.match(/^\s*quarkus\s*=\s*\{\s*id\s*=\s*"io\.quarkus"/gm)?.length ?? 0;
    expect(quarkusVersionLine).toBe(1);
    expect(quarkusPluginLine).toBe(1);
  });

  it('works in a fresh directory (no catalog / settings) with warnings', async () => {
    const engine = new HomegrownEngine();
    engine.register(executableRestSchematic);

    await engine.run(
      'executable-rest',
      { basePackage: 'com.example', projectName: 'svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    expect(
      existsSync(
        path.join(
          workDir,
          'application/rest/executable/src/main/java/com/example/application/rest/executable/resources/PingResource.java',
        ),
      ),
    ).toBe(true);
    expect(existsSync(path.join(workDir, 'settings.gradle.kts'))).toBe(false);
    expect(existsSync(path.join(workDir, 'gradle/libs.versions.toml'))).toBe(false);
  });

  it('rejects missing required parameters', async () => {
    const engine = new HomegrownEngine();
    engine.register(executableRestSchematic);
    await expect(
      engine.run(
        'executable-rest',
        { projectName: 'svc' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      ),
    ).rejects.toThrow(/basePackage.*required/);
  });
});

/**
 * Minimal stand-in for the files the walking-skeleton scaffold would
 * already have rendered — just enough for the schematic's idempotent
 * amendments to have something to amend.
 */
function seedWalkingSkeletonShell(workDir: string): void {
  writeFileSync(
    path.join(workDir, 'settings.gradle.kts'),
    'rootProject.name = "acme-svc"\ninclude(":domain:contract")\ninclude(":domain:core")\n',
    'utf8',
  );
  mkdirSync(path.join(workDir, 'gradle'), { recursive: true });
  writeFileSync(
    path.join(workDir, 'gradle/libs.versions.toml'),
    '[versions]\njunit = "5.13.4"\n\n[libraries]\njunit-jupiter = { module = "org.junit.jupiter:junit-jupiter" }\n\n[plugins]\nspotless = { id = "com.diffplug.spotless", version = "8.4.0" }\n',
    'utf8',
  );
}
