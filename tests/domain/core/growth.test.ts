/**
 * `growthOf` (`src/domain/core/growth.ts`): what adding an entrypoint
 * to a project would do, or why it cannot, read off a registry and a
 * manifest. `growth.golden.test.ts` records it on keel's own presets
 * and `growth-render.test.ts` holds its refusal to what the adapters
 * render; this holds each rule on a family small enough to read.
 *
 * **Scenario.** The `acme` family: a CLI, an HTTP and a CLI + HTTP
 * preset, each on the basic layout or the modulith, over a skeleton
 * with one bootstrap per entrypoint and a peer context that wires into
 * whichever it finds, an agent harness, and an observability and a dev
 * vertical only the HTTP presets carry, in that order; a front end
 * beside them. Each case varies that registry, or the manifest a
 * scaffold of one of them would have recorded. A context `keel add
 * module` adds is wired in by keel's own `bounded-context`, the one
 * that command runs, whose adapters cover keel's families alone: its
 * replay is read on keel's Go presets, whose context adapters are split.
 *
 * **Factory.** `registryOf` over the family, as a plugin's source; the
 * shipped registry for Go.
 *
 * **Port.** `growthOf`.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_HARNESS_TAG,
  type Adapter,
  type Tag,
  type Vertical,
} from '../../../src/domain/contract/composition.js';
import {
  emptyManifestV2,
  type InstalledModule,
  type ManifestV2,
} from '../../../src/domain/contract/manifest.js';
import type { BuildSystemOption, Stack } from '../../../src/domain/contract/stack.js';
import { BASIC_LAYOUT, MODULITH_LAYOUT } from '../../../src/domain/core/adapters/module-layout.js';
import { growthOf, grownScope, rerendersOf } from '../../../src/domain/core/growth.js';
import { readiness } from '../../../src/domain/core/planner.js';
import { pluginOrigin, registryOf, shippedRegistry } from '../../../src/domain/core/registry.js';
import { projectScope } from '../../../src/domain/core/scope.js';
import { STACKS } from '../../../src/domain/core/stacks.js';

/* ---- Scenario ---------------------------------------------------- */

const PEER = 'modules.peer-context';
const CONTEXT = 'modules.context';

function adapter(
  vertical: string,
  name: string,
  requires: readonly Tag[],
  excludes: readonly Tag[] = [],
): Adapter {
  return {
    id: `${vertical}/${name}`,
    vertical,
    covers: ['only'],
    predicate: { requires, ...(excludes.length > 0 ? { excludes } : {}) },
    contribute: () => ({}),
  };
}

function vertical(id: string, adapters: readonly Adapter[], promotes?: readonly Tag[]): Vertical {
  return {
    id,
    description: `the ${id} vertical`,
    dimensions: ['only'],
    adapters,
    ...(promotes === undefined ? {} : { promotes }),
  };
}

const skeletonAdapters = [
  adapter('acme-skeleton', 'cli', ['lang.acme', 'arch.cli']),
  adapter('acme-skeleton', 'http', ['lang.acme', 'arch.server-http']),
  adapter('acme-skeleton', 'spa', ['lang.acme', 'arch.spa']),
  adapter('acme-skeleton', 'peer', ['lang.acme', PEER]),
];
const skeleton = vertical('acme-skeleton', skeletonAdapters);
const harness = vertical(
  'agent-harness',
  [adapter('agent-harness', 'kit', ['lang.acme'])],
  [AGENT_HARNESS_TAG],
);
const observability = vertical('acme-obs', [
  adapter('acme-obs', 'main', ['lang.acme', 'arch.server-http']),
]);
/** Listed after observability, which its id sorts ahead of. */
const dev = vertical('acme-dev', [adapter('acme-dev', 'main', ['lang.acme'])]);
/** Promotes a runtime tag, which sorts ahead of the preset's own. */
const native = vertical(
  'acme-native',
  [adapter('acme-native', 'main', ['lang.acme'])],
  ['runtime.a-native'],
);

function stack(id: string, tags: readonly Tag[], verticals: readonly Vertical[]): Stack {
  const http = tags.includes('arch.server-http');
  return {
    id,
    description: `the ${id} preset`,
    tags: ['lang.acme', 'runtime.acme', 'arch.hexagonal', ...tags],
    verticals,
    moduleLayouts: [BASIC_LAYOUT, MODULITH_LAYOUT],
    ...(http ? { projects: ['peer.api.rest'] } : {}),
  };
}

