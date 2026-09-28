/**
 * The paths golden's growth family (`docs/roadmap.md` → S.1a): what
 * `keel add module` and `keel add entrypoint` leave, and what a
 * re-render leaves after a module history, pinned absolutely, cell by
 * cell (`support/paths-golden.ts`).
 *
 * **Scenario.** Cells are derived, never listed: the presets from
 * `keel.catalog` — the ones that grow from its stack finder, as the
 * grid's growth axis reads them — their settings and menus from
 * `keel.dials`, and each modulith's skeleton, and what it can
 * re-render, from `keel.project-status`.
 *
 * - the module history (`keel add module orders --consumes
 *   <skeleton>`, then `shipping --consumes orders`) on every modulith
 *   setting `harnessSettings` walks that takes a bounded context, the
 *   agent harness on and off, each add a real run: one cell per
 *   history;
 * - after each history, `keel add walking-skeleton --reapply` alone,
 *   and the whole re-render (every recorded vertical `keel add` can
 *   name, as a dry run). Every other vertical re-rendered alone there
 *   was measured a fixed point;
 * - `keel add entrypoint <word>` on each single-entrypoint backend
 *   preset, for the back entrypoint it lacks: on its opening scaffold,
 *   with no extras and with the whole menu; after the module history on
 *   its opening modulith setting; on its opening scaffold made with
 *   `--no-agent-harness`, after `keel add agent-harness`; and once
 *   grown, followed by `keel add dev-container --reapply`.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`); each
 * scaffold is made once, and copied into every cell that starts from it.
 *
 * `paths-grow.golden.json` keys each cell by its command lines.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import type { StackDescriptor, StackFinder } from '../../../src/domain/contract/queries.js';
import { ENTRYPOINTS } from '../../../src/domain/core/stack-wizard.js';
import { eachStack } from '../../support/composition-grid.js';
import {
  addStep,
  menuOf,
  newStep,
  pathsGolden,
  reapplyStep,
  wholeRerenderStep,
  type Base,
  type PathsSweep,
} from '../../support/paths-golden.js';

/** The vertical whose re-render after a history drops each context's wiring (R's blocker 8). */
const BOOTSTRAP = 'walking-skeleton';

/** Re-rendered once a preset has grown: the dev container, whose shape the grown tags rank. */
const GROWN_RERENDER = 'dev-container';

/** The vertical a project made without the harness adopts it by. */
const HARNESS = 'agent-harness';

describe('paths golden: keel add module and keel add entrypoint', () => {
  pathsGolden({
    name: 'paths-grow',
    here: import.meta.url,
    sweep: async (paths) => {
      const { stacks, finder } = await paths.catalog();
      const growing = new Set(singleEntrypointBackends(finder));
      await eachStack(
        stacks.filter((stack) => stack.services.length === 0),
        async (stack) => {
          const settings = await paths.settings(stack.id);
          const histories = await sweepHistories(paths, settings);
          if (growing.has(stack.id)) await sweepGrowth(paths, stack, settings, histories);
        },
      );
    },
  });
});

/**
 * The module history on each modulith setting of `settings` that takes a
 * bounded context — a cell — then the bootstrap re-rendered alone after
 * it, and the whole re-render. Returns each setting given its history.
 */
async function sweepHistories(
  paths: PathsSweep,
  settings: readonly NewProjectTarget[],
): Promise<ReadonlyMap<NewProjectTarget, Base>> {
  const histories = new Map<NewProjectTarget, Base>();
  for (const setting of settings) {
    if (setting.moduleLayout !== 'modulith') continue;
    const scaffolded = await paths.extend(null, [newStep(setting)]);
    const history = await paths.historyOf(scaffolded);
    if (history === null) continue;
    const given = await paths.extend(
      scaffolded,
      history.map((add) => addStep(add)),
      { record: true },
    );
    histories.set(setting, given);
    await paths.cell(given, [reapplyStep([BOOTSTRAP])]);
    await paths.cell(given, [wholeRerenderStep(await paths.reapplicable(given))]);
  }
  return histories;
}

/**
 * The presets the stack finder lists with a single back entrypoint, as
 * the grid's growth axis reads them.
 */
function singleEntrypointBackends(finder: StackFinder): readonly string[] {
  return finder.shapes
    .filter((shape) => shape.id === 'backend')
    .flatMap((shape) => shape.languages)
    .flatMap((language) => language.frameworks)
    .flatMap((framework) => framework.combinations)
    .filter((combination) => combination.entrypoints.length === 1)
    .map((combination) => combination.stack);
}

/**
 * Every `keel add entrypoint` cell of `stack`, for each back entrypoint
 * it lacks: `settings` are its settings, the opening one first, and
 * `histories` its modulith settings given their history.
 */
async function sweepGrowth(
  paths: PathsSweep,
  stack: StackDescriptor,
  settings: readonly NewProjectTarget[],
  histories: ReadonlyMap<NewProjectTarget, Base>,
): Promise<void> {
  const opening = await paths.dials({ kind: 'new-project', stack: stack.id });
  const target = opening.target as NewProjectTarget;
  const scaffold = await paths.extend(null, [newStep(target)]);
  const whole = await paths.extend(null, [newStep(await paths.snapped(target, menuOf(opening)))]);
  const modulith = settings.find(
    (setting) => setting.moduleLayout === 'modulith' && setting.agentHarness !== false,
  );
  const given = modulith === undefined ? undefined : histories.get(modulith);
  const left = opening.agentHarness
    ? (await paths.dials({ ...target, agentHarness: false })).target
    : undefined;
  const without =
    left === undefined ? undefined : await paths.extend(null, [newStep(left as NewProjectTarget)]);

  const lacking = ENTRYPOINTS.filter(
    (entrypoint) => entrypoint.side === 'back' && !stack.tags.includes(entrypoint.tag),
  );
  for (const { word } of lacking) {
    const grow = addStep({ kind: 'add-entrypoint', entrypoint: word });
    await paths.cell(scaffold, [grow]);
    await paths.cell(whole, [grow]);
    if (given !== undefined) await paths.cell(given, [grow]);
    if (without !== undefined) {
      await paths.cell(without, [addStep({ kind: 'add-vertical', verticals: [HARNESS] }), grow]);
    }
    await paths.cell(scaffold, [grow, reapplyStep([GROWN_RERENDER])]);
  }
}
