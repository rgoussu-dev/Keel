/**
 * Tests for the `layout.modulith` module layout on `ts-http`.
 *
 * TypeScript's layout risk is neither depth nor naming: it is that
 * **nothing is enforced by default**. An undeclared workspace
 * dependency resolves through npm's hoisted `node_modules`, and TS
 * project references do not restrict which projects a project may
 * import. So what these tests hold is the two things that do enforce
 * something — the `exports` map each package publishes, and the paths
 * every adapter derives instead of spelling — plus the fact that a
 * vertical's patches land on the assembly the layout actually chose.
 *
 * What they deliberately do not attempt is the walls themselves.
 * That a deep import is rejected by `tsc` and by Node, and that
 * dependency-cruiser fails on a relative bypass, are claims only the
 * real toolchain can settle; `tests/e2e/ts-walking-skeleton.test.ts`
 * settles them against a real install.
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
import { observabilityVertical } from '../../../../src/domain/core/verticals/observability.js';
import { persistenceVertical } from '../../../../src/domain/core/verticals/persistence.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { tsLayout, tsPeerPackage } from '../../../../src/domain/core/adapters/ts-module-layout.js';
import {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';

const SCOPE = 'acme';

const tags = (...extra: string[]): string[] => [
  'lang.typescript',
  'runtime.node',
  'pkg.npm',
  'arch.hexagonal',
  'arch.server-http',
  ...extra,
];

const ANSWERS = {
  'walking-skeleton/ts-http-bootstrap': { npmScope: SCOPE, projectName: 'skel' },
};

const cwds: string[] = [];

const install = async (verticals: readonly Vertical[], projectTags: string[]): Promise<FsTree> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-modulith-'));
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

describe('tsLayout', () => {
  it('resolves to the flat workspace when no layout tag is recorded', () => {
    // Every ts-http project scaffolded before the dial existed is in
    // this case, which is what keeps `keel add` working on them.
    const layout = tsLayout([], SCOPE);
    expect(layout.layout).toBe('basic');
    expect(layout.contractSrc).toBe('domain/contract/src');
    expect(layout.corePkg).toBe('@acme/domain-core');
    expect(layout.infraSrc('clock')).toBe('infrastructure/clock/src');
    expect(layout.infraIsPackage).toBe(true);
    expect(layout.servicePkg).toBeNull();
  });

  it('collapses a context into one package with two entry points', () => {
    const layout = tsLayout([MODULITH_LAYOUT_TAG], SCOPE);
    expect(layout.coreRoot).toBe('modules/greeting');
    expect(layout.corePkg).toBe('@acme/greeting');
    expect(layout.contractPkg).toBe('@acme/greeting');
    expect(layout.infraSrc('clock')).toBe('modules/greeting/src/infra/clock');
    // The whole "1 manifest per context instead of 3.5" claim.
    expect(layout.infraIsPackage).toBe(false);
    expect(layout.servicePkg).toBe('@acme/greeting/service');
  });

  // The aperture is the only wall TypeScript enforces on its own, so
  // the resolver owns it rather than each package.json deciding.
  it('publishes the facade and the peer seam, and nothing else', () => {
    const modulith = tsLayout([MODULITH_LAYOUT_TAG], SCOPE);
    expect(JSON.parse(`{${modulith.exportsMap('domain')}}`)).toEqual({
      '.': './src/index.ts',
      './service': './src/service.ts',
    });
    // The kernel has no peers to serve; one entry point is the map.
    expect(JSON.parse(`{${modulith.exportsMap('kernel')}}`)).toEqual({ '.': './src/index.ts' });
    expect(JSON.parse(`{${tsLayout([BASIC_LAYOUT_TAG], SCOPE).exportsMap('domain')}}`)).toEqual({
      '.': './src/index.ts',
    });
  });

  // With no build step the map points at sources and specifiers keep
  // their .ts. An emitting build needs ./dist/index.js, a types
  // condition, and .js specifiers — and mixing the two typechecks
  // before failing at runtime, so the pair is asserted together.
  it('keeps the map and the specifier convention in the same mode', () => {
    for (const tag of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      const layout = tsLayout([tag], SCOPE);
      expect(layout.exportsMap('domain')).toContain('./src/index.ts');
      expect(layout.exportsMap('domain')).not.toContain('dist');
      expect(layout.coreExport('greeting-log-handlers.ts')).toMatch(/\.ts$/);
    }
  });

  it('names a module by its package when published and relatively when not', () => {
    const basic = tsLayout([BASIC_LAYOUT_TAG], SCOPE);
    // Two packages: the adapter imports the contract's published entry.
    expect(basic.specifierFrom(basic.infraSrc('clock'), basic.contractIndex)).toBe(
      '@acme/domain-contract',
    );
    const modulith = tsLayout([MODULITH_LAYOUT_TAG], SCOPE);
    // One package: the contract face is published by nothing, so a
    // relative path is the only way in.
    expect(modulith.specifierFrom(modulith.infraSrc('clock'), modulith.contractIndex)).toBe(
      '../../domain/contract/index.ts',
    );
    expect(modulith.specifierFrom(modulith.restSrc, modulith.coreIndex)).toBe('@acme/greeting');
  });
});

describe('the ts-http modulith tree', () => {
  it('carves the workspace into a platform, a context and an assembly', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    for (const p of [
      'platform/kernel/src/kernel.ts',
      'platform/kernel/src/registry-mediator.ts',
      'modules/greeting/src/index.ts',
      'modules/greeting/src/service.ts',
      'modules/greeting/src/domain/contract/greet.ts',
      'modules/greeting/src/domain/core/internal/greet-handler.ts',
      'modules/greeting/src/infra/clock/system-clock.ts',
      'modules/greeting/tests/greet.test.ts',
      'application/rest/src/main.ts',
      '.dependency-cruiser.cjs',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    // None of the flat homes survive, and the driven adapter is no
    // longer a package of its own.
    expect(tree.read('domain/contract/src/greet.ts')).toBeNull();
    expect(tree.read('infrastructure/clock/package.json')).toBeNull();
  });

  it('moves the mediator out of the context and into the platform', async () => {
    // Dispatch is owned by no bounded context — every module
    // contributes handlers to it. Same move the JVM modulith makes.
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    expect(read(tree, 'platform/kernel/src/index.ts')).toContain('registry-mediator');
    expect(read(tree, 'application/rest/src/main.ts')).toContain(
      "import { createRegistryMediator } from '@acme/platform-kernel';",
    );
  });

  it('declares exactly the entry points the layout published', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    expect(json(tree, 'modules/greeting/package.json').exports).toEqual({
      '.': './src/index.ts',
      './service': './src/service.ts',
    });
    expect(json(tree, 'platform/kernel/package.json').exports).toEqual({ '.': './src/index.ts' });
  });

  // dependency-cruiser with default options resolves every @scope/*
  // import to a bare specifier and reports zero violations over a tree
  // that is in violation. The block below is the difference between a
  // lint and a lint-shaped no-op.
  it('ships a lint that resolves workspace imports rather than skipping them', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    const config = read(tree, '.dependency-cruiser.cjs');
    expect(config).toContain('enhancedResolveOptions');
    expect(config).toContain("exportsFields: ['exports']");
    expect(config).toContain("'.ts'");
    for (const rule of [
      'context-through-its-aperture',
      'domain-owns-no-adapters',
      'domain-knows-no-platform',
      'peers-meet-at-the-service-seam',
    ]) {
      expect(config, `missing rule ${rule}`).toContain(rule);
    }
    expect(json(tree, 'package.json').devDependencies).toHaveProperty('dependency-cruiser');
  });

  it('lists the workspace members the layout declares, in both manifests', async () => {
    const npm = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    expect(json(npm, 'package.json').workspaces).toEqual([
      'platform/*',
      'modules/*',
      'application/*',
    ]);
    const pnpm = await install(
      [walkingSkeletonVertical],
      [
        'lang.typescript',
        'runtime.node',
        'pkg.pnpm',
        'arch.hexagonal',
        'arch.server-http',
        MODULITH_LAYOUT_TAG,
      ],
    );
    expect(read(pnpm, 'pnpm-workspace.yaml')).toBe(
      'packages:\n  - platform/*\n  - modules/*\n  - application/*\n',
    );
  });
});

describe('the TypeScript verticals follow the layout', () => {
  // The Go regression in its TypeScript shape: emit a correct package,
  // patch a file the layout moved, and let the install report success
  // over an assembly that imports none of it.
  it('wires observability into the modulith assembly, not just beside it', async () => {
    const tree = await install(
      [walkingSkeletonVertical, observabilityVertical],
      tags(MODULITH_LAYOUT_TAG),
    );
    expect(tree.read('application/rest/src/observability/http.ts')).not.toBeNull();
    const main = read(tree, 'application/rest/src/main.ts');
    expect(main).toContain("import './observability/otel.ts';");
    expect(main).toContain('const server = instrument(createGreetServer(mediator));');
  });

  it('puts every package of the persistence slice inside the context', async () => {
    const tree = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags(MODULITH_LAYOUT_TAG),
    );
    for (const p of [
      'modules/greeting/src/domain/contract/greeting-log.ts',
      'modules/greeting/src/domain/core/internal/greeting-log-handlers.ts',
      'modules/greeting/src/infra/greeting-log/pg-greeting-log.ts',
      'modules/greeting/src/infra/unit-of-work/pg-unit-of-work.ts',
      'application/rest/src/greetings.ts',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    // Two manifests fewer than `basic`, which is the trade.
    expect(tree.read('infrastructure/greeting-log/package.json')).toBeNull();
    expect(tree.read('infrastructure/unit-of-work/package.json')).toBeNull();
    // …and the dependency they carried moved onto the package that
    // now contains their sources.
    expect(json(tree, 'modules/greeting/package.json').dependencies).toHaveProperty('pg');
  });

  // The assembly cannot import the context's infra, so a slice that
  // adds adapters has to widen the facade rather than let main.ts
  // reach past it. Same constraint Go's facade imposes.
  it('wires the persistence slice through the facade', async () => {
    const tree = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags(MODULITH_LAYOUT_TAG),
    );
    const facade = read(tree, 'modules/greeting/src/index.ts');
    expect(facade).toContain(
      "export { createPgGreetingLog } from './infra/greeting-log/index.ts';",
    );
    const main = read(tree, 'application/rest/src/main.ts');
    expect(main).toContain("} from '@acme/greeting';");
    expect(main).toContain('createRecordGreetingHandler(greetingLog, systemClock');
    // Never past the aperture.
    expect(main).not.toContain('modules/greeting/src');
  });

  // Absolute specifiers hide depth; a test that reads a file out of
  // the repo does not. The JVM's `upToRoot` bug in Node's spelling.
  it('walks back to the repo root from wherever the SQL contract test landed', async () => {
    const modulith = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags(MODULITH_LAYOUT_TAG),
    );
    expect(read(modulith, 'modules/greeting/tests/pg-greeting-log.test.ts')).toContain(
      "new URL('../../../migrations/sql', import.meta.url)",
    );
    const basic = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags(BASIC_LAYOUT_TAG),
    );
    expect(read(basic, 'infrastructure/greeting-log/tests/pg-greeting-log.test.ts')).toContain(
      "new URL('../../../migrations/sql', import.meta.url)",
    );
  });

  // A Dockerfile naming the entry point by hand builds fine and
  // starts nothing — the container's CMD is a wiring point like any
  // other.
  it('points the container image at the assembly the layout chose', async () => {
    for (const tag of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      const tree = await install([walkingSkeletonVertical, containerizationVertical], tags(tag));
      const entry = tsLayout([tag], SCOPE).restSrc;
      expect(read(tree, 'Dockerfile')).toContain(`CMD ["node", "${entry}/main.ts"]`);
      expect(tree.read(`${entry}/main.ts`)).not.toBeNull();
    }
  });
});

/**
 * The peer context — `--with-peer-context`.
 *
 * What is worth asserting from emitted text is the *edge* and the
 * *binding*: that the gateway imports greeting's seam and nothing
 * else of greeting's, and that the assembly actually loads the
 * wiring — an unimported TypeScript module runs in nothing.
 *
 * What is deliberately not attempted here is the wall. The peer rule
 * is a dependency-cruiser rule rather than anything tsc holds, so
 * only a real `depcruise` run can settle it, and only a real `tsc`
 * run can settle the exports map's depth rule.
 * `tests/e2e/modulith-ts-peer-context.test.ts` settles both.
 */
