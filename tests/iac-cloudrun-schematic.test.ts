import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { iacCloudrunSchematic } from '../src/schematics/iac-cloudrun/factory.js';
import { logger } from '../src/util/log.js';

describe('iac-cloudrun schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-iac-cr-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('emits the complete /iac/cloudrun module and the bootstrap folder', async () => {
    const engine = new HomegrownEngine();
    engine.register(iacCloudrunSchematic);

    await engine.run(
      'iac-cloudrun',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const expected = [
      'iac/cloudrun/versions.tf',
      'iac/cloudrun/providers.tf',
      'iac/cloudrun/variables.tf',
      'iac/cloudrun/main.tf',
      'iac/cloudrun/wif.tf',
      'iac/cloudrun/outputs.tf',
      'iac/cloudrun/Dockerfile',
      'iac/cloudrun/README.md',
      'iac/bootstrap/bootstrap.sh',
      'iac/bootstrap/README.md',
    ];
    for (const rel of expected) expect(existsSync(path.join(workDir, rel))).toBe(true);
  });

  it('wires the GCS remote backend and the native-image Dockerfile', async () => {
    const engine = new HomegrownEngine();
    engine.register(iacCloudrunSchematic);

    await engine.run(
      'iac-cloudrun',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const versions = readFileSync(path.join(workDir, 'iac/cloudrun/versions.tf'), 'utf8');
    expect(versions).toContain('backend "gcs"');
    expect(versions).toContain('prefix = "cloudrun/state"');

    const dockerfile = readFileSync(path.join(workDir, 'iac/cloudrun/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('ubi-quarkus-mandrel-builder-image');
    expect(dockerfile).toContain('-Dquarkus.native.enabled=true');
    expect(dockerfile).toContain('distroless/base-debian12:nonroot');
  });

  it('locks WIF trust to a single GitHub repository via attribute_condition', async () => {
    const engine = new HomegrownEngine();
    engine.register(iacCloudrunSchematic);

    await engine.run(
      'iac-cloudrun',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const wif = readFileSync(path.join(workDir, 'iac/cloudrun/wif.tf'), 'utf8');
    expect(wif).toContain('attribute_condition');
    expect(wif).toContain('assertion.repository == \\"${var.github_repository}\\"');
    expect(wif).toContain('roles/iam.workloadIdentityUser');
  });

  it('keeps bootstrap.sh executable on POSIX', () => {
    if (process.platform === 'win32') return;
    return (async () => {
      const engine = new HomegrownEngine();
      engine.register(iacCloudrunSchematic);

      await engine.run(
        'iac-cloudrun',
        {},
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      );

      const mode = statSync(path.join(workDir, 'iac/bootstrap/bootstrap.sh')).mode & 0o111;
      expect(mode).not.toBe(0);
    })();
  });
});
