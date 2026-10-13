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
 * The sweep that derives them is `support/paths-families.ts`' `PATHS_GROW`,
 * which the converge golden (`converge.golden.test.ts`) reads too.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`); each
 * scaffold is made once, and copied into every cell that starts from it.
 *
 * `paths-grow.golden.json` keys each cell by its command lines.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change.
 */

import { describe } from 'vitest';
import { PATHS_GROW } from '../../support/paths-families.js';
import { pathsGolden } from '../../support/paths-golden.js';

describe('paths golden: keel add module and keel add entrypoint', () => {
  pathsGolden({ ...PATHS_GROW, here: import.meta.url });
});
