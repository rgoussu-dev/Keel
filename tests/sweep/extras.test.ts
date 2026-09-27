/**
 * The weekly composition sweep's `extras` suite: every set of offered
 * extras, on every dial setting of every preset — the grid's I2, I8 and
 * I9, which the grid reads on each preset's opening dials only,
 * generalised to the full powerset (`support/composition-sweep.ts`).
 *
 * For each setting `keel.dials` offers, each subset of the extras its
 * menu offers — a product's per service — ticked as the page ticks it
 * (each box bringing what it needs), and each distinct set the ticks
 * come to, once:
 *
 *   - **keel.dials keeps it as it is** — nothing to add, nothing to
 *     drop: a set the page can build is a set the menu stands by;
 *   - **the preview is Ok** (I2), and so nothing throws (I1): every
 *     box was offered;
 *   - **a preview plans what a dry-run install stages** (I9): the same
 *     paths, kinds and bytes, or the same refusal in the same sentence;
 *   - **naming order changes nothing** (I8): named backwards, in every
 *     order for a set of up to three, and in every order its boxes can
 *     be ticked in where they are up to three (the boxes a user ticks,
 *     before what they bring), it stages the same;
 *   - **a product's two spellings are one set**: where its own menu
 *     offers every extra of the set without a service (`--with
 *     persistence` for `backend:persistence`), the set spelled so is
 *     held to I2 and I9 as well, and stages what it stages as ticked
 *     (I8). `keel.dials` is not asked about it: it routes a bare id
 *     onto its service, and the page never posts one.
 *
 * Naming order alone cannot show an undeclared `Vertical.reads` — the
 * planner sorts what it is given — so the `arrival` suite beside this
 * one installs a pair in two runs, which can.
 *
 * Report-only and opt-in: `KEEL_RUN_SWEEP=1`, narrowed by
 * `KEEL_SWEEP_STACKS`. A preset is a test, and fails with every finding
 * it collected.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { installCommandFor, type NewProjectTarget } from '../../src/domain/contract/commands.js';
import {
  catalogQuery,
  dialsQuery,
  previewQuery,
  type DialOptions,
} from '../../src/domain/contract/queries.js';
import { Grid, OK, permutations } from '../support/composition-grid.js';
import {
  LaneTotals,
  PRESET_TIMEOUT,
  PresetSweep,
  SWEEP_OPTED_IN,
  answered,
  bareSpelling,
  commandOf,
  everyDialSetting,
  naming,
  offeredExtras,
  setKey,
  stagedDifference,
  subsetsOf,
  sweptStacks,
  ticked,
  unknownStacks,
  type Extra,
} from '../support/composition-sweep.js';

const grid = new Grid([]);
// Read only when opted in: the presets are listed when the file is
// collected, and a skipped file has no business dispatching.
const stacks = SWEEP_OPTED_IN ? (await grid.read(catalogQuery())).stacks : [];
const totals = new LaneTotals('extras');

describe.skipIf(!SWEEP_OPTED_IN)(
  'composition sweep: every extras set, on every dial setting',
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
        const preset = new PresetSweep('extras', id);
        // Previews write nothing and dry runs neither; each stages into
        // Trees rooted here, which is how their bytes are read back.
        const roots = { preview: await grid.scratch(), install: await grid.scratch() };
        for (const dials of await everyDialSetting(grid, stack, preset)) {
          preset.count('dial settings');
          const extras = offeredExtras(dials);
          const { sets, capped } = subsetsOf(extras);
          if (capped) {
            console.warn(
              `[sweep:extras] ${id}: ${extras.length} offered extras on ${commandOf(dials.target)} — ` +
                `past the powerset bound, so every set of up to three, the whole menu less each one, and the whole menu`,
            );
            preset.count('capped settings');
          }
          const seen = new Set<string>();
          for (const subset of sets) {
            preset.count('subsets');
            const named = ticked(dials, subset);
            const key = setKey(named);
            if (seen.has(key)) continue;
            seen.add(key);
            preset.count('sets');
            // Swept whole, the subsets come smallest mask first, so the
            // first to tick to a set is the one with no box another
            // brings: the boxes a user ticks for it.
            await holdSet(preset, dials, subset, named, roots);
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
 * Holds one set, as `named` names it on `dials`' setting once `boxes`
 * are ticked: kept by `keel.dials`, Ok, previewed as installed, and the
 * same named in any other order it is tried in — and on a product, where
 * the set has a spelling without services, Ok, previewed as installed
 * and the same spelled so too.
 */
