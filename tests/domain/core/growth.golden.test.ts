/**
 * What growth reads on the shipped registry, pinned (`docs/roadmap.md`
 * → R.2a): `growthOf` for every single-service preset, on every dial
 * setting, for each back entrypoint the preset lacks. The command that
 * acts on it (R.2b) is reviewed against this record, as Q1.3 was
 * against the planner's readiness golden: a cell that moves is a
 * reading that moved.
 *
 * **Scenario.** Cells are derived, never listed: the presets from
 * `keel.catalog`, every dial setting each offers from `keel.dials`
 * (`harnessSettings` over `walkDials`: build system × module layout,
 * and the peer context wherever the modulith offers it), each again
 * with the agent harness left out wherever the reply lets it be, and
 * on each, every back-side entrypoint of `ENTRYPOINTS` the scaffold's
 * tags lack — the other one on a single-entrypoint backend, both on a
 * front end, none on a preset carrying both. Every modulith setting is
 * read again after the {@link moduleHistory} — `keel add module orders
 * --consumes <skeleton>`, then `shipping --consumes orders` — whose
 * contexts growing has to wire into the new assembly too (roadmap R.3).
 *
 * **Factory.** {@link installMediator} over the real templates, with a
 * fake process runner and no deferred action, as the composition grid
 * wires it, and the shipped in-memory fakes of the `Tree` and
 * `ManifestStore` ports in place of the filesystem: each setting is
 * scaffolded by a real run, not a dry one, so `growthOf` reads the
 * manifest keel writes rather than one rebuilt here, and nothing
 * reaches the disk. What a run commits stays in memory under its
 * directory, where the next run's `Tree` finds it: a context's add
 * patches the files the scaffold wrote.
 *
 * **Port.** `Mediator.dispatch` for the scaffolds, and `growthOf` over
 * the manifest read back through the `ManifestStore` port.
 *
 * `growth.golden.json` keys each cell by the command lines that make
 * it and records the twin, the adapters that newly match, the
 * verticals installed, the contexts `keel add module` added wired in
 * and the verticals re-rendered — or the refusal:
 * its code, and why, which its sentence is to be worded from (R.2b).
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change, reviewed
 * in the diff like any other golden — formatted as `prettier --check`
 * holds it, since its cells hold lists, so the diff is the change and
 * nothing else.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import * as prettier from 'prettier';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  installCommandFor,
  type InstallRun,
  type NewProjectTarget,
} from '../../../src/domain/contract/commands.js';
import { projectScopeRoot, type ManifestV2 } from '../../../src/domain/contract/manifest.js';
import type { Tree, TreeChange } from '../../../src/domain/contract/ports/tree.js';
import {
  catalogQuery,
  dialsQuery,
  projectStatusQuery,
  type DialOptions,
} from '../../../src/domain/contract/queries.js';
import {
  growthOf,
  type Growth,
  type GrowthContext,
  type GrowthModule,
  type GrowthRefusal,
} from '../../../src/domain/core/growth.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import { ENTRYPOINTS } from '../../../src/domain/core/stack-wizard.js';
import { FakeManifestStore } from '../../../src/infrastructure/manifest/fake.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { FakeTree } from '../../../src/infrastructure/tree/fake.js';
import { eachStack } from '../../support/composition-grid.js';
import {
  addModuleCommandLine,
  harnessSettings,
  moduleHistory,
  newCommandLine,
} from '../../support/dial-walk.js';
import { expectOk, installMediator } from '../../support/factory.js';

const GOLDEN = new URL('./growth.golden.json', import.meta.url);
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

/** Where each setting is scaffolded: a directory of the in-memory Tree, never the disk. */
const SCRATCH = path.join(path.sep, 'keel-growth');

/**
 * A few seconds on their own; `verify` runs this beside the rest of the
 * suite on four cores, so the budget is far above that and far below a
 * hang.
 */
const SWEEP_TIMEOUT = 180_000;

/** One cell: what growth does, or the code it is refused under and why. */
type Cell =
  | {
      readonly twin: string;
      readonly adapters: readonly string[];
      readonly verticals: readonly string[];
      readonly modules?: readonly GrowthModule[];
      readonly rerender: readonly string[];
    }
  | {
      readonly refused: string;
      readonly reason?: string;
      readonly drops?: readonly string[];
      readonly rules?: readonly string[];
      readonly contexts?: readonly GrowthContext[];
    };

/** What each directory holds once a run has committed it, by path from the directory. */
const disk = new Map<string, Map<string, Buffer>>();
const manifests = new FakeManifestStore();
const mediator = installMediator({
  processes: new FakeProcessRunner(),
  runDeferred: async () => {},
  trees: treeAt,
  manifests,
});
const cells = new Map<string, Cell>();
let swept = false;