const CLI = stack('acme-cli', ['arch.cli'], [skeleton, harness]);
const HTTP = stack('acme-http', ['arch.server-http'], [skeleton, harness, observability, dev]);
const BOTH = stack(
  'acme-cli-http',
  ['arch.cli', 'arch.server-http'],
  [skeleton, harness, observability, dev],
);
const SPA = stack('acme-spa', ['arch.spa'], [skeleton, harness]);

/** A build system of the family's own, for a preset that offers a choice of them. */
function buildSystem(id: string): BuildSystemOption {
  return { id, tag: `pkg.acme-${id}`, label: id, doc: `the ${id} build` };
}

/**
 * The family, with `stacks` in place of its presets and `verticals`
 * listed ahead of its own, so the registry's order is not the one a
 * manifest records them in.
 */
function family(
  stacks: readonly Stack[] = [CLI, HTTP, BOTH, SPA],
  verticals: readonly Vertical[] = [],
) {
  return registryOf([
    {
      origin: pluginOrigin('acme'),
      stacks,
      verticals: [...verticals, skeleton, harness, observability, dev, native],
    },
  ]);
}

/**
 * A manifest as a scaffold of `preset` records it, less what growth
 * does not read: on the basic layout unless `layout` says otherwise.
 */
function scaffoldOf(
  preset: Stack,
  extra: {
    readonly layout?: Tag;
    readonly tags?: readonly Tag[];
    readonly verticals?: readonly string[];
    readonly modules?: readonly InstalledModule[];
  } = {},
): ManifestV2 {
  const now = '2026-09-25T00:00:00Z';
  return {
    ...emptyManifestV2(now, '0.5.0-alpha'),
    tags: [...preset.tags, extra.layout ?? BASIC, ...(extra.tags ?? [])].sort(),
    verticals: (extra.verticals ?? preset.verticals.map((own) => own.id)).map((id) => ({
      id,
      installedAt: now,
    })),
    projects: [...(preset.projects ?? [])],
    modules: [...(extra.modules ?? [])],
  };
}

const BASIC = BASIC_LAYOUT.tag;
const MODULITH = MODULITH_LAYOUT.tag;
const SKELETON: InstalledModule = { name: 'greeting', installedAt: 'then', seam: true };
const GUESTBOOK: InstalledModule = {
  name: 'guestbook',
  installedAt: 'then',
  seam: false,
  consumes: 'greeting',
};
const ORDERS: InstalledModule = { name: 'orders', installedAt: 'then', seam: true };

/* ---- Tests ------------------------------------------------------- */