describe('the ts-http peer context', () => {
  const peerTags = tags(MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG);

  it('resolves the peer to one package, and to none under basic', () => {
    const peer = tsPeerPackage(tsLayout([MODULITH_LAYOUT_TAG], SCOPE));
    expect(peer?.root).toBe('modules/guestbook');
    expect(peer?.pkg).toBe('@acme/guestbook');
    expect(peer?.gatewaySrc).toBe('modules/guestbook/src/infra/greeting-gateway');

    expect(tsPeerPackage(tsLayout([BASIC_LAYOUT_TAG], SCOPE))).toBeNull();
  });

  it('emits nothing without the tag', async () => {
    const tree = await install([walkingSkeletonVertical], tags(MODULITH_LAYOUT_TAG));
    expect(tree.read('modules/guestbook/package.json')).toBeNull();
    expect(tree.read('application/rest/src/guestbook.ts')).toBeNull();
    expect(read(tree, 'application/rest/src/main.ts')).not.toContain('guestbook');
  });

  it('emits one package with a single aperture', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags);
    for (const p of [
      'modules/guestbook/package.json',
      'modules/guestbook/tsconfig.json',
      'modules/guestbook/src/index.ts',
      'modules/guestbook/src/domain/contract/sign.ts',
      'modules/guestbook/src/domain/core/internal/sign-handler.ts',
      'modules/guestbook/src/infra/greeting-gateway/index.ts',
      'modules/guestbook/tests/sign.test.ts',
      'modules/guestbook/tests/greeting-gateway.test.ts',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    // Guestbook is the consumer of this pair and publishes no
    // `./service`: a seam exists to be reached, and nothing reaches
    // guestbook yet.
    expect(json(tree, 'modules/guestbook/package.json')['exports']).toEqual({
      '.': './src/index.ts',
    });
  });

  it('gives the gateway an edge to the seam and to no other greeting entry point', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags);
    const gateway = read(tree, 'modules/guestbook/src/infra/greeting-gateway/index.ts');
    // Comments first. The gateway's doc comment explains which
    // specifier it must *not* write, so scanning the raw text matches
    // the prose documenting the rule and fails a file that obeys it.
    const code = gateway.replace(/\/\*[\s\S]*?\*\//g, '');
    const specifiers = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);

    expect(specifiers).toContain('@acme/greeting/service');
    expect(specifiers).not.toContain('@acme/greeting');
  });

  /**
   * The binding. Without the `main.ts` patch the peer would
   * typecheck, lint and be loaded by nothing — the JVM failure this
   * adapter family exists to prevent, and the one thing here that a
   * file-existence check would miss.
   */
  it('loads the wiring from the assembly, and declares the peer on its manifest', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags);

    const main = read(tree, 'application/rest/src/main.ts');
    expect(main).toContain("import { createGuestbookHandler } from './guestbook.ts';");
    expect(main).toContain(
      'createRegistryMediator([createGreetHandler(), createGuestbookHandler()])',
    );

    const manifest = json(tree, 'application/rest/package.json');
    expect(manifest['dependencies']).toMatchObject({ '@acme/guestbook': '*' });
  });

  /**
   * The assembly may legitimately name both contexts, but the wiring
   * is written against the seam so that copying it into a gateway
   * does not carry a domain edge along with it.
   */
  it('wires through the seam, and ships a test that drives it for real', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags);
    const wiring = read(tree, 'application/rest/src/guestbook.ts');

    expect(wiring).toContain("from '@acme/greeting/service'");
    expect(wiring).toContain('export function createGuestbookHandler()');
    // The test calls the same function main.ts does, rather than
    // rebuilding the graph beside it.
    expect(read(tree, 'application/rest/tests/guestbook-wiring.test.ts')).toContain(
      "createGuestbookHandler } from '../src/guestbook.ts'",
    );
  });

  it('declares greeting on the peer manifest under either package manager', async () => {
    for (const [pmTag, dep] of [
      ['pkg.npm', '*'],
      ['pkg.pnpm', 'workspace:*'],
    ] as const) {
      const projectTags = [
        ...tags(MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG).filter((t) => !t.startsWith('pkg.')),
        pmTag,
      ];
      const tree = await install([walkingSkeletonVertical], projectTags);
      expect(json(tree, 'modules/guestbook/package.json')['dependencies']).toMatchObject({
        '@acme/greeting': dep,
      });
      expect(json(tree, 'application/rest/package.json')['dependencies']).toMatchObject({
        '@acme/guestbook': dep,
      });
    }
  });
});

