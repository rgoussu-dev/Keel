/**
 * The stack table, and what it expands into.
 *
 * `stack-registry.test.ts` holds the shipped table to the registry
 * golden — the whole answer, preset for preset. This suite is about
 * the expansion's own rules, each on a table small enough to read:
 * what a cell takes from its row, its entrypoints and the table; the
 * order presets come out in; the product rule's crossing and naming;
 * and the defects in keel's own file it refuses to expand.
 */

import { describe, expect, it } from 'vitest';
import { expandStackTable } from '../../../src/domain/core/stack-table.js';
import { ENTRYPOINTS } from '../../../src/domain/core/stack-wizard.js';
import stackTable from '../../../src/domain/core/stack-presets.json' with { type: 'json' };

/** A table of `rows`, with the shipped entrypoints and a small `singles`. */
function tableOf(rows: readonly object[], products: readonly object[] = []): object {
  return {
    entrypoints: [
      { word: 'cli', tag: 'arch.cli' },
      { word: 'http', tag: 'arch.server-http', projects: ['peer.api.rest'] },
      { word: 'spa', tag: 'arch.spa', projects: ['peer.ui.spa'] },
    ],
    singles: {
      tags: ['arch.hexagonal'],
      moduleLayouts: ['basic', 'modulith'],
      verticals: ['vcs', { id: 'dev-env', with: 'http' }, 'dev-container'],
    },
    platforms: rows,
    products,
  };
}

const JAVA = {
  id: 'acme-{entrypoints}',
  words: { http: 'rest' },
  tags: ['lang.java', 'runtime.jvm', 'framework.acme'],
  buildSystems: ['gradle', 'maven'],
  cells: { cli: 'Acme CLI.', http: 'Acme REST.', 'cli+http': 'Acme both.' },
};
const KOTLIN = {
  ...JAVA,
  id: 'acme-{entrypoints}-kotlin',
  tags: ['lang.kotlin', 'runtime.jvm', 'framework.acme'],
};
const GO = { id: 'go-{entrypoints}', tags: ['lang.go', 'pkg.go-modules'], cells: { http: 'Go.' } };
const SPA = { id: 'spa', tags: ['lang.typescript', 'runtime.browser'], cells: { spa: 'SPA.' } };
const LIT = {
  id: 'spa-lit',
  tags: ['lang.typescript', 'runtime.browser', 'framework.lit'],
  cells: { spa: 'Lit.' },
};

const ids = (raw: object): readonly string[] =>
  expandStackTable(raw).presets.map((preset) => preset.id);

describe('a cell', () => {
  it("takes its row's tags, the table's, then its entrypoints', its row's build systems and the table's module layouts", () => {
    const [cli, , both] = expandStackTable(tableOf([JAVA])).presets;
    expect(cli).toEqual({
      id: 'acme-cli',
      description: 'Acme CLI.',
      tags: ['lang.java', 'runtime.jvm', 'framework.acme', 'arch.hexagonal', 'arch.cli'],
      buildSystems: ['gradle', 'maven'],
      moduleLayouts: ['basic', 'modulith'],
      verticals: ['vcs', 'dev-container'],
    });
    expect(both?.tags.slice(-2)).toEqual(['arch.cli', 'arch.server-http']);
  });

  it('installs a vertical written `with` an entrypoint only where it has one, in place', () => {
    const [cli, http] = expandStackTable(tableOf([JAVA])).presets;
    expect(cli?.verticals).toEqual(['vcs', 'dev-container']);
    expect(http?.verticals).toEqual(['vcs', 'dev-env', 'dev-container']);
  });

  it("projects its entrypoints' peers, and declares none where they have none", () => {
    const [cli, http] = expandStackTable(tableOf([JAVA])).presets;
    expect(cli).not.toHaveProperty('projects');
    expect(http?.projects).toEqual(['peer.api.rest']);
    expect(expandStackTable(tableOf([SPA])).presets[0]?.projects).toEqual(['peer.ui.spa']);
  });

  it('omits a dial its row does not offer rather than carrying it empty', () => {
    expect(expandStackTable(tableOf([GO])).presets[0]).not.toHaveProperty('buildSystems');
  });

  it("is named by its row's id, its entrypoints spelled in the row's words", () => {
    expect(ids(tableOf([JAVA, GO, SPA]))).toEqual(
      expect.arrayContaining(['acme-cli', 'acme-rest', 'acme-cli-rest', 'go-http', 'spa']),
    );
  });
});

