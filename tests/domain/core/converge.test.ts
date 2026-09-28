/**
 * The converge reading (`src/domain/core/converge.ts`): the composition
 * a manifest records, its reference order, and what each request makes
 * of it, read off a registry and a manifest. `converge.golden.test.ts`
 * records it on every cell of the paths golden; this holds each rule on
 * a family small enough to read.
 *
 * **Scenario.** The `acme` family, as `growth.test.ts` builds it: a CLI,
 * an HTTP and a CLI + HTTP preset over a version control placed at the
 * repository root, a skeleton with one bootstrap per entrypoint and a
 * peer context, and an agent harness — the HTTP presets with an
 * observability and a dev vertical after them, and a choice of two
 * build systems — beside extras nothing ties together, and a shipping
 * vertical that needs the image another promotes, whose id sorts after
 * it, a pipeline placed at the repository root, and a gateway that
 * needs what a linked HTTP service projects. A product of two services
 * — the HTTP preset at `api`, the CLI at `app` — gives the CLI the
 * gateway of its own accord. Each case varies the manifest a scaffold
 * of one of them would have recorded, or the seed it starts from. A context `keel add module` adds is wired by keel's
 * own `bounded-context`, whose adapters cover keel's families alone:
 * its reading is held on keel's Go CLI preset.
 *
 * **Factory.** `registryOf` over the family, as a plugin's source; the
 * shipped registry for Go.
 *
 * **Port.** `compositionOf`, `referenceOrder` and `convergeOf`.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
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
import {
  compositionOf,
  convergeOf,
  referenceOrder,
  type ConvergePlan,
  type ConvergeRequest,
} from '../../../src/domain/core/converge.js';
import { pluginOrigin, registryOf, shippedRegistry } from '../../../src/domain/core/registry.js';
import { projectScope } from '../../../src/domain/core/scope.js';
import { STACKS } from '../../../src/domain/core/stacks.js';

/* ---- Scenario ---------------------------------------------------- */

const PEER = 'modules.peer-context';
const BASIC = BASIC_LAYOUT.tag;
const MODULITH = MODULITH_LAYOUT.tag;
const IMAGE = 'deploy.acme-image';

function adapter(vertical: string, name: string, requires: readonly Tag[]): Adapter {
  return {
    id: `${vertical}/${name}`,
    vertical,
    covers: ['only'],
    predicate: { requires },
    contribute: () => ({}),
  };
}

function vertical(
  id: string,
  adapters: readonly Adapter[],
  extra: Partial<Pick<Vertical, 'promotes' | 'placement'>> = {},
): Vertical {
  return { id, description: `the ${id} vertical`, dimensions: ['only'], adapters, ...extra };
}

const vcs = vertical('acme-vcs', [adapter('acme-vcs', 'git', ['lang.acme'])], {
  placement: { scope: 'repository', because: 'a repository has one version control' },
});
const skeleton = vertical('acme-skeleton', [
  adapter('acme-skeleton', 'cli', ['lang.acme', 'arch.cli']),
  adapter('acme-skeleton', 'http', ['lang.acme', 'arch.server-http']),
  adapter('acme-skeleton', 'peer', ['lang.acme', PEER]),
]);
const harness = vertical('agent-harness', [adapter('agent-harness', 'kit', ['lang.acme'])], {
  promotes: [AGENT_HARNESS_TAG],
});
const observability = vertical('acme-obs', [
  adapter('acme-obs', 'main', ['lang.acme', 'arch.server-http']),
]);
const dev = vertical('acme-dev', [adapter('acme-dev', 'main', ['lang.acme'])]);
/** Two extras nothing ties together, whose ids sort the other way round from how they arrive below. */
const alpha = vertical('acme-alpha', [adapter('acme-alpha', 'main', ['lang.acme'])]);
const zeta = vertical('acme-zeta', [adapter('acme-zeta', 'main', ['lang.acme'])]);
/** Promotes the image shipping needs; its id sorts after shipping's. */
const image = vertical('acme-zimage', [adapter('acme-zimage', 'main', ['lang.acme'])], {
  promotes: [IMAGE],
});
const ship = vertical('acme-ship', [adapter('acme-ship', 'main', ['lang.acme', IMAGE])]);
/** An extra no acme project can carry. */
const elsewhere = vertical('acme-elsewhere', [adapter('acme-elsewhere', 'main', ['lang.other'])]);
/** An extra whose place is a repository root. */
const ci = vertical('acme-ci', [adapter('acme-ci', 'main', ['lang.acme'])], {
  placement: { scope: 'repository', because: 'a repository has one pipeline' },
});
/** An extra only a project linked to an HTTP one takes; its id sorts after alpha's. */
const gw = vertical('acme-gw', [adapter('acme-gw', 'main', ['lang.acme', 'peer.api.rest'])]);

/** A build system of the family's own. */
function buildSystem(id: string): BuildSystemOption {
  return { id, tag: `pkg.acme-${id}`, label: id, doc: `the ${id} build` };
}

