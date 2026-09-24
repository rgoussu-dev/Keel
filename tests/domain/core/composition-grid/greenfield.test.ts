/**
 * The composition grid's greenfield axis: `keel new`, previewed for
 * every stack in the catalog with each vertical as its one extra,
 * against the extras menu `keel.dials` shows for it, and into a
 * directory already holding a user's file. The preset alone is not a
 * cell here: the brownfield and composite axes scaffold every one.
 *
 * Three questions, each answered by `keel.preview` and nothing else:
 *
 *   - **Does anything throw?** (I1) Every cell, including a directory
 *     that already holds a `README.md` or a `.gitignore` — the usual
 *     way `keel new` meets a directory that is not empty.
 *   - **Does the menu offer what the gate refuses?** (I2) Every extra
 *     the menu offers, posted after its prerequisites
 *     ({@link chainOf}), must preview Ok. An entry that refuses is a
 *     dead end on the page.
 *   - **Does the gate accept what the menu hides?** (I3) The menu is
 *     flat, so an extra it does not offer is out of reach in any set.
 *     If some set containing it previews Ok ({@link candidateSets}),
 *     the CLI accepts what the page cannot build.
 *
 * Holds I6 over every refusal on the way. The menu read is each
 * stack's default dial setting; the others are the weekly lane's.
 */

import { describe } from 'vitest';
import { catalogQuery, previewQuery } from '../../../../src/domain/contract/queries.js';
import {
  OK,
  SEEDED_BEFORE_NEW,
  candidateSets,
  chainOf,
  eachStack,
  seed,
  settle,
  sweepGrid,
} from '../../../support/composition-grid.js';

describe('composition grid: greenfield', () => {
  sweepGrid({
    name: 'greenfield',
    here: import.meta.url,
    holds: ['I1', 'I2', 'I3', 'I6'],
    sweep: async (grid) => {
      const catalog = await grid.read(catalogQuery());
      const verticals = catalog.verticals.map((vertical) => vertical.id);
      // Previews write nothing, so one empty directory serves every
      // cell that is not about what the directory already holds.
      const empty = await grid.scratch();

      await eachStack(catalog.stacks, async ({ id: stack }) => {
        const { target, offered } = await settle(grid, stack);
        const preview = (extras: readonly string[]) =>
          grid.cell(
            `new:${stack}+${extras.join(',')}`,
            previewQuery({
              cwd: empty,
              target: { ...target, extraVerticals: extras },
              answers: {},
            }),
          );

        for (const vertical of verticals) await preview([vertical]);

        for (const vertical of verticals) {
          const cell = `new:${stack}+${vertical}`;
          if (offered.has(vertical)) {
            const chain = chainOf(grid.registry, vertical, offered);
            if ((await preview(chain)).verdict !== OK) grid.violate('I2', cell);
            continue;
          }
          for (const extras of candidateSets(grid.registry, vertical, offered)) {
            if ((await preview(extras)).verdict !== OK) continue;
            grid.violate('I3', cell);
            break;
          }
        }

        for (const file of SEEDED_BEFORE_NEW) {
          const cwd = await grid.scratch();
          await seed(cwd, file);
          await grid.cell(`new:${stack}@${file}`, previewQuery({ cwd, target, answers: {} }));
        }
      });
    },
  });
});
