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
 * The sweep that derives them is `support/paths-families.ts`' `PATHS_NEW`,
 * which the converge golden (`converge.golden.test.ts`) reads too.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`), each cell
 * a real run into an empty directory of the in-memory disk.
 *
 * `paths-new.golden.json` keys each cell by its command line.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import { PATHS_NEW } from '../../support/paths-families.js';
import { pathsGolden } from '../../support/paths-golden.js';

describe('paths golden: keel new', () => {
  pathsGolden({ ...PATHS_NEW, here: import.meta.url });
});
