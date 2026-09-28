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
 * The sweep that derives them is `support/paths-families.ts`' `PATHS_REAPPLY`,
 * which the converge golden (`converge.golden.test.ts`) reads too.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`); each
 * scaffold is made once, and copied into every cell that starts from it.
 *
 * `paths-reapply.golden.json` keys each cell by its command lines.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import { PATHS_REAPPLY } from '../../support/paths-families.js';
import { pathsGolden } from '../../support/paths-golden.js';

describe('paths golden: --reapply', () => {
  pathsGolden({ ...PATHS_REAPPLY, here: import.meta.url });
});