function stack(id: string, tags: readonly Tag[], verticals: readonly Vertical[]): Stack {
  const http = tags.includes('arch.server-http');
  return {
    id,
    description: `the ${id} preset`,
    tags: ['lang.acme', 'runtime.acme', 'arch.hexagonal', ...tags],
    verticals,
    buildSystems: [buildSystem('make'), buildSystem('bake')],
    moduleLayouts: [BASIC_LAYOUT, MODULITH_LAYOUT],
    ...(http ? { projects: ['peer.api.rest'] } : {}),
  };
}

const MAKE = 'pkg.acme-make';
const BAKE = 'pkg.acme-bake';

const CLI = stack('acme-cli', ['arch.cli'], [vcs, skeleton, harness]);
const HTTP = stack('acme-http', ['arch.server-http'], [vcs, skeleton, harness, observability, dev]);
const BOTH = stack(
  'acme-cli-http',
  ['arch.cli', 'arch.server-http'],
  [vcs, skeleton, harness, observability, dev],
);

/** A product whose CLI service, linked to its HTTP one, it gives the gateway. */
const PRODUCT: Stack = {
  id: 'acme-product',
  description: 'an HTTP service and a CLI',
  tags: ['lang.acme'],
  verticals: [vcs],
  services: [
    { path: 'api', stack: HTTP.id },
    { path: 'app', stack: CLI.id, extraVerticals: [gw] },
  ],
};

const family = registryOf([
  {
    origin: pluginOrigin('acme'),
    stacks: [CLI, HTTP, BOTH, PRODUCT],
    verticals: [
      elsewhere,
      zeta,
      ship,
      image,
      alpha,
      ci,
      gw,
      vcs,
      skeleton,
      harness,
      observability,
      dev,
    ],
  },
]);

/** How `keel new` of {@link PRODUCT} links its CLI service to the HTTP one. */
const TO_API = { ref: '../api', tags: ['peer.api.rest'] };

/**
 * A manifest as a scaffold of `preset` records it: on the basic layout
 * and the first build system the preset offers, unless `extra` names
 * others, with its `tags`; its verticals, the preset's, unless it
 * names others.
 */
function scaffoldOf(
  preset: Stack,
  extra: {
    readonly layout?: Tag;
    readonly build?: Tag | null;
    readonly tags?: readonly Tag[];
    readonly verticals?: readonly string[];
    readonly modules?: readonly InstalledModule[];
  } = {},
): ManifestV2 {
  const now = '2026-09-27T00:00:00Z';
  const build = extra.build === undefined ? (preset.buildSystems?.[0]?.tag ?? null) : extra.build;
  const dials = [extra.layout ?? BASIC, ...(build === null ? [] : [build]), ...(extra.tags ?? [])];
  return {
    ...emptyManifestV2(now, '0.5.0-alpha'),
    tags: [...preset.tags, ...dials].sort(),
    verticals: (extra.verticals ?? preset.verticals.map(({ id }) => id)).map((id) => ({
      id,
      installedAt: now,
    })),
    projects: [...(preset.projects ?? [])],
    modules: [...(extra.modules ?? [])],
  };
}

const SKELETON: InstalledModule = { name: 'greeting', installedAt: 'then', seam: true };
const GUESTBOOK: InstalledModule = {
  name: 'guestbook',
  installedAt: 'then',
  seam: false,
  consumes: 'greeting',
};
const ORDERS: InstalledModule = {
  name: 'orders',
  installedAt: 'then',
  seam: true,
  consumes: 'greeting',
};

/** The ids of a plan's run, each with its posture, as the golden spells them. */
function runOf(plan: ConvergePlan): readonly string[] {
  if (plan.kind !== 'converges') throw new Error(`refused: ${JSON.stringify(plan.refusal)}`);
  return plan.run.map(
    (step) =>
      `${step.vertical.id} ${step.posture}${step.settles === true ? '+settle' : ''}${
        step.context === undefined ? '' : ` ${step.context}`
      }${step.adapters === undefined ? '' : ` ${step.adapters.join(',')}`}`,
  );
}

function converged(plan: ConvergePlan) {
  if (plan.kind !== 'converges') throw new Error(`refused: ${JSON.stringify(plan.refusal)}`);
  return plan;
}

/* ---- Tests ------------------------------------------------------- */

