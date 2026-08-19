/**
 * The consumer for the single-source rule (roadmap N.5).
 *
 * A project states its toolchain versions in three places that must
 * agree: the manifest's `toolchain` block (what the project declares
 * it needs), the Dev Container features (what an editor provisions),
 * and the CI setup steps (what the pipeline provisions). Each used to
 * carry its own literal, and the only thing comparing them was
 * `tests/version-pins.test.ts` happening to claim all three
 * occurrences with one entry. That is a weak guarantee: it holds for
 * the shapes the sweep's regexes recognise, and a surface that
 * changes shape — or grows a second one — drifts silently. A dev
 * container provisioning JDK 24 for a project whose block declares 25
 * is a build that works on the runner and fails on the laptop.
 *
 * So the three converge on one source: `TOOLCHAIN_PIN_SOURCE` in
 * `src/domain/core/adapters/version-pins.ts` names the registry entry
 * each tool's version comes from, and the block, the features and the
 * CI steps all resolve through it. This file is the wall around that
 * rule, and it runs in `verify` — the fast gate — because a
 * disagreement is a bug in what keel emits, not a weekly drift
 * report.
 *
 * It asserts over **emitted projects**, never over the constants:
 * scaffold each family, read the versions back out of
 * `.devcontainer/devcontainer.json`, `.github/workflows/ci.yml` and
 * `.gitlab-ci.yml`, and require every one of them to match the
 * recorded need. Editing one surface alone fails here — and the last
 * block proves it by moving the registry entry under a scaffold and
 * watching all three follow.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../src/domain/core/install.js';
import { toolchainVertical } from '../src/domain/core/verticals/toolchain.js';
import { devContainerVertical } from '../src/domain/core/verticals/dev-container.js';
import { ciVertical } from '../src/domain/core/verticals/ci.js';
import { TOOLCHAIN_PIN_SOURCE, type PinnedTool } from '../src/domain/core/adapters/version-pins.js';
import { emptyManifestV2 } from '../src/domain/contract/manifest.js';
import type { AnswerMap, ManifestV2, Vertical } from '../src/domain/contract/composition.js';
import type { ToolchainNeed } from '../src/domain/contract/toolchain.js';
import type { TemplateSource } from '../src/domain/contract/ports/template-source.js';
import { FsTree } from '../src/infrastructure/tree/fs-tree.js';
import { loadRegistry, withRegistry, type Pin } from './support/version-pins.js';

const registry = loadRegistry();

const entry = (id: string): Pin => {
  const pin = registry.find((p) => p.id === id);
  if (!pin) throw new Error(`test setup: no '${id}' entry in the pin registry`);
  return pin;
};

/**
 * The spelling a surface may use instead of the version, for a tool
 * whose pin floats by construction. Only pins with no upstream check
 * (`"check": {"type": "none"}`) qualify — a major-only tag or a
 * `latest` tag that tracks the current stable release rather than
 * naming one. Rust is the only such tool today.
 */
const FLOATING_SPELLING = 'latest';

const floats = (source: string): boolean => entry(source).check.type === 'none';

/** Where a version was found, and which tool it claims to provision. */
interface Statement {
  readonly surface: 'devcontainer' | 'github' | 'gitlab';
  readonly tool: PinnedTool;
  readonly version: string;
}

const label = (statement: Statement): string => `${statement.surface}:${statement.tool}`;

/** The Dev Container features that provision a tool keel pins. */
const FEATURE_TOOL: Readonly<Record<string, PinnedTool>> = {
  'ghcr.io/devcontainers/features/java:1': 'jdk',
  'ghcr.io/devcontainers/features/node:1': 'node',
  'ghcr.io/devcontainers/features/go:1': 'go',
  'ghcr.io/devcontainers/features/rust:1': 'rust',
};

/**
 * How a pipeline names a toolchain version — the setup-action inputs
 * on GitHub, the language image tags on GitLab. Deliberately broader
 * than any one template: a pipeline growing a second way to state a
 * version should be found, not accommodated.
 */
const PIPELINE_DETECTORS: readonly { tool: PinnedTool; regex: () => RegExp }[] = [
  { tool: 'jdk', regex: () => /java-version:[ \t]*'?([\w.]+)'?/g },
  { tool: 'node', regex: () => /node-version:[ \t]*'?([\w.]+)'?/g },
  { tool: 'go', regex: () => /go-version:[ \t]*'?([\w.]+)'?/g },
  { tool: 'jdk', regex: () => /image:[ \t]*eclipse-temurin:([\w.]+)-j(?:dk|re)/g },
  { tool: 'node', regex: () => /image:[ \t]*node:([\w.]+)/g },
  { tool: 'go', regex: () => /image:[ \t]*golang:([\w.]+)/g },
  { tool: 'rust', regex: () => /image:[ \t]*rust:([\w.]+)/g },
];