/**
 * A tag set carrying both `arch.cli` and `arch.server-http` resolves
 * both TypeScript bootstraps under the modulith too. Nothing about
 * the *workspace* had to change for that — `application/*` already
 * covers a second deployment unit — but the root `package.json` and
 * `README.md` were whole-file writes from each entrypoint's own
 * template tree, so the second adapter to resolve conflicted on both.
 * They are now a shared seed plus an idempotent per-arch `apply`,
 * which is also why the run scripts are named per entrypoint:
 * `start`/`dev` would have been one name for two assemblies.
 */
describe('walking-skeleton under layout.modulith (composed cli + server-http)', () => {
  const comboTags = (pmTag: string): string[] => [
    'lang.typescript',
    'runtime.node',
    pmTag,
    'arch.hexagonal',
    'arch.cli',
    'arch.server-http',
    MODULITH_LAYOUT_TAG,
  ];

  const comboAnswers = {
    'walking-skeleton/ts-cli-bootstrap': { npmScope: SCOPE, projectName: 'skel' },
    'walking-skeleton/ts-http-bootstrap': { npmScope: SCOPE, projectName: 'skel' },
  };

  const installCombo = async (pmTag: string): Promise<FsTree> => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-modulith-combo-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    await installVertical({
      vertical: walkingSkeletonVertical,
      manifest: {
        ...emptyManifestV2('2026-08-15T00:00:00Z', '0.5.0-alpha'),
        tags: comboTags(pmTag),
        answers: comboAnswers,
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
    return tree;
  };

  for (const pmTag of ['pkg.npm', 'pkg.pnpm']) {
    it(`ships both deployment units on one context under ${pmTag}`, async () => {
      const tree = await installCombo(pmTag);

      for (const file of [
        'platform/kernel/package.json',
        'modules/greeting/package.json',
        'modules/greeting/src/service.ts',
        'application/cli/src/main.ts',
        'application/rest/src/main.ts',
        '.dependency-cruiser.cjs',
      ]) {
        expect(tree.read(file), `missing ${file}`).not.toBeNull();
      }
    });

    it(`gives each entrypoint its own run script under ${pmTag}`, async () => {
      const tree = await installCombo(pmTag);
      const scripts = json(tree, 'package.json')['scripts'] as Record<string, string>;

      expect(scripts).toMatchObject({
        'start:cli': 'node application/cli/src/main.ts',
        'start:rest': 'node application/rest/src/main.ts',
        'dev:rest': 'node --watch application/rest/src/main.ts',
      });
      // The modulith's own script survives the merge: it is seeded,
      // not contributed by either entrypoint.
      expect(scripts['lint']).toBe('depcruise platform modules application');
      expect(json(tree, 'package.json')['devDependencies']).toMatchObject({
        'dependency-cruiser': expect.any(String) as unknown as string,
      });
    });
  }

  it('gives the whole workspace one scope when only one bootstrap was answered', async () => {
    // Sticky memory is per adapter, so nothing in the engine
    // reconciles two answers to the same question. A scope that
    // disagrees is not cosmetic here: the assembly would depend on
    // `@given/greeting` while the context publishes `@acme/greeting`,
    // and the install the scaffold runs cannot resolve it.
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-modulith-identity-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    await installVertical({
      vertical: walkingSkeletonVertical,
      manifest: {
        ...emptyManifestV2('2026-08-15T00:00:00Z', '0.5.0-alpha'),
        tags: comboTags('pkg.npm'),
        answers: {
          'walking-skeleton/ts-cli-bootstrap': { npmScope: 'given', projectName: 'answered-once' },
        },
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

    expect(json(tree, 'package.json')['name']).toBe('answered-once');
    for (const manifest of [
      'platform/kernel/package.json',
      'modules/greeting/package.json',
      'application/cli/package.json',
      'application/rest/package.json',
    ]) {
      expect(read(tree, manifest), `${manifest} fell back to the default scope`).not.toContain(
        '@acme/',
      );
    }
  });

  it('documents both entrypoints under one layout section', async () => {
    const readme = read(await installCombo('pkg.npm'), 'README.md');

    expect(readme).toContain('### cli');
    expect(readme).toContain('### rest');
    // The shared half is seeded once, not repeated by the second
    // adapter to resolve.
    expect(readme.split('## Adding a second bounded context')).toHaveLength(2);
  });
});
