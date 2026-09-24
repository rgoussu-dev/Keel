/**
 * The consumer for **keel's generated documentation**.
 *
 * Two tables in `docs/` are projections, not prose: the verticals
 * compatibility matrix is the composition grid's verdicts, and the
 * stack catalog's defaults table is what each preset installs. Written
 * by hand they rotted the way an index nobody checks does — the matrix
 * kept offering `distribution` in a monorepo service the grid refuses
 * it in, and the defaults table never learnt about `agent-harness` or
 * `code-style`. So `tests/support/generated-docs.ts` renders them, and
 * this suite fails when regenerating would change a committed file,
 * the way `prettier --check` fails on a file `prettier --write` would
 * touch: a grid golden that moves is a document that moves, in the
 * same commit.
 *
 * `KEEL_UPDATE_GOLDEN=1` — the grid's own switch — rewrites each
 * region instead. The regions read the goldens as committed, so when a
 * change moves verdicts, regenerate the grid first
 * (`tests/AGENTS.md` → The composition grid), then this.
 *
 * The renderer's own rules — how a split cell names what disagrees, a
 * vertical the catalog table does not place, a verdict that
 * contradicts what the scope comes with — are held below over small
 * made-up grids, so a regenerated table is not the only witness.
 */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { installMediator } from './support/factory.js';
import {
  GENERATED,
  REGENERATE,
  REPO_ROOT,
  catalogOrder,
  gridFacts,
  regenerated,
  renderDefaults,
  renderMatrix,
  spliceRegion,
  type GridFacts,
  type ProductFacts,
  type StackFacts,
} from './support/generated-docs.js';

/** Regeneration switch, shared with the grid's goldens. */
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

describe('the generated documentation', () => {
  let facts: GridFacts;

  beforeAll(async () => {
    facts = await gridFacts(installMediator());
  });

  it.each(GENERATED.map((region) => [region.file, region.name, region] as const))(
    '%s: its %s region is what regenerating writes',
    async (file, _name, region) => {
      const absolute = path.join(REPO_ROOT, file);
      const committed = fs.readFileSync(absolute, 'utf8');
      const expected = await regenerated(region, facts, committed);
      if (UPDATE) {
        if (expected !== committed) fs.writeFileSync(absolute, expected);
        return;
      }
      expect(committed, `${file} is out of date — regenerate it: ${REGENERATE}`).toBe(expected);
    },
  );
});

/** A single-service preset of a made-up grid: every vertical Ok, `vcs` included. */
function stack(
  id: string,
  entrypoints: readonly string[],
  verdicts: Readonly<Record<string, string>> = {},
): StackFacts {
  return {
    id,
    entrypoints,
    installs: ['vcs'],
    included: ['vcs'],
    verdicts: { vcs: 'ok', ci: 'ok', ...verdicts },
  };
}