describe('compositionOf', () => {
  it('reads a scaffold back as the preset, dials and extras keel new was given', () => {
    const manifest = scaffoldOf(HTTP, {
      build: BAKE,
      verticals: [...HTTP.verticals.map(({ id }) => id), 'acme-alpha', 'acme-zeta'],
    });
    expect(compositionOf(family, manifest)).toEqual({
      preset: 'acme-http',
      dials: [BAKE, BASIC],
      harness: true,
      member: false,
      given: [],
      extras: ['acme-alpha', 'acme-zeta'],
      contexts: [],
      tags: manifest.tags,
      projects: ['peer.api.rest'],
      recorded: manifest.verticals.map(({ id }) => id),
      order: manifest.verticals.map(({ id }) => id),
    });
  });

  it('reads a preset whose dials the tags do not record as none', () => {
    // A build system the preset does not offer: no setting of its dials seeds these tags.
    const manifest = scaffoldOf(HTTP, { build: 'pkg.acme-other' });
    expect(compositionOf(family, manifest)).toMatchObject({ preset: null, dials: [] });
  });

  it('reads the harness dial off the record, and a preset without it where it is not recorded', () => {
    const manifest = scaffoldOf(HTTP, {
      verticals: ['acme-vcs', 'acme-skeleton', 'acme-obs', 'acme-dev'],
    });
    expect(compositionOf(family, manifest)).toMatchObject({
      preset: 'acme-http',
      harness: false,
      extras: [],
      order: ['acme-vcs', 'acme-skeleton', 'acme-obs', 'acme-dev'],
    });
  });

  it('reads the added contexts, the skeleton and the peer apart, and the peer as a dial', () => {
    const manifest = scaffoldOf(CLI, {
      layout: MODULITH,
      tags: [PEER],
      verticals: [...CLI.verticals.map(({ id }) => id), 'bounded-context'],
      modules: [SKELETON, GUESTBOOK, ORDERS],
    });
    expect(compositionOf(family, manifest)).toMatchObject({
      preset: 'acme-cli',
      dials: [MAKE, MODULITH, PEER],
      extras: [],
      contexts: ['orders'],
    });
  });

  it('reads a monorepo service off what its preset places at a repository root and it does not record', () => {
    const service = scaffoldOf(HTTP, {
      verticals: ['acme-skeleton', 'agent-harness', 'acme-obs', 'acme-dev'],
    });
    expect(compositionOf(family, service)).toMatchObject({
      preset: 'acme-http',
      member: true,
      extras: [],
      order: ['acme-skeleton', 'agent-harness', 'acme-obs', 'acme-dev'],
    });
    expect(compositionOf(family, scaffoldOf(HTTP)).member).toBe(false);
  });

  it('reads what a product gives its service off the links keel new made, and nothing without them', () => {
    const app = {
      ...scaffoldOf(CLI, { verticals: [...CLI.verticals.map(({ id }) => id), 'acme-gw'] }),
      peers: [TO_API],
    };
    expect(compositionOf(family, app)).toMatchObject({
      preset: 'acme-cli',
      given: ['acme-gw'],
      extras: ['acme-gw'],
    });
    // Linked to an HTTP project the product does not place there: a project of its own.
    const own = { ...app, peers: [{ ...TO_API, ref: '../elsewhere' }] };
    expect(compositionOf(family, own)).toMatchObject({ given: [], extras: ['acme-gw'] });
  });
});

