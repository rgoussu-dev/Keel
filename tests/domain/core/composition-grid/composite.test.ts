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
 *     writes each service's image files, which is where a collision
 *     used to surface as a crash.
 *   - **A card says what the click will do** (I4), at the root and in
 *     every service that is a keel project: every vertical is
 *     installed there, given by the product (a monorepo service's
 *     version control and image — the add is an Ok that stages
 *     nothing, and says so), or a `keel.project-status` card, and the
 *     card agrees with the preview of its add — `ready` Ok, `needs` Ok
 *     with its prerequisites in the plan, a refusal the add's own,
 *     code and sentence. A polyrepo product's root is no project at
 *     all, and shows no cards.
 *   - **A service cell is Ok or refused for its scope** (I7): never
 *     a file in the way, and — where the same service under the
 *     polyrepo layout, a repository of its own, is Ok — Ok or
 *     `keel.wrong-scope` under the monorepo one, where it is a
 *     directory of the product's repository: what the product root
 *     builds for it reads as there already, and what only a
 *     repository root reads (a pipeline, a release) as not for it.
 *
 * Holds I6 over every refusal on the way.
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
import { WRONG_SCOPE_CODE } from '../../../../src/domain/core/refusals.js';
import {
  FILE_REFUSALS,
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
    holds: ['I1', 'I4', 'I6', 'I7'],
    sweep: async (grid) => {
      const catalog = await grid.read(catalogQuery());
      const verticals = catalog.verticals.map((vertical) => vertical.id);
      const products = catalog.stacks.filter((stack) => stack.services.length > 0);
      await eachStack(products, async ({ id: stack, services }) => {
        // Each service cell's verdict, by `<layout>/<service>+<vertical>`,
        // for I7's comparison of a layout against the polyrepo one.
        const served = new Map<string, string>();
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
              if (scope !== product) {
                served.set(`${layout}/${scope.slice(product.length + 1)}+${vertical}`, cell);
              }
            }
          }
        }
        holdScopes(grid, stack, served);
      });
    },
  });
});

/**
 * Holds one product's service cells to I7: none refused for a file in
 * the way, and each that is Ok where the service is a repository of its
 * own (the polyrepo layout) Ok or `keel.wrong-scope` under any other —
 * the only thing another layout changes about a service is where it
 * stands in the repository. `served` maps `<layout>/<service>+<vertical>`
 * to the cell id swept for it.
 */
function holdScopes(grid: Grid, stack: string, served: ReadonlyMap<string, string>): void {
  const verdicts = grid.verdicts();
  for (const [key, cell] of served) {
    const verdict = verdicts[cell] ?? '';
    if (FILE_REFUSALS.includes(verdict)) {
      grid.violate('I7', cell);
      continue;
    }
    const [layout, rest] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];
    if (layout === 'polyrepo') continue;
    const twin = served.get(`polyrepo/${rest}`);
    if (twin === undefined) {
      throw new Error(`'${stack}' has no polyrepo twin of '${cell}' to hold it to`);
    }
    if (verdicts[twin] === OK && verdict !== OK && verdict !== WRONG_SCOPE_CODE) {
      grid.violate('I7', cell);
    }
  }
}

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