describe('growth: what adding an entrypoint reads, on every shipped preset', () => {
  beforeAll(async () => {
    const { stacks } = expectOk(await mediator.dispatch(catalogQuery()));
    const lacking = (tags: readonly string[]) =>
      ENTRYPOINTS.filter((entry) => entry.side === 'back' && !tags.includes(entry.tag));
    const growing = stacks.filter(
      (stack) => stack.services.length === 0 && lacking(stack.tags).length > 0,
    );
    await eachStack(growing, async (stack) => {
      for (const target of await harnessSettings(dialsOf, stack.id)) {
        const cwd = path.join(SCRATCH, newCommandLine(target).replace(/\W+/g, '-'));
        expectOk(await mediator.dispatch(installCommandFor(target, run(cwd))));
        const read = async (line: string): Promise<void> => {
          const manifest = await manifestAt(cwd, line);
          for (const entry of lacking(manifest.tags)) {
            cells.set(
              `${line} && keel add entrypoint ${entry.word}`,
              cellOf(growthOf(shippedRegistry, manifest, entry.word)),
            );
          }
        };
        await read(newCommandLine(target));
        if (target.moduleLayout !== 'modulith') continue;
        const { canAddModule, modules } = expectOk(
          await mediator.dispatch(projectStatusQuery({ cwd })),
        );
        const skeleton = modules[0]?.name;
        if (!canAddModule || skeleton === undefined) continue;
        const history = moduleHistory(skeleton);
        for (const add of history)
          expectOk(await mediator.dispatch(installCommandFor(add, run(cwd))));
        await read([newCommandLine(target), ...history.map(addModuleCommandLine)].join(' && '));
      }
    });
    swept = true;
  }, SWEEP_TIMEOUT);

  afterAll(async () => {
    if (!UPDATE || !swept) return;
    const sorted = Object.fromEntries(
      [...cells.keys()].sort().map((cell) => [cell, cells.get(cell)]),
    );
    const file = fileURLToPath(GOLDEN);
    const options = (await prettier.resolveConfig(file)) ?? {};
    await fs.writeFile(
      GOLDEN,
      await prettier.format(JSON.stringify(sorted, null, 2), { ...options, filepath: file }),
    );
  });

  it('reads every cell as its golden records', () => {
    if (UPDATE) return;
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, Cell>;
    const read = Object.fromEntries(
      [...cells.keys()].sort().map((cell) => [cell, cells.get(cell)]),
    );
    expect(read, 'a deliberate change is recorded by KEEL_UPDATE_GOLDEN=1').toEqual(golden);
  });
});

/**
 * The shipped in-memory `Tree` fake over what one directory holds:
 * seeded with what earlier runs there committed, and committing back
 * into it.
 */
class DirectoryTree extends FakeTree {
  constructor(private readonly files: Map<string, Buffer>) {
    super();
    for (const [file, content] of files) this.seed(file, content);
  }

  override async commit(): Promise<readonly TreeChange[]> {
    const changes = await super.commit();
    for (const change of changes) {
      const bytes = this.read(change.path);
      if (bytes === null) this.files.delete(change.path);
      else this.files.set(change.path, bytes);
    }
    return changes;
  }
}

/** A `Tree` over what `root` holds, which commits back into it. */
function treeAt(root: string): Tree {
  const files = disk.get(root) ?? new Map<string, Buffer>();
  disk.set(root, files);
  return new DirectoryTree(files);
}

/** A real run in `cwd`, answering every question its default. */
function run(cwd: string): InstallRun {
  return { cwd, answers: {}, interactive: false, dryRun: false };
}

/** The manifest the runs `line` spells left in `cwd`. */
async function manifestAt(cwd: string, line: string): Promise<ManifestV2> {
  const manifest = await manifests.read(projectScopeRoot(cwd));
  if (manifest === null) throw new Error(`${line}: no manifest written`);
  return manifest;
}

async function dialsOf(target: NewProjectTarget): Promise<DialOptions> {
  return expectOk(await mediator.dispatch(dialsQuery({ target })));
}

/** A growth reading as the golden records it. */
function cellOf(growth: Growth): Cell {
  switch (growth.kind) {
    case 'grows':
      return {
        twin: growth.twin,
        adapters: growth.adapters.flatMap((vertical) => vertical.adapters),
        verticals: growth.verticals,
        ...(growth.modules.length === 0 ? {} : { modules: growth.modules }),
        rerender: growth.rerender,
      };
    case 'refused':
      return refusedCell(growth.refusal);
    case 'present':
      throw new Error(`growth read '${growth.entrypoint}' as present on a scaffold lacking it`);
  }
}

/** A refusal as the golden records it, less the entrypoint its key names. */
function refusedCell(refusal: GrowthRefusal): Cell {
  switch (refusal.code) {
    case 'keel.uncoverable-entrypoint':
      return {
        refused: refusal.code,
        reason: refusal.reason,
        ...(refusal.drops === undefined
          ? {}
          : { drops: refusal.drops.flatMap((vertical) => vertical.adapters) }),
      };
    case 'keel.incompatible':
      return { refused: refusal.code, rules: refusal.rules.map((rule) => rule.id) };
    case 'keel.contexts-need-rewiring':
      return { refused: refusal.code, contexts: refusal.contexts };
    case 'keel.unknown-entrypoint':
      throw new Error(`growth read '${refusal.word}', a word of ENTRYPOINTS, as naming none`);
  }
}
