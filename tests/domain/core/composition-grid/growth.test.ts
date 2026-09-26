/**
 * The composition grid's growth axis (roadmap R.2b): every
 * single-entrypoint backend preset, on every dial setting, grown by
 * `keel add entrypoint` with the entrypoint it lacks — and held to its
 * twin, the preset carrying both, scaffolded by `keel new` on the same
 * dials.
 *
 * Cells are derived, never listed: the presets and their twins from
 * `keel.catalog`'s stack finder (a framework's combination of one back
 * entrypoint, grown into its combination of that and another), every
 * setting of each from `keel.dials` — build system, module layout, the
 * peer context where the modulith offers it, and each again with the
 * agent harness left out — and no extras. Every modulith setting is
 * grown again after a module history (`moduleHistory`: `keel add module
 * orders --consumes <skeleton>`, then `shipping --consumes orders`),
 * and held to the twin given the same history (roadmap R.3): its
 * contexts are wired into the new assembly too. A cell's key is the
 * command lines that make it, spelled as the growth golden spells them
 * (`../growth.golden.json`, R.2a's record of what `growthOf` reads).
 *
 * What it holds:
 *
 *   - **Growing writes the twin's bytes** (I10): the scaffold, grown
 *     for real, holds every file `keel new` of the twin holds, byte for
 *     byte — `.claude/.keel-manifest.json` among them, the pinned clock
 *     making its timestamps equal — and queues the deferred actions
 *     `keel new` of the twin queues, in its order, less those that set
 *     up the repository (version control's): the project has one. A
 *     context the history added queued what it needed when it was
 *     added, on either side. Or it is refused —
 *     and either way the command answers as growth reads the cell:
 *     grown into the twin it names, or refused under the code it
 *     records.
 *   - **The command previews as it installs** (I9), on the scaffold
 *     before it grows: the same bytes, or the same refusal — over no
 *     answers, and over every question the preview asks answered away
 *     from its default (`answerBodies`, as the greenfield axis sends
 *     them): the monitoring stack, where HTTP arrives.
 *
 * Holds I1 and I6 over every cell on the way. Every invariant here is
 * hard, so `growth.known.json` has no key.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { describe } from 'vitest';
import type { DeferredAction } from '../../../../src/domain/contract/composition.js';
import {
  installCommandFor,
  type AddEntrypointTarget,
  type AddModuleTarget,
  type InstallRun,
  type NewProjectTarget,
} from '../../../../src/domain/contract/commands.js';
import {
  catalogQuery,
  dialsQuery,
  previewQuery,
  projectStatusQuery,
  type StackFinder,
} from '../../../../src/domain/contract/queries.js';
import { shippedRegistry } from '../../../../src/domain/core/registry.js';
import { entrypointNamed } from '../../../../src/domain/core/stack-wizard.js';
import {
  OK,
  answerBodies,
  eachStack,
  holdParity,
  sweepGrid,
  type Grid,
} from '../../../support/composition-grid.js';
import {
  addModuleCommandLine,
  harnessSettings,
  moduleHistory,
  newCommandLine,
} from '../../../support/dial-walk.js';

/** R.2a's reading of every cell: the twin it grows into, or the code it is refused under. */
const reading = JSON.parse(
  fs.readFileSync(new URL('../growth.golden.json', import.meta.url), 'utf8'),
) as Readonly<Record<string, { readonly twin?: string; readonly refused?: string }>>;

/**
 * The ids of the adapters whose actions set up the repository: version
 * control's, and no other vertical's — not the handler's own rule of
 * what settles, so a wrong one shows here. A deferred action carries
 * its adapter's id.
 */
const REPOSITORY_SETUP = new Set(
  (shippedRegistry.vertical('vcs')?.adapters ?? []).map((adapter) => adapter.id),
);

/** One preset to grow, and what it grows into: each entrypoint's word, with the twin. */
interface Growing {
  readonly stack: string;
  readonly grows: readonly { readonly word: string; readonly twin: string | null }[];
}

/** A scaffold as I10 compares it: each file's digest, and the actions it queued. */
interface Snapshot {
  readonly files: ReadonlyMap<string, string>;
  readonly actions: readonly string[];
}

describe('composition grid: growth', () => {
  sweepGrid({
    name: 'growth',
    here: import.meta.url,
    holds: ['I1', 'I6', 'I9', 'I10'],
    sweep: async (grid) => {
      const { finder } = await grid.read(catalogQuery());
      const twins = new Map<string, Promise<Snapshot>>();
      const dials = async (target: NewProjectTarget) => grid.read(dialsQuery({ target }));
      await eachStack(growingOf(finder), async ({ stack, grows }) => {
        for (const target of await harnessSettings(dials, stack)) {
          for (const { word, twin } of grows) {
            const cwd = await grid.scratch();
            await grid.read(installCommandFor(target, runIn(cwd)));
            await growCell(grid, twins, { target, history: [], word, twin, cwd });
            if (target.moduleLayout !== 'modulith') continue;
            const given = await grid.scratch();
            await grid.read(installCommandFor(target, runIn(given)));
            const history = await historyOf(grid, given);
            if (history === null) continue;
            for (const add of history) await grid.read(installCommandFor(add, runIn(given)));
            await growCell(grid, twins, { target, history, word, twin, cwd: given });
          }
        }
      });
    },
  });
});

