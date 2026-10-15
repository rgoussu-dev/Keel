/**
 * The consumer for **keel's generated documentation**.
 *
 * Five tables in three files are projections, not prose: the verticals
 * compatibility matrix is the composition grid's verdicts; the stack
 * matrix, in `README.md` and in the stack catalog, is the presets the
 * finder places and their tier by default; the catalog's defaults
 * table is what each preset installs; and its support tiers are how far
 * keel vouches for each setting. The ones written by hand rotted the
 * way an index nobody checks does — the matrix kept offering
 * `distribution` in a monorepo service the grid refuses it in, the
 * defaults table never learnt about `agent-harness` or `code-style`,
 * and the two stack matrices drifted apart. So
 * `tests/support/generated-docs.ts` renders them all, and this suite
 * fails when regenerating would change a committed file,
 * the way `prettier --check` fails on a file `prettier --write` would
 * touch: a grid golden that moves is a document that moves, in the
 * same commit.
 *
 * `KEEL_UPDATE_GOLDEN=1` — the grid's own switch — rewrites each
 * region instead. The regions read the goldens as committed, so when a
 * change moves verdicts, regenerate the grid first
 * (`tests/AGENTS.md` → The composition grid), then this.
 *
 * The renderers' own rules — how a split cell names what disagrees, a
 * vertical the catalog table does not place, a verdict that
 * contradicts what the scope comes with, a platform with no label, a
 * page that does not exist, two presets in one cell, a preset with no
 * default tier, a product built on another backend than its row's, a
 * cell's suite, a first-class cell with a proof it cannot name — are
 * held below over small made-up grids, so a regenerated table is not
 * the only witness.
 */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { installMediator } from './support/factory.js';
import {
  BEST_EFFORT,
  GENERATED,
  REGENERATE,
  REPO_ROOT,
  catalogOrder,
  docFacts,
  regenerated,
  renderDefaults,
  renderMatrix,
  renderStackMatrix,
  renderSupportTiers,
  spliceRegion,
  type DocFacts,
  type ProductFacts,
  type ProductTierFacts,
  type SingleTierFacts,
  type StackFacts,
  type TierFacts,
} from './support/generated-docs.js';

/** Regeneration switch, shared with the grid's goldens. */
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

