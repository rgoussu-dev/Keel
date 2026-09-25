/**
 * Tests for the `dev-container` vertical. The install blocks prove
 * both shapes of the definition — standalone image-based without the
 * `dev-env` vertical, Compose-attached (joining `dev/compose.yaml`'s
 * project) when the manifest records it — and that the per-family
 * adapters request their toolchain features, with every version
 * asserted **against the pin registry itself**, so a feature can
 * never become a second place a toolchain version is stated
 * (`tests/toolchain-pins.test.ts` guards the same rule across all
 * three surfaces at once). The order-independence block proves the
 * upgrade a later dev environment makes, ranked by the tags: on an
 * HTTP project, for every family and on the tags a CLI project grows
 * to, it writes the bytes the template renders attached, in the
 * file's own line endings and around what the user wrote; elsewhere,
 * the shape an extra dev environment has always written. The resolution block proves every non-composite
 * stack's tag set covers the vertical, so no stack can silently lose
 * its dev container.
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

/** Installs the dev environment over `installed`, as `keel add dev-env` does. */
async function installDevEnv(installed: { tree: FsTree; manifest: ManifestV2 }): Promise<FsTree> {
  await installVertical({
    vertical: devEnvVertical,
    manifest: installed.manifest,
    tree: installed.tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: '/unused',
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-18T13:00:00Z',
  });
  return installed.tree;
}

/** One family's HTTP project, as its manifest reads before the dev container installs. */
interface HttpProject {
  readonly family: string;
  readonly tags: readonly string[];
  readonly answers: ManifestV2['answers'];
}

/**
 * An HTTP project of every family, and of each build system the
 * family's features read; and one carrying the CLI as well, the tags a
 * CLI project grows to.
 */
const HTTP_PROJECTS: readonly HttpProject[] = [
  {
    family: 'JVM, Gradle',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.server-http', 'pkg.gradle'],
    answers: {
      'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'greeter', basePackage: 'x.y' },
    },
  },
  {
    family: 'JVM, Maven',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.server-http', 'pkg.maven'],
    answers: {
      'walking-skeleton/spring-rest-kotlin-bootstrap': { projectName: 'api', basePackage: 'x.y' },
    },
  },
  {
    family: 'Go',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
    answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
  },
  {
    family: 'Rust',
    tags: ['lang.rust', 'pkg.cargo', 'arch.server-http'],
    answers: { 'walking-skeleton/rust-bootstrap': { projectName: 'tool' } },
  },
  {
    family: 'TypeScript, pnpm',
    tags: ['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.pnpm'],
    answers: { 'walking-skeleton/ts-http-bootstrap': { projectName: 'api' } },
  },
  {
    family: 'TypeScript, npm',
    tags: ['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.npm'],
    answers: { 'walking-skeleton/ts-http-bootstrap': { projectName: 'api' } },
  },
  {
    family: 'Go, with a CLI as well',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli', 'arch.server-http'],
    answers: { 'walking-skeleton/go-cli-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
  },
];

/** `project`'s manifest before the dev container, `dev-env` recorded or not. */
function manifestOf(project: HttpProject, devEnv: boolean): ManifestV2 {
  return {
    ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
    tags: [...project.tags],
    answers: project.answers,
    verticals: devEnv ? [{ id: 'dev-env', installedAt: '2026-08-18T00:00:00Z' }] : [],
  };
}

function devcontainerOf(tree: FsTree): string {
  return tree.read('.devcontainer/devcontainer.json')?.toString() ?? '';
}

/** Parses the rendered devcontainer.json, tolerating its comments. */
function parseDevcontainer(tree: FsTree): Record<string, unknown> {
  return parseJsonc(devcontainerOf(tree)) as Record<string, unknown>;
}

/** Parses JSONC: every comment and trailing comma dropped, none read inside a string. */
function parseJsonc(text: string): unknown {
  const drop = (from: string, noise: RegExp): string =>
    from.replace(noise, (_, string?: string) => string ?? '');
  const comment = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  const trailingComma = /("(?:[^"\\]|\\.)*")|,(?=\s*[}\]])/g;
  return JSON.parse(drop(drop(text, comment), trailingComma));
}

