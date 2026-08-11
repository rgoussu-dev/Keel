/**
 * Tests for the `dev-env` vertical and its compose patch helpers.
 * The install block proves the base lands with the pristine empty
 * shapes; the helper block proves supplementing verticals (and
 * future infra contributions) compose onto both the pristine and an
 * already-populated file.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { devEnvVertical } from '../../../../src/domain/core/verticals/dev-env.js';
import { getVertical } from '../../../../src/domain/core/verticals/index.js';
import {
  addComposeService,
  addComposeVolumes,
} from '../../../../src/domain/core/adapters/dev-env-compose.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('dev-env vertical', () => {
  it('is registered for brownfield installs', () => {
    expect(getVertical('dev-env')?.id).toBe('dev-env');
  });

  it('seeds dev/compose.yaml with the empty base and the README section', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dev-env-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    tree.write('README.md', '# demo\n');
    const manifest = {
      ...emptyManifestV2('2026-08-11T00:00:00Z', '0.0.0-test'),
      tags: ['lang.go', 'arch.hexagonal', 'arch.server-http'],
      answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
    };
    await installVertical({
      vertical: devEnvVertical,
      manifest,
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-11T12:00:00Z',
    });

    const compose = tree.read('dev/compose.yaml')?.toString() ?? '';
    expect(compose).toContain('name: shipper-dev');
    expect(compose).toContain('services: {}');
    expect(tree.read('README.md')?.toString()).toContain('### Dev environment');
  });
});

describe('dev-env installed after a contributor (order independence)', () => {
  it('leaves an already-populated dev compose untouched and still adds its README section', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dev-env-after-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    tree.write('README.md', '# demo\n');
    const populated =
      'name: shipper-dev\n\nservices:\n  lgtm:\n    image: grafana/otel-lgtm:0.30.1\n';
    tree.write('dev/compose.yaml', populated);
    const manifest = {
      ...emptyManifestV2('2026-08-11T00:00:00Z', '0.0.0-test'),
      tags: ['lang.go', 'arch.hexagonal', 'arch.server-http'],
      answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
    };
    await installVertical({
      vertical: devEnvVertical,
      manifest,
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-11T12:00:00Z',
    });

    expect(tree.read('dev/compose.yaml')?.toString()).toBe(populated);
    expect(tree.read('README.md')?.toString()).toContain('### Dev environment');
  });
});

describe('compose patch helpers', () => {
  const base = 'name: demo-dev\n\nservices: {}\n';

  it('replaces the pristine empty services map, then inserts at the top', () => {
    const once = addComposeService(base, '  redis:\n    image: redis:8\n');
    expect(once).toContain('services:\n  redis:');
    expect(once).not.toContain('services: {}');

    const twice = addComposeService(once, '  postgres:\n    image: postgres:17\n');
    expect(twice).toContain('services:\n  postgres:');
    expect(twice).toContain('  redis:');
  });

  it('creates the volumes section once and skips already-declared names', () => {
    const withVolumes = addComposeVolumes(base, ['redis-data']);
    expect(withVolumes).toContain('volumes:\n  redis-data:');

    const again = addComposeVolumes(withVolumes, ['redis-data', 'pg-data']);
    expect(again.match(/redis-data:/g)).toHaveLength(1);
    expect(again).toContain('  pg-data:');
  });
});
