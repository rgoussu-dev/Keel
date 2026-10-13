/**
 * The paths golden's four families of cells (`docs/roadmap.md` → S.1a),
 * each derived by a sweep over a {@link PathsSweep}: `keel new`, `keel
 * add`, `--reapply`, and `keel add module` with `keel add entrypoint`.
 * Held here rather than in their suites so that another reading of the
 * same cells enumerates them once, as the paths golden does: the
 * converge golden (S.2) reads the converge operation on every cell the
 * four key. Each family's cells, and why, are its suite's
 * (`domain/core/paths-*.golden.test.ts`).
 */

import type { AddVerticalTarget, NewProjectTarget } from '../../src/domain/contract/commands.js';
import type { StackDescriptor, StackFinder } from '../../src/domain/contract/queries.js';
import { shippedRegistry } from '../../src/domain/core/registry.js';
import { ENTRYPOINTS } from '../../src/domain/core/stack-wizard.js';
import { answerBodies, eachStack } from './composition-grid.js';
import {
  addStep,
  menuOf,
  newStep,
  reapplyStep,
  wholeRerenderStep,
  type Base,
  type PathsSweep,
} from './paths-golden.js';

/** One family of the paths golden: the name its golden is written under, and its sweep. */
export interface PathsFamilySweep {
  /** `<name>.golden.json`, beside its suite. */
  readonly name: string;
  /** Derives the family's cells and records each through `paths`. */
  readonly sweep: (paths: PathsSweep) => Promise<void>;
}

/** The vertical a project made without the harness adopts it by. */
const HARNESS = 'agent-harness';

/* ---- keel new ------------------------------------------------------ */

/** `paths-new`: every `keel new` cell (`paths-new.golden.test.ts`). */
export const PATHS_NEW: PathsFamilySweep = {
  name: 'paths-new',
  sweep: async (paths) => {
    const { stacks } = await paths.catalog();
    await eachStack(
      stacks.filter((stack) => stack.services.length === 0),
      (stack) => sweepNewPreset(paths, stack.id),
    );
    await eachStack(
      stacks.filter((stack) => stack.services.length > 0),
      async (stack) => {
        for (const layout of await paths.layouts(stack.id)) {
          const settled = await paths.dials({ kind: 'new-project', stack: stack.id, layout });
          await paths.cell(null, [newStep(settled.target as NewProjectTarget)]);
        }
      },
    );
  },
};

/** Every `keel new` cell of the single-service preset `stack`. */
async function sweepNewPreset(paths: PathsSweep, stack: string): Promise<void> {
  for (const setting of await paths.settings(stack)) {
    await paths.cell(null, [newStep(setting)]);
    if (setting.agentHarness === false) continue;
    const menu = menuOf(await paths.dials(setting));
    if (menu.length > 0) await paths.cell(null, [newStep(await paths.snapped(setting, menu))]);
  }

  const opening = await paths.dials({ kind: 'new-project', stack });
  const target = opening.target as NewProjectTarget;
  const menu = menuOf(opening);
  for (const extra of menu) {
    await paths.cell(null, [newStep(await paths.snapped(target, [extra]))]);
  }
  const whole = await paths.snapped(target, menu);
  const questions = (await paths.preview(null, whole))?.questions ?? [];
  for (const body of answerBodies(shippedRegistry, questions)) {
    if (Object.keys(body.answers).length === 0) continue;
    await paths.cell(null, [newStep(whole, body.answers)]);
  }
}

/* ---- keel add ------------------------------------------------------ */

/**
 * Q3.4's finding 2, pinned by name: on a Quarkus CLI with REST under
 * Gradle, distribution resolves to the native binary until a container
 * image arrives, whose install proposes re-rendering it; the re-render
 * moves it onto the image's pipeline and leaves the native binary's
 * files behind.
 */
const Q34_FINDING_2 = {
  stacks: ['quarkus-cli-rest', 'quarkus-cli-rest-kotlin'],
  buildSystem: 'gradle',
  first: 'distribution',
  then: 'containerization',
} as const;

