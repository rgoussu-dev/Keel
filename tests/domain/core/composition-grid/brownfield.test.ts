/**
 * The composition grid's brownfield axis: every single-service stack
 * scaffolded once, then `keel add` previewed for every vertical in the
 * catalog — on the pristine scaffold, and again where the user already
 * keeps a file the add would write — and the other install targets a
 * project on disk takes (`keel add entrypoint` is growth's), each
 * previewed as it installs.
 *
 * What it holds, each against `keel.preview`:
 *
 *   - **Nothing throws** (I1), including the seeded cells: a user's
 *     own `Dockerfile` or `.github/workflows/ci.yml`, seeded only
 *     beside a vertical whose pristine preview creates that path — a
 *     vertical that never writes a path cannot collide with it.
 *   - **A card says what the click will do** (I4): every vertical is
 *     installed or a `keel.project-status` card, and each card agrees
 *     with the preview of its add — `ready` previews Ok, `needs`
 *     previews Ok with the prerequisites it names in the plan, and a
 *     refusal shown on the card is the one the add gives, code,
 *     sentence and data — the action it names included. The card is
 *     read before the click; the preview is the click.
 *   - **Both phases agree** (I5): `keel add v` on a fresh scaffold
 *     reaches the same outcome as `keel new --with v` on the same
 *     stack — Ok on both sides, or refused on both under one code and
 *     in one sentence, word for word. Where the greenfield golden
 *     (which the greenfield suite pins to its own sweep) records Ok
 *     and so does the add, that is the whole answer; wherever either
 *     side refuses, the greenfield twin is previewed again here, into
 *     an empty directory, for its sentence.
 *   - **Every install target previews as it installs** (I9), on the
 *     scaffold: the same bytes, or the same refusal — each vertical's
 *     add (`add:<stack>+<v>`, beside the dry-run install
 *     `install:<stack>+<v>`), `keel add v --reapply` of each installed
 *     vertical (`reapply:`), `--refresh v` of each beside the add of
 *     the first `ready` card (`refresh:<stack>+<card>~<v>`), and, on a
 *     modulith scaffold of the preset where `keel.dials` offers one,
 *     `keel add module orders` (`module:<stack>`).
 *   - **The recorded composition is a fixed point** (I11): the
 *     scaffold's whole re-render — one `--reapply` naming every
 *     recorded vertical `keel add` can name — re-renders each and
 *     stages nothing (`fixed:<stack>`), and so does the modulith
 *     scaffold's, before any context is added to it
 *     (`fixed:<stack>/modulith`); and each `reapply:` and `refresh:`
 *     pair above installs Ok, re-rendering the vertical it names.
 *
 * Holds I6 over every refusal on the way.
 */

import { describe } from 'vitest';
import {
  installCommandFor,
  type AddVerticalTarget,
} from '../../../../src/domain/contract/commands.js';
import {
  catalogQuery,
  previewQuery,
  projectStatusQuery,
} from '../../../../src/domain/contract/queries.js';
import {
  OK,
  SEEDED_BEFORE_ADD,
  eachStack,
  goldenOf,
  holdCard,
  holdFixedPoint,
  holdParity,
  holdRerenders,
  nameableOf,
  runIn,
  seed,
  settle,
  sweepGrid,
  type Grid,
} from '../../../support/composition-grid.js';

const greenfield = goldenOf('greenfield', import.meta.url);

describe('composition grid: brownfield', () => {
  sweepGrid({
    name: 'brownfield',
    here: import.meta.url,
    holds: ['I1', 'I4', 'I5', 'I6', 'I9', 'I11'],
    sweep: async (grid) => {
      const catalog = await grid.read(catalogQuery());
      const verticals = catalog.verticals.map((vertical) => vertical.id);
      const single = catalog.stacks.filter((stack) => stack.services.length === 0);
      // The greenfield twins preview into it, and a preview writes nothing.
      const empty = await grid.scratch();
      await eachStack(single, async ({ id: stack }) => {
        const cwd = await grid.scratch();
        const { target } = await settle(grid, stack);
        const scaffold = await grid.cell(`new:${stack}`, installCommandFor(target, runIn(cwd)));
        if (scaffold.verdict !== OK) return;

        const status = await grid.read(projectStatusQuery({ cwd }));
        for (const vertical of verticals) {
          const cell = `add:${stack}+${vertical}`;
          const adding: AddVerticalTarget = { kind: 'add-vertical', verticals: [vertical] };
          const install = `install:${stack}+${vertical}`;
          await holdParity(grid, { preview: cell, install }, adding, {}, cwd);
          const add = previewQuery({ cwd, target: adding, answers: {} });
          // Answered from the record: holdParity swept it.
          const outcome = await grid.cell(cell, add);
          await holdCard(grid, cell, status, vertical, cwd, outcome);
          const twin = greenfield[`new:${stack}+${vertical}`];
          if (twin !== undefined && (twin !== OK || outcome.verdict !== OK)) {
            const mirrored = await grid.twin(
              previewQuery({
                cwd: empty,
                target: { ...target, extraVerticals: [vertical] },
                answers: {},
              }),
            );
            if (mirrored.verdict !== outcome.verdict || mirrored.message !== outcome.message) {
              grid.violate('I5', cell);
            }
          }

          const created = new Set(
            (outcome.value?.changes ?? []).filter((c) => c.kind === 'create').map((c) => c.path),
          );
          for (const file of SEEDED_BEFORE_ADD.filter((f) => created.has(f))) {
            const unseed = await seed(cwd, file);
            await grid.cell(`${cell}@${file}`, add);
            await unseed();
          }
        }
        await holdRerenders(grid, stack, status, verticals, cwd);
        await holdModulith(grid, stack, verticals);
      });
    },
  });
});

/**
 * Holds a modulith scaffold of `stack` — its opening dials with the
 * modulith layout set, as `keel.dials` settles them — where those dials
 * offer the modulith: to I11, as the cell `fixed:<stack>/modulith`,
 * whose whole re-render names what `keel add` can name of it
 * ({@link nameableOf} over `catalog`); and, where its status says the
 * command takes a context, `keel add module orders` to I9, as the cell
 * `module:<stack>`. The scaffold is the cells' setting, not a cell: it
 * adds no verdict.
 */
async function holdModulith(grid: Grid, stack: string, catalog: readonly string[]): Promise<void> {
  const { target } = await settle(grid, stack, { moduleLayout: 'modulith' });
  if (target.moduleLayout !== 'modulith') return;
  const cwd = await grid.scratch();
  await grid.read(installCommandFor(target, runIn(cwd)));
  const status = await grid.read(projectStatusQuery({ cwd }));
  await holdFixedPoint(grid, `fixed:${stack}/modulith`, nameableOf(status, catalog), cwd);
  if (!status.canAddModule) return;
  await holdParity(grid, `module:${stack}`, { kind: 'add-module', module: 'orders' }, {}, cwd);
}
