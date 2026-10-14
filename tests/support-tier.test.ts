/**
 * The consumer for `src/domain/core/support-tier.json`, the support
 * tier's facts (roadmap T.2b): which e2e suite builds which dial cell.
 *
 * Every cell keel will call first-class rests on one of its rows, so
 * it is an index of the kind `ci-workflow.test.ts` guards, and it rots
 * the same way, silently. A suite renamed or moved to a shard that
 * cannot build it, or a row on a cell keel no longer offers, leaves the
 * tier vouching for a build nobody runs. So these, in `verify`:
 *
 *   - G1: every e2e file is a row's suite or has a role
 *     (`support/e2e-roles.ts`), never both, and every name has a file.
 *   - G2: the shard that runs a proving suite probes for the toolchain
 *     of every cell it claims. A suite in a shard without its toolchain
 *     skips, and a skip reads as a pass.
 *   - G3: every claimed cell is a cell of the paths golden, so one
 *     `keel.dials` reaches, spelled as that golden keys it, and so is
 *     every cell a role seeds; and every service a product row builds
 *     is a service of its product.
 *   - G4: no cell is claimed twice: one suite per cell (roadmap J).
 *   - D0: no e2e suite or e2e helper (`support/*-e2e.ts`) calls
 *     `installMediator(`, so every scaffold of the e2e job goes through
 *     `support/e2e-cell.ts`'s `e2eMediator`.
 *   - D1's premises: every row, dispatched as a command and read back
 *     as the job reads it, settles through `keel.dials` to the spelling
 *     it is claimed by, with no extras; and nothing turns off vitest's
 *     per-file isolation, which the job's per-file record rests on.
 *
 * G5 scaffolds every cell, so it is a file of its own:
 * `support-tier.premises.test.ts` holds P1's and P2's premises. What
 * a suite actually scaffolds can only be read where it runs, in the
 * e2e job: D1, `e2eMediator`'s check (roadmap T.2c). D0 is what keeps
 * every scaffold going through it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newProjectCommand, type NewProjectTarget } from '../src/domain/contract/commands.js';
import { dialsQuery } from '../src/domain/contract/queries.js';
import { shippedRegistry } from '../src/domain/core/registry.js';
import {
  SHIPPED_SUPPORT_FACTS,
  type ProductFact,
  type SingleFact,
} from '../src/domain/core/support-tier.js';
import { claimedFiles, e2eShards, probedTools } from './support/ci-shards.js';
import {
  cellLine,
  commandTarget,
  factLine,
  factTarget,
  namesExtras,
} from './support/e2e-claims.js';
import { expectOk, installMediator } from './support/factory.js';
import { E2E_ROLES } from './support/e2e-roles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2eDir = path.join(repoRoot, 'tests', 'e2e');
const pathsNew = path.join(repoRoot, 'tests', 'domain', 'core', 'paths-new.golden.json');

const { singles, products } = SHIPPED_SUPPORT_FACTS;
const rows: readonly (SingleFact | ProductFact)[] = [...singles, ...products];

/**
 * The binaries a shard must probe for to build a cell, by the cell's
 * packaging tag: each inner list is alternatives, one of which the
 * shard probes. Every shard gets node and pnpm (`ci.yml`), and npm
 * ships with node, so those need nothing. A packaging tag missing here
 * fails G2, so a new family says what its cells need.
 */
const PROBES_FOR: Readonly<Record<string, readonly (readonly string[])[]>> = {
  'pkg.gradle': [['gradle'], ['java', 'javac']],
  'pkg.maven': [['mvn'], ['java', 'javac']],
  'pkg.go-modules': [['go']],
  'pkg.cargo': [['cargo']],
  'pkg.npm': [],
  'pkg.pnpm': [],
};

/** Each service a row compiles, as the stack it is built from and its build system there. */
function builtBy(row: SingleFact | ProductFact): readonly (readonly [string, string | null])[] {
  if (!('builds' in row)) return [[row.stack, row.buildSystem]];
  const pairs = new Map(
    row.buildSystem.split(',').map((pair) => pair.split('=') as [string, string]),
  );
  const services = shippedRegistry.stack(row.stack)?.services ?? [];
  return row.builds.flatMap((at) => {
    const service = services.find((candidate) => candidate.path === at);
    return service === undefined ? [] : [[service.stack, pairs.get(at) ?? null] as const];
  });
}

/** The packaging tags a stack carries on a build system: its own, and the build system's. */
function packagingOf(stack: string, buildSystem: string | null): readonly string[] {
  const preset = shippedRegistry.stack(stack);
  const option = preset?.buildSystems?.find((candidate) => candidate.id === buildSystem);
  return [...(preset?.tags ?? []), ...(option === undefined ? [] : [option.tag])].filter((tag) =>
    tag.startsWith('pkg.'),
  );
}