/** `paths-add`: every `keel add` cell (`paths-add.golden.test.ts`). */
export const PATHS_ADD: PathsFamilySweep = {
  name: 'paths-add',
  sweep: async (paths) => {
    const { stacks, verticals } = await paths.catalog();
    await eachStack(
      stacks.filter((stack) => stack.services.length === 0),
      (stack) => sweepAddPreset(paths, stack),
    );
    await eachStack(
      stacks.filter((stack) => stack.services.length > 0),
      async (stack) => {
        const scopes = ['', ...stack.services.map((service) => service.path)];
        for (const layout of await paths.layouts(stack.id)) {
          const settled = await paths.dials({ kind: 'new-project', stack: stack.id, layout });
          const product = await paths.extend(null, [newStep(settled.target as NewProjectTarget)]);
          for (const at of scopes) {
            for (const { id } of verticals) {
              await paths.cell(product, [addStep(adding(id), { at })]);
            }
          }
        }
      },
    );
  },
};

/** Every `keel add` cell of the single-service preset `stack`. */
async function sweepAddPreset(paths: PathsSweep, stack: StackDescriptor): Promise<void> {
  const opening = await paths.dials({ kind: 'new-project', stack: stack.id });
  const target = opening.target as NewProjectTarget;
  const menu = menuOf(opening);
  await sweepExtras(paths, await paths.extend(null, [newStep(target)]), menu);
  await sweepHistory(paths, stack.id);
  if (opening.agentHarness) await sweepAdoption(paths, target);
  const back = ENTRYPOINTS.filter((entrypoint) => entrypoint.side === 'back');
  if (back.every((entrypoint) => stack.tags.includes(entrypoint.tag))) {
    await sweepPairs(paths, target, menu);
  }
  if ((Q34_FINDING_2.stacks as readonly string[]).includes(stack.id)) {
    await sweepFinding(paths, stack.id);
  }
}

/**
 * Each of `menu` added alone to `scaffold`: on default answers, and with
 * every question its preview asks answered away from its default, where
 * it asks one.
 */
async function sweepExtras(
  paths: PathsSweep,
  scaffold: Base,
  menu: readonly string[],
): Promise<void> {
  for (const extra of menu) {
    await paths.cell(scaffold, [addStep(adding(extra))]);
    const questions = (await paths.preview(scaffold, adding(extra)))?.questions ?? [];
    const answered = answerBodies(shippedRegistry, questions).find(
      (body) => body.name === 'answered',
    );
    if (answered === undefined || Object.keys(answered.answers).length === 0) continue;
    await paths.cell(scaffold, [addStep(adding(extra), { answers: answered.answers })]);
  }
}

/**
 * Each extra the opening modulith setting of `stack` offers, added alone
 * after the module history — where the preset has a modulith setting,
 * and it takes a bounded context.
 */
async function sweepHistory(paths: PathsSweep, stack: string): Promise<void> {
  const modulith = (await paths.settings(stack)).find(
    (setting) => setting.moduleLayout === 'modulith' && setting.agentHarness !== false,
  );
  if (modulith === undefined) return;
  const scaffolded = await paths.extend(null, [newStep(modulith)]);
  const history = await paths.historyOf(scaffolded);
  if (history === null) return;
  const given = await paths.extend(
    scaffolded,
    history.map((add) => addStep(add)),
  );
  for (const extra of menuOf(await paths.dials(modulith))) {
    await paths.cell(given, [addStep(adding(extra))]);
  }
}

/**
 * `keel add agent-harness` on `target` made without the harness, and on
 * it made with each extra offered there alone.
 */
async function sweepAdoption(paths: PathsSweep, target: NewProjectTarget): Promise<void> {
  const left = await paths.dials({ ...target, agentHarness: false });
  const without = left.target as NewProjectTarget;
  await paths.cell(await paths.extend(null, [newStep(without)]), [addStep(adding(HARNESS))]);
  for (const extra of menuOf(left)) {
    const made = await paths.extend(null, [newStep(await paths.snapped(without, [extra]))]);
    await paths.cell(made, [addStep(adding(HARNESS))]);
  }
}

/**
 * Every ordered pair of `menu` on `target`: `keel new --with a`, then
 * `keel add b`, re-rendering what its preview proposes; and, where it
 * proposes a refresh, `keel add b` again without it, whose report makes
 * the proposal.
 */