async function holdSet(
  preset: PresetSweep,
  dials: DialOptions,
  boxes: readonly Extra[],
  named: readonly Extra[],
  roots: { readonly preview: string; readonly install: string },
): Promise<void> {
  const setting = dials.target as NewProjectTarget;
  const target = naming(setting, named);
  const at = commandOf(target);

  const kept = await grid.twin(dialsQuery({ target }));
  preset.count('dials');
  if (kept.verdict !== OK || kept.value === null) {
    preset.find({ at, what: `every box was offered, and keel.dials ${answered(kept)}` });
  } else if (kept.value.adjustments.length > 0) {
    preset.find({
      at,
      what:
        'keel.dials adjusts a set its menu offers: ' +
        kept.value.adjustments
          .map(
            (moved) =>
              `${moved.change} ${moved.service === undefined ? '' : `${moved.service}:`}${moved.id} (${moved.because})`,
          )
          .join('; '),
    });
  }

  const preview = await holdInstall(preset, target, roots);

  const orders = [
    ...(named.length <= 3 ? permutations(named).slice(1) : [[...named].reverse()]),
    ...(boxes.length <= 3 ? permutations(boxes).map((order) => ticked(dials, order)) : []),
  ];
  const others = new Map<string, NewProjectTarget>();
  for (const order of orders) {
    const other = naming(setting, order);
    const line = commandOf(other);
    if (line !== at && !others.has(line)) others.set(line, other);
  }
  for (const [line, other] of others) {
    const again = await grid.stages(
      previewQuery({ cwd: roots.preview, target: other, answers: {} }),
      roots.preview,
    );
    preset.count('previews');
    holdSame(preset, line, preview, again);
  }

  const spelled = bareSpelling(dials, named);
  if (spelled !== null) {
    const bare = naming(setting, spelled);
    preset.count('bare spellings');
    holdSame(preset, commandOf(bare), preview, await holdInstall(preset, bare, roots));
  }
}

/** What a dispatch answered, and what it staged when it was Ok. */
type Staged = Awaited<ReturnType<typeof grid.stages>>;

/**
 * Holds `target` to a preview that is Ok and a dry-run install staging
 * the same, or refusing in the same sentence (I1, I2, I9), and returns
 * the preview for the orderings to be held to.
 */
async function holdInstall(
  preset: PresetSweep,
  target: NewProjectTarget,
  roots: { readonly preview: string; readonly install: string },
): Promise<Staged> {
  const at = commandOf(target);
  const preview = await grid.stages(
    previewQuery({ cwd: roots.preview, target, answers: {} }),
    roots.preview,
  );
  preset.count('previews');
  const install = await grid.stages(
    installCommandFor(target, {
      cwd: roots.install,
      answers: {},
      interactive: false,
      dryRun: true,
    }),
    roots.install,
  );
  preset.count('dry-run installs');
  if (preview.outcome.verdict !== OK) {
    preset.find({
      at,
      what: `every box was offered, and the preview ${answered(preview.outcome)}`,
    });
  }
  if (preview.staged !== null && install.staged !== null) {
    const differs = stagedDifference(
      { label: 'preview', staged: preview.staged },
      { label: 'dry-run install', staged: install.staged },
    );
    if (differs !== null) {
      preset.find({
        at,
        what: 'the preview and the dry-run install stage other changes',
        difference: differs,
      });
    }
  } else if (
    install.outcome.verdict !== preview.outcome.verdict ||
    install.outcome.message !== preview.outcome.message
  ) {
    preset.find({
      at,
      what:
        `the preview and the dry-run install disagree: the preview ${answered(preview.outcome)}; ` +
        `the dry-run install ${answered(install.outcome)}`,
    });
  }
  return preview;
}

/**
 * Holds the set named otherwise, at `line`, to staging what it stages
 * as ticked, or answering as it does there (I8).
 */
function holdSame(preset: PresetSweep, line: string, ticked: Staged, again: Staged): void {
  if (again.staged !== null && ticked.staged !== null) {
    const differs = stagedDifference(
      { label: 'as ticked', staged: ticked.staged },
      { label: 'named otherwise', staged: again.staged },
    );
    if (differs !== null) {
      preset.find({
        at: line,
        what: 'named otherwise than as ticked, the set stages other changes',
        difference: differs,
      });
    }
  } else if (
    again.outcome.verdict !== ticked.outcome.verdict ||
    again.outcome.message !== ticked.outcome.message
  ) {
    preset.find({
      at: line,
      what:
        `named otherwise than as ticked, the set previews otherwise: as ticked it ` +
        `${answered(ticked.outcome)}; named so it ${answered(again.outcome)}`,
    });
  }
}
