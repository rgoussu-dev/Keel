/**
 * The paths golden's own machinery (`support/paths-golden.ts`), held
 * apart from the four families, which only compare what they recorded:
 * a Factory that stopped telling two runs' instants apart, or that
 * pinned what the contributor's checkout gave a file, would record a
 * golden every family agrees with, and the families could not tell.
 *
 * **Scenario.** `go-cli` on its opening dials, `keel new` then
 * `keel add vcs --reapply` — a re-render that records nothing new but
 * the instant it ran at — made once as one chain of two commands, and
 * once as a cell copied from the scaffold; and the modes a checkout can
 * give a file.
 *
 * **Factory** and **port**: the paths golden's (`PathsSweep`), a fresh
 * one per sweep, over `Mediator.dispatch`.
 */

import { describe, expect, it } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { PINNED_NOW } from '../../support/factory.js';
import {
  PathsSweep,
  instantAt,
  newStep,
  pinnedMode,
  reapplyStep,
  type PathsCell,
} from '../../support/paths-golden.js';

const STACK = 'go-cli';
const REAPPLIED = 'vcs';

async function openingTarget(paths: PathsSweep): Promise<NewProjectTarget> {
  return (await paths.dials({ kind: 'new-project', stack: STACK })).target as NewProjectTarget;
}

/** The one cell `paths` recorded. */
function only(paths: PathsSweep): PathsCell {
  const cells = Object.values(paths.swept());
  expect(cells).toHaveLength(1);
  return cells[0] as PathsCell;
}

describe('the paths golden: a file mode', () => {
  it('pins the executable bit alone, whatever umask the checkout was made under', () => {
    expect(pinnedMode(0o775)).toBe(pinnedMode(0o755));
    expect(pinnedMode(0o700)).toBe(pinnedMode(0o755));
    expect(pinnedMode(0o664)).toBe(pinnedMode(0o644));
    expect(pinnedMode(0o600)).toBe(pinnedMode(0o644));
    expect(pinnedMode(0o644)).not.toBe(pinnedMode(0o755));
  });
});

describe('the paths golden: a run instant', () => {
  it('pins the first command of a chain at the pinned instant, and each later one apart, the same day', () => {
    expect(instantAt(0)).toBe(PINNED_NOW);
    const later = [1, 2, 3, 4, 5, 6, 7, 8].map(instantAt);
    expect(new Set([instantAt(0), ...later]).size).toBe(9);
    for (const instant of later) {
      expect(Date.parse(instant)).toBeGreaterThan(Date.parse(PINNED_NOW));
      expect(instant.slice(0, 10)).toBe(PINNED_NOW.slice(0, 10));
    }
  });

  it('records a re-render at its own instant, apart from the scaffold it runs on', async () => {
    const paths = new PathsSweep();
    const target = await openingTarget(paths);
    await paths.cell(null, [newStep(target)]);
    const scaffold = only(paths).manifest[''];
    expect(scaffold?.['updatedAt']).toBe(scaffold?.['installedAt']);

    const chained = new PathsSweep();
    await chained.cell(null, [newStep(target), reapplyStep([REAPPLIED])]);
    const reapplied = only(chained);
    expect(reapplied.verdict).toBe('ok');
    expect(reapplied.manifest['']?.['installedAt']).toBe(scaffold?.['installedAt']);
    expect(reapplied.manifest['']?.['updatedAt']).not.toBe(scaffold?.['updatedAt']);
  });

  it("stamps a command with its position's instant, whether its cell ran the chain or copied a scaffold", async () => {
    const chained = new PathsSweep();
    const target = await openingTarget(chained);
    await chained.cell(null, [newStep(target), reapplyStep([REAPPLIED])]);

    const copied = new PathsSweep();
    const scaffold = await copied.extend(null, [newStep(target)]);
    await copied.cell(scaffold, [reapplyStep([REAPPLIED])]);

    expect(copied.swept()).toEqual(chained.swept());
  });
});
