/**
 * The weekly composition sweep's `arrival` suite: every ordered pair of
 * offered extras, and every offered extra on its own, on every dial
 * setting of every preset, arriving in one run and in two
 * (`support/composition-sweep.ts`).
 *
 * The one order naming cannot vary is the order verticals *arrive* in:
 * `keel new --with` plans the set it is given, sorted, whatever order
 * it is named in, so the `extras` suite's permutations hold the planner
 * to itself and no more. Two runs are the other order. For each pair
 * `(x, y)` of the extras a setting's menu offers — each ticked as the
 * page ticks it, with what it needs — this suite installs, for real,
 * into scratch directories:
 *
 *   - `keel new --with x,y` — one run naming both;
 *   - `keel new --with x`, then `keel add y` — `y` arriving later, in
 *     its service's directory on a product, re-rendering whatever the
 *     add's preview proposes (`--refresh`, the command's `refresh`).
 *
 * and holds the two trees to one another: every file's bytes, and each
 * manifest with its timestamps and arrival order taken out. Each `y`
 * arrives on its own first — `keel new`, then `keel add y`, against
 * `keel new --with y` — the path a user takes most, and what a pair is
 * read against: a pair that differs in the paths `y` alone differs in,
 * and no more, is that fact again, and is said so, under one heading.
 *
 * A vertical whose `contribute()` reads another it does not declare
 * (`Vertical.reads`) writes something else when the other is already
 * there than when it is not, so it shows here as a file only one of the
 * two trees holds, or one they hold with other bytes — as does an
 * adapter whose output depends on the order it runs in — whether or not
 * the add proposed a refresh: a refresh re-renders the verticals it
 * names, not the one that reads. A declared read shows instead as the
 * refresh the later add proposes, which should take it up. Files two
 * runs leave that one run never writes, where that refresh moves a
 * vertical onto another adapter, are a refresh that cannot take back
 * what the first adapter wrote. Pairs are exhaustive for a read, which
 * is a fact about two verticals. A pair whose `y` is among what `x`
 * needs is left out: nothing arrives later.
 *
 * Report-only and opt-in: `KEEL_RUN_SWEEP=1`, narrowed by
 * `KEEL_SWEEP_STACKS`. A preset is a test, and fails with every finding
 * it collected.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';
import {
  installCommandFor,
  type AddVerticalTarget,
  type NewProjectTarget,
} from '../../src/domain/contract/commands.js';
import { catalogQuery, previewQuery, type DialOptions } from '../../src/domain/contract/queries.js';
import { Grid, OK } from '../support/composition-grid.js';
import {
  LaneTotals,
  PRESET_TIMEOUT,
  PresetSweep,
  SWEEP_OPTED_IN,
  answered,
  commandOf,
  everyDialSetting,
  naming,
  offeredExtras,
  scratchDirectory,
  setKey,
  spelled,
  sweptStacks,
  ticked,
  treeDifference,
  treeOf,
  unknownStacks,
  type Difference,
  type Extra,
} from '../support/composition-sweep.js';

const grid = new Grid([]);
// Read only when opted in: the presets are listed when the file is
// collected, and a skipped file has no business dispatching.
const stacks = SWEEP_OPTED_IN ? (await grid.read(catalogQuery())).stacks : [];
const totals = new LaneTotals('arrival');

describe.skipIf(!SWEEP_OPTED_IN)(
  'composition sweep: every pair, arriving in one run and in two',
  () => {
    afterAll(async () => {
      console.log(totals.summary());
      await grid.dispose();
    });

    it('sweeps at least one preset, and only presets the catalog has', () => {
      expect(unknownStacks(stacks)).toEqual([]);
      expect(sweptStacks(stacks)).not.toHaveLength(0);
    });

    it.concurrent.for(sweptStacks(stacks).map((stack) => stack.id))(
      '%s',
      { timeout: PRESET_TIMEOUT },
      async (id, { expect }) => {
        const stack = stacks.find((candidate) => candidate.id === id);
        if (stack === undefined) throw new Error(`'${id}' left the catalog`);
        const preset = new PresetSweep('arrival', id);
        for (const dials of await everyDialSetting(grid, stack, preset)) {
          preset.count('dial settings');
          const root = await scratchDirectory();
          try {
            await holdPairs(preset, dials, root);
          } finally {
            await fs.remove(root);
          }
        }
        totals.add(preset);
        console.log(preset.summary());
        expect(preset.findings.length, preset.report()).toBe(0);
      },
    );
  },
);

/**
 * What `y` arriving in a later run did, by the way its tree differs
 * from one run's ({@link treeDifference}), said against `one` — the one
 * run naming both, or naming `y`: the manifest's record alone; lines in
 * another order; files one run never writes, left behind where the
 * add's refresh moves a vertical onto another adapter — a refresh that
 * does not take back what the first one wrote; or anything else,
 * refresh or none — a file only one run writes, or one written
 * otherwise — which is what an undeclared read looks like.
 */