describe('the generated documentation', () => {
  let facts: DocFacts;

  beforeAll(async () => {
    facts = await docFacts(installMediator());
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

describe('the stack matrix renderer', () => {
  const links = { pages: 'docs/stacks/', tiers: '#support-tiers' };
  const labels = {
    'go/': { name: 'Go', page: 'go.md' },
    'rust/': { name: 'Rust', page: 'rust.md' },
  };
  /** Go with a CLI, an HTTP server and its product; Rust with a CLI alone. */
  const tiers = (defaults: TierFacts['defaults'] = {}): TierFacts => ({
    platforms: [
      {
        key: 'go/',
        presets: [
          { entrypoints: ['cli'], stack: 'go-cli', product: false },
          { entrypoints: ['server-http'], stack: 'go-http', product: false },
          { entrypoints: ['server-http', 'spa'], stack: 'fullstack-go', product: true },
        ],
      },
      { key: 'rust/', presets: [{ entrypoints: ['cli'], stack: 'rust-cli', product: false }] },
    ],
    defaults: {
      'go-cli': 'first-class',
      'go-http': 'first-class',
      'fullstack-go': 'first-class',
      'rust-cli': 'first-class',
      ...defaults,
    },
    singles: [],
    products: [],
  });
  const facts = (
    tierFacts: TierFacts,
    stacks = [stack('go-http', ['server-http']), stack('web', ['spa'])],
  ) => ({
    stacks,
    products: [
      {
        id: 'fullstack-go',
        installs: [],
        services: [
          { path: 'backend', stack: 'go-http', extras: [] },
          { path: 'frontend', stack: 'web', extras: [] },
        ],
        layouts: [],
      },
    ],
    tiers: tierFacts,
  });

  it('gives a row per platform, marks a preset best-effort by default, and dashes what is not generated', () => {
    const matrix = renderStackMatrix(facts(tiers({ 'go-http': 'best-effort' })), links, labels);
    expect(matrix).toContain('| Language / framework | CLI | HTTP server | Product, HTTP server |');
    expect(matrix).toContain(
      '| **Go** ([docs](docs/stacks/go.md)) | `go-cli` | `go-http` ◻ | `fullstack-go` |',
    );
    expect(matrix).toContain('| **Rust** ([docs](docs/stacks/rust.md)) | `rust-cli` | — | — |');
    expect(matrix).toContain(
      "A product column's preset pairs the row's preset for that column's entrypoints, in `backend/`, with `web` in `frontend/`.",
    );
  });

  it('refuses a platform with no label, and a label that reaches no preset', () => {
    expect(() => renderStackMatrix(facts(tiers()), links, { 'go/': labels['go/'] })).toThrow(
      /no label for `rust\/`/,
    );
    expect(() =>
      renderStackMatrix(facts(tiers()), links, {
        ...labels,
        'zig/': { name: 'Zig', page: 'go.md' },
      }),
    ).toThrow(/names `zig\/`, which reaches no preset/);
  });

  it('refuses a page that does not exist, and two presets in one cell', () => {
    expect(() =>
      renderStackMatrix(facts(tiers()), links, {
        ...labels,
        'rust/': { name: 'Rust', page: 'nowhere.md' },
      }),
    ).toThrow(/docs\/stacks\/nowhere.md does not exist/);
    const twins = tiers({ 'go-cli-too': 'first-class' });
    const crowded: TierFacts = {
      ...twins,
      platforms: twins.platforms.map((platform) =>
        platform.key === 'go/'
          ? {
              ...platform,
              presets: [
                ...platform.presets,
                { entrypoints: ['cli'], stack: 'go-cli-too', product: false },
              ],
            }
          : platform,
      ),
    };
    expect(() => renderStackMatrix(facts(crowded), links, labels)).toThrow(
      /`go-cli` and `go-cli-too` share a cell/,
    );
  });

  it('refuses a placed preset with no default tier', () => {
    const { 'rust-cli': _dropped, ...defaults } = tiers().defaults;
    expect(() => renderStackMatrix(facts({ ...tiers(), defaults }), links, labels)).toThrow(
      /`rust-cli` has no default tier/,
    );
  });

  it('refuses a product service whose preset is not among the stacks', () => {
    expect(() =>
      renderStackMatrix(facts(tiers(), [stack('go-http', ['server-http'])]), links, labels),
    ).toThrow(/'web' is no single-service preset/);
  });

  it("refuses a product whose backend is not its row's preset at those entrypoints", () => {
    const placed = facts(tiers(), [
      stack('go-http', ['server-http']),
      stack('java-http', ['server-http']),
      stack('web', ['spa']),
    ]);
    const elsewhere = {
      ...placed,
      products: placed.products.map((product) => ({
        ...product,
        services: [
          { path: 'backend', stack: 'java-http', extras: [] },
          { path: 'frontend', stack: 'web', extras: [] },
        ],
      })),
    };
    expect(() => renderStackMatrix(elsewhere, links, labels)).toThrow(
      /Go: `fullstack-go` builds `backend\/` on `java-http`, but the row places `go-http` at HTTP server/,
    );
  });
});

describe('the support tiers renderer', () => {
  const single = (
    moduleLayout: string,
    peerContext: boolean,
    proof: string | null,
    variants: readonly string[] = [],
  ): SingleTierFacts => ({
    cell: {
      kind: 'single',
      stack: 'go-cli',
      buildSystem: null,
      moduleLayout,
      peerContext,
      agentHarness: true,
    },
    support:
      proof === null
        ? { tier: 'best-effort', proof: null, unbuilt: [] }
        : { tier: 'first-class', proof: { by: 'suite', suite: proof }, unbuilt: [] },
    variants,
  });
  const product: ProductTierFacts = {
    cell: {
      kind: 'product',
      stack: 'fullstack-go',
      layout: 'monorepo',
      buildSystem: 'frontend=npm',
    },
    support: {
      tier: 'best-effort',
      proof: { by: 'services', suites: { backend: 'fullstack-go' } },
      unbuilt: ['frontend'],
    },
    services: ['backend', 'frontend'],
  };
  const tiers = renderSupportTiers({
    platforms: [],
    defaults: {},
    singles: [
      single('basic', false, 'walking-skeleton-go'),
      single('modulith', false, null, ['add-module-go']),
    ],
    products: [product],
  });

  it('names the suite of a first-class cell, and the variant beside a best-effort one', () => {
    expect(tiers).toContain('| Preset | Build system | `basic` | `modulith` |');
    expect(tiers).toContain('| `go-cli` | — | ✅ `walking-skeleton-go` | ◻ `add-module-go` |');
  });

  it("names what proves each of a product's services", () => {
    expect(tiers).toContain(
      '| `fullstack-go` ◻ | monorepo | `frontend=npm` | ✅ `fullstack-go` | ◻ |',
    );
  });

  it('refuses two cells of one preset and build system in one layout', () => {
    expect(() =>
      renderSupportTiers({
        platforms: [],
        defaults: {},
        singles: [single('basic', false, 'walking-skeleton-go'), single('basic', false, null)],
        products: [],
      }),
    ).toThrow(/`go-cli`: two cells share `basic`/);
  });

  it('refuses a first-class cell whose proof it cannot name', () => {
    const twin: SingleTierFacts = {
      ...single('basic', false, null),
      support: {
        tier: 'first-class',
        proof: { by: 'harness-twin', suite: 'walking-skeleton-go' },
        unbuilt: [],
      },
    };
    expect(() =>
      renderSupportTiers({ platforms: [], defaults: {}, singles: [twin], products: [] }),
    ).toThrow(/first-class by harness-twin, which the table cannot name/);
    const unproven: ProductTierFacts = {
      ...product,
      support: { tier: 'first-class', proof: null, unbuilt: [] },
    };
    expect(() =>
      renderSupportTiers({ platforms: [], defaults: {}, singles: [], products: [unproven] }),
    ).toThrow(/`fullstack-go`, monorepo: first-class by nothing/);
  });

  it('defines best-effort in the same words in the prose and in both committed legends', () => {
    const read = (...file: string[]): string =>
      fs.readFileSync(path.join(REPO_ROOT, ...file), 'utf8').replace(/\s+/g, ' ');
    const catalog = read('docs', 'stacks', 'README.md');
    expect(catalog).toContain(`- **best-effort**: ${BEST_EFFORT}.`);
    expect(catalog).toContain(`◻ best-effort: ${BEST_EFFORT};`);
    expect(catalog).toContain(
      `◻ best-effort on its default setting ([support tiers](#support-tiers)): ${BEST_EFFORT} ·`,
    );
    expect(read('README.md')).toContain(
      `◻ best-effort on its default setting ([support tiers](docs/stacks/README.md#support-tiers)): ${BEST_EFFORT} ·`,
    );
  });
});

describe('a region', () => {
  const document =
    'before\n<!-- generated:x:begin -->\nthe old body\n<!-- generated:x:end -->\nafter\n';

  it('is replaced between its sentinels, and nothing around it moves', () => {
    const spliced = spliceRegion(document, 'x', 'new', 'the facts');
    expect(spliced.startsWith('before\n<!-- generated:x:begin -->\n')).toBe(true);
    expect(spliced.endsWith('\nnew\n\n<!-- generated:x:end -->\nafter\n')).toBe(true);
    expect(spliced).toContain('generated-docs.ts from the facts: edit the generator');
    expect(spliced).not.toContain('the old body');
  });

  it('must be there exactly once', () => {
    expect(() => spliceRegion('no region here', 'x', 'new', 'the facts')).toThrow(/expected one/);
    expect(() => spliceRegion(document + document, 'x', 'new', 'the facts')).toThrow(
      /expected one/,
    );
  });
});