describe('referenceOrder', () => {
  it('is the preset’s verticals in its order, then the extras in admit’s, then bounded-context', () => {
    // The extras arrived zeta first, then alpha, then shipping and its image;
    // one run of keel new installs them by id, the image before what needs it.
    const manifest = scaffoldOf(CLI, {
      layout: MODULITH,
      verticals: [
        'acme-vcs',
        'acme-skeleton',
        'acme-zeta',
        'bounded-context',
        'acme-alpha',
        'agent-harness',
        'acme-zimage',
        'acme-ship',
      ],
      modules: [SKELETON, ORDERS],
    });
    const composition = compositionOf(family, manifest);
    expect(composition.extras).toEqual(['acme-zeta', 'acme-alpha', 'acme-zimage', 'acme-ship']);
    expect(referenceOrder(family, composition)).toEqual([
      'acme-vcs',
      'acme-skeleton',
      'agent-harness',
      'acme-alpha',
      'acme-zeta',
      'acme-zimage',
      'acme-ship',
      'bounded-context',
    ]);
    expect(composition.order).toEqual(referenceOrder(family, composition));
  });

  it('puts a harness adopted later at its preset’s rank, where one run records it', () => {
    const manifest = scaffoldOf(HTTP, {
      verticals: ['acme-vcs', 'acme-skeleton', 'acme-obs', 'acme-dev', 'agent-harness'],
    });
    expect(compositionOf(family, manifest).order).toEqual([
      'acme-vcs',
      'acme-skeleton',
      'agent-harness',
      'acme-obs',
      'acme-dev',
    ]);
  });

  it('leaves out what a monorepo service’s product root carries', () => {
    const service = scaffoldOf(CLI, {
      verticals: ['acme-skeleton', 'agent-harness', 'acme-alpha'],
    });
    expect(compositionOf(family, service).order).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-alpha',
    ]);
  });

  it('is the recorded order where no preset reads back', () => {
    const manifest: ManifestV2 = {
      ...scaffoldOf(CLI, { verticals: ['acme-zeta', 'bounded-context', 'acme-alpha'] }),
      tags: ['lang.acme'],
    };
    const composition = compositionOf(family, manifest);
    expect(composition).toMatchObject({
      preset: null,
      dials: [],
      extras: ['acme-zeta', 'acme-alpha'],
    });
    expect(composition.order).toEqual(['acme-zeta', 'bounded-context', 'acme-alpha']);
  });

  it('puts an extra no registered vertical is any more after the others, which admit still orders', () => {
    const manifest = scaffoldOf(CLI, {
      verticals: [...CLI.verticals.map(({ id }) => id), 'acme-zeta', 'acme-gone', 'acme-alpha'],
    });
    expect(compositionOf(family, manifest).order).toEqual([
      'acme-vcs',
      'acme-skeleton',
      'agent-harness',
      'acme-alpha',
      'acme-zeta',
      'acme-gone',
    ]);
  });

  it('keeps extras admit refuses together as recorded', () => {
    // The gateway needs what a linked HTTP project projects, and nothing is linked.
    const manifest = scaffoldOf(CLI, {
      verticals: [...CLI.verticals.map(({ id }) => id), 'acme-zeta', 'acme-gw', 'acme-alpha'],
    });
    expect(compositionOf(family, manifest).order.slice(3)).toEqual([
      'acme-zeta',
      'acme-gw',
      'acme-alpha',
    ]);
  });

  it('orders the extras over what a linked sibling projects here', () => {
    const manifest: ManifestV2 = {
      ...scaffoldOf(CLI, {
        verticals: [...CLI.verticals.map(({ id }) => id), 'acme-zeta', 'acme-gw'],
      }),
      peers: [{ ...TO_API, ref: '../elsewhere' }],
    };
    expect(compositionOf(family, manifest).order).toEqual([
      'acme-vcs',
      'acme-skeleton',
      'agent-harness',
      'acme-gw',
      'acme-zeta',
    ]);
  });

  it('puts what a product gives its service straight after the preset’s verticals, before an extra whose id sorts first', () => {
    const verticals = [...CLI.verticals.map(({ id }) => id), 'acme-alpha', 'acme-gw'];
    const app: ManifestV2 = { ...scaffoldOf(CLI, { verticals }), peers: [TO_API] };
    expect(compositionOf(family, app).order).toEqual([
      'acme-vcs',
      'acme-skeleton',
      'agent-harness',
      'acme-gw',
      'acme-alpha',
    ]);
    // The same project, linked to nothing the product places: its extras in admit's order.
    const own: ManifestV2 = { ...app, peers: [{ ...TO_API, ref: '../elsewhere' }] };
    expect(compositionOf(family, own).order.slice(3)).toEqual(['acme-alpha', 'acme-gw']);
  });
});

