/**
 * The weekly composition sweep's `choices` suite: every choice of every
 * question, on every dial setting of every preset
 * (`support/composition-sweep.ts`).
 *
 * The grid's I9 answers one non-default choice per question, on each
 * preset's opening dials, so a choice offered where it is then refused
 * shows there only by luck — and `handlers/preview.test.ts` sweeps
 * persistence's alone. Here, for each setting `keel.dials` offers, the
 * questions are read off previews with no answers: of the whole menu
 * ticked (every offered extra, with what it needs), of no extra, and of
 * each offered extra ticked alone, with what it needs. The whole menu
 * alone is not enough: an extra answers a question another asks
 * (Continuous integration answers Distribution's CI provider), or moves
 * it onto another adapter (a container image takes Distribution off the
 * native binary, and its targets), so some questions are asked only
 * where fewer boxes are ticked — and a whole menu that throws would
 * ask none. Then each question an adapter asks, answered with each
 * choice it offers — for a `multi-select`, none, each one alone and
 * all; for a free-form question, one sample — goes, one answer per
 * body, on the first of those targets that offers that choice, to a
 * preview and to a dry-run install:
 *
 *   - **nothing throws** (I1);
 *   - **both are Ok, and the preview reads the answer**: it was offered,
 *     so neither may refuse it, nor report it unread;
 *   - **both stage the same changes** (I9): paths, kinds and bytes.
 *
 * Report-only and opt-in: `KEEL_RUN_SWEEP=1`, narrowed by
 * `KEEL_SWEEP_STACKS`. A preset is a test, and fails with every finding
 * it collected.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { installCommandFor, type NewProjectTarget } from '../../src/domain/contract/commands.js';
import { catalogQuery, previewQuery, type DialOptions } from '../../src/domain/contract/queries.js';
import { Grid, OK } from '../support/composition-grid.js';
import {
  LaneTotals,
  PRESET_TIMEOUT,
  PresetSweep,
  SWEEP_OPTED_IN,
  answered,
  answersFor,
  commandOf,
  everyDialSetting,
  naming,
  offeredExtras,
  stagedDifference,
  sweptStacks,
  ticked,
  unknownStacks,
} from '../support/composition-sweep.js';

const grid = new Grid([]);
// Read only when opted in: the presets are listed when the file is
// collected, and a skipped file has no business dispatching.
const stacks = SWEEP_OPTED_IN ? (await grid.read(catalogQuery())).stacks : [];
const totals = new LaneTotals('choices');

describe.skipIf(!SWEEP_OPTED_IN)('composition sweep: every choice of every question', () => {
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
      const preset = new PresetSweep('choices', id);
      // Previews write nothing and dry runs neither; each stages into
      // Trees rooted here, which is how their bytes are read back.
      const roots = { preview: await grid.scratch(), install: await grid.scratch() };
      for (const dials of await everyDialSetting(grid, stack, preset)) {
        preset.count('dial settings');
        await holdChoices(preset, dials, roots);
      }
      totals.add(preset);
      console.log(preset.summary());
      expect(preset.findings.length, preset.report()).toBe(0);
    },
  );
});

/**
 * Holds every choice of every question asked on `dials`' setting — by
 * the whole menu, by no extra, or by any one extra with what it needs —
 * each on the first of those that offers it: Ok from a preview that
 * reads it and from a dry-run install, both staging the same.
 */
async function holdChoices(
  preset: PresetSweep,
  dials: DialOptions,
  roots: { readonly preview: string; readonly install: string },
): Promise<void> {
  const setting = dials.target as NewProjectTarget;
  const extras = offeredExtras(dials);
  const askers = new Map<string, NewProjectTarget>();
  for (const chosen of [extras, [], ...extras.map((extra) => [extra])]) {
    const target = naming(setting, ticked(dials, chosen));
    const line = commandOf(target);
    if (!askers.has(line)) askers.set(line, target);
  }
  const questions = new Set<string>();
  const swept = new Set<string>();
  for (const [line, target] of askers) {
    const asked = await grid.twin(previewQuery({ cwd: roots.preview, target, answers: {} }));
    preset.count('previews');
    if (asked.verdict !== OK || asked.value === null) {
      preset.find({
        at: line,
        what: `every box was offered, and the preview asking its questions ${answered(asked)}`,
      });
      continue;
    }
    for (const question of asked.value.questions) {
      if (question.binding.kind !== 'answer') continue;
      const { adapter, question: id } = question.binding;
      for (const value of answersFor(question)) {
        const key = JSON.stringify([adapter, id, value]);
        if (swept.has(key)) continue;
        swept.add(key);
        if (!questions.has(`${adapter}:${id}`)) {
          questions.add(`${adapter}:${id}`);
          preset.count('questions');
        }
        preset.count('answers');
        await holdAnswer(preset, target, { [adapter]: { [id]: value } }, roots);
      }
    }
  }
}

/**
 * Holds one offered choice, `answers` on `target`: Ok from a preview
 * that reads it and from a dry-run install, both staging the same.
 */
async function holdAnswer(
  preset: PresetSweep,
  target: NewProjectTarget,
  answers: Readonly<Record<string, Readonly<Record<string, string>>>>,
  roots: { readonly preview: string; readonly install: string },
): Promise<void> {
  const at = commandOf(target, answers);
  const preview = await grid.stages(
    previewQuery({ cwd: roots.preview, target, answers }),
    roots.preview,
  );
  preset.count('previews');
  const install = await grid.stages(
    installCommandFor(target, {
      cwd: roots.install,
      answers,
      interactive: false,
      dryRun: true,
    }),
    roots.install,
  );
  preset.count('dry-run installs');
  for (const [label, outcome] of [
    ['the preview', preview.outcome],
    ['the dry-run install', install.outcome],
  ] as const) {
    if (outcome.verdict !== OK) {
      preset.find({ at, what: `an offered choice, and ${label} ${answered(outcome)}` });
    }
  }
  const unread = preview.outcome.value?.unusedAnswers ?? [];
  for (const unused of unread) {
    preset.find({
      at,
      what: `an offered choice, and the preview reports it unread: ${unused.code}: ${unused.message}`,
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
  }
}
