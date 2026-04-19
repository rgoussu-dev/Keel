import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { ciGithubSchematic } from '../src/schematics/ci-github/factory.js';
import { logger } from '../src/util/log.js';

describe('ci-github schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-ci-gh-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('emits ci.yml and release.yml wired for the given service', async () => {
    const engine = new HomegrownEngine();
    engine.register(ciGithubSchematic);

    await engine.run(
      'ci-github',
      { serviceName: 'acme-svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    expect(existsSync(path.join(workDir, '.github/workflows/ci.yml'))).toBe(true);
    expect(existsSync(path.join(workDir, '.github/workflows/release.yml'))).toBe(true);
  });

  it('ci.yml does continuous deployment on main but not on PRs', async () => {
    const engine = new HomegrownEngine();
    engine.register(ciGithubSchematic);

    await engine.run(
      'ci-github',
      { serviceName: 'acme-svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const ci = readFileSync(path.join(workDir, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('name: ci');
    expect(ci).toContain("if: github.ref == 'refs/heads/main'");
    expect(ci).toContain('google-github-actions/auth@v2');
    expect(ci).toContain('workload_identity_provider');
    expect(ci).toContain('docker build -f iac/cloudrun/Dockerfile');
    expect(ci).toContain('-var service_name=acme-svc');
    expect(ci).toContain('tofu apply -auto-approve');
    expect(ci).toContain('/ping');
  });

  it('release.yml is workflow_dispatch with a bump input and promotes images', async () => {
    const engine = new HomegrownEngine();
    engine.register(ciGithubSchematic);

    await engine.run(
      'ci-github',
      { serviceName: 'acme-svc' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const release = readFileSync(path.join(workDir, '.github/workflows/release.yml'), 'utf8');
    expect(release).toContain('workflow_dispatch');
    expect(release).toContain('bump');
    expect(release).toMatch(/options:\s*\[patch,\s*minor,\s*major\]/);
    expect(release).toContain('gcloud artifacts docker tags add');
    expect(release).toContain('chore(release): ${TAG} [skip ci]');
    expect(release).toContain('git push origin');
  });

  it('rejects a malformed service name', async () => {
    const engine = new HomegrownEngine();
    engine.register(ciGithubSchematic);
    await expect(
      engine.run(
        'ci-github',
        { serviceName: 'Invalid_Name' },
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/invalid serviceName/);
  });

  it('rejects missing service name', async () => {
    const engine = new HomegrownEngine();
    engine.register(ciGithubSchematic);
    await expect(
      engine.run(
        'ci-github',
        {},
        { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      ),
    ).rejects.toThrow(/serviceName.*required/);
  });
});