describe('convergeOf', () => {
  const cli = scaffoldOf(CLI);

  describe('add', () => {
    it('admits what is named, closed over its prerequisites, and installs it in plan order, appended', () => {
      const plan = converged(
        convergeOf(family, cli, {
          kind: 'add',
          verticals: ['acme-ship'],
          scope: projectScope(family, cli),
        }),
      );
      expect(runOf(plan)).toEqual(['acme-zimage install', 'acme-ship install']);
      expect(plan.placement).toEqual({ rows: 'append', harness: 'run' });
      expect(plan.target).toMatchObject({
        preset: 'acme-cli',
        extras: ['acme-zimage', 'acme-ship'],
        recorded: [...cli.verticals.map(({ id }) => id), 'acme-zimage', 'acme-ship'],
        order: ['acme-vcs', 'acme-skeleton', 'agent-harness', 'acme-zimage', 'acme-ship'],
      });
    });

    it('re-renders what --refresh names, planned beside it as if it were not there yet', () => {
      const manifest = scaffoldOf(CLI, {
        verticals: [...CLI.verticals.map(({ id }) => id), 'acme-zimage'],
      });
      const plan = converged(
        convergeOf(family, manifest, {
          kind: 'add',
          verticals: ['acme-ship'],
          refresh: ['acme-zimage'],
          scope: projectScope(family, manifest, ['acme-zimage']),
        }),
      );
      // Within the recorded composition: what the project records
      // replays straight after the re-render, before what installs.
      expect(runOf(plan)).toEqual([
        'acme-zimage rerender',
        'acme-vcs replay',
        'acme-skeleton replay',
        'agent-harness replay',
        'acme-ship install',
      ]);
      expect(plan.target.recorded).toEqual([
        ...manifest.verticals.map(({ id }) => id),
        'acme-ship',
      ]);
    });

    it('replays what it installed ahead of the re-render after it, from what the install recorded', () => {
      // The planner runs acme-alpha first: its patches into what the
      // re-render then rewrites go back after the recorded ones, where
      // one run of the target composition, appending it, applies them.
      const plan = converged(
        convergeOf(family, cli, {
          kind: 'add',
          verticals: ['acme-alpha'],
          refresh: ['acme-skeleton'],
          scope: projectScope(family, cli, ['acme-skeleton']),
        }),
      );
      expect(runOf(plan)).toEqual([
        'acme-alpha install',
        'acme-skeleton rerender',
        'acme-vcs replay',
        'agent-harness replay',
        'acme-alpha replay',
      ]);
    });

    it('replays a vertical it re-rendered ahead of one recorded before it, at its rank', () => {
      const plan = converged(
        convergeOf(family, cli, {
          kind: 'add',
          verticals: ['acme-alpha'],
          refresh: ['acme-skeleton', 'acme-vcs'],
          scope: projectScope(family, cli, ['acme-skeleton', 'acme-vcs']),
        }),
      );
      expect(runOf(plan)).toEqual([
        'acme-alpha install',
        'acme-skeleton rerender',
        'acme-vcs rerender',
        'acme-skeleton replay',
        'agent-harness replay',
        'acme-alpha replay',
      ]);
    });

    it('replays nothing where it re-renders nothing', () => {
      const plan = converged(
        convergeOf(family, cli, {
          kind: 'add',
          verticals: ['acme-alpha'],
          scope: projectScope(family, cli),
        }),
      );
      expect(runOf(plan)).toEqual(['acme-alpha install']);
      expect(plan.modules).toEqual([]);
    });

    it('refuses what the scope cannot carry, as the planner refuses it', () => {
      const plan = convergeOf(family, cli, {
        kind: 'add',
        verticals: ['acme-elsewhere'],
        scope: projectScope(family, cli),
      });
      expect(plan).toMatchObject({
        kind: 'refused',
        refusal: { kind: 'plan', error: { code: 'keel.uncoverable-vertical' } },
      });
    });
  });

  describe('reapply', () => {
    it('re-renders what is named, in the order the project records it, a later one at its rank among the replays of every other recorded vertical', () => {
      // acme-skeleton, recorded between the two, patches the second's
      // files, if any, before the second's own patches, as one run does.
      const plan = converged(
        convergeOf(family, cli, { kind: 'reapply', verticals: ['agent-harness', 'acme-vcs'] }),
      );
      expect(runOf(plan)).toEqual([
        'acme-vcs rerender',
        'acme-skeleton replay',
        'agent-harness rerender',
      ]);
      expect(plan.modules).toEqual([]);
      expect(plan.target).toEqual(compositionOf(family, cli));
      expect(plan.placement).toEqual({ rows: 'append', harness: 'run' });
    });

    it('replays what is recorded before the vertical it re-renders too, in recorded order', () => {
      // Rows recorded at rank keep no arrival order: one recorded first
      // may have arrived after, and patched what the re-render rewrites.
      const manifest = scaffoldOf(HTTP, {
        verticals: ['acme-obs', 'acme-vcs', 'acme-skeleton', 'agent-harness', 'acme-dev'],
      });
      expect(
        runOf(
          converged(
            convergeOf(family, manifest, { kind: 'reapply', verticals: ['acme-skeleton'] }),
          ),
        ),
      ).toEqual([
        'acme-skeleton rerender',
        'acme-obs replay',
        'acme-vcs replay',
        'agent-harness replay',
        'acme-dev replay',
      ]);
    });

    it('replays no vertical nothing registered provides any more, and none where every recorded one re-renders', () => {
      const manifest = scaffoldOf(CLI, {
        verticals: [...CLI.verticals.map(({ id }) => id), 'acme-gone'],
      });
      expect(
        runOf(
          converged(
            convergeOf(family, manifest, { kind: 'reapply', verticals: ['acme-skeleton'] }),
          ),
        ),
      ).toEqual(['acme-skeleton rerender', 'acme-vcs replay', 'agent-harness replay']);
      const whole = converged(
        convergeOf(family, cli, {
          kind: 'reapply',
          verticals: cli.verticals.map(({ id }) => id),
        }),
      );
      expect(whole.run.every((step) => step.posture === 'rerender')).toBe(true);
    });
  });

  describe('entrypoint', () => {
    it('reads growth: what newly matches installs alone, the harness re-renders, what the twin adds installs, at the twin’s rank', () => {
      const plan = converged(convergeOf(family, cli, { kind: 'entrypoint', word: 'http' }));
      // Version control is placed at the repository root: it does not settle.
      expect(runOf(plan)).toEqual([
        'acme-skeleton only+settle acme-skeleton/http',
        'agent-harness rerender',
        'acme-obs install',
        'acme-dev install',
      ]);
      expect(plan.placement).toEqual({ rows: 'twin', harness: 'twin' });
      expect(plan.modules).toEqual([]);
      expect(plan.target).toMatchObject({
        preset: 'acme-cli-http',
        recorded: ['acme-vcs', 'acme-skeleton', 'agent-harness', 'acme-obs', 'acme-dev'],
        order: ['acme-vcs', 'acme-skeleton', 'agent-harness', 'acme-obs', 'acme-dev'],
        projects: ['peer.api.rest'],
      });
    });

    it('settles a vertical of the twin that nothing newly matches', () => {
      const manifest = scaffoldOf(HTTP);
      expect(
        runOf(converged(convergeOf(family, manifest, { kind: 'entrypoint', word: 'cli' }))),
      ).toEqual([
        'acme-skeleton only+settle acme-skeleton/cli',
        'agent-harness rerender',
        'acme-obs settle',
        'acme-dev settle',
      ]);
    });

    it('refuses as growth refuses', () => {
      expect(convergeOf(family, cli, { kind: 'entrypoint', word: 'ws' })).toEqual({
        kind: 'refused',
        refusal: { kind: 'growth', refusal: { code: 'keel.unknown-entrypoint', word: 'ws' } },
      });
    });

    it('runs nothing for an entrypoint the project has', () => {
      const plan = converged(convergeOf(family, cli, { kind: 'entrypoint', word: 'cli' }));
      expect(plan.run).toEqual([]);
      expect(plan.target).toEqual(compositionOf(family, cli));
      expect(plan.placement).toEqual({ rows: 'append', harness: 'run' });
    });
  });

  describe('module, on keel’s Go CLI', () => {
    const goCli = STACKS['go-cli']!;
    const modulith = scaffoldOf(goCli, { layout: MODULITH, modules: [SKELETON] });

    it('wires one context by every adapter of keel’s bounded-context its tags match, as the one it adds, consuming what it names, and records the row last', () => {
      const plan = converged(
        convergeOf(shippedRegistry, modulith, {
          kind: 'module',
          name: 'orders',
          consumes: 'greeting',
        }),
      );
      expect(plan.run).toEqual([]);
      expect(plan.modules).toEqual([
        {
          name: 'orders',
          adapters: ['bounded-context/go-context', 'bounded-context/go-context-cli'],
          adds: { consumes: 'greeting' },
        },
      ]);
      expect(plan.target).toMatchObject({
        preset: 'go-cli',
        contexts: ['orders'],
        recorded: [...goCli.verticals.map(({ id }) => id), 'bounded-context'],
      });
      expect(plan.target.order.at(-1)).toBe('bounded-context');
      expect(plan.placement).toEqual({ rows: 'append', harness: 'run' });
    });

    const ADAPTERS = 'bounded-context/go-context,bounded-context/go-context-cli';
    /** The replays of every vertical the Go CLI preset records but the bootstrap. */
    const replayed = goCli.verticals
      .map(({ id }) => id)
      .filter((id) => id !== 'walking-skeleton')
      .map((id) => `${id} replay`);

    it('replays each context it added after a re-render, in recorded order, by every adapter its add ran — the bounded-context row never a step of its own', () => {
      const given = scaffoldOf(goCli, {
        layout: MODULITH,
        verticals: [...goCli.verticals.map(({ id }) => id), 'bounded-context'],
        modules: [SKELETON, ORDERS, { ...ORDERS, name: 'shipping', consumes: 'orders' }],
      });
      const plan = converged(
        convergeOf(shippedRegistry, given, { kind: 'reapply', verticals: ['walking-skeleton'] }),
      );
      expect(runOf(plan)).toEqual([
        'walking-skeleton rerender',
        ...replayed,
        `bounded-context replay orders ${ADAPTERS}`,
        `bounded-context replay shipping ${ADAPTERS}`,
      ]);
      expect(plan.modules).toEqual([]);
    });

    it('replays each context it added where it arrived: before what a keel add appended after it, after what arrived first', () => {
      // orders came before ci and persistence, shipping between them;
      // observability, grown last, is recorded at rank before the
      // bounded-context row, and growth's run wired the contexts after it.
      const at = (minute: number) => `2026-09-27T00:${String(minute).padStart(2, '0')}:00Z`;
      const given = scaffoldOf(goCli, {
        layout: MODULITH,
        verticals: [...goCli.verticals.map(({ id }) => id)],
        modules: [SKELETON, { ...ORDERS, installedAt: at(1) }],
      });
      const history: ManifestV2 = {
        ...given,
        verticals: [
          ...given.verticals,
          { id: 'observability', installedAt: at(5) },
          { id: 'bounded-context', installedAt: at(1) },
          { id: 'ci', installedAt: at(2) },
          { id: 'persistence', installedAt: at(4) },
        ],
        modules: [
          ...given.modules,
          { ...ORDERS, name: 'shipping', consumes: 'orders', installedAt: at(3) },
        ],
      };
      expect(
        runOf(
          converged(
            convergeOf(shippedRegistry, history, {
              kind: 'reapply',
              verticals: ['walking-skeleton'],
            }),
          ),
        ),
      ).toEqual([
        'walking-skeleton rerender',
        ...replayed,
        'observability replay',
        `bounded-context replay orders ${ADAPTERS}`,
        'ci replay',
        `bounded-context replay shipping ${ADAPTERS}`,
        'persistence replay',
      ]);
      // Recorded at one instant, as under a pinned clock: each goes
      // before what is appended after the bounded-context row.
      const pinned: ManifestV2 = {
        ...history,
        verticals: history.verticals.map((row) => ({ ...row, installedAt: at(0) })),
        modules: history.modules.map((row) => ({ ...row, installedAt: at(0) })),
      };
      expect(
        runOf(
          converged(
            convergeOf(shippedRegistry, pinned, {
              kind: 'reapply',
              verticals: ['walking-skeleton'],
            }),
          ),
        ),
      ).toEqual([
        'walking-skeleton rerender',
        ...replayed,
        'observability replay',
        `bounded-context replay orders ${ADAPTERS}`,
        `bounded-context replay shipping ${ADAPTERS}`,
        'ci replay',
        'persistence replay',
      ]);
    });

    it('replays each context it added before a later named vertical that arrived after it re-renders', () => {
      const given = scaffoldOf(goCli, {
        layout: MODULITH,
        verticals: [...goCli.verticals.map(({ id }) => id), 'bounded-context', 'persistence'],
        modules: [SKELETON, ORDERS],
      });
      expect(
        runOf(
          converged(
            convergeOf(shippedRegistry, given, {
              kind: 'reapply',
              verticals: ['walking-skeleton', 'persistence'],
            }),
          ),
        ),
      ).toEqual([
        'walking-skeleton rerender',
        ...replayed,
        `bounded-context replay orders ${ADAPTERS}`,
        'persistence rerender',
      ]);
    });

    it('replays each context it added after a --refresh re-render beside an add, before what the add installed ahead of it', () => {
      const given = scaffoldOf(goCli, {
        layout: MODULITH,
        verticals: [...goCli.verticals.map(({ id }) => id), 'bounded-context'],
        modules: [SKELETON, ORDERS],
      });
      const plan = converged(
        convergeOf(shippedRegistry, given, {
          kind: 'add',
          verticals: ['ci'],
          refresh: ['walking-skeleton'],
          scope: projectScope(shippedRegistry, given, ['walking-skeleton']),
        }),
      );
      expect(runOf(plan)).toEqual([
        'ci install',
        'walking-skeleton rerender',
        ...replayed,
        `bounded-context replay orders ${ADAPTERS}`,
        'ci replay',
      ]);
      expect(plan.modules).toEqual([]);
    });

    it('records the row once, and wires the one it adds alone, consuming none where it names none', () => {
      const given = scaffoldOf(goCli, {
        layout: MODULITH,
        verticals: [...goCli.verticals.map(({ id }) => id), 'bounded-context'],
        modules: [SKELETON, ORDERS],
      });
      const plan = converged(
        convergeOf(shippedRegistry, given, { kind: 'module', name: 'shipping', consumes: null }),
      );
      expect(plan.target).toMatchObject({
        contexts: ['orders', 'shipping'],
        recorded: given.verticals.map(({ id }) => id),
      });
      expect(plan.modules.map(({ name, adds }) => [name, adds])).toEqual([
        ['shipping', { consumes: null }],
      ]);
    });
  });

  describe('new, from a seed manifest', () => {
    const seed = scaffoldOf(HTTP, { build: BAKE, verticals: [] });

    it('installs the preset in its order, the harness left out, then the extras in admit’s', () => {
      const plan = converged(
        convergeOf(family, seed, {
          kind: 'new',
          stack: 'acme-http',
          harness: false,
          extras: ['acme-ship', 'acme-zeta', 'acme-alpha'],
          member: false,
        }),
      );
      expect(runOf(plan)).toEqual([
        'acme-vcs install',
        'acme-skeleton install',
        'acme-obs install',
        'acme-dev install',
        'acme-alpha install',
        'acme-zeta install',
        'acme-zimage install',
        'acme-ship install',
      ]);
      // What the run records reads back as the composition it converged onto.
      const wrote = {
        ...seed,
        verticals: plan.run.map(({ vertical: { id } }) => ({ id, installedAt: 'now' })),
      };
      expect(compositionOf(family, wrote)).toEqual(plan.target);
      expect(plan.target).toMatchObject({
        preset: 'acme-http',
        dials: [BAKE, BASIC],
        harness: false,
        order: plan.run.map(({ vertical: { id } }) => id),
      });
    });

    it('leaves out of a monorepo service what its product root carries', () => {
      const plan = converged(
        convergeOf(family, seed, {
          kind: 'new',
          stack: 'acme-http',
          harness: true,
          extras: [],
          member: true,
        }),
      );
      expect(runOf(plan)).toEqual([
        'acme-skeleton install',
        'agent-harness install',
        'acme-obs install',
        'acme-dev install',
      ]);
      expect(plan.target).toMatchObject({
        member: true,
        order: plan.run.map(({ vertical: { id } }) => id),
      });
    });

    it('refuses an extra the preset cannot carry, as keel new --with does', () => {
      expect(
        convergeOf(family, seed, {
          kind: 'new',
          stack: 'acme-http',
          harness: true,
          extras: ['acme-elsewhere'],
          member: false,
        }),
      ).toMatchObject({
        kind: 'refused',
        refusal: { kind: 'plan', error: { code: 'keel.uncoverable-vertical' } },
      });
    });

    it('refuses of a monorepo service an extra placed at a repository root, which a repository of its own takes', () => {
      const asked = (member: boolean) =>
        convergeOf(family, seed, {
          kind: 'new',
          stack: 'acme-http',
          harness: true,
          extras: ['acme-ci'],
          member,
        });
      expect(asked(true)).toMatchObject({
        kind: 'refused',
        refusal: { kind: 'plan', error: { code: 'keel.wrong-scope' } },
      });
      expect(runOf(converged(asked(false))).at(-1)).toBe('acme-ci install');
    });

    describe('of a product’s service', () => {
      const app: ManifestV2 = { ...scaffoldOf(CLI, { verticals: [] }), peers: [TO_API] };
      const asked = (member: boolean, extras: readonly string[]) =>
        convergeOf(family, app, {
          kind: 'new',
          stack: 'acme-cli',
          harness: true,
          extras,
          member,
          service: { product: 'acme-product', path: 'app' },
        });

      it('installs what the product gives it after the preset, never admitted, then the extras admitted beside it', () => {
        const plan = converged(asked(false, ['acme-alpha']));
        expect(runOf(plan)).toEqual([
          'acme-vcs install',
          'acme-skeleton install',
          'agent-harness install',
          'acme-gw install',
          'acme-alpha install',
        ]);
        expect(plan.target).toMatchObject({
          given: ['acme-gw'],
          extras: ['acme-gw', 'acme-alpha'],
        });
        expect(plan.target.order).toEqual(plan.run.map(({ vertical: { id } }) => id));
        // What the run records reads back as the composition it converged onto.
        const wrote = {
          ...app,
          verticals: plan.run.map(({ vertical: { id } }) => ({ id, installedAt: 'now' })),
        };
        expect(compositionOf(family, wrote)).toEqual(plan.target);
      });

      it('sets aside an extra the product gives it already', () => {
        expect(runOf(converged(asked(false, ['acme-gw'])))).toEqual(
          runOf(converged(asked(false, []))),
        );
      });

      it('plans a monorepo service’s extras on what its product root gives it', () => {
        const plan = converged(asked(true, ['acme-alpha']));
        expect(runOf(plan)).toEqual([
          'acme-skeleton install',
          'agent-harness install',
          'acme-gw install',
          'acme-alpha install',
        ]);
        expect(plan.target).toMatchObject({ member: true, given: ['acme-gw'] });
        expect(plan.target.order).toEqual(plan.run.map(({ vertical: { id } }) => id));
        expect(asked(true, ['acme-ci'])).toMatchObject({
          kind: 'refused',
          refusal: { kind: 'plan', error: { code: 'keel.wrong-scope' } },
        });
      });
    });
  });

  it('takes no request that removes: each kind adds, and none has a field that takes away', () => {
    expectTypeOf<ConvergeRequest['kind']>().toEqualTypeOf<
      'add' | 'reapply' | 'entrypoint' | 'module' | 'new'
    >();
    expectTypeOf<keyof Extract<ConvergeRequest, { kind: 'add' }>>().toEqualTypeOf<
      'kind' | 'verticals' | 'refresh' | 'scope' | 'siblings'
    >();
    expectTypeOf<keyof Extract<ConvergeRequest, { kind: 'reapply' }>>().toEqualTypeOf<
      'kind' | 'verticals'
    >();
    expectTypeOf<keyof Extract<ConvergeRequest, { kind: 'entrypoint' }>>().toEqualTypeOf<
      'kind' | 'word'
    >();
    expectTypeOf<keyof Extract<ConvergeRequest, { kind: 'module' }>>().toEqualTypeOf<
      'kind' | 'name' | 'consumes'
    >();
    expectTypeOf<keyof Extract<ConvergeRequest, { kind: 'new' }>>().toEqualTypeOf<
      'kind' | 'stack' | 'harness' | 'extras' | 'member' | 'service'
    >();
    const requests: ConvergeRequest[] = [
      // @ts-expect-error — no request kind removes a vertical
      { kind: 'remove', verticals: ['acme-dev'] },
      // @ts-expect-error — nor does a request that adds take one away beside it
      { kind: 'add', verticals: [], scope: projectScope(family, cli), remove: ['acme-dev'] },
      // @ts-expect-error — nor does a re-render
      { kind: 'reapply', verticals: ['acme-dev'], drop: ['acme-obs'] },
    ];
    expect(requests).toHaveLength(3);
  });
});