async function sweepPairs(
  paths: PathsSweep,
  target: NewProjectTarget,
  menu: readonly string[],
): Promise<void> {
  for (const a of menu) {
    const first = await paths.snapped(target, [a]);
    const made = await paths.extend(null, [newStep(first)]);
    for (const b of menu) {
      if ((first.extraVerticals ?? []).includes(b)) continue;
      const taken = await proposed(paths, made, b);
      await paths.cell(made, [addStep(taken)]);
      if ((taken.refresh ?? []).length > 0) await paths.cell(made, [addStep(adding(b))]);
    }
  }
}

/** Q3.4's finding 2's three cells on `stack`, under its build system. */
async function sweepFinding(paths: PathsSweep, stack: string): Promise<void> {
  const { buildSystem, first, then } = Q34_FINDING_2;
  const settled = (await paths.dials({ kind: 'new-project', stack, buildSystem }))
    .target as NewProjectTarget;
  const made = await paths.extend(null, [newStep(await paths.snapped(settled, [first]))]);
  await paths.cell(made, [addStep(adding(then))]);
  await paths.cell(made, [addStep({ ...adding(then), refresh: [first] })]);
  await paths.cell(made, [addStep(adding(then)), addStep({ ...adding(first), reapply: true })]);
}

/** `keel add <id>` in `base`, with the refresh its preview proposes, where it proposes one. */
async function proposed(paths: PathsSweep, base: Base, id: string): Promise<AddVerticalTarget> {
  const proposals = (await paths.preview(base, adding(id)))?.refreshProposals ?? [];
  const refresh = proposals.map((proposal) => proposal.vertical);
  return refresh.length === 0 ? adding(id) : { ...adding(id), refresh };
}

function adding(id: string): AddVerticalTarget {
  return { kind: 'add-vertical', verticals: [id] };
}

/* ---- --reapply ----------------------------------------------------- */

/** `paths-reapply`: every `--reapply` cell (`paths-reapply.golden.test.ts`). */
export const PATHS_REAPPLY: PathsFamilySweep = {
  name: 'paths-reapply',
  sweep: async (paths) => {
    const { stacks } = await paths.catalog();
    await eachStack(
      stacks.filter((stack) => stack.services.length === 0),
      async (stack) => {
        const opening = await paths.dials({ kind: 'new-project', stack: stack.id });
        const target = opening.target as NewProjectTarget;
        await rerender(paths, await paths.extend(null, [newStep(target)]));
        const menu = menuOf(opening);
        if (menu.length === 0) return;
        const whole = await paths.snapped(target, menu);
        await rerender(paths, await paths.extend(null, [newStep(whole)]));
      },
    );
    await eachStack(
      stacks.filter((stack) => stack.services.length > 0),
      async (stack) => {
        for (const layout of await paths.layouts(stack.id)) {
          const settled = await paths.dials({ kind: 'new-project', stack: stack.id, layout });
          const product = await paths.extend(null, [newStep(settled.target as NewProjectTarget)]);
          for (const service of stack.services) await rerender(paths, product, service.path);
        }
      },
    );
  },
};

/**
 * Each vertical `base` records, in its service `at` where given,
 * re-rendered alone; then all of them at once, as a dry run.
 */
async function rerender(paths: PathsSweep, base: Base, at = ''): Promise<void> {
  const recorded = await paths.reapplicable(base, at);
  for (const vertical of recorded) {
    await paths.cell(base, [reapplyStep([vertical], at)]);
  }
  if (recorded.length > 0) await paths.cell(base, [wholeRerenderStep(recorded, at)]);
}

/* ---- keel add module and keel add entrypoint ----------------------- */

/** The vertical whose re-render after a history drops each context's wiring (R's blocker 8). */
const BOOTSTRAP = 'walking-skeleton';

/** Re-rendered once a preset has grown: the dev container, whose shape the grown tags rank. */
const GROWN_RERENDER = 'dev-container';

/** `paths-grow`: every `keel add module` and `keel add entrypoint` cell (`paths-grow.golden.test.ts`). */
export const PATHS_GROW: PathsFamilySweep = {
  name: 'paths-grow',
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
};

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

/** The four families, in the order the paths golden lists them. */
export const PATHS_FAMILIES: readonly PathsFamilySweep[] = [
  PATHS_NEW,
  PATHS_ADD,
  PATHS_REAPPLY,
  PATHS_GROW,
];
