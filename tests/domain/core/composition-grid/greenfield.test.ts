/**
 * The composition grid's greenfield axis: `keel new`, previewed for
 * every stack in the catalog with each vertical as its one extra,
 * against the extras menu `keel.dials` shows for it, and into a
 * directory already holding a user's file. The preset alone is not a
 * cell here: the brownfield and composite axes scaffold every one.
 *
 * Each question is answered by the engine and nothing else —
 * `keel.preview`, and for I9 the install beside it:
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
 *     the CLI accepts what the page cannot build. What the preset
 *     comes with is shown beside the menu, and naming it adds nothing
 *     — `--with` drops it with a note — so no set is out of reach for
 *     naming it.
 *   - **Does the order extras are named in change what is written?**
 *     (I8) Every permutation of each set whose order could matter
 *     ({@link orderSensitiveSets}: a vertical that reads another, with
 *     the chains of both) previews to the same verdict and stages the
 *     same bytes, file for file — and so does the whole menu, named
 *     forwards and backwards, which turns every pair of it round: two
 *     verticals nothing ties together can still write one file (the
 *     toolchain and persistence README sections), in the order they
 *     run. The page names extras in menu order and the command line in
 *     whatever order it was typed; neither may cost a `DB_URL`, or move
 *     a line.
 *   - **Does a preview plan what the install then writes?** (I9) One
 *     body — the preset with its whole menu, and its answers — sent
 *     to a preview and to a dry-run install stages the same bytes, or
 *     is refused by both in one sentence, the preview reporting the
 *     answer the install refuses ({@link answerBodies}: none, each
 *     question answered away from its default, the same keyed to a
 *     sibling the asker borrows from, and one question answered
 *     twice).
 *
 * Holds I6 over every refusal on the way. The menu read is each
 * stack's default dial setting; the others are the weekly lane's.
 */

import { describe } from 'vitest';
import { catalogQuery, previewQuery } from '../../../../src/domain/contract/queries.js';
import {
  OK,
  SEEDED_BEFORE_NEW,
  answerBodies,
  candidateSets,
  chainOf,
  eachStack,
  holdParity,
  orderSensitiveSets,
  permutations,
  seed,
  settle,
  sweepGrid,
} from '../../../support/composition-grid.js';

describe('composition grid: greenfield', () => {
  sweepGrid({
    name: 'greenfield',
    here: import.meta.url,
    holds: ['I1', 'I2', 'I3', 'I6', 'I8', 'I9'],
    sweep: async (grid) => {
      const catalog = await grid.read(catalogQuery());
      const verticals = catalog.verticals.map((vertical) => vertical.id);
      // Previews write nothing, so one empty directory serves every
      // cell that is not about what the directory already holds.
      const empty = await grid.scratch();

      await eachStack(catalog.stacks, async ({ id: stack }) => {
        const { target, offered, included } = await settle(grid, stack);
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
          if (included.has(vertical)) continue;
          for (const extras of candidateSets(grid.registry, vertical, offered)) {
            if ((await preview(extras)).verdict !== OK) continue;
            grid.violate('I3', cell);
            break;
          }
        }

        // Previews write nothing, but each stages into Trees rooted
        // here, which is how their bytes are read back.
        const ordered = await grid.scratch();
        const menu = [...offered];
        const orderings = [
          ...orderSensitiveSets(grid.registry, offered).map(permutations),
          ...(menu.length > 1 ? [[menu, [...menu].reverse()]] : []),
        ];
        for (const orders of orderings) {
          let first: string | undefined;
          for (const extras of orders) {
            const cell = `order:${stack}+${extras.join(',')}`;
            const staged = await grid.staged(
              cell,
              previewQuery({
                cwd: ordered,
                target: { ...target, extraVerticals: extras },
                answers: {},
              }),
              ordered,
            );
            const written = JSON.stringify(staged);
            first ??= written;
            if (written !== first) grid.violate('I8', cell);
          }
        }

        // One body, previewed and installed as a dry run: the preset
        // with its whole menu, so every adapter that asks is asked.
        const whole = { ...target, extraVerticals: menu };
        const asked = await grid.read(previewQuery({ cwd: empty, target: whole, answers: {} }));
        for (const body of answerBodies(grid.registry, asked.questions)) {
          await holdParity(grid, `answers:${stack}#${body.name}`, whole, body.answers);
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
