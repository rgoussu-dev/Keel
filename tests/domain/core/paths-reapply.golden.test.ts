/**
 * The paths golden's `--reapply` family (`docs/roadmap.md` → S.1a): what
 * re-rendering a project's recorded verticals leaves, pinned absolutely,
 * cell by cell (`support/paths-golden.ts`).
 *
 * **Scenario.** Cells are derived, never listed: the presets from
 * `keel.catalog`, their menus from `keel.dials`, and what each project
 * records, and can re-render, from `keel.project-status`. On each
 * single-service preset's opening scaffold, on its whole-menu scaffold,
 * and in each service of every product under each repository layout:
 *
 * - each recorded vertical re-rendered alone, for real;
 * - then the whole re-render: one `keel add v1 … vn --reapply` naming
 *   every recorded vertical `keel add` can name, as a dry run — all of
 *   them but `bounded-context`, which `keel add module` records, and a
 *   product root's `fullstack`.
 *
 * The re-renders after a module history are the `keel add module`
 * family's (`paths-grow.golden.test.ts`), which makes those histories.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`); each
 * scaffold is made once, and copied into every cell that starts from it.
 *
 * `paths-reapply.golden.json` keys each cell by its command lines.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { eachStack } from '../../support/composition-grid.js';
import {
  menuOf,
  newStep,
  pathsGolden,
  reapplyStep,
  wholeRerenderStep,
  type Base,
  type PathsSweep,
} from '../../support/paths-golden.js';

describe('paths golden: --reapply', () => {
  pathsGolden({
    name: 'paths-reapply',
    here: import.meta.url,
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
  });
});

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