describe('the matrix renderer', () => {
  const order = ['vcs', 'ci'];

  it('gives a column one glyph per vertical where its presets agree', () => {
    const matrix = renderMatrix(
      {
        verticals: order,
        stacks: [stack('a-cli', ['cli']), stack('b-cli', ['cli'])],
        products: [],
      },
      order,
    );
    expect(matrix).toContain('| `vcs` | ● |');
    expect(matrix).toContain('| `ci` | ➕ |');
    expect(matrix).toContain('- **CLI** — `a-cli`, `b-cli`');
  });

  it('names the fewer presets where they disagree, and calls the most common glyph the rest', () => {
    const refused = { ci: 'keel.uncoverable-vertical' };
    const matrix = renderMatrix(
      {
        verticals: order,
        stacks: [
          stack('a-cli', ['cli'], refused),
          stack('b-cli', ['cli']),
          stack('c-cli', ['cli'], refused),
        ],
        products: [],
      },
      order,
    );
    expect(matrix).toContain('| `ci` | ➕ `b-cli` · ⛔ the rest |');
  });

  describe('in a product service', () => {
    const scope = (ci: string) => ({ verdicts: { vcs: 'ok', ci }, included: ['vcs'] });
    /** A product with one service, `api/`, whose `ci` reads `monorepo` and then `polyrepo`. */
    const product = (id: string, monorepo: string, polyrepo: string): ProductFacts => ({
      id,
      installs: ['vcs'],
      services: [{ path: 'api', stack: 'a-http', extras: [] }],
      layouts: [
        { layout: 'monorepo', root: null, services: { api: scope(monorepo) } },
        { layout: 'polyrepo', root: null, services: { api: scope(polyrepo) } },
      ],
    });
    const matrixOf = (...products: ProductFacts[]): string =>
      renderMatrix(
        { verticals: order, stacks: [stack('a-http', ['server-http'])], products },
        order,
      );

    it('names every layout where the layout decides the cell', () => {
      const matrix = matrixOf(
        product('p', 'keel.wrong-scope', 'ok'),
        product('q', 'keel.wrong-scope', 'ok'),
      );
      expect(matrix).toContain('| `ci` | ➕ | ↪ monorepo · ➕ polyrepo |');
      expect(matrix).not.toContain('Product root');
      expect(matrix).toContain(
        '- **Product `api/`** — `p`, `q`, each on `a-http`; under the monorepo and polyrepo layouts',
      );
    });

    it('names the product where the product decides it', () => {
      const refused = 'keel.uncoverable-vertical';
      const matrix = matrixOf(
        product('p', 'ok', 'ok'),
        product('q', refused, refused),
        product('r', 'ok', 'ok'),
      );
      expect(matrix).toContain('| `ci` | ➕ | ⛔ `q` · ➕ the rest |');
    });

    it('names each scope whole where neither decides it alone', () => {
      const refused = 'keel.uncoverable-vertical';
      const matrix = matrixOf(product('p', 'ok', refused), product('q', refused, 'ok'));
      expect(matrix).toContain('| `ci` | ➕ | ⛔ `p` / polyrepo, `q` / monorepo · ➕ the rest |');
    });
  });

  it('shows a refusal it has no glyph for as its code, and says so in the legend', () => {
    const matrix = renderMatrix(
      {
        verticals: order,
        stacks: [stack('a-cli', ['cli'], { ci: 'keel.something-new' })],
        products: [],
      },
      order,
    );
    expect(matrix).toContain('| `ci` | `keel.something-new` |');
    expect(matrix).toContain('refused under the code it shows');
  });

  it('refuses a vertical the catalog table does not place', () => {
    expect(() =>
      renderMatrix({ verticals: order, stacks: [stack('a-cli', ['cli'])], products: [] }, ['vcs']),
    ).toThrow(/no row for `ci`/);
  });

  it('refuses a vertical that comes with a scope whose add is refused', () => {
    const contradicted = stack('a-cli', ['cli'], { vcs: 'keel.uncoverable-vertical' });
    expect(() =>
      renderMatrix({ verticals: order, stacks: [contradicted], products: [] }, order),
    ).toThrow(/a-cli \+ vcs: keel.dials says it comes with the scope/);
  });

  it('reads the row order from the catalog table, links and all', () => {
    expect(catalogOrder('| [`vcs`](vcs.md) | x |\n| `ci` | ● |\n| [`ci`](ci.md) | y |\n')).toEqual([
      'vcs',
      'ci',
    ]);
  });
});

describe('the defaults renderer', () => {
  it('gives presets of one shape that install different lists a row each, naming them', () => {
    const defaults = renderDefaults({
      verticals: ['vcs', 'ci'],
      stacks: [stack('a-cli', ['cli']), { ...stack('b-cli', ['cli']), installs: ['vcs', 'ci'] }],
      products: [],
    });
    expect(defaults).toContain('| CLI (`a-cli`) | [`vcs`](../verticals/vcs.md) |');
    expect(defaults).toContain(
      '| CLI (`b-cli`) | [`vcs`](../verticals/vcs.md) · [`ci`](../verticals/ci.md) |',
    );
  });
});

describe('a region', () => {
  const document =
    'before\n<!-- generated:x:begin -->\nthe old body\n<!-- generated:x:end -->\nafter\n';

  it('is replaced between its sentinels, and nothing around it moves', () => {
    const spliced = spliceRegion(document, 'x', 'new');
    expect(spliced.startsWith('before\n<!-- generated:x:begin -->\n')).toBe(true);
    expect(spliced.endsWith('\nnew\n\n<!-- generated:x:end -->\nafter\n')).toBe(true);
    expect(spliced).not.toContain('the old body');
  });

  it('must be there exactly once', () => {
    expect(() => spliceRegion('no region here', 'x', 'new')).toThrow(/expected one/);
    expect(() => spliceRegion(document + document, 'x', 'new')).toThrow(/expected one/);
  });
});