const WHAT = {
  record: (one: string) =>
    `writes the files ${one} writes, and the manifest records them otherwise`,
  order: (one: string) =>
    `writes lines ${one} writes, in another order: an adapter whose output follows the order it ` +
    'runs in',
  content: (one: string) =>
    `writes other files than ${one}: an undeclared read, or an adapter whose output follows the ` +
    'order it runs in',
  refreshed: (one: string) =>
    `leaves files ${one} never writes: the refresh moves a vertical onto another adapter, and ` +
    'does not take back what the first one wrote',
} as const;

/**
 * Holds every offered extra of `dials`' setting arriving later — on its
 * own, then after each other one: `y` added to a project that has
 * nothing, or `x`, leaves the tree one run naming all it then has
 * leaves. Scaffolds under `root`, each set once.
 */
async function holdPairs(preset: PresetSweep, dials: DialOptions, root: string): Promise<void> {
  const setting = dials.target as NewProjectTarget;
  const scaffolds = new Map<string, string | null>();
  const scaffold = async (named: readonly Extra[]): Promise<string | null> => {
    const key = setKey(named);
    const done = scaffolds.get(key);
    if (done !== undefined) return done;
    const cwd = path.join(root, `set-${scaffolds.size}`);
    await fs.ensureDir(cwd);
    const target = naming(setting, named);
    const outcome = await grid.twin(
      installCommandFor(target, { cwd, answers: {}, interactive: false, dryRun: false }),
    );
    preset.count('scaffolds');
    const made = outcome.verdict === OK ? cwd : null;
    if (made === null) {
      preset.find({
        at: commandOf(target),
        what: `every box was offered, and keel new ${answered(outcome)}`,
      });
    }
    scaffolds.set(key, made);
    return made;
  };

  const extras = offeredExtras(dials);
  const work = path.join(root, 'work');
  // What each extra differs in arriving on its own, by the paths it
  // names: read first, so each pair is read against it.
  const alone = new Map<string, string>();
  const shape = (difference: Difference): string =>
    JSON.stringify([difference.nature, ...difference.paths]);
  for (const x of [null, ...extras]) {
    const first = ticked(dials, x === null ? [] : [x]);
    for (const y of extras) {
      if (y === x || first.some((extra) => extra.id === y.id && extra.service === y.service)) {
        continue;
      }
      preset.count(x === null ? 'arrivals alone' : 'pairs');
      const pair = ticked(dials, x === null ? [y] : [x, y]);
      const both = await scaffold(pair);
      const before = await scaffold(first);
      // A first run refused is a finding already, and leaves nothing
      // to add to.
      if (before === null) continue;

      await fs.remove(work);
      await fs.copy(before, work);
      const cwd = y.service === null ? work : path.join(work, y.service);
      const adding: AddVerticalTarget = { kind: 'add-vertical', verticals: [y.id] };
      const proposed = await grid.twin(previewQuery({ cwd, target: adding, answers: {} }));
      preset.count('previews');
      const proposals = proposed.value?.refreshProposals ?? [];
      const refresh = proposals.map((proposal) => proposal.vertical);
      const add: AddVerticalTarget = refresh.length === 0 ? adding : { ...adding, refresh };
      const at =
        `${commandOf(naming(setting, pair))}; against ${commandOf(naming(setting, first))}, ` +
        `then ${y.service === null ? '' : `cd ${y.service} && `}${commandOf(add)}`;
      if (proposed.verdict !== OK) {
        preset.find({ at, what: `the add's preview ${answered(proposed)}` });
        continue;
      }
      const added = await grid.twin(
        installCommandFor(add, { cwd, answers: {}, interactive: false, dryRun: false }),
      );
      preset.count('adds');
      if (added.verdict !== OK) {
        preset.find({ at, what: `the add ${answered(added)}` });
        continue;
      }
      const one = x === null ? 'one run naming it' : 'one run naming both';
      // One run refused is a finding already; the add is made all the
      // same, since `keel add` has a front door of its own to hold.
      if (both === null) {
        preset.find({ at, what: `the add is Ok, where ${one} is not` });
        continue;
      }

      const differs = treeDifference(
        { label: 'one run', tree: await treeOf(both) },
        { label: 'two runs', tree: await treeOf(work) },
      );
      if (differs === null) continue;
      if (x === null) alone.set(spelled(y), shape(differs));
      else if (alone.get(spelled(y)) === shape(differs)) {
        preset.find({
          at,
          what:
            `${spelled(y)} arriving after another extra differs from one run naming both ` +
            'only as it does arriving on its own',
          difference: differs,
        });
        continue;
      }
      const who =
        x === null
          ? `${spelled(y)} arriving on its own in a later run`
          : `${spelled(y)} arriving after ${spelled(x)}`;
      const arriving =
        refresh.length === 0
          ? who
          : `${who}, with the refresh its add proposed (${refresh.join(', ')}),`;
      // Files left behind read as the refresh's only where it moves a
      // vertical onto another adapter; anywhere else, as what this suite
      // is for: a vertical that wrote them because `y` was not there,
      // and was not re-rendered once it was.
      const moved = proposals.some((proposal) => proposal.adapters !== undefined);
      const reading = differs.nature !== 'added' ? differs.nature : moved ? 'refreshed' : 'content';
      preset.find({ at, what: `${arriving} ${WHAT[reading](one)}`, difference: differs });
    }
  }
}
