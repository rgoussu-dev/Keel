/**
 * Tests for the `dev-container` vertical. The install blocks prove
 * both shapes of the definition — standalone image-based without the
 * `dev-env` vertical, Compose-attached (joining `dev/compose.yaml`'s
 * project) when the manifest records it — and that the per-family
 * adapters request their toolchain features, with every version
 * asserted **against the pin registry itself**, so a feature can
 * never become a second place a toolchain version is stated
 * (`tests/toolchain-pins.test.ts` guards the same rule across all
 * three surfaces at once). The resolution block proves every
 * non-composite stack's tag set covers the vertical, so no stack can
 * silently lose its dev container.
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
import { devContainerVertical } from '../../../../src/domain/core/verticals/dev-container.js';
import { devEnvVertical } from '../../../../src/domain/core/verticals/dev-env.js';
import { attachDevContainerToDevEnv } from '../../../../src/domain/core/adapters/dev-container.js';
import { shippedRegistry } from '../../../../src/domain/core/registry.js';
import { resolveVertical } from '../../../../src/domain/core/resolver.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import { pinValue } from '../../../support/version-pins.js';

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

async function install(manifest: ManifestV2): Promise<{ tree: FsTree; manifest: ManifestV2 }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dev-container-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  tree.write('README.md', '# demo\n');
  const result = await installVertical({
    vertical: devContainerVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-18T12:00:00Z',
  });
  return { tree, manifest: result.manifest };
}

/** Parses the rendered devcontainer.json, tolerating its comments. */
function parseDevcontainer(tree: FsTree): Record<string, unknown> {
  const raw = tree.read('.devcontainer/devcontainer.json')?.toString() ?? '';
  const withoutComments = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  return JSON.parse(withoutComments) as Record<string, unknown>;
}

describe('dev-container vertical', () => {
  it('is registered for brownfield installs', () => {
    expect(shippedRegistry.vertical('dev-container')?.id).toBe('dev-container');
  });

  it('renders the standalone image shape when dev-env is not installed (JVM, Gradle)', async () => {
    const { tree, manifest } = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.cli', 'pkg.gradle'],
      answers: {
        'walking-skeleton/quarkus-cli-bootstrap': { projectName: 'greeter', basePackage: 'x.y' },
      },
    });

    const parsed = parseDevcontainer(tree);
    expect(parsed.name).toBe('greeter');
    expect(parsed.image).toBe('mcr.microsoft.com/devcontainers/base:ubuntu');
    expect(parsed.dockerComposeFile).toBeUndefined();
    const features = parsed.features as Record<string, Record<string, unknown>>;
    expect(features['ghcr.io/devcontainers/features/java:1']).toEqual({
      version: pinValue('jvm-jdk'),
      jdkDistro: 'tem',
      installGradle: true,
      installMaven: false,
    });
    expect(features['ghcr.io/devcontainers/features/docker-outside-of-docker:1']).toBeUndefined();
    expect(tree.read('.devcontainer/compose.yaml')).toBeNull();
    expect(tree.read('README.md')?.toString()).toContain('### Dev container');
    expect(manifest.tags).toContain('dev.container');
    expect(manifest.verticals.map((v) => v.id)).toContain('dev-container');
  });

  it('installs Maven instead of Gradle when the manifest says so', async () => {
    const { tree } = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.server-http', 'pkg.maven'],
      answers: {
        'walking-skeleton/spring-rest-kotlin-bootstrap': { projectName: 'api', basePackage: 'x.y' },
      },
    });
    const features = parseDevcontainer(tree).features as Record<string, Record<string, unknown>>;
    expect(features['ghcr.io/devcontainers/features/java:1']).toMatchObject({
      installGradle: false,
      installMaven: true,
    });
  });

  it('attaches to the dev environment when the dev-env vertical is installed (Go)', async () => {
    const { tree } = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
      verticals: [{ id: 'dev-env', installedAt: '2026-08-18T00:00:00Z' }],
      answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
    });

    const parsed = parseDevcontainer(tree);
    expect(parsed.dockerComposeFile).toEqual(['../dev/compose.yaml', 'compose.yaml']);
    expect(parsed.service).toBe('workspace');
    expect(parsed.workspaceFolder).toBe('/workspaces/shipper');
    expect(parsed.image).toBeUndefined();
    const features = parsed.features as Record<string, Record<string, unknown>>;
    expect(features['ghcr.io/devcontainers/features/go:1']).toEqual({
      version: pinValue('go-toolchain'),
    });
    expect(features['ghcr.io/devcontainers/features/docker-outside-of-docker:1']).toEqual({});

    const overlay = tree.read('.devcontainer/compose.yaml')?.toString() ?? '';
    expect(overlay).toContain('workspace:');
    expect(overlay).toContain('- ..:/workspaces/shipper:cached');
    expect(tree.read('README.md')?.toString()).toContain('reachable by name');
  });

  it('installs dependencies with the tagged package manager (TypeScript)', async () => {
    const pnpm = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.pnpm'],
      answers: { 'walking-skeleton/ts-http-bootstrap': { projectName: 'api' } },
    });
    expect(parseDevcontainer(pnpm.tree).postCreateCommand).toBe('corepack enable && pnpm install');

    const npm = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.typescript', 'runtime.browser', 'framework.web-components', 'pkg.npm'],
      answers: { 'walking-skeleton/wc-spa-bootstrap': { projectName: 'shop' } },
    });
    const parsed = parseDevcontainer(npm.tree);
    expect(parsed.postCreateCommand).toBe('npm install');
    const features = parsed.features as Record<string, Record<string, unknown>>;
    expect(features['ghcr.io/devcontainers/features/node:1']).toEqual({
      version: pinValue('node-active-lts'),
    });
  });

  it('provisions the Rust toolchain for the Rust stacks', async () => {
    const { tree } = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.rust', 'pkg.cargo', 'arch.cli'],
      answers: { 'walking-skeleton/rust-bootstrap': { projectName: 'tool' } },
    });
    const features = parseDevcontainer(tree).features as Record<string, Record<string, unknown>>;
    expect(features['ghcr.io/devcontainers/features/rust:1']).toEqual({});
  });
});

