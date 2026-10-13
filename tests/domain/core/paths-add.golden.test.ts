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
 *   rule reaches its re-render: on `quarkus-cli-rest` and its Kotlin
 *   twin under Gradle (`support/paths-families.ts`' `Q34_FINDING_2`),
 *   `keel new --with distribution`, then `keel add containerization`,
 *   which proposes the refresh, and `keel add containerization
 *   --refresh distribution`, which takes it; and `keel add
 *   containerization`, then `keel add distribution --reapply`;
 * - every vertical `keel.catalog` lists, added at each product's root
 *   and in each of its services, under each repository layout.
 *
 * The sweep that derives them is `support/paths-families.ts`' `PATHS_ADD`,
 * which the converge golden (`converge.golden.test.ts`) reads too.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`); each
 * scaffold is made once, and copied into every cell that starts from it.
 *
 * `paths-add.golden.json` keys each cell by its command lines.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import { PATHS_ADD } from '../../support/paths-families.js';
import { pathsGolden } from '../../support/paths-golden.js';

describe('paths golden: keel add', () => {
  pathsGolden({ ...PATHS_ADD, here: import.meta.url });
});
