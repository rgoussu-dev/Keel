/**
 * The composition grid's composite axis: every product preset,
 * scaffolded under every repository layout its install offers, then
 * `keel add` previewed for every vertical at the product root and in
 * each service directory.
 *
 * The layouts are read from the product's own preview — the question
 * bound to the layout, and its choices — so a third layout joins the
 * sweep the day the install asks about it. The services are the
 * catalog's.
 *
 * What it holds, each against `keel.preview`:
 *
 *   - **Nothing throws** (I1). Under the monorepo layout the root
 *     writes each service's image files without telling the service,
 *     which is where a collision surfaces as a crash.
 *   - **A card says what the click will do** (I4), at the root and in
 *     every service that is a keel project: every vertical is
 *     installed there or a `keel.project-status` card, and the card
 *     agrees with the preview of its add — `ready` Ok, `needs` Ok with
 *     its prerequisites in the plan, a refusal the add's own, code and
 *     sentence. A polyrepo product's root is no project at all, and
 *     shows no cards.
 *
 * Holds I6 over every refusal on the way. I7 — every service cell Ok
 * or a scope-aware refusal — reads these same cells, and lands with
 * the step that makes it true.
 */

import path from 'node:path';
import { describe } from 'vitest';
import { installCommandFor } from '../../../../src/domain/contract/commands.js';
import type { RepoLayout } from '../../../../src/domain/contract/commands.js';
import {
  catalogQuery,
  previewQuery,
  projectStatusQuery,
} from '../../../../src/domain/contract/queries.js';
import {
  OK,
  eachStack,
  holdCard,
  settle,
  sweepGrid,
  type Grid,
} from '../../../support/composition-grid.js';

describe('composition grid: composite', () => {
  sweepGrid({
    name: 'composite',
    here: import.meta.url,
    holds: ['I1', 'I4', 'I6'],
    sweep: async (grid) => {
      const catalog = await grid.read(catalogQuery());
      const verticals = catalog.verticals.map((vertical) => vertical.id);
      const products = catalog.stacks.filter((stack) => stack.services.length > 0);
      await eachStack(products, async ({ id: stack, services }) => {
        for (const layout of await layoutsOf(grid, stack)) {
          const product = `${stack}/${layout}`;
          const cwd = await grid.scratch();
          const { target } = await settle(grid, stack, { layout });
          const run = { cwd, answers: {}, interactive: false, dryRun: false };
          const scaffold = await grid.cell(`new:${product}`, installCommandFor(target, run));
          if (scaffold.verdict !== OK) continue;

          const scopes = [
            { scope: product, dir: cwd },
            ...services.map((s) => ({
              scope: `${product}/${s.path}`,
              dir: path.join(cwd, s.path),
            })),
          ];
          for (const { scope, dir } of scopes) {
            const status = await grid.read(projectStatusQuery({ cwd: dir }));
            for (const vertical of verticals) {
              const cell = `add:${scope}+${vertical}`;
              const outcome = await grid.cell(
                cell,
                previewQuery({
                  cwd: dir,
                  target: { kind: 'add-vertical', verticals: [vertical] },
                  answers: {},
                }),
              );
              if (status.initialised) await holdCard(grid, cell, status, vertical, dir, outcome);
            }
          }
        }
      });
    },
  });
});

/**
 * The repository layouts a product's install offers: the choices of
 * the question its preview binds to the layout, asked because the
 * target leaves it unset.
 */
async function layoutsOf(grid: Grid, stack: string): Promise<readonly RepoLayout[]> {
  const preview = await grid.read(
    previewQuery({
      cwd: await grid.scratch(),
      target: { kind: 'new-project', stack },
      answers: {},
    }),
  );
  const question = preview.questions.find((q) => q.binding.kind === 'layout');
  if (question?.choices === undefined) throw new Error(`'${stack}' asks no repository layout`);
  return question.choices.map((choice) => choice.value as RepoLayout);
}