describe('growthOf', () => {
  it('grows a CLI into its twin: the bootstrap that newly matches, the verticals it lacks in the twin’s order, the harness', () => {
    expect(growthOf(family(), scaffoldOf(CLI), 'http')).toEqual({
      kind: 'grows',
      entrypoint: 'server-http',
      twin: 'acme-cli-http',
      tags: [
        'arch.cli',
        'arch.hexagonal',
        'arch.server-http',
        'lang.acme',
        'layout.basic',
        'runtime.acme',
      ],
      projects: ['peer.api.rest'],
      adapters: [{ vertical: 'acme-skeleton', adapters: ['acme-skeleton/http'] }],
      verticals: ['acme-obs', 'acme-dev'],
      modules: [],
      rerender: ['agent-harness'],
    });
  });

  it('grows an HTTP service by the CLI, installing nothing it lacks', () => {
    const growth = growthOf(family(), scaffoldOf(HTTP), 'cli');
    expect(growth).toMatchObject({
      kind: 'grows',
      entrypoint: 'cli',
      twin: 'acme-cli-http',
      adapters: [{ vertical: 'acme-skeleton', adapters: ['acme-skeleton/cli'] }],
      verticals: [],
    });
  });

  it('takes an entrypoint by its word or by its id', () => {
    const byWord = growthOf(family(), scaffoldOf(CLI), 'http');
    expect(growthOf(family(), scaffoldOf(CLI), 'server-http')).toEqual(byWord);
  });

  it('refuses a word naming no entrypoint', () => {
    expect(growthOf(family(), scaffoldOf(CLI), 'grpc')).toEqual({
      kind: 'refused',
      refusal: { code: 'keel.unknown-entrypoint', word: 'grpc' },
    });
  });

  it('reads an entrypoint the project has as present', () => {
    expect(growthOf(family(), scaffoldOf(CLI), 'cli')).toEqual({
      kind: 'present',
      entrypoint: 'cli',
    });
  });

  it('refuses a front end, as the entrypoint or as the project, a full-stack one included', () => {
    const frontEnd = {
      kind: 'refused',
      refusal: { code: 'keel.uncoverable-entrypoint', reason: 'front-end' },
    };
    expect(growthOf(family(), scaffoldOf(CLI), 'spa')).toMatchObject(frontEnd);
    expect(growthOf(family(), scaffoldOf(SPA), 'cli')).toMatchObject(frontEnd);
    const full = stack('acme-full', ['arch.server-http', 'arch.spa'], [skeleton, harness]);
    const fullCli = stack(
      'acme-full-cli',
      ['arch.cli', 'arch.server-http', 'arch.spa'],
      [skeleton],
    );
    expect(
      growthOf(family([CLI, HTTP, BOTH, SPA, full, fullCli]), scaffoldOf(full), 'cli'),
    ).toMatchObject(frontEnd);
  });

  it('refuses a project no preset carries with the entrypoint', () => {
    expect(growthOf(family([CLI, HTTP]), scaffoldOf(CLI), 'http')).toEqual({
      kind: 'refused',
      refusal: {
        code: 'keel.uncoverable-entrypoint',
        entrypoint: 'server-http',
        reason: 'no-twin',
      },
    });
  });

  it('refuses a project the drill-down cannot place: no language, or no entrypoint', () => {
    const LIB = stack('acme-lib', [], [skeleton, harness]);
    const unplaced = {
      kind: 'refused',
      refusal: {
        code: 'keel.uncoverable-entrypoint',
        entrypoint: 'server-http',
        reason: 'no-twin',
      },
    };
    const registry = family([LIB, CLI, HTTP, BOTH, SPA]);
    const noLanguage = scaffoldOf(CLI);
    expect(
      growthOf(
        registry,
        { ...noLanguage, tags: noLanguage.tags.filter((tag) => tag !== 'lang.acme') },
        'http',
      ),
    ).toEqual(unplaced);
    expect(growthOf(registry, scaffoldOf(LIB), 'http')).toEqual(unplaced);
    expect(growthOf(registry, scaffoldOf(LIB), 'cli')).toMatchObject({
      refusal: { reason: 'no-twin' },
    });
  });

  it('never takes a product for the twin, though one sits at its node and sorts first', () => {
    const product: Stack = {
      id: 'acme-a-api',
      description: 'a product of one CLI + HTTP service',
      tags: [],
      verticals: [],
      services: [{ path: 'api', stack: BOTH.id }],
    };
    expect(growthOf(family([product, CLI, HTTP, BOTH, SPA]), scaffoldOf(CLI), 'http')).toEqual(
      growthOf(family(), scaffoldOf(CLI), 'http'),
    );
  });

  it('refuses a twin carrying a tag the grown project would not, or lacking one it would', () => {
    const noTwin = {
      kind: 'refused',
      refusal: { code: 'keel.uncoverable-entrypoint', reason: 'no-twin' },
    };
    const wider = { ...BOTH, tags: [...BOTH.tags, 'acme.wider'] };
    expect(growthOf(family([CLI, HTTP, wider]), scaffoldOf(CLI), 'http')).toMatchObject(noTwin);
    const narrower = { ...CLI, tags: [...CLI.tags, 'acme.narrower'] };
    expect(growthOf(family([narrower, HTTP, BOTH]), scaffoldOf(narrower), 'http')).toMatchObject(
      noTwin,
    );
  });

  it('passes over a preset with a tag of its own at the twin’s node, though it sorts first', () => {
    const variant = stack(
      'acme-a-cli-http-grpc',
      ['arch.cli', 'arch.server-http', 'api.grpc'],
      BOTH.verticals,
    );
    expect(growthOf(family([variant, CLI, HTTP, BOTH, SPA]), scaffoldOf(CLI), 'http')).toEqual(
      growthOf(family(), scaffoldOf(CLI), 'http'),
    );
  });

  it('places a project by its framework, or by having none, whichever preset sorts first', () => {
    const fwCli = stack('acme-fw-cli', ['framework.fw', 'arch.cli'], CLI.verticals);
    const fwBoth = stack(
      'acme-a-fw-cli-http',
      ['framework.fw', 'arch.cli', 'arch.server-http'],
      BOTH.verticals,
    );
    const registry = family([fwBoth, fwCli, CLI, HTTP, BOTH]);
    expect(growthOf(registry, scaffoldOf(CLI), 'http')).toMatchObject({ twin: BOTH.id });
    expect(growthOf(registry, scaffoldOf(fwCli), 'http')).toMatchObject({ twin: fwBoth.id });
  });

  describe('a twin on the project’s dials', () => {
    const noTwin = {
      kind: 'refused',
      refusal: { code: 'keel.uncoverable-entrypoint', reason: 'no-twin' },
    };

    it('offers its build system and module layout, which its rules admit', () => {
      const a = buildSystem('a');
      const b = buildSystem('b');
      const cli = { ...CLI, buildSystems: [a, b] };
      const both = { ...BOTH, buildSystems: [a] };
      const builds = family([cli, HTTP, both]);
      expect(growthOf(builds, scaffoldOf(cli, { tags: [a.tag] }), 'http')).toMatchObject({
        kind: 'grows',
        twin: both.id,
      });
      expect(growthOf(builds, scaffoldOf(cli, { tags: [b.tag] }), 'http')).toMatchObject(noTwin);

      const modulith = scaffoldOf(CLI, { layout: MODULITH, modules: [SKELETON] });
      const flat = { ...BOTH, moduleLayouts: [BASIC_LAYOUT] };
      expect(growthOf(family([CLI, HTTP, flat]), modulith, 'http')).toMatchObject(noTwin);
      const { moduleLayouts: _layouts, ...fixed } = BOTH;
      expect(growthOf(family([CLI, HTTP, fixed]), modulith, 'http')).toMatchObject(noTwin);
      const ruled: Stack = {
        ...BOTH,
        conflicts: [
          {
            id: 'acme/flat-http',
            when: [MODULITH, 'arch.server-http'],
            reason: 'an HTTP service here is one hexagon',
          },
        ],
      };
      expect(growthOf(family([CLI, HTTP, ruled]), modulith, 'http')).toMatchObject(noTwin);
      expect(growthOf(family([CLI, HTTP, ruled]), scaffoldOf(CLI), 'http')).toMatchObject({
        kind: 'grows',
      });
    });

    it('carries its peer context, and leaves the harness out where the project has none', () => {
      const unpeered = {
        ...BOTH,
        verticals: [
          vertical(
            'acme-skeleton',
            skeletonAdapters.filter((own) => own.id !== 'acme-skeleton/peer'),
          ),
          ...BOTH.verticals.slice(1),
        ],
      };
      const peered = scaffoldOf(CLI, { layout: MODULITH, tags: [PEER], modules: [SKELETON] });
      expect(growthOf(family([CLI, HTTP, unpeered]), peered, 'http')).toMatchObject(noTwin);
      expect(
        growthOf(
          family([CLI, HTTP, unpeered]),
          scaffoldOf(CLI, { layout: MODULITH, modules: [SKELETON] }),
          'http',
        ),
      ).toMatchObject({ kind: 'grows' });

      const kit = vertical(
        'acme-kit',
        [adapter('acme-kit', 'main', ['lang.acme'])],
        [AGENT_HARNESS_TAG],
      );
      const bound = { ...BOTH, verticals: [...BOTH.verticals, kit] };
      const registry = family([CLI, HTTP, bound], [kit]);
      const bare = scaffoldOf(CLI, { verticals: ['acme-skeleton'] });
      expect(growthOf(registry, bare, 'http')).toMatchObject(noTwin);
      expect(growthOf(registry, scaffoldOf(CLI), 'http')).toMatchObject({ kind: 'grows' });
    });
  });

  it('places the project by its preset, not by what a vertical added since', () => {
    const grown = growthOf(
      family(),
      scaffoldOf(CLI, {
        tags: ['runtime.a-native'],
        verticals: ['acme-skeleton', 'acme-native'],
      }),
      'http',
    );
    expect(grown).toMatchObject({ kind: 'grows', twin: 'acme-cli-http' });
    expect(grown.kind === 'grows' && grown.tags).toContain('runtime.a-native');
  });

  it('grows a project whose preset carries a tag a vertical can add, as its twin does', () => {
    const database = vertical('acme-db', [adapter('acme-db', 'main', ['lang.acme'])], ['db.acme']);
    const cli = stack('acme-cli', ['arch.cli', 'db.acme'], CLI.verticals);
    const both = stack(
      'acme-cli-http',
      ['arch.cli', 'arch.server-http', 'db.acme'],
      BOTH.verticals,
    );
    expect(growthOf(family([cli, HTTP, both], [database]), scaffoldOf(cli), 'http')).toMatchObject({
      kind: 'grows',
      twin: both.id,
    });
  });

  it('refuses where an adapter the project matches would stop matching, naming it', () => {
    const cliOnly = vertical('acme-cli-only', [
      adapter('acme-cli-only', 'main', ['lang.acme'], ['arch.server-http']),
    ]);
    const manifest = scaffoldOf(CLI, {
      verticals: ['acme-skeleton', 'agent-harness', 'acme-cli-only'],
    });
    expect(growthOf(family(undefined, [cliOnly]), manifest, 'http')).toEqual({
      kind: 'refused',
      refusal: {
        code: 'keel.uncoverable-entrypoint',
        entrypoint: 'server-http',
        reason: 'drops',
        drops: [{ vertical: 'acme-cli-only', adapters: ['acme-cli-only/main'] }],
      },
    });
  });

  it('refuses where the entrypoint would break a rule of a vertical the project has, and only one it newly breaks', () => {
    const noHttp = { id: 'acme-cli-only/no-http', when: ['arch.server-http'], reason: 'no HTTP' };
    const standing = { id: 'acme-cli-only/standing', when: ['arch.cli'], reason: 'broken already' };
    const cliOnly: Vertical = {
      ...vertical('acme-cli-only', [adapter('acme-cli-only', 'main', ['lang.acme'])]),
      conflicts: [standing, noHttp],
    };
    const manifest = scaffoldOf(CLI, {
      verticals: ['acme-skeleton', 'agent-harness', 'acme-cli-only'],
    });
    expect(growthOf(family(undefined, [cliOnly]), manifest, 'http')).toEqual({
      kind: 'refused',
      refusal: { code: 'keel.incompatible', entrypoint: 'server-http', rules: [noHttp] },
    });
  });

  it('leaves the harness out where the project was scaffolded without it', () => {
    const manifest = scaffoldOf(CLI, { verticals: ['acme-skeleton'] });
    expect(growthOf(family(), manifest, 'http')).toMatchObject({
      kind: 'grows',
      verticals: ['acme-obs', 'acme-dev'],
      rerender: [],
    });
    expect(rerendersOf(manifest)).toEqual([]);
  });

  it('reads what a linked sibling projects into the project, before the entrypoint and after, in the manifest’s order', () => {
    const cors = vertical('acme-cors', [
      adapter('acme-cors', 'any', ['lang.acme', 'peer.ui.spa']),
      adapter('acme-cors', 'http', ['arch.server-http', 'peer.ui.spa']),
    ]);
    const manifest: ManifestV2 = {
      ...scaffoldOf(CLI, { verticals: ['acme-skeleton', 'agent-harness', 'acme-cors'] }),
      peers: [{ ref: '../web', tags: ['peer.ui.spa'] }],
    };
    expect(growthOf(family(undefined, [cors]), manifest, 'http')).toMatchObject({
      kind: 'grows',
      adapters: [
        { vertical: 'acme-skeleton', adapters: ['acme-skeleton/http'] },
        { vertical: 'acme-cors', adapters: ['acme-cors/http'] },
      ],
    });
  });

  it('grows a modulith holding the skeleton alone', () => {
    const manifest = scaffoldOf(CLI, { layout: MODULITH, modules: [SKELETON] });
    expect(growthOf(family(), manifest, 'http')).toMatchObject({ kind: 'grows' });
  });

  describe('bounded contexts wired into the existing assemblies', () => {
    const peered = scaffoldOf(CLI, {
      layout: MODULITH,
      tags: [PEER],
      modules: [SKELETON, GUESTBOOK],
    });

    it('refuses the peer context while no adapter wires it into the new entrypoint', () => {
      expect(growthOf(family(), peered, 'http')).toEqual({
        kind: 'refused',
        refusal: {
          code: 'keel.contexts-need-rewiring',
          entrypoint: 'server-http',
          contexts: [{ name: 'guestbook', marker: PEER }],
        },
      });
    });

    it('grows it once an adapter of the family requires the marker with the entrypoint', () => {
      const wiring = adapter('acme-skeleton', 'peer-http', ['lang.acme', PEER, 'arch.server-http']);
      const split = vertical('acme-skeleton', [...skeletonAdapters, wiring]);
      const registry = registryOf([
        {
          origin: pluginOrigin('acme'),
          stacks: [CLI, HTTP, BOTH].map((preset) => ({
            ...preset,
            verticals: preset.verticals.map((own) => (own.id === split.id ? split : own)),
          })),
          verticals: [split, harness, observability],
        },
      ]);
      expect(growthOf(registry, peered, 'http')).toMatchObject({
        kind: 'grows',
        adapters: [
          {
            vertical: 'acme-skeleton',
            adapters: ['acme-skeleton/http', 'acme-skeleton/peer-http'],
          },
        ],
      });
    });

    it('is not lifted by another family’s wiring adapter', () => {
      const other = vertical('other-wiring', [
        adapter('other-wiring', 'main', ['lang.other', PEER, 'arch.server-http']),
      ]);
      const manifest = scaffoldOf(CLI, {
        layout: MODULITH,
        tags: [PEER],
        verticals: ['acme-skeleton', 'agent-harness', 'other-wiring'],
        modules: [SKELETON, GUESTBOOK],
      });
      expect(growthOf(family(undefined, [other]), manifest, 'http')).toMatchObject({
        kind: 'refused',
        refusal: { code: 'keel.contexts-need-rewiring' },
      });
    });

    it('refuses each added context by the marker keel add module selects it with, in recorded order', () => {
      const manifest = scaffoldOf(CLI, {
        layout: MODULITH,
        tags: [PEER],
        modules: [SKELETON, GUESTBOOK, ORDERS],
      });
      expect(growthOf(family(), manifest, 'http')).toMatchObject({
        kind: 'refused',
        refusal: {
          contexts: [
            { name: 'guestbook', marker: PEER },
            { name: 'orders', marker: CONTEXT },
          ],
        },
      });
    });

    it('is not lifted for an added context by an installed vertical, which keel add module never runs', () => {
      const contexts = vertical('acme-contexts', [
        adapter('acme-contexts', 'http', ['lang.acme', CONTEXT, 'arch.server-http']),
      ]);
      const manifest = scaffoldOf(CLI, {
        layout: MODULITH,
        verticals: ['acme-skeleton', 'agent-harness', 'acme-contexts'],
        modules: [SKELETON, ORDERS],
      });
      expect(growthOf(family(undefined, [contexts]), manifest, 'http')).toMatchObject({
        kind: 'refused',
        refusal: { contexts: [{ name: 'orders', marker: CONTEXT }] },
      });
    });

    it('is lifted by no bounded-context a registry lists, which keel add module never runs', () => {
      const contexts = vertical('bounded-context', [
        adapter('bounded-context', 'acme-http', ['lang.acme', CONTEXT, 'arch.server-http']),
        adapter('bounded-context', 'acme-peer', ['lang.acme', PEER, 'arch.server-http']),
      ]);
      // Recorded among the project's verticals, as `keel add module` records it.
      const manifest = scaffoldOf(CLI, {
        layout: MODULITH,
        tags: [PEER],
        verticals: [...CLI.verticals.map(({ id }) => id), 'bounded-context'],
        modules: [SKELETON, GUESTBOOK, ORDERS],
      });
      expect(growthOf(family(undefined, [contexts]), manifest, 'http')).toMatchObject({
        kind: 'refused',
        refusal: {
          contexts: [
            { name: 'guestbook', marker: PEER },
            { name: 'orders', marker: CONTEXT },
          ],
        },
      });
    });

    it('probes a context on what a linked sibling projects too', () => {
      const wiring = vertical('acme-wiring', [
        adapter('acme-wiring', 'peer', ['lang.acme', PEER, 'arch.server-http', 'peer.ui.spa']),
      ]);
      const wired = {
        ...peered,
        verticals: [...peered.verticals, { id: 'acme-wiring', installedAt: 'then' }],
      };
      const linked: ManifestV2 = { ...wired, peers: [{ ref: '../web', tags: ['peer.ui.spa'] }] };
      expect(growthOf(family(undefined, [wiring]), linked, 'http')).toMatchObject({
        kind: 'grows',
      });
      expect(growthOf(family(undefined, [wiring]), wired, 'http')).toMatchObject({
        kind: 'refused',
        refusal: { contexts: [{ name: 'guestbook', marker: PEER }] },
      });
    });

    describe('added by keel add module, wired in by a replay of keel’s own bounded-context', () => {
      const goCli = STACKS['go-cli']!;
      const goHttp = STACKS['go-http']!;
      /** Consumes `orders`, and sorts ahead of it. */
      const BILLING: InstalledModule = {
        name: 'billing',
        installedAt: 'then',
        seam: true,
        consumes: 'orders',
      };

      it('replays each, in the order the manifest records them, installing what newly matches', () => {
        const manifest = scaffoldOf(goCli, {
          layout: MODULITH,
          modules: [SKELETON, ORDERS, BILLING],
        });
        expect(growthOf(shippedRegistry, manifest, 'http')).toMatchObject({
          kind: 'grows',
          modules: [
            { name: 'orders', adapters: ['bounded-context/go-context-http'] },
            { name: 'billing', adapters: ['bounded-context/go-context-http'] },
          ],
        });
        expect(
          growthOf(
            shippedRegistry,
            scaffoldOf(goHttp, { layout: MODULITH, modules: [SKELETON, ORDERS] }),
            'cli',
          ),
        ).toMatchObject({
          kind: 'grows',
          modules: [{ name: 'orders', adapters: ['bounded-context/go-context-cli'] }],
        });
      });

      it('replays neither the skeleton nor the peer, which the skeleton’s own adapters wire', () => {
        const manifest = scaffoldOf(goCli, {
          layout: MODULITH,
          tags: [PEER],
          modules: [SKELETON, GUESTBOOK, ORDERS],
        });
        expect(growthOf(shippedRegistry, manifest, 'http')).toMatchObject({
          kind: 'grows',
          adapters: [
            {
              vertical: 'walking-skeleton',
              adapters: [
                'walking-skeleton/go-http-bootstrap',
                'walking-skeleton/go-peer-context-http',
              ],
            },
          ],
          modules: [{ name: 'orders', adapters: ['bounded-context/go-context-http'] }],
        });
      });

      it('replays none on a modulith holding the skeleton alone', () => {
        const manifest = scaffoldOf(goCli, { layout: MODULITH, modules: [SKELETON] });
        expect(growthOf(shippedRegistry, manifest, 'http')).toMatchObject({
          kind: 'grows',
          modules: [],
        });
      });
    });

    it('names the peer where its marker is on and no record says which context it is', () => {
      const manifest = scaffoldOf(CLI, { layout: MODULITH, tags: [PEER] });
      expect(growthOf(family(), manifest, 'http')).toMatchObject({
        kind: 'refused',
        refusal: { contexts: [{ name: 'guestbook', marker: PEER }] },
      });
    });
  });
});