describe('dev-env installed after dev-container (order independence)', () => {
  it('upgrades the standalone definition to the attached shape', async () => {
    const first = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
      answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
    });
    expect(parseDevcontainer(first.tree).image).toBeDefined();

    await installVertical({
      vertical: devEnvVertical,
      manifest: first.manifest,
      tree: first.tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd: '/unused',
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-18T13:00:00Z',
    });

    const parsed = parseDevcontainer(first.tree);
    expect(parsed.image).toBeUndefined();
    expect(parsed.dockerComposeFile).toEqual(['../dev/compose.yaml', 'compose.yaml']);
    expect(parsed.service).toBe('workspace');
    expect(parsed.workspaceFolder).toBe('/workspaces/shipper');
    const features = parsed.features as Record<string, Record<string, unknown>>;
    expect(features['ghcr.io/devcontainers/features/docker-outside-of-docker:1']).toEqual({});
    expect(features['ghcr.io/devcontainers/features/go:1']).toEqual({
      version: pinValue('go-toolchain'),
    });

    const overlay = first.tree.read('.devcontainer/compose.yaml')?.toString() ?? '';
    expect(overlay).toContain('- ..:/workspaces/shipper:cached');
    expect(first.tree.read('dev/compose.yaml')?.toString()).toContain('name: shipper-dev');
    const readme = first.tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('reachable by name');
    expect(readme).toContain('### Dev environment');
  });

  it('leaves an already-attached definition untouched', () => {
    const attached = '{\n  "dockerComposeFile": ["../dev/compose.yaml", "compose.yaml"]\n}\n';
    expect(attachDevContainerToDevEnv(attached, 'shipper')).toBe(attached);
  });

  it('refuses to rewrite a definition with a customized image', () => {
    const custom =
      '{\n  "name": "shipper",\n  "image": "my-registry/my-base:1",\n  "features": {\n  }\n}\n';
    expect(() => attachDevContainerToDevEnv(custom, 'shipper')).toThrow(
      /attach it to the dev environment manually/,
    );
  });
});

describe('dev-container coverage across the stack registry', () => {
  it('resolves exactly one definition adapter for every non-composite stack', () => {
    for (const stack of Object.values(STACKS)) {
      if (stack.services) continue;
      const tags = [...stack.tags, ...(stack.buildSystems?.[0] ? [stack.buildSystems[0].tag] : [])];
      const resolved = resolveVertical(devContainerVertical, tags);
      expect(resolved, stack.id).toHaveLength(1);
    }
  });

  it('is listed on every non-composite stack', () => {
    for (const stack of Object.values(STACKS)) {
      if (stack.services) continue;
      expect(
        stack.verticals.map((v) => v.id),
        stack.id,
      ).toContain('dev-container');
    }
  });
});
