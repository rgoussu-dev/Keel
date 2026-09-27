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
 *     installed there, provided (a monorepo service's version control
 *     and image, from the product; at a monorepo root, what its
 *     services have — the add is an Ok that stages nothing, and says
 *     so), or a `keel.project-status` card, and the card agrees with
 *     the preview of its add — `ready` Ok, `needs` Ok with its
 *     prerequisites in the plan, a refusal the add's own, code,
 *     sentence and data — the action it names included. And at the
 *     root, both phases read one answer: what `keel.dials` shows as
 *     coming with the product under that layout — its own verticals,
 *     and what `keel new --with` sets aside as already in its
 *     services — is exactly what `keel add` at the root answers with
 *     an Ok that stages and runs nothing. A polyrepo product's root is
 *     no project at all, and shows no cards.
 *   - **A service cell is Ok or refused for its scope** (I7): never
 *     a file in the way, and — where the same service under the
 *     polyrepo layout, a repository of its own, is Ok — Ok or
 *     `keel.wrong-scope` under the monorepo one, where it is a
 *     directory of the product's repository: what the product root
 *     builds for it reads as there already, and what only a
 *     repository root reads (a pipeline, a release) as not for it.
 *
 * And before anything is scaffolded, each service's own extras menu —
 * what `keel new --with <path>:<id>` takes, as `keel.dials` reads it
 * per service — against the preview of the product naming it there:
 *
 *   - **Offered ⇒ Ok** (I2): every vertical a service's menu offers,
 *     named with what it needs first, previews Ok.
 *   - **Accepted ⇒ offered** (I3): a vertical the menu has as neither
 *     offered nor the service's own previews as refused — an
 *     `unavailable` entry is one no set of prerequisites makes
 *     installable, so naming it alone is the whole question.
 *   - **Refused for its scope, never for a file** (I7), as a service's
 *     add is: Ok or `keel.wrong-scope` under the monorepo layout
 *     wherever the polyrepo twin is Ok.
 *
 * Holds I6 over every refusal on the way.
 */

import path from 'node:path';
import { describe } from 'vitest';
import {
  installCommandFor,
  type NewProjectTarget,
  type RepoLayout,
} from '../../../../src/domain/contract/commands.js';
import {
  catalogQuery,
  dialsQuery,
  previewQuery,
  projectStatusQuery,
  type DialOptions,
  type InstallPreview,
} from '../../../../src/domain/contract/queries.js';
import { WRONG_SCOPE_CODE } from '../../../../src/domain/core/refusals.js';
import {
  FILE_REFUSALS,
  OK,
  eachStack,
  holdCard,
  layoutsOf,
  settle,
  sweepGrid,
  type Grid,
  type Outcome,
} from '../../../support/composition-grid.js';

describe('composition grid: composite', () => {
  sweepGrid({
    name: 'composite',
    here: import.meta.url,
    holds: ['I1', 'I2', 'I3', 'I4', 'I6', 'I7'],
    sweep: async (grid) => {
      const catalog = await grid.read(catalogQuery());
      const verticals = catalog.verticals.map((vertical) => vertical.id);
      const products = catalog.stacks.filter((stack) => stack.services.length > 0);
      await eachStack(products, async ({ id: stack, services }) => {
        // Each service cell's verdict, by `<layout>/<service>+<vertical>`,
        // for I7's comparison of a layout against the polyrepo one.
        const served = new Map<string, string>();
        // The same, for each service's extras as `keel new` names them.
        const named = new Map<string, string>();
        const layouts = await layoutsOf(grid, stack);
        if (layouts.length === 0) throw new Error(`'${stack}' asks no repository layout`);
        for (const layout of layouts) {
          const product = `${stack}/${layout}`;
          for (const [key, cell] of await holdServiceMenus(grid, product, stack, layout)) {
            named.set(`${layout}/${key}`, cell);
          }
          const cwd = await grid.scratch();
          const { target, included } = await settle(grid, stack, { layout });
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
              if (status.initialised && scope === product) {
                holdThereAlready(grid, cell, included.has(vertical), outcome);
              }
              if (scope !== product) {
                served.set(`${layout}/${scope.slice(product.length + 1)}+${vertical}`, cell);
              }
            }
          }
        }
        holdScopes(grid, stack, served);
        holdScopes(grid, stack, named);
      });
    },
  });
});

/**
 * Holds a product root's add of a vertical to what `keel new --with` on
 * the product makes of it (I4 at the root): `included` — the product's
 * own, or set aside because the services that could have it have it —
 * exactly where the add is an Ok that stages nothing and runs nothing.
 * One reading in both phases, so a `--with` list that runs on the
 * product and `keel add` of it at the root cannot tell a fact apart.
 */
function holdThereAlready(
  grid: Grid,
  cell: string,
  included: boolean,
  outcome: Outcome<InstallPreview>,
): void {
  const nothing =
    outcome.verdict === OK &&
    outcome.value !== null &&
    outcome.value.changes.length === 0 &&
    outcome.value.actions.length === 0;
  if (nothing !== included) grid.violate('I4', cell);
}

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
 * Holds each service's extras menu on `stack` under `layout` to the
 * preview of the product naming the vertical for that service (I2,
 * I3): an offered one, named after what it needs, is Ok; one neither
 * offered nor the service's own is not. `product` names the cells,
 * `new:<product>/<service>+<vertical>`; they are returned keyed
 * `<service>+<vertical>`, for {@link holdScopes}.
 */
async function holdServiceMenus(
  grid: Grid,
  product: string,
  stack: string,
  layout: RepoLayout,
): Promise<ReadonlyMap<string, string>> {
  const swept = new Map<string, string>();
  const dials: DialOptions = await grid.read(
    dialsQuery({ target: { kind: 'new-project', stack, layout } }),
  );
  const cwd = await grid.scratch();
  for (const service of dials.services) {
    for (const vertical of service.verticals) {
      if (vertical.readiness === 'included') continue;
      const offered = vertical.readiness === 'ready' || vertical.readiness === 'needs';
      const cell = `new:${product}/${service.path}+${vertical.id}`;
      const outcome = await grid.cell(
        cell,
        previewQuery({
          cwd,
          target: {
            ...(dials.target as NewProjectTarget),
            services: {
              [service.path]: {
                extraVerticals: offered ? [...vertical.requires, vertical.id] : [vertical.id],
              },
            },
          },
          answers: {},
        }),
      );
      swept.set(`${service.path}+${vertical.id}`, cell);
      if (offered && outcome.verdict !== OK) grid.violate('I2', cell);
      if (!offered && outcome.verdict === OK) grid.violate('I3', cell);
    }
  }
  return swept;
}