describe('the support tier facts', () => {
  it('name every e2e file once, as the suite of a row or as a role (G1)', () => {
    const onDisk = fs
      .readdirSync(e2eDir)
      .filter((entry) => entry.endsWith('.test.ts'))
      .map((entry) => entry.slice(0, -'.test.ts'.length));
    const proving = new Set(rows.map((row) => row.suite));
    const roles = new Set(Object.keys(E2E_ROLES));

    expect({
      both: [...proving].filter((suite) => roles.has(suite)).sort(),
      unnamed: onDisk.filter((suite) => !proving.has(suite) && !roles.has(suite)).sort(),
      noFile: [...proving, ...roles].filter((suite) => !onDisk.includes(suite)).sort(),
    }).toEqual({ both: [], unnamed: [], noFile: [] });
  });

  it('run each proving suite in a shard that probes for its toolchain (G2)', () => {
    const shards = e2eShards();
    const gaps: string[] = [];
    for (const row of rows) {
      const file = `tests/e2e/${row.suite}.test.ts`;
      const shard = shards.find((candidate) => claimedFiles(candidate).includes(file));
      if (shard === undefined) {
        gaps.push(`${row.suite}: in no shard`);
        continue;
      }
      const probed = probedTools(shard);
      for (const [stack, buildSystem] of builtBy(row)) {
        const packaging = packagingOf(stack, buildSystem);
        if (packaging.length === 0) gaps.push(`${row.suite}: '${stack}' names no pkg.* tag`);
        for (const tag of packaging) {
          const needs = PROBES_FOR[tag];
          if (needs === undefined) {
            gaps.push(`${row.suite}: no toolchain known for ${tag}`);
            continue;
          }
          for (const need of needs) {
            if (!need.some((tool) => probed.includes(tool))) {
              gaps.push(`${row.suite} (${tag}) in shard ${shard.id}: probes for none of ${need}`);
            }
          }
        }
      }
    }

    expect(gaps).toEqual([]);
  });

  it('claim only cells of the paths golden, and only services of their product (G3)', () => {
    const golden = new Set(Object.keys(JSON.parse(fs.readFileSync(pathsNew, 'utf8')) as object));
    const notOffered = rows.filter((row) => !golden.has(factLine(row)));
    const seedsNotOffered = Object.entries(E2E_ROLES).flatMap(([suite, role]) =>
      (role.seeds ?? []).filter((cell) => !golden.has(cell)).map((cell) => `${suite}: ${cell}`),
    );
    const notServices = products.flatMap((row) => {
      const services = shippedRegistry.stack(row.stack)?.services ?? [];
      return row.builds
        .filter((at) => !services.some((service) => service.path === at))
        .map((at) => `${row.suite}: ${row.stack} has no service '${at}'`);
    });

    expect(notOffered.map((row) => `${row.suite}: ${factLine(row)}`)).toEqual([]);
    expect(seedsNotOffered).toEqual([]);
    expect(notServices).toEqual([]);
  });

  it('claim each cell once (G4)', () => {
    const claims = new Map<string, string[]>();
    for (const row of rows)
      claims.set(factLine(row), [...(claims.get(factLine(row)) ?? []), row.suite]);
    const twice = [...claims]
      .filter(([, suites]) => suites.length > 1)
      .map(([line, suites]) => `${line}: ${suites.join(', ')}`);

    expect(twice).toEqual([]);
  });
});

describe('the e2e suites', () => {
  it('scaffold only through e2eMediator (D0)', () => {
    const supportDir = path.join(repoRoot, 'tests', 'support');
    const files = [
      ...fs
        .readdirSync(e2eDir)
        .filter((entry) => entry.endsWith('.ts'))
        .map((entry) => path.join(e2eDir, entry)),
      ...fs
        .readdirSync(supportDir)
        .filter((entry) => entry.endsWith('-e2e.ts'))
        .map((entry) => path.join(supportDir, entry)),
    ];
    const direct = files
      .filter((file) => fs.readFileSync(file, 'utf8').includes('installMediator('))
      .map((file) => path.relative(repoRoot, file));

    expect(direct).toEqual([]);
  });

  it('settle each row to the cell it is spelled as, as the e2e job reads it (D1)', async () => {
    // e2eMediator compares a dispatch, settled through keel.dials, with
    // a row's spelling: the two must agree on every row, outside the job.
    const mediator = installMediator();
    const disagree: string[] = [];
    for (const row of [...SHIPPED_SUPPORT_FACTS.singles, ...SHIPPED_SUPPORT_FACTS.products]) {
      // As a suite dispatches it: a command, read back as the job reads it.
      const { kind: _kind, ...dials } = factTarget(row);
      const command = newProjectCommand({
        cwd: '/x',
        answers: {},
        interactive: false,
        dryRun: true,
        ...dials,
      });
      const asked = commandTarget(command);
      const { target } = expectOk(await mediator.dispatch(dialsQuery({ target: asked })));
      const settled = target as NewProjectTarget;
      if (cellLine(settled) !== factLine(row) || namesExtras(settled)) {
        disagree.push(`${row.suite}: ${factLine(row)} settles as ${cellLine(settled)}`);
      }
    }
    expect(disagree).toEqual([]);
  });

  it('run each in a file of its own, as e2eMediator’s record assumes', () => {
    // Its hooks and record are per module evaluation, which is per file
    // only while vitest isolates files.
    const unisolated = /isolate[:=]\s*false|--no-isolate|singleThread|singleFork/;
    for (const file of ['vitest.config.ts', '.github/workflows/ci.yml', 'package.json']) {
      expect(fs.readFileSync(path.join(repoRoot, file), 'utf8'), file).not.toMatch(unisolated);
    }
  });
});
