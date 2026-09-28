/**
 * The paths golden's `keel add` family (`docs/roadmap.md` → S.1a): what
 * `keel add` leaves on a project `keel new` made, pinned absolutely,
 * cell by cell (`support/paths-golden.ts`).
 *
 * **Scenario.** Cells are derived, never listed: the presets from
 * `keel.catalog`, their settings and menus from `keel.dials`, the
 * questions and the refreshes each add proposes from `keel.preview`,
 * and each modulith's skeleton from `keel.project-status`.
 *
 * - every offered extra alone on each single-service preset's opening
 *   scaffold, on default answers and again with every question its
 *   preview asks answered away from its default (the grid's `answered`
 *   body), where it asks one;
 * - every offered extra alone after the module history (`keel add
 *   module orders --consumes <skeleton>`, then `shipping --consumes
 *   orders`) on each preset's opening modulith setting;
 * - `keel add agent-harness` on each preset's opening scaffold made with
 *   `--no-agent-harness`, and on each such scaffold made with each extra
 *   offered there alone;
 * - every ordered pair of offered extras on the opening dials of each
 *   preset carrying both back entrypoints (read off `keel.catalog`'s
 *   tags): `keel new --with a`, then `keel add b` with the refresh its
 *   preview proposes taken, and, where it proposes one, `keel add b`
 *   alone, the install whose report makes the proposal — but a pair
 *   whose `b` comes with `a`, where nothing arrives later;
 * - Q3.4's finding 2, the one cell family named here, since no pair
 *   rule reaches its re-render: on {@link Q34_FINDING_2}'s presets
 *   under its build system, `keel new --with distribution`, then `keel
 *   add containerization`, which proposes the refresh, and `keel add
 *   containerization --refresh distribution`, which takes it; and
 *   `keel add containerization`, then `keel add distribution --reapply`;
 * - every vertical `keel.catalog` lists, added at each product's root
 *   and in each of its services, under each repository layout.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`); each
 * scaffold is made once, and copied into every cell that starts from it.
 *
 * `paths-add.golden.json` keys each cell by its command lines.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import type { AddVerticalTarget, NewProjectTarget } from '../../../src/domain/contract/commands.js';
import type { StackDescriptor } from '../../../src/domain/contract/queries.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import { ENTRYPOINTS } from '../../../src/domain/core/stack-wizard.js';
import { answerBodies, eachStack } from '../../support/composition-grid.js';
import {
  addStep,
  menuOf,
  newStep,
  pathsGolden,
  type Base,
  type PathsSweep,
} from '../../support/paths-golden.js';

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

/** The vertical a project made without the harness adopts it by. */
const HARNESS = 'agent-harness';

describe('paths golden: keel add', () => {
  pathsGolden({
    name: 'paths-add',
    here: import.meta.url,
    sweep: async (paths) => {
      const { stacks, verticals } = await paths.catalog();
      await eachStack(
        stacks.filter((stack) => stack.services.length === 0),
        (stack) => sweepPreset(paths, stack),
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
  });
});

/** Every `keel add` cell of the single-service preset `stack`. */
async function sweepPreset(paths: PathsSweep, stack: StackDescriptor): Promise<void> {
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
