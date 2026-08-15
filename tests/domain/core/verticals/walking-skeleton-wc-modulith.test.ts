/**
 * Tests for the `layout.modulith` module layout on `web-components`.
 *
 * Two of this stack's risks are the same as `ts-http`'s — nothing is
 * enforced by default, and the `exports` map is the only wall — so
 * what is asserted here is the aperture each package publishes and
 * the paths every adapter derives instead of spelling.
 *
 * The third risk is this stack's own: the **custom-element tag**. It
 * is not a type, not a specifier and not a path, so a wrong prefix
 * produces a project that builds, typechecks and tests green while
 * rendering an unknown element as an empty inline box. It is asserted
 * here, and the emitted project carries its own consumer for it.
 *
 * What these tests do not attempt is the browser: that the import map
 * keeps the design system out of the app bundle, and that the page
 * upgrades, are claims only Vite and a real browser can settle.
 * `tests/e2e/wc-walking-skeleton.test.ts` settles them.
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
import { containerizationVertical } from '../../../../src/domain/core/verticals/containerization.js';
import { gatewayVertical } from '../../../../src/domain/core/verticals/gateway.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { wcLayout } from '../../../../src/domain/core/adapters/wc-module-layout.js';
import {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';

const SCOPE = 'acme';

const tags = (...extra: string[]): string[] => [
  'lang.typescript',
  'runtime.browser',
  'framework.web-components',
  'pkg.npm',
  'arch.hexagonal',
  'arch.spa',
  ...extra,
];

const ANSWERS = {
  'walking-skeleton/wc-spa-bootstrap': { npmScope: SCOPE, projectName: 'skel' },
};

const cwds: string[] = [];

const install = async (verticals: readonly Vertical[], projectTags: string[]): Promise<FsTree> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wc-modulith-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  for (const vertical of verticals) {
    await installVertical({
      vertical,
      manifest: {
        ...emptyManifestV2('2026-08-15T00:00:00Z', '0.5.0-alpha'),
        tags: projectTags,
        answers: ANSWERS,
      },
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-15T12:00:00Z',
    });
  }
  return tree;
};

const read = (tree: FsTree, file: string): string => tree.read(file)?.toString() ?? '';

const json = (tree: FsTree, file: string): Record<string, unknown> =>
  JSON.parse(read(tree, file)) as Record<string, unknown>;

beforeEach(() => {
  cwds.length = 0;
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('wcLayout', () => {
  it('resolves to the flat workspace when no layout tag is recorded', () => {
    // Every web-components project scaffolded before the dial existed
    // is in this case, which is what keeps `keel add` working on them.
    const layout = wcLayout([], SCOPE);
    expect(layout.layout).toBe('basic');
    expect(layout.contractSrc).toBe('domain/domain-api/src');
    expect(layout.infraSrc('commons')).toBe('infrastructure/commons/src');
    expect(layout.elementsDir).toBe('application/web-app/src/components');
    expect(layout.elementsPkg).toBeNull();
    expect(layout.contextProtocolPkg).toBeNull();
  });

  it('collapses a context into one package with three entry points', () => {
    const layout = wcLayout([MODULITH_LAYOUT_TAG], SCOPE);
    expect(layout.coreRoot).toBe('modules/greeting');
    expect(layout.corePkg).toBe('@acme/greeting');
    expect(layout.elementsPkg).toBe('@acme/greeting/elements');
    expect(layout.servicePkg).toBe('@acme/greeting/service');
    expect(layout.infraIsPackage).toBe(false);
    // The port-bound elements are the context's driving adapters, not
    // the shell's components.
    expect(layout.elementsDir).toBe('modules/greeting/src/user-side/elements');
  });

  it('keeps the design system a top-level package under both layouts', () => {
    // Domain-blind, consumed by every context, and the package the
    // import map deduplicates — folding it into one context would give
    // that context ownership of everyone's buttons.
    for (const tag of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      const layout = wcLayout([tag], SCOPE);
      expect(layout.designSystemRoot).toBe('design-system');
      expect(layout.designSystemPkg).toBe('@acme/design-system');
      expect(layout.workspaceGlobs[0]).toBe('design-system');
    }
  });

  it('publishes the facade, the registration and the peer seam', () => {
    const modulith = wcLayout([MODULITH_LAYOUT_TAG], SCOPE);
    expect(JSON.parse(`{${modulith.exportsMap('context')}}`)).toEqual({
      '.': './src/index.ts',
      './elements': './src/elements.ts',
      './service': './src/service.ts',
    });
    // A plain package has one way in and needs no more.
    expect(JSON.parse(`{${modulith.exportsMap('plain')}}`)).toEqual({ '.': './src/index.ts' });
  });

  // The one string in the layout no compiler will check.
  it('qualifies element tags with the context under the modulith', () => {
    expect(wcLayout([BASIC_LAYOUT_TAG], SCOPE).elementTag('greeting')).toBe('acme-greeting');
    expect(wcLayout([MODULITH_LAYOUT_TAG], SCOPE).elementTag('view')).toBe('acme-greeting-view');
  });

  it('names a module by its package when published and relatively when not', () => {
    const basic = wcLayout([BASIC_LAYOUT_TAG], SCOPE);
    expect(basic.specifierFrom(basic.infraSrc('commons'), basic.contractIndex)).toBe(
      '@acme/domain-api',
    );
    const modulith = wcLayout([MODULITH_LAYOUT_TAG], SCOPE);
    // Extensionless: this workspace is bundled by Vite and a `.ts`
    // specifier is a TS5097 — the opposite of `ts-http`'s convention.
    expect(modulith.specifierFrom(modulith.infraSrc('commons'), modulith.contractIndex)).toBe(
      '../../domain/contract/index',
    );
    expect(modulith.specifierFrom(modulith.appSrc, modulith.coreIndex)).toBe('@acme/greeting');
  });
});

describe('the web-components modulith tree', () => {
  it('carves the workspace into a platform, a context, a design system and a shell', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    for (const p of [
      'design-system/package.json',
      'design-system/vite.config.ts',
      'platform/context/src/index.ts',
      'modules/greeting/src/index.ts',
      'modules/greeting/src/elements.ts',
      'modules/greeting/src/element-tags.ts',
      'modules/greeting/src/service.ts',
      'modules/greeting/src/context-keys.ts',
      'modules/greeting/src/domain/contract/greet.ts',
      'modules/greeting/src/domain/core/internal/greet-service.ts',
      'modules/greeting/src/user-side/elements/greeting-view.ts',
      'modules/greeting/src/infra/commons/system-clock.ts',
      'modules/greeting/tests/element-tags.test.ts',
      'application/web-app/vite.config.ts',
      'application/web-app/vendor-design-system.ts',
      '.dependency-cruiser.cjs',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('domain/domain-api/src/greet.ts')).toBeNull();
    expect(tree.read('infrastructure/commons/package.json')).toBeNull();
  });

  it('declares exactly the entry points the layout published', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    expect(json(tree, 'modules/greeting/package.json').exports).toEqual({
      '.': './src/index.ts',
      './elements': './src/elements.ts',
      './service': './src/service.ts',
    });
  });

  // Registration is a side effect. Behind its own entry point, the
  // facade stays importable from a DOM-less program — and the assembly
  // can order the definition after the provider is listening.
  it('keeps element registration out of the facade', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    const facade = read(tree, 'modules/greeting/src/index.ts');
    expect(facade).not.toContain('customElements');
    expect(read(tree, 'modules/greeting/src/elements.ts')).toContain('customElements.define');
    const main = read(tree, 'application/web-app/src/main.ts');
    expect(main).toContain("from '@acme/greeting/elements'");
    // Provider first, definitions last.
    expect(main.indexOf('context-request')).toBeLessThan(main.indexOf('defineGreetingElements()'));
  });

  // A wall with no consumer is prose. This one is a runtime string, so
  // the emitted project carries the test that re-derives it.
  it('emits the tag prefix and a test that re-derives it', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    expect(read(tree, 'modules/greeting/src/element-tags.ts')).toContain(
      "export const GREETING_VIEW_TAG = 'acme-greeting-view';",
    );
    // The markup and the registration are separate spellings that
    // must agree.
    expect(read(tree, 'application/web-app/index.html')).toContain(
      '<acme-greeting-view></acme-greeting-view>',
    );
    const guard = read(tree, 'modules/greeting/tests/element-tags.test.ts');
    expect(guard).toContain("manifest.name.replace('@', '').split('/')");
    expect(guard).toContain('${scope}-${context}-view');
  });

  // Browser-verified in the e2e; asserted here so a template edit
  // cannot quietly drop it.
  it('ships the import map and leaves the design system external', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    const html = read(tree, 'application/web-app/index.html');
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain('"@acme/design-system": "/vendor/design-system.js"');
    // The map must precede the first module script or the browser
    // ignores it.
    expect(html.indexOf('importmap')).toBeLessThan(html.indexOf('src="/src/main.ts"'));
    expect(read(tree, 'application/web-app/vite.config.ts')).toContain('external: [DESIGN_SYSTEM]');
    // …and the external needs something to point at.
    expect(json(tree, 'design-system/package.json').scripts).toHaveProperty('build');
  });

  it('ships a lint that resolves workspace imports rather than skipping them', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    const config = read(tree, '.dependency-cruiser.cjs');
    expect(config).toContain('enhancedResolveOptions');
    expect(config).toContain("exportsFields: ['exports']");
    for (const rule of [
      'context-through-its-aperture',
      'domain-owns-no-adapters',
      'domain-knows-no-dom',
      'design-system-is-domain-blind',
      'peers-meet-at-the-service-seam',
    ]) {
      expect(config, `missing rule ${rule}`).toContain(rule);
    }
  });
});

describe('the web-components verticals follow the layout', () => {
  it('puts the gateway inside the context and wires it through the facade', async () => {
    const tree = await install(
      [walkingSkeletonVertical, gatewayVertical],
      tags(MODULITH_LAYOUT_TAG, 'peer.api.rest'),
    );
    expect(
      tree.read('modules/greeting/src/infra/gateway-rest/rest-greet-gateway.ts'),
    ).not.toBeNull();
    expect(tree.read('infrastructure/gateway-rest/package.json')).toBeNull();
    expect(read(tree, 'modules/greeting/src/index.ts')).toContain(
      "export { createRestGreetGateway } from './infra/gateway-rest/index';",
    );
    const main = read(tree, 'application/web-app/src/main.ts');
    expect(main).toContain('createRestGreetGateway');
    expect(main).toContain("} from '@acme/greeting';");
    expect(main).not.toContain('modules/greeting/src');
  });

  // The gateway rewrites the app's Vite config to add a dev proxy.
  // Dropping the vendor plugin there would inline the design system
  // back into the bundle — invisible until a second bundle exists.
  it('keeps the design system external when the gateway rewrites the vite config', async () => {
    const tree = await install(
      [walkingSkeletonVertical, gatewayVertical],
      tags(MODULITH_LAYOUT_TAG, 'peer.api.rest'),
    );
    const config = read(tree, 'application/web-app/vite.config.ts');
    expect(config).toContain('vendorDesignSystem()');
    expect(config).toContain('external: [DESIGN_SYSTEM]');
    expect(config).toContain("'/api'");
  });

  it('points the container image at the bundle the layout chose', async () => {
    for (const tag of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      const tree = await install([walkingSkeletonVertical, containerizationVertical], tags(tag));
      const appRoot = wcLayout([tag], SCOPE).appRoot;
      expect(read(tree, 'Dockerfile')).toContain(`COPY ${appRoot}/dist/ /usr/share/nginx/html/`);
    }
  });
});