describe('the order presets come out in', () => {
  it("keeps a platform's languages together, one-entrypoint cells first", () => {
    expect(ids(tableOf([JAVA, KOTLIN, GO]))).toEqual([
      'acme-cli',
      'acme-rest',
      'acme-cli-kotlin',
      'acme-rest-kotlin',
      'acme-cli-rest',
      'acme-cli-rest-kotlin',
      'go-http',
    ]);
  });

  it('groups by the set of tags other than `lang.*`, whatever order a row writes them in', () => {
    const kotlin = { ...KOTLIN, tags: ['framework.acme', 'lang.kotlin', 'runtime.jvm'] };
    expect(ids(tableOf([JAVA, GO, kotlin]))).toEqual([
      'acme-cli',
      'acme-rest',
      'acme-cli-kotlin',
      'acme-rest-kotlin',
      'acme-cli-rest',
      'acme-cli-rest-kotlin',
      'go-http',
    ]);
  });
});

describe('a product rule', () => {
  const rule = {
    id: 'fullstack-{backend}-{frontend}',
    unsaid: ['acme', 'rest', 'http', 'spa'],
    description: '{backend} + {frontend}',
    verticals: ['vcs', 'fullstack'],
    services: [
      {
        path: 'backend',
        stacks: ['acme-rest', 'go-http', 'acme-cli-rest-kotlin'],
        extraVerticals: ['gateway'],
      },
      { path: 'frontend', stacks: ['spa', 'spa-lit'] },
    ],
  };

  it('makes one product per choice of stacks, after every single, first service outermost', () => {
    const presets = expandStackTable(tableOf([JAVA, KOTLIN, GO, SPA, LIT], [rule])).presets;
    expect(presets.slice(-6).map((preset) => [preset.id, preset.description])).toEqual([
      ['fullstack', 'acme-rest + spa'],
      ['fullstack-lit', 'acme-rest + spa-lit'],
      ['fullstack-go', 'go-http + spa'],
      ['fullstack-go-lit', 'go-http + spa-lit'],
      ['fullstack-cli-kotlin', 'acme-cli-rest-kotlin + spa'],
      ['fullstack-cli-kotlin-lit', 'acme-cli-rest-kotlin + spa-lit'],
    ]);
    expect(presets.at(-6)).toEqual({
      id: 'fullstack',
      description: 'acme-rest + spa',
      tags: [],
      verticals: ['vcs', 'fullstack'],
      services: [
        { path: 'backend', stack: 'acme-rest', extraVerticals: ['gateway'] },
        { path: 'frontend', stack: 'spa' },
      ],
    });
  });

  it('refuses to name a stack that is no cell of the table, a product among them', () => {
    const ghost = { ...rule, services: [{ path: 'backend', stacks: ['go-grpc'] }] };
    expect(() => expandStackTable(tableOf([GO], [ghost]))).toThrow(
      "stack-presets.json: a product names 'go-grpc', which is no cell of the table",
    );
    // Products do not nest: a product is no cell, though the table makes it.
    const nested = {
      ...rule,
      id: 'meta-{backend}',
      unsaid: [],
      services: [{ path: 'backend', stacks: ['fullstack-go'] }],
    };
    expect(() => expandStackTable(tableOf([JAVA, KOTLIN, GO, SPA, LIT], [rule, nested]))).toThrow(
      "stack-presets.json: a product names 'fullstack-go', which is no cell of the table",
    );
  });
});