describe('grownScope', () => {
  /** What growth reads `manifest`, a scaffold of `preset`, as grown by `word`, over `registry`. */
  const grown = (
    registry: ReturnType<typeof family>,
    preset: Stack,
    word: string,
    manifest: ManifestV2 = scaffoldOf(preset),
  ) => {
    const growth = growthOf(registry, manifest, word);
    if (growth.kind !== 'grows') throw new Error(`${preset.id} does not grow by ${word}`);
    return grownScope(registry, manifest, growth);
  };

  /**
   * What stops `id` on the CLI project, its scope carrying HTTP grown
   * as {@link grownScope} reads it, as the add front door plans on it.
   */
  const gapOn = (registry: ReturnType<typeof family>, id: string) => {
    const manifest = scaffoldOf(CLI);
    const scope = grown(registry, CLI, 'http', manifest);
    const ready = readiness(
      registry,
      {
        ...projectScope(registry, manifest),
        grown: scope === null ? [] : [{ entrypoint: 'arch.server-http', scope }],
      },
      id,
    );
    if (ready.kind !== 'unavailable') throw new Error(`${id} is ${ready.kind}`);
    return ready.gap;
  };

  /** Promotes a tag once the server is there, as a metrics exporter would. */
  const metrics = vertical(
    'acme-metrics',
    [adapter('acme-metrics', 'main', ['lang.acme', 'arch.server-http'])],
    ['acme.metrics'],
  );

  it('reads the project as growing would leave it: the grown tags, and what it installs as there', () => {
    const registry = family();
    const scope = grown(registry, CLI, 'http');
    expect(scope?.tags).toEqual([
      'arch.cli',
      'arch.hexagonal',
      'arch.server-http',
      'lang.acme',
      'layout.basic',
      'runtime.acme',
    ]);
    // In the order the planner installs them, after what the project has.
    expect(scope?.installed).toEqual(['acme-skeleton', 'agent-harness', 'acme-dev', 'acme-obs']);
    // What the grown project has is there already; nothing else is.
    expect(readiness(registry, scope!, 'acme-obs')).toEqual({ kind: 'included' });
    expect(readiness(registry, scope!, 'acme-native')).toEqual({ kind: 'ready' });
  });

  it('counts what the planner closes growth over as there too, with what it promotes', () => {
    const dash = vertical('acme-dash', [adapter('acme-dash', 'main', ['acme.metrics'])]);
    const twin = stack(
      'acme-cli-http',
      ['arch.cli', 'arch.server-http'],
      [skeleton, harness, observability, dev, dash],
    );
    const scope = grown(family([CLI, HTTP, twin, SPA], [metrics, dash]), CLI, 'http');
    expect(scope?.installed).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-dev',
      'acme-metrics',
      'acme-dash',
      'acme-obs',
    ]);
    expect(scope?.tags).toContain('acme.metrics');
  });

  it('carries the tags growing promotes, so what they feed is offered the entrypoint and what they exclude is not', () => {
    const alerts = vertical('acme-alerts', [adapter('acme-alerts', 'main', ['acme.metrics'])]);
    const plain = vertical('acme-plain', [
      adapter('acme-plain', 'main', ['lang.acme', 'arch.server-http'], ['acme.metrics']),
    ]);
    const twin = stack(
      'acme-cli-http',
      ['arch.cli', 'arch.server-http'],
      [skeleton, harness, observability, dev, metrics],
    );
    const registry = family([CLI, HTTP, twin, SPA], [metrics, alerts, plain]);
    const scope = grown(registry, CLI, 'http');
    expect(scope?.tags).toContain('acme.metrics');
    expect(readiness(registry, scope!, 'acme-alerts')).toEqual({ kind: 'ready' });
    expect(readiness(registry, scope!, 'acme-plain')).toMatchObject({ kind: 'unavailable' });
    // On the CLI, both are stopped by the server alone; only one is let in by it.
    expect(gapOn(registry, 'acme-alerts')).toMatchObject({
      entrypoint: ['arch.server-http'],
      identity: [],
      grow: { entrypoint: 'http', comes: false },
    });
    expect(gapOn(registry, 'acme-plain')).toMatchObject({ entrypoint: ['arch.server-http'] });
    expect(gapOn(registry, 'acme-plain')).not.toHaveProperty('grow');
  });

  it('carries what an adapter the entrypoint newly matches promotes', () => {
    const tracing = vertical(
      'acme-tracing',
      [
        adapter('acme-tracing', 'cli', ['lang.acme', 'arch.cli']),
        {
          ...adapter('acme-tracing', 'http', ['lang.acme', 'arch.server-http']),
          promotes: ['acme.traced'],
        },
      ],
      ['acme.traced'],
    );
    const spans = vertical('acme-spans', [adapter('acme-spans', 'main', ['acme.traced'])]);
    const registry = family(undefined, [tracing, spans]);
    const manifest = scaffoldOf(CLI, {
      verticals: ['acme-skeleton', 'agent-harness', 'acme-tracing'],
    });
    const scope = grown(registry, CLI, 'http', manifest);
    expect(scope?.tags).toContain('acme.traced');
    expect(readiness(registry, scope!, 'acme-spans')).toEqual({ kind: 'ready' });
  });

  it('holds the grown project to the rules of what growing installs, offering no action to what would break one', () => {
    const quiet: Vertical = {
      ...vertical('acme-quiet', [adapter('acme-quiet', 'main', ['lang.acme'])]),
      conflicts: [{ id: 'acme-quiet/no-noise', when: ['acme.noise'], reason: 'quiet' }],
    };
    const loud = vertical(
      'acme-loud',
      [adapter('acme-loud', 'main', ['lang.acme', 'arch.server-http'])],
      ['acme.noise'],
    );
    const twin = stack(
      'acme-cli-http',
      ['arch.cli', 'arch.server-http'],
      [skeleton, harness, observability, dev, quiet],
    );
    const registry = family([CLI, HTTP, twin, SPA], [quiet, loud]);
    expect(readiness(registry, grown(registry, CLI, 'http')!, 'acme-loud')).toMatchObject({
      kind: 'unavailable',
      gap: { rules: ['acme-quiet/no-noise'] },
    });
    expect(gapOn(registry, 'acme-loud')).toMatchObject({ entrypoint: ['arch.server-http'] });
    expect(gapOn(registry, 'acme-loud')).not.toHaveProperty('grow');
  });

  it('reads nothing where the planner refuses what growing installs, as the command then does', () => {
    const needy = vertical('acme-needy', [adapter('acme-needy', 'main', ['acme.none'])]);
    const twin = stack(
      'acme-cli-http',
      ['arch.cli', 'arch.server-http'],
      [skeleton, harness, observability, dev, needy],
    );
    expect(grown(family([CLI, HTTP, twin, SPA], [needy]), CLI, 'http')).toBeNull();
  });
});