/** One cell: a setting, the module history given it, and the entrypoint it grows. */
interface Growth {
  readonly target: NewProjectTarget;
  readonly history: readonly AddModuleTarget[];
  readonly word: string;
  /** The preset carrying both, or null where the finder lists none. */
  readonly twin: string | null;
  /** Where the setting was scaffolded and given its history. */
  readonly cwd: string;
}

/**
 * The {@link moduleHistory} the modulith in `cwd` can be given — null
 * where it takes no bounded context — read off its status, which names
 * its skeleton's context first.
 */
async function historyOf(grid: Grid, cwd: string): Promise<readonly AddModuleTarget[] | null> {
  const { canAddModule, modules } = await grid.read(projectStatusQuery({ cwd }));
  const skeleton = modules[0]?.name;
  return canAddModule && skeleton !== undefined ? moduleHistory(skeleton) : null;
}

/**
 * Holds I9 and I10 over one cell: its add previewed as it installs,
 * then grown for real and held to its twin given the same history —
 * or refused as growth reads it.
 */
async function growCell(
  grid: Grid,
  twins: Map<string, Promise<Snapshot>>,
  { target, history, word, twin, cwd }: Growth,
): Promise<void> {
  const cell = [
    newCommandLine(target),
    ...history.map(addModuleCommandLine),
    `keel add entrypoint ${word}`,
  ].join(' && ');
  const grow: AddEntrypointTarget = { kind: 'add-entrypoint', entrypoint: word };
  await holdParity(grid, `answers:${cell}#default`, grow, {}, cwd);
  // Answered from the record: the default body's preview is swept.
  const asked = await grid.cell(
    `answers:${cell}#default`,
    previewQuery({ cwd, target: grow, answers: {} }),
  );
  const bodies = answerBodies(shippedRegistry, asked.value?.questions ?? []);
  const answered = bodies.filter(({ answers }) => Object.keys(answers).length > 0);
  for (const body of answered) {
    await holdParity(grid, `answers:${cell}#${body.name}`, grow, body.answers, cwd);
  }

  const outcome = await grid.cell(`grow:${cell}`, installCommandFor(grow, runIn(cwd)));
  const read = reading[cell];
  if (outcome.verdict !== OK) {
    if (read?.refused !== outcome.verdict) grid.violate('I10', cell);
    return;
  }
  if (twin === null || read?.twin !== twin) {
    grid.violate('I10', cell);
    return;
  }
  const setting = { ...target, stack: twin };
  const key = JSON.stringify([setting, history]);
  const expected = twins.get(key) ?? scaffold(grid, setting, history);
  twins.set(key, expected);
  const grown = await snapshotOf(cwd, grid.queued(cwd), false);
  if (!sameSnapshot(grown, await expected)) grid.violate('I10', cell);
}

/**
 * The presets the finder lists with a single back entrypoint, each with
 * the other back entrypoints its framework offers and the preset
 * carrying both — null where the finder lists none, which growth must
 * then refuse.
 */
function growingOf(finder: StackFinder): readonly Growing[] {
  const backend = finder.shapes.filter((shape) => shape.id === 'backend');
  return backend
    .flatMap((shape) => shape.languages)
    .flatMap((language) => language.frameworks)
    .flatMap((framework) => {
      const offered = [...new Set(framework.combinations.flatMap((c) => c.entrypoints))];
      return framework.combinations
        .filter((combination) => combination.entrypoints.length === 1)
        .map((single) => ({
          stack: single.stack,
          grows: offered
            .filter((id) => !single.entrypoints.includes(id))
            .map((id) => {
              const both = [...single.entrypoints, id].sort().join(',');
              const twin = framework.combinations.find(
                (other) => [...other.entrypoints].sort().join(',') === both,
              );
              return { word: entrypointNamed(id)?.word ?? id, twin: twin?.stack ?? null };
            }),
        }));
    });
}

/**
 * `keel new` of `setting` in a directory of its own, then `history`, as
 * I10 compares it: the actions are the ones `keel new` queued.
 */
async function scaffold(
  grid: Grid,
  setting: NewProjectTarget,
  history: readonly AddModuleTarget[],
): Promise<Snapshot> {
  const cwd = await grid.scratch();
  await grid.read(installCommandFor(setting, runIn(cwd)));
  const queued = grid.queued(cwd);
  for (const add of history) await grid.read(installCommandFor(add, runIn(cwd)));
  return snapshotOf(cwd, queued, true);
}

/**
 * The project in `cwd` as I10 compares it: every file's digest, by path
 * from `cwd`, and the descriptions of `queued` — less the repository
 * setup, where `twin` says they are `keel new`'s.
 */
async function snapshotOf(
  cwd: string,
  queued: readonly DeferredAction[],
  twin: boolean,
): Promise<Snapshot> {
  const files = new Map<string, string>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const at = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(at);
      else {
        const digest = createHash('sha256')
          .update(await fs.readFile(at))
          .digest('hex');
        files.set(path.relative(cwd, at), digest);
      }
    }
  };
  await walk(cwd);
  const actions = queued
    .filter((action) => !twin || !REPOSITORY_SETUP.has(action.id))
    .map((action) => action.description);
  return { files, actions };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  const sorted = (files: ReadonlyMap<string, string>) =>
    JSON.stringify([...files].sort(([x], [y]) => x.localeCompare(y)));
  return (
    sorted(a.files) === sorted(b.files) && JSON.stringify(a.actions) === JSON.stringify(b.actions)
  );
}

function runIn(cwd: string): InstallRun {
  return { cwd, answers: {}, interactive: false, dryRun: false };
}