describe('a defect in the table', () => {
  it('is refused where a cell spells its entrypoints out of order or unknown', () => {
    for (const key of ['http+cli', 'grpc', 'cli+cli']) {
      expect(() => expandStackTable(tableOf([{ ...GO, cells: { [key]: 'x' } }]))).toThrow(
        `stack-presets.json: cell '${key}' is not entrypoint words joined by '+'`,
      );
    }
  });

  it('is refused where a row or a vertical names an entrypoint the table does not define', () => {
    expect(() => expandStackTable(tableOf([{ ...JAVA, words: { htp: 'rest' } }]))).toThrow(
      "stack-presets.json: row 'acme-{entrypoints}' names 'htp', which is none of the entrypoints cli, http, spa",
    );
    const table = tableOf([GO]) as { singles: { verticals: unknown[] } };
    table.singles.verticals = ['vcs', { id: 'dev-env', with: 'rest' }];
    expect(() => expandStackTable(table)).toThrow(
      "stack-presets.json: vertical 'dev-env' names 'rest', which is none of the entrypoints cli, http, spa",
    );
  });

  it('is refused where a row names no platform, only a language', () => {
    expect(() => expandStackTable(tableOf([{ ...GO, tags: ['lang.go'] }]))).toThrow(
      "stack-presets.json: row 'go-{entrypoints}' has no tag but its language's",
    );
  });

  it('is refused where a product rule has two services at one path', () => {
    const twice = {
      id: 'fullstack-{backend}',
      description: '{backend}',
      verticals: ['vcs'],
      services: [
        { path: 'backend', stacks: ['go-http'] },
        { path: 'backend', stacks: ['spa'] },
      ],
    };
    expect(() => expandStackTable(tableOf([GO, SPA], [twice]))).toThrow(
      "stack-presets.json: a product rule has two services at 'backend'",
    );
  });

  it('is refused where a product rule names a path none of its services is at', () => {
    const astray = {
      id: 'fullstack-{backnd}',
      description: '{backend}',
      verticals: ['vcs'],
      services: [{ path: 'backend', stacks: ['go-http'] }],
    };
    expect(() => expandStackTable(tableOf([GO], [astray]))).toThrow(
      "stack-presets.json: a product rule names '{backnd}', which is none of its services",
    );
    // A name every object answers to is still no service.
    const inherited = { ...astray, id: 'fullstack', description: 'x {toString}' };
    expect(() => expandStackTable(tableOf([GO], [inherited]))).toThrow(
      "stack-presets.json: a product rule names '{toString}', which is none of its services",
    );
  });

  it('is refused where a product id template leaves a word empty', () => {
    const doubled = {
      id: 'fullstack--{backend}',
      description: '{backend}',
      verticals: ['vcs'],
      services: [{ path: 'backend', stacks: ['go-http'] }],
    };
    expect(() => expandStackTable(tableOf([GO], [doubled]))).toThrow(
      "stack-presets.json: a product rule spells 'fullstack--go-http', a word of it empty",
    );
  });

  it('is refused where a key is misspelt, at any level, rather than dropped', () => {
    const table = tableOf([GO]);
    const singles = { tags: [], moduleLayouts: ['basic'], verticals: ['vcs'] };
    const service = { path: 'frontend', stacks: ['spa'], extraVertical: ['gateway'] };
    for (const misspelt of [
      { ...table, presets: [] },
      { ...table, singles: { ...singles, vertical: [] } },
      { ...table, singles: { ...singles, verticals: [{ id: 'dev-env', width: 'http' }] } },
      { ...table, entrypoints: [{ word: 'cli', tag: 'arch.cli', project: ['peer.cli'] }] },
      tableOf([{ ...JAVA, buildsystems: ['gradle'] }]),
      tableOf([{ ...GO, word: { http: 'rest' } }]),
      tableOf(
        [GO, SPA],
        [{ id: 'fullstack', description: 'x', verticals: [], services: [service] }],
      ),
      tableOf(
        [GO],
        [
          {
            id: 'fullstack-{backend}',
            unsay: ['http'],
            description: 'x',
            verticals: [],
            services: [{ path: 'backend', stacks: ['go-http'] }],
          },
        ],
      ),
    ]) {
      expect(() => expandStackTable(misspelt)).toThrow(/^stack-presets\.json: .*Unrecognized key/);
    }
  });

  it('is refused where the table is not a table', () => {
    expect(() => expandStackTable({ presets: [] })).toThrow();
    expect(() => expandStackTable(tableOf([{ ...GO, cells: { cli: '' } }]))).toThrow();
  });
});

describe('the shipped table', () => {
  it("spells the finder's entrypoints, in the finder's order", () => {
    expect(stackTable.entrypoints.map(({ word, tag }) => ({ word, tag }))).toEqual(
      ENTRYPOINTS.map(({ word, tag }) => ({ word, tag })),
    );
  });
});
