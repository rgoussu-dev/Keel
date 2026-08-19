/**
 * Tests for the `toolchain` vertical. The install blocks prove the
 * recorded needs per family and per `pkg.*` tag combination — with
 * every version asserted **against the pin registry itself**, so the
 * block can never become a second place versions are stated. The
 * reapply block proves the pin-bump path (versions refresh in place,
 * nothing duplicates); the resolution block proves every
 * non-composite stack's tag set covers the vertical, and that no
 * stack installs it by default — it is deliberately opt-in.
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
import { toolchainVertical } from '../../../../src/domain/core/verticals/toolchain.js';
import { VERSION_PINS_ASSET } from '../../../../src/domain/core/adapters/toolchain.js';
import { getVertical } from '../../../../src/domain/core/verticals/index.js';
import { resolveVertical } from '../../../../src/domain/core/resolver.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import type { TemplateSource } from '../../../../src/domain/contract/ports/template-source.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import { loadRegistry } from '../../../support/version-pins.js';

/** The registry the adapters read — the single source of versions. */
const pinValue = (id: string): string => {
  const pin = loadRegistry().find((p) => p.id === id);
  if (!pin) throw new Error(`test setup: no '${id}' entry in the pin registry`);
  return pin.value;
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

interface InstallOptions {
  readonly tree?: FsTree;
  readonly templates?: TemplateSource;
  readonly apply?: 'install' | 'reapply';
}

async function install(
  manifest: ManifestV2,
  options: InstallOptions = {},
): Promise<{ tree: FsTree; manifest: ManifestV2 }> {
  let tree = options.tree;
  if (!tree) {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-toolchain-'));
    cwds.push(cwd);
    tree = new FsTree(cwd);
    tree.write('README.md', '# demo\n');
  }
  const result = await installVertical({
    vertical: toolchainVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: '/unused',
    templates: options.templates ?? ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-19T12:00:00Z',
    apply: options.apply ?? 'install',
  });
  return { tree, manifest: result.manifest };
}

/** A TemplateSource serving a doctored pin registry over the real assets. */
function withRegistry(transform: (pins: { id: string; value: string }[]) => void): TemplateSource {
  return {
    render: (templateId, targetRoot, vars) =>
      ejsTemplateSource.render(templateId, targetRoot, vars),
    readText: async (assetId) => {
      const raw = await ejsTemplateSource.readText(assetId);
      if (assetId !== VERSION_PINS_ASSET) return raw;
      const registry = JSON.parse(raw) as { pins: { id: string; value: string }[] };
      transform(registry.pins);
      return JSON.stringify(registry);
    },
  };
}

const baseManifest = (tags: readonly string[]): ManifestV2 => ({
  ...emptyManifestV2('2026-08-19T00:00:00Z', '0.0.0-test'),
  tags: [...tags],
});

describe('toolchain vertical', () => {
  it('is registered for brownfield installs', () => {
    expect(getVertical('toolchain')?.id).toBe('toolchain');
  });

  it('records JDK + Gradle for a Gradle-tagged JVM stack', async () => {
    const { tree, manifest } = await install(
      baseManifest(['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.cli', 'pkg.gradle']),
    );

    expect(manifest.toolchain).toEqual({
      schemaVersion: 1,
      needs: [
        { tool: 'gradle', version: pinValue('jvm-gradle-wrapper'), source: 'jvm-gradle-wrapper' },
        { tool: 'jdk', version: pinValue('jvm-jdk'), source: 'jvm-jdk' },
      ],
    });
    expect(tree.read('README.md')?.toString()).toContain('### Toolchain');
    expect(manifest.verticals.map((v) => v.id)).toContain('toolchain');
  });

  it('records Maven instead of Gradle when the manifest says so', async () => {
    const { manifest } = await install(
      baseManifest([
        'lang.kotlin',
        'runtime.jvm',
        'framework.spring',
        'arch.server-http',
        'pkg.maven',
      ]),
    );

    expect(manifest.toolchain?.needs).toEqual([
      { tool: 'jdk', version: pinValue('jvm-jdk'), source: 'jvm-jdk' },
      { tool: 'maven', version: pinValue('jvm-maven-wrapper'), source: 'jvm-maven-wrapper' },
    ]);
  });

  it('records the Go toolchain for the Go stacks', async () => {
    const { manifest } = await install(
      baseManifest(['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http']),
    );

    expect(manifest.toolchain?.needs).toEqual([
      { tool: 'go', version: pinValue('go-toolchain'), source: 'go-toolchain' },
    ]);
  });

  it('records the Rust toolchain major for the Rust stacks', async () => {
    const { manifest } = await install(baseManifest(['lang.rust', 'pkg.cargo', 'arch.cli']));

    expect(manifest.toolchain?.needs).toEqual([
      { tool: 'rust', version: pinValue('image-rust'), source: 'image-rust' },
    ]);
  });

  it('records Node alone under npm — npm rides with Node', async () => {
    const { manifest } = await install(
      baseManifest(['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.npm']),
    );

    expect(manifest.toolchain?.needs).toEqual([
      { tool: 'node', version: pinValue('node-active-lts'), source: 'node-active-lts' },
    ]);
  });

  it('records Node + pnpm under pnpm — pnpm is its own need', async () => {
    const { manifest } = await install(
      baseManifest(['lang.typescript', 'runtime.browser', 'framework.web-components', 'pkg.pnpm']),
    );

    expect(manifest.toolchain?.needs).toEqual([
      { tool: 'node', version: pinValue('node-active-lts'), source: 'node-active-lts' },
      { tool: 'pnpm', version: pinValue('ts-pnpm'), source: 'ts-pnpm' },
    ]);
  });

  it('records the same needs on the modulith layout — layout is not an axis', async () => {
    const basic = await install(
      baseManifest(['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.cli', 'pkg.gradle']),
    );
    const modulith = await install(
      baseManifest([
        'lang.java',
        'runtime.jvm',
        'framework.quarkus',
        'arch.cli',
        'pkg.gradle',
        'layout.modulith',
      ]),
    );

    expect(modulith.manifest.toolchain).toEqual(basic.manifest.toolchain);
  });

  it('fails loudly on a pin id the registry does not carry', async () => {
    await expect(
      install(baseManifest(['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.pnpm']), {
        templates: withRegistry((pins) => {
          const index = pins.findIndex((p) => p.id === 'ts-pnpm');
          pins.splice(index, 1);
        }),
      }),
    ).rejects.toThrow(/toolchain\/node-toolchain: no 'ts-pnpm' entry/);
  });
});

describe('reapply — the pin-bump path', () => {
  it('refreshes versions in place without duplicating needs or the README note', async () => {
    const first = await install(
      baseManifest(['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.cli', 'pkg.gradle']),
    );
    expect(first.manifest.toolchain?.needs.find((n) => n.tool === 'jdk')?.version).toBe(
      pinValue('jvm-jdk'),
    );

    const second = await install(first.manifest, {
      tree: first.tree,
      apply: 'reapply',
      templates: withRegistry((pins) => {
        for (const pin of pins) {
          if (pin.id === 'jvm-jdk') pin.value = '99';
        }
      }),
    });

    expect(second.manifest.toolchain?.needs).toEqual([
      { tool: 'gradle', version: pinValue('jvm-gradle-wrapper'), source: 'jvm-gradle-wrapper' },
      { tool: 'jdk', version: '99', source: 'jvm-jdk' },
    ]);
    const readme = second.tree.read('README.md')?.toString() ?? '';
    expect(readme.match(/### Toolchain/g)).toHaveLength(1);
  });
});

describe('toolchain coverage across the stack registry', () => {
  it('resolves exactly one needs adapter for every non-composite stack', () => {
    for (const stack of Object.values(STACKS)) {
      if (stack.services) continue;
      const tags = [...stack.tags, ...(stack.buildSystems ? [stack.buildSystems[0].tag] : [])];
      const resolved = resolveVertical(toolchainVertical, tags);
      expect(resolved, stack.id).toHaveLength(1);
    }
  });

  it('is in no stack default vertical set — deliberately opt-in', () => {
    for (const stack of Object.values(STACKS)) {
      expect(
        (stack.verticals ?? []).map((v) => v.id),
        stack.id,
      ).not.toContain('toolchain');
    }
  });
});
