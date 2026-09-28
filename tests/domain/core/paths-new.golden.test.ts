/**
 * The paths golden's `keel new` family (`docs/roadmap.md` → S.1a): what
 * `keel new` leaves, pinned absolutely, cell by cell — the tree, each
 * manifest field, the deferred actions, the report and `keel docs
 * check`'s drift (`support/paths-golden.ts`).
 *
 * **Scenario.** Cells are derived, never listed: the presets from
 * `keel.catalog`, their settings and menus from `keel.dials`, the
 * questions from `keel.preview`.
 *
 * - every single-service preset on every dial setting `harnessSettings`
 *   walks — build system × module layout × the peer context, each again
 *   with the agent harness left out wherever it may be — with no extras;
 * - the whole menu (every extra `keel.dials` offers there, as it snaps
 *   it) on every setting with the harness;
 * - each offered extra alone on the opening dials;
 * - the whole menu on the opening dials under each of the grid's I9
 *   answer bodies but the empty one (`answerBodies`: every question
 *   answered away from its default, the same keyed to the sibling its
 *   asker borrows from, and one question answered twice), so answer
 *   folding is pinned where the e2e suites' non-default answers reach it;
 * - every product under each repository layout its preview offers, with
 *   no extras.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`), each cell
 * a real run into an empty directory of the in-memory disk.
 *
 * `paths-new.golden.json` keys each cell by its command line.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import { answerBodies, eachStack } from '../../support/composition-grid.js';
import { menuOf, newStep, pathsGolden, type PathsSweep } from '../../support/paths-golden.js';

describe('paths golden: keel new', () => {
  pathsGolden({
    name: 'paths-new',
    here: import.meta.url,
    sweep: async (paths) => {
      const { stacks } = await paths.catalog();
      await eachStack(
        stacks.filter((stack) => stack.services.length === 0),
        (stack) => sweepPreset(paths, stack.id),
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
  });
});

/** Every `keel new` cell of the single-service preset `stack`. */
async function sweepPreset(paths: PathsSweep, stack: string): Promise<void> {
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