/** The docker feature's key, as `features` holds it once attached. */
const DOCKER_FEATURE = 'ghcr.io/devcontainers/features/docker-outside-of-docker:1';

/** The features `upgraded` holds, read as JSONC. */
function featuresOf(upgraded: string): readonly string[] {
  return Object.keys((parseJsonc(upgraded) as { features: object }).features);
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

    await installDevEnv(first);

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

  it.each(HTTP_PROJECTS.map((project) => [project.family, project] as const))(
    'on an HTTP project, writes the bytes the template renders attached (%s)',
    async (_, project) => {
      const upgraded = devcontainerOf(
        await installDevEnv(await install(manifestOf(project, false))),
      );
      const rendered = devcontainerOf((await install(manifestOf(project, true))).tree);
      expect(upgraded).toBe(rendered);
    },
  );

  it('on an HTTP project, writes them in a CRLF definition in its own line endings', async () => {
    const [project] = HTTP_PROJECTS;
    const standalone = await install(manifestOf(project!, false));
    const crlf = (text: string): string => text.replace(/\n/g, '\r\n');
    standalone.tree.write('.devcontainer/devcontainer.json', crlf(devcontainerOf(standalone.tree)));
    const upgraded = devcontainerOf(await installDevEnv(standalone));
    expect(upgraded).toBe(crlf(devcontainerOf((await install(manifestOf(project!, true))).tree)));
  });

  it('on an HTTP project, keeps what the user wrote into the definition', () => {
    const edited = [
      '{',
      '  // Ours.',
      '  "name": "shipper-dev",',
      `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
      '  "features": {',
      '    "ghcr.io/devcontainers/features/go:1": {"version":"1.26"},',
      '    "ghcr.io/devcontainers/features/github-cli:1": {',
      '      "version": "latest"',
      '    }',
      '    // More to come.',
      '  },',
      '  "customizations": {"vscode": {"extensions": ["golang.go"]}},',
      '  "remoteUser": "vscode"',
      '}',
      '',
    ].join('\n');
    const upgraded = attachDevContainerToDevEnv(edited, 'shipper', HTTP_PROJECTS[2]!.tags);
    const lines = upgraded.split('\n');
    expect(lines.slice(0, 3)).toEqual(['{', '  // Ours.', '  //']);
    expect(lines[lines.indexOf('  "name": "shipper-dev",') - 1]).toMatch(/not restarted\.$/);
    expect(lines[lines.indexOf('  "name": "shipper-dev",') + 1]).toContain('"dockerComposeFile"');
    expect(upgraded).toContain(
      [
        '    "ghcr.io/devcontainers/features/github-cli:1": {',
        '      "version": "latest"',
        '    },',
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}',
        '    // More to come.',
        '  },',
        '  "customizations": {"vscode": {"extensions": ["golang.go"]}},',
      ].join('\n'),
    );
    expect(upgraded).not.toContain('"image"');
    expect(attachDevContainerToDevEnv(upgraded, 'shipper', HTTP_PROJECTS[2]!.tags)).toBe(upgraded);
  });

  it('on an HTTP project, gives a features object with no entry the docker feature below its brace, every line kept', () => {
    const empty = [
      '{',
      '  "name": "shipper",',
      `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
      '  "features": {',
      '',
      '    // None yet.',
      '  },',
      '  "remoteUser": "vscode"',
      '}',
      '',
    ].join('\n');
    const upgraded = attachDevContainerToDevEnv(empty, 'shipper', HTTP_PROJECTS[2]!.tags);
    expect(upgraded).toContain(
      [
        '  "features": {',
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}',
        '',
        '    // None yet.',
        '  },',
      ].join('\n'),
    );
    expect(featuresOf(upgraded)).toEqual([DOCKER_FEATURE]);
  });

  it('on an HTTP project, puts the comma the last feature takes ahead of a comment trailing it', () => {
    const commented = [
      '{',
      '  "name": "shipper",',
      `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
      '  "features": {',
      '    "ghcr.io/devcontainers/features/go:1": {"version": "1.26"} // pinned, for now',
      '    /* More',
      '       to come. */',
      '  },',
      '  "remoteUser": "vscode"',
      '}',
      '',
    ].join('\n');
    const upgraded = attachDevContainerToDevEnv(commented, 'shipper', HTTP_PROJECTS[2]!.tags);
    expect(upgraded).toContain(
      [
        '    "ghcr.io/devcontainers/features/go:1": {"version": "1.26"}, // pinned, for now',
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}',
        '    /* More',
        '       to come. */',
        '  },',
      ].join('\n'),
    );
    expect(parseJsonc(upgraded)).toMatchObject({
      features: { 'ghcr.io/devcontainers/features/docker-outside-of-docker:1': {} },
    });
  });

  it('on an HTTP project, follows a last feature that already carries its trailing comma', () => {
    const trailing = [
      '{',
      '  "name": "shipper",',
      `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
      '  "features": {',
      '    "ghcr.io/devcontainers/features/go:1": {},',
      '  },',
      '  "remoteUser": "vscode"',
      '}',
      '',
    ].join('\n');
    const upgraded = attachDevContainerToDevEnv(trailing, 'shipper', HTTP_PROJECTS[2]!.tags);
    expect(upgraded).toContain(
      [
        '    "ghcr.io/devcontainers/features/go:1": {},',
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {},',
        '  },',
      ].join('\n'),
    );
    expect(upgraded).not.toContain(',,');
  });

  it.each([
    ['without', ''],
    ['with', ','],
  ])(
    'on an HTTP project, puts the docker feature past a block comment the last feature opens, %s its trailing comma',
    (_, comma) => {
      const commented = [
        '{',
        '  "name": "shipper",',
        `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
        '  "features": {',
        `    "ghcr.io/devcontainers/features/go:1": {}${comma} /* pinned`,
        '       until 1.27 lands */',
        '  },',
        '  "remoteUser": "vscode"',
        '}',
        '',
      ].join('\n');
      const upgraded = attachDevContainerToDevEnv(commented, 'shipper', HTTP_PROJECTS[2]!.tags);
      expect(upgraded).toContain(
        [
          '    "ghcr.io/devcontainers/features/go:1": {}, /* pinned',
          '       until 1.27 lands */',
          `    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}${comma}`,
          '  },',
        ].join('\n'),
      );
      expect(featuresOf(upgraded)).toEqual(['ghcr.io/devcontainers/features/go:1', DOCKER_FEATURE]);
    },
  );

  it.each([
    [
      "on its last entry's line, first",
      ['    "ghcr.io/devcontainers/features/go:1": {} },'],
      [
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {},',
        '    "ghcr.io/devcontainers/features/go:1": {} },',
      ],
    ],
    [
      'where a comment its last entry opens ends, first',
      ['    "ghcr.io/devcontainers/features/go:1": {} /* pinned', '  */ },'],
      [
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {},',
        '    "ghcr.io/devcontainers/features/go:1": {} /* pinned',
        '  */ },',
      ],
    ],
    [
      "on a line of its own at its entries' indent, last",
      ['    "ghcr.io/devcontainers/features/go:1": {}', '    },'],
      [
        '    "ghcr.io/devcontainers/features/go:1": {},',
        '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}',
        '    },',
      ],
    ],
  ])(
    'on an HTTP project, lists the docker feature in a features object closing %s, and in no object after it',
    (_, entries, listed) => {
      const customizations = [
        '  "customizations": {',
        '    "vscode": {',
        '      "extensions": ["golang.go"]',
        '    }',
        '  },',
      ];
      const closed = [
        '{',
        '  "name": "shipper",',
        `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
        '  "features": {',
        ...entries,
        ...customizations,
        '  "remoteUser": "vscode"',
        '}',
        '',
      ].join('\n');
      const upgraded = attachDevContainerToDevEnv(closed, 'shipper', HTTP_PROJECTS[2]!.tags);
      expect(upgraded).toContain(['  "features": {', ...listed, ...customizations].join('\n'));
      expect(featuresOf(upgraded)).toContain(DOCKER_FEATURE);
    },
  );

  it.each([
    ['an HTTP', HTTP_PROJECTS[2]!.tags],
    ['a CLI', ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli']],
  ])('on %s project, keeps a docker feature the user listed once, where it was', (_, tags) => {
    const features = [
      '  "features": {',
      '    "ghcr.io/devcontainers/features/go:1": {},',
      '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {"moby": false},',
      '    "ghcr.io/devcontainers/features/github-cli:1": {}',
      '  },',
    ];
    const listed = [
      '{',
      '  "name": "shipper",',
      `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
      ...features,
      '  "remoteUser": "vscode"',
      '}',
      '',
    ].join('\n');
    const upgraded = attachDevContainerToDevEnv(listed, 'shipper', tags);
    expect(upgraded).toContain(features.join('\n'));
    expect(upgraded.split(DOCKER_FEATURE)).toHaveLength(2);
  });

  it('on an HTTP project, puts the note above the Compose fields once "name" is no longer the line above the image', () => {
    const moved = [
      '{',
      `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
      '  "name": "shipper",',
      '  "features": {',
      '    "ghcr.io/devcontainers/features/go:1": {}',
      '  },',
      '  "remoteUser": "vscode"',
      '}',
      '',
    ].join('\n');
    const lines = attachDevContainerToDevEnv(moved, 'shipper', HTTP_PROJECTS[2]!.tags).split('\n');
    const fields = lines.findIndex((line) => line.startsWith('  "dockerComposeFile"'));
    expect(lines[0]).toBe('{');
    expect(lines[fields - 1]).toMatch(/not restarted\.$/);
    expect(lines[lines.indexOf('  "name": "shipper",') - 1]).toBe('  "overrideCommand": true,');
  });

  it.each([
    [
      'a features object the user commented out above it',
      ['  /* Was:', '  "features": {', '  },', '  */', '  "features": {', '  },'],
      [DOCKER_FEATURE],
    ],
    [
      'a brace in a comment above its entry',
      [
        '  "features": {',
        '    /* Next:',
        '  }',
        '    */',
        '    "ghcr.io/devcontainers/features/go:1": {}',
        '  },',
      ],
      ['ghcr.io/devcontainers/features/go:1', DOCKER_FEATURE],
    ],
  ])(
    'on an HTTP project, reads the features object as code alone: %s is none of it',
    (_, features, listed) => {
      const edited = [
        '{',
        '  "name": "shipper",',
        `  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",`,
        ...features,
        '  "remoteUser": "vscode"',
        '}',
        '',
      ].join('\n');
      expect(
        featuresOf(attachDevContainerToDevEnv(edited, 'shipper', HTTP_PROJECTS[2]!.tags)),
      ).toEqual(listed);
    },
  );

  it('elsewhere, keeps the shape an extra dev environment has always written', async () => {
    const standalone = await install({
      ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
      tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli'],
      answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
    });
    const lines = devcontainerOf(await installDevEnv(standalone)).split('\n');
    const name = lines.indexOf('  "name": "shipper",');
    expect(lines.slice(name + 1, name + 3)).toEqual([
      '  //',
      '  // Compose-based on purpose: the workspace is one extra service',
    ]);
    const features = lines.indexOf('  "features": {');
    expect(lines.slice(features + 1, features + 3)).toEqual([
      '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {},',
      `    "ghcr.io/devcontainers/features/go:1": {"version":"${pinValue('go-toolchain')}"}`,
    ]);
  });

  it('leaves an already-attached definition untouched', () => {
    const attached = '{\n  "dockerComposeFile": ["../dev/compose.yaml", "compose.yaml"]\n}\n';
    expect(attachDevContainerToDevEnv(attached, 'shipper', [])).toBe(attached);
  });

  it('refuses to rewrite a definition with a customized image', () => {
    const custom =
      '{\n  "name": "shipper",\n  "image": "my-registry/my-base:1",\n  "features": {\n  }\n}\n';
    expect(() => attachDevContainerToDevEnv(custom, 'shipper', [])).toThrow(
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