/** Parses the rendered devcontainer.json, tolerating its comments. */
const parseDevcontainer = (raw: string): Record<string, unknown> =>
  JSON.parse(
    raw
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n'),
  ) as Record<string, unknown>;

const devcontainerStatements = (raw: string): Statement[] => {
  if (raw === '') return [];
  const features = (parseDevcontainer(raw).features ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  return Object.entries(features).flatMap(([id, options]) => {
    const tool = FEATURE_TOOL[id];
    const version = options.version;
    if (!tool || typeof version !== 'string') return [];
    return [{ surface: 'devcontainer' as const, tool, version }];
  });
};

const pipelineStatements = (surface: 'github' | 'gitlab', raw: string): Statement[] =>
  PIPELINE_DETECTORS.flatMap(({ tool, regex }) =>
    [...raw.matchAll(regex())].map((match) => ({ surface, tool, version: match[1] })),
  );

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

/** One scaffolded project: its needs and every version its files state. */
interface Scaffold {
  readonly needs: readonly ToolchainNeed[];
  readonly statements: readonly Statement[];
}

interface Scenario {
  readonly id: string;
  readonly tags: readonly string[];
  readonly answers: AnswerMap;
  /** Every `surface:tool` the emitted files must state, sorted. */
  readonly states: readonly string[];
}

/**
 * Installs `toolchain`, `dev-container` and `ci` onto one project and
 * reads the versions back out of what was written. `ci` runs twice —
 * once per provider — because both flavors state versions and both
 * must agree; the GitLab pass gets its own tree so the two pipelines
 * never overwrite each other's answer.
 */
async function scaffold(scenario: Scenario, templates: TemplateSource): Promise<Scaffold> {
  const emit = async (
    verticals: readonly Vertical[],
    answers: AnswerMap,
  ): Promise<{ tree: FsTree; manifest: ManifestV2 }> => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-toolchain-pins-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    tree.write('README.md', '# demo\n');
    let manifest: ManifestV2 = {
      ...emptyManifestV2('2026-08-19T00:00:00Z', '0.0.0-test'),
      tags: [...scenario.tags],
      answers: { ...scenario.answers, ...answers },
    };
    for (const vertical of verticals) {
      const result = await installVertical({
        vertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates,
        processes: spawnProcessRunner,
        now: () => '2026-08-19T12:00:00Z',
      });
      manifest = result.manifest;
    }
    return { tree, manifest };
  };

  const github = await emit([toolchainVertical, devContainerVertical, ciVertical], {});
  const gitlab = await emit(
    [ciVertical],
    Object.fromEntries(
      ['jvm-pipeline', 'go-pipeline', 'rust-pipeline', 'ts-pipeline'].map((adapter) => [
        `ci/${adapter}`,
        { provider: 'gitlab-ci' },
      ]),
    ),
  );

  return {
    needs: github.manifest.toolchain?.needs ?? [],
    statements: [
      ...devcontainerStatements(
        github.tree.read('.devcontainer/devcontainer.json')?.toString() ?? '',
      ),
      ...pipelineStatements(
        'github',
        github.tree.read('.github/workflows/ci.yml')?.toString() ?? '',
      ),
      ...pipelineStatements('gitlab', gitlab.tree.read('.gitlab-ci.yml')?.toString() ?? ''),
    ],
  };
}

/**
 * The families, and exactly which surfaces state a version for which
 * tool. A surface that deliberately defers is absent by design and
 * stays absent: GitHub's Go setup reads `go-version-file: go.mod`,
 * the Rust workflow runs `rustup update stable`, the Rust dev
 * container feature takes the toolchain it ships with, and pnpm is
 * corepack-provisioned from the workspace's own `packageManager`
 * field. Listing what *is* stated makes "a surface quietly stopped
 * stating its version" as red as "it states the wrong one".
 */
const SCENARIOS: readonly Scenario[] = [
  {
    id: 'jvm-gradle',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.cli', 'pkg.gradle'],
    answers: {
      'walking-skeleton/quarkus-cli-bootstrap': { projectName: 'greeter', basePackage: 'x.y' },
    },
    states: ['devcontainer:jdk', 'github:jdk', 'gitlab:jdk'],
  },
  {
    id: 'jvm-maven',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.server-http', 'pkg.maven'],
    answers: {
      'walking-skeleton/spring-rest-kotlin-bootstrap': { projectName: 'api', basePackage: 'x.y' },
    },
    states: ['devcontainer:jdk', 'github:jdk', 'gitlab:jdk'],
  },
  {
    id: 'go',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
    answers: { 'walking-skeleton/go-bootstrap': { projectName: 'shipper', modulePath: 'x/y' } },
    states: ['devcontainer:go', 'gitlab:go'],
  },
  {
    id: 'rust',
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli'],
    answers: { 'walking-skeleton/rust-cli-bootstrap': { projectName: 'ferry' } },
    states: ['gitlab:rust'],
  },
  {
    id: 'ts-npm',
    tags: ['lang.typescript', 'runtime.browser', 'framework.web-components', 'pkg.npm'],
    answers: { 'walking-skeleton/wc-spa-bootstrap': { projectName: 'shopfront' } },
    states: ['devcontainer:node', 'github:node', 'gitlab:node'],
  },
  {
    id: 'ts-pnpm',
    tags: ['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.pnpm'],
    answers: { 'walking-skeleton/ts-http-bootstrap': { projectName: 'api' } },
    states: ['devcontainer:node', 'github:node', 'gitlab:node'],
  },
];

/** The disagreements in one scaffold, as readable lines. */
const disagreements = ({ needs, statements }: Scaffold): string[] =>
  statements.flatMap((statement) => {
    const need = needs.find((n) => n.tool === statement.tool);
    if (!need) return [`${label(statement)} states ${statement.version} but no need is recorded`];
    if (statement.version === need.version) return [];
    if (need.source && floats(need.source) && statement.version === FLOATING_SPELLING) return [];
    return [`${label(statement)} states ${statement.version}, the block needs ${need.version}`];
  });

describe('the single-source rule for toolchain versions', () => {
  it.each(SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    'agrees across the block, the dev container and both pipelines (%s)',
    async (_id, scenario) => {
      const result = await scaffold(scenario, ejsTemplateSource);
      expect(disagreements(result)).toEqual([]);
    },
  );

  it.each(SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    'states a version on every surface that is meant to carry one (%s)',
    async (_id, scenario) => {
      // Without this, a surface dropping its version would make the
      // agreement assertion pass over strictly less coverage.
      const { statements } = await scaffold(scenario, ejsTemplateSource);
      expect([...new Set(statements.map(label))].sort()).toEqual([...scenario.states].sort());
    },
  );

  it('records needs whose versions come from the registry, not from keel', async () => {
    const { needs } = await scaffold(SCENARIOS[0], ejsTemplateSource);
    expect(needs.length).toBeGreaterThan(0);
    for (const need of needs) {
      expect(need.source, `need for ${need.tool}`).toBeDefined();
      expect(need.version, `need for ${need.tool}`).toBe(entry(need.source ?? '').value);
    }
  });

  it('reaches every tool the pin map names', () => {
    // The map is the single source; a tool nobody scaffolds here is a
    // pin the guard silently stops covering.
    const covered = new Set(
      SCENARIOS.flatMap((scenario) => scenario.states).map((state) => state.split(':')[1]),
    );
    // `gradle`, `maven` and `pnpm` are provisioned by the project's
    // own wrapper / corepack, so no surface states their version —
    // the block is their only statement, guarded above.
    for (const tool of ['jdk', 'go', 'node', 'rust'] satisfies PinnedTool[]) {
      expect(covered, tool).toContain(tool);
    }
    expect(Object.keys(TOOLCHAIN_PIN_SOURCE).sort()).toEqual(
      ['gradle', 'go', 'jdk', 'maven', 'node', 'pnpm', 'rust'].sort(),
    );
  });
});

describe('one entry drives all three surfaces', () => {
  it('moves the block, the dev container and both pipelines together (JDK)', async () => {
    // The demonstration the rule asks for: bump the registry entry
    // under a scaffold and every surface follows. A surface holding a
    // literal of its own would still say 25 and fail here.
    const bumped = await scaffold(
      SCENARIOS[0],
      withRegistry((pins) => {
        for (const pin of pins) if (pin.id === 'jvm-jdk') pin.value = '26';
      }),
    );

    expect(bumped.needs.find((need) => need.tool === 'jdk')?.version).toBe('26');
    expect(
      bumped.statements
        .filter((s) => s.tool === 'jdk')
        .map(label)
        .sort(),
    ).toEqual(['devcontainer:jdk', 'github:jdk', 'gitlab:jdk']);
    expect(bumped.statements.filter((s) => s.tool === 'jdk').map((s) => s.version)).toEqual([
      '26',
      '26',
      '26',
    ]);
    expect(disagreements(bumped)).toEqual([]);
  });

  it('moves them together for Node and Go too', async () => {
    const node = await scaffold(
      SCENARIOS[5],
      withRegistry((pins) => {
        for (const pin of pins) if (pin.id === 'node-active-lts') pin.value = '26';
      }),
    );
    expect(node.statements.filter((s) => s.tool === 'node').map((s) => s.version)).toEqual([
      '26',
      '26',
      '26',
    ]);

    const go = await scaffold(
      SCENARIOS[2],
      withRegistry((pins) => {
        for (const pin of pins) if (pin.id === 'go-toolchain') pin.value = '1.99';
      }),
    );
    expect(go.statements.filter((s) => s.tool === 'go').map((s) => s.version)).toEqual([
      '1.99',
      '1.99',
    ]);
    expect(disagreements(go)).toEqual([]);
  });
});
