/**
 * The converge reading (`src/domain/core/converge.ts`) on every cell of
 * the paths golden (`docs/roadmap.md` → S.2): what the one operation
 * every path is to call reads for the command each cell runs last —
 * the target composition's reference order, what each vertical of the
 * run does, the contexts it wires and where it records, or the
 * refusal. Epic S's later steps make each path its caller, and their
 * diffs are reviewed against this record, as Q1.3's were against the
 * planner's readiness golden.
 *
 * **Scenario.** The paths golden's cells, derived by its four families
 * (`support/paths-families.ts`) — every cell its four goldens key, and
 * no other. Each is read on the manifest its last command runs on,
 * every command before it run for real, with the request that command
 * makes, as its handler makes it before it plans. The handler's own
 * gates come first, each read through the function the handler reads
 * it with, and a cell they stop records the code (`gate`): no project
 * there; at a product root, a vertical the root cannot carry; a
 * re-render of a vertical not installed, or one its own rules refuse;
 * `keel add entrypoint` inside a monorepo product; `keel add module`
 * where the project takes no context. The harness generation is left
 * out: every cell's manifest is this keel's. A `keel new` cell is read
 * on the seed manifest each of its scopes starts from — the preset's
 * and the dials' tags, `projects`, `peers`, `services` and the
 * scaffolded modules, as `keel new` seeds them — then run, and each
 * manifest it leaves is read back (`compositionOf`): the round trip,
 * which names the preset, the dials, what a product gives its service
 * and the extras that wrote it, on every single-service cell and in
 * each product's services. The paths golden names no extra of a
 * product's service, so the round trip is also held, and recorded
 * nowhere, on each product under each layout with every service naming
 * its whole extras menu ({@link menus}). A `keel add module` or
 * `keel add entrypoint` cell whose reading converges is run too, and
 * the record it leaves held against the reading's target. What each
 * cell comes to — a gate, a refusal or a plan — is held against the
 * verdict its paths golden records, code for code.
 *
 * **Factory.** The paths golden's `PathsSweep` in its reading mode:
 * {@link installMediator} over the real templates, the shipped
 * in-memory `Tree` and `ManifestStore` fakes over one in-memory disk,
 * each scaffold made once, every command before a cell's last run for
 * real, and the last only for a `keel new`, `keel add module` or
 * `keel add entrypoint` cell, whose records the reading is held
 * against.
 *
 * **Port.** `convergeOf` and `compositionOf`, over the manifests read
 * back through the `ManifestStore` port; `Mediator.dispatch` for every
 * run and for every reading the cells are derived from.
 *
 * `converge.golden.json` keys each cell as the paths golden does, by
 * its command lines. `KEEL_UPDATE_GOLDEN=1` rewrites it, through
 * prettier; it reads the paths golden's four files for their keys, so
 * regenerate those first.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import * as prettier from 'prettier';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AddEntrypointTarget,
  AddModuleTarget,
  AddVerticalTarget,
  NewProjectTarget,
} from '../../../src/domain/contract/commands.js';
import {
  emptyManifestV2,
  projectScopeRoot,
  type InstalledModule,
  type ManifestV2,
  type PeerLink,
} from '../../../src/domain/contract/manifest.js';
import { NOT_INITIALISED_CODE } from '../../../src/domain/contract/nearby.js';
import type { Tag } from '../../../src/domain/contract/composition.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import { addScopeOf, productRootReading } from '../../../src/domain/core/add-readiness.js';
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  PEER_MODULE,
  SKELETON_MODULE,
} from '../../../src/domain/core/adapters/module-layout.js';
import {
  compositionOf,
  convergeOf,
  type Composition,
  type ConvergePlan,
  type ConvergeRequest,
  type ConvergeStep,
} from '../../../src/domain/core/converge.js';
import { moduleRefusal } from '../../../src/domain/core/handlers/add-module.js';
import {
  elsewhereRefusal,
  placementRefusal,
  ruleRefusal,
  VERTICAL_NOT_INSTALLED_CODE,
  WRONG_SCOPE_CODE,
} from '../../../src/domain/core/refusals.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import { boundedContextVertical } from '../../../src/domain/core/verticals/bounded-context.js';
import {
  productPlaceOf,
  provisionsHere,
  scopeOf,
  siblingsOf,
  type DirectoryScope,
} from '../../../src/domain/core/scope.js';
import { PINNED_NOW } from '../../support/factory.js';
import { PATHS_FAMILIES, PATHS_NEW } from '../../support/paths-families.js';
import { offeredAsExtra } from '../../support/dial-walk.js';
import { newStep, PathsSweep, type CellReading } from '../../support/paths-golden.js';

const GOLDEN = new URL('./converge.golden.json', import.meta.url);
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

/**
 * The four families take 13 to 43 s each under the paths golden, which
 * records what every cell leaves; read before their last command, in
 * one sweep, with the product menus beside them, they take about 44 s
 * together. `verify` runs this beside the rest of the suite, so the
 * budget is far above that and far below a hang.
 */
const SWEEP_TIMEOUT = 300_000;

/** How many moved cells a failure lists before it counts the rest. */
const LISTED = 50;

/** The paths golden's verdict of a run that came back Ok. */
const OK = 'ok';

const registry = shippedRegistry;

/** What the reading of one scope records. */
type Reading =
  /** The handler refuses before it plans: its code. */
  | { readonly gate: string }
  /** The reading refuses: growth's code, or the planner's with the sentence both front doors give. */
  | { readonly refused: string; readonly sentence?: string }
  /** A command before the last did not come back Ok, and the chain stopped there. */
  | { readonly stopped: string }
  | {
      /** The target composition's reference order, its ids joined by a space. */
      readonly order: string;
      /** Each step of the run: `<vertical> <posture>`, then `+settle` and the adapters installing, where it installs some. */
      readonly run: readonly string[];
      /** Each context the run wires: `<name> <adapters>`. */
      readonly modules?: readonly string[];
      /** `<rows>/<harness>`. */
      readonly placement: string;
    };

/** What the round trip reads back from a manifest `keel new` wrote. */
interface Wrote {
  readonly preset: string | null;
  readonly dials: readonly Tag[];
  readonly harness: boolean;
  /** What a product gave the service of its own accord, in the product's order. */
  readonly given: readonly string[];
  readonly extras: readonly string[];
}

/**
 * One cell: the reading of the scope its last command runs in; or, for
 * `keel new`, of each scope it converges — `''` for the cell's
 * directory, a service's path — and what each it leaves reads back as.
 */
type Cell =
  | Reading
  | {
      readonly scopes: Readonly<Record<string, Reading>>;
      readonly wrote: Readonly<Record<string, Wrote>>;
    };

const cells = new Map<string, Cell>();
/**
 * Beyond the paths golden, for the round trip alone: each product under
 * each layout, every service naming the whole extras menu it offers —
 * which no cell of the paths golden names, and where an extra the user
 * names can sort before what the product gives. Read as the cells are,
 * and recorded nowhere.
 */
const menus = new Map<string, Cell>();
/** Every round trip that did not name what `keel new` was given: the cell, the scope, and what moved. */
const trips: string[] = [];
/** How many scopes the round trip read, and how many services among them. */
let tripped = 0;
let services = 0;
/**
 * Every `keel add module` or `keel add entrypoint` cell whose run left
 * a record other than the one its reading converges onto: the cell,
 * and what moved.
 */
const records: string[] = [];
/** How many runs of each were held against their reading, and how many `keel add module` reports. */
const held = { module: 0, entrypoint: 0, adapters: 0 };
let swept = false;

describe('the converge reading, on every cell of the paths golden', () => {
  beforeAll(async () => {
    let into = cells;
    const paths = new PathsSweep(async (cell) => {
      into.set(cell.key, await readingOf(cell));
    });
    // `keel new` last: each of its cells another family scaffolds is
    // read off that scaffold rather than run again.
    for (const family of [...PATHS_FAMILIES.filter((f) => f !== PATHS_NEW), PATHS_NEW]) {
      await family.sweep(paths);
    }
    into = menus;
    await sweepServiceMenus(paths);
    swept = true;
  }, SWEEP_TIMEOUT);

  afterAll(async () => {
    if (!UPDATE || !swept) return;
    const target = fileURLToPath(GOLDEN);
    const options = (await prettier.resolveConfig(target)) ?? {};
    await fs.writeFile(
      GOLDEN,
      await prettier.format(JSON.stringify(sweptCells(), null, 2), {
        ...options,
        filepath: target,
      }),
    );
  });

  it('reads every cell the paths golden keys, and no other', () => {
    const keyed = new Set(
      PATHS_FAMILIES.flatMap(({ name }) =>
        Object.keys(readJson(new URL(`./${name}.golden.json`, import.meta.url))),
      ),
    );
    const read = [...cells.keys()];
    expect({
      unread: listed([...keyed].filter((key) => !cells.has(key)).sort()),
      unkeyed: listed(read.filter((key) => !keyed.has(key)).sort()),
    }).toEqual({ unread: [], unkeyed: [] });
  });

  it('reads back, from every manifest keel new writes, the preset, the dials and the extras that wrote it', () => {
    expect(listed(trips), 'the composition read back, against what keel new was given').toEqual([]);
    // Read on every single-service cell that comes back Ok, and in every product's services.
    expect(services).toBeGreaterThan(0);
    expect(tripped).toBeGreaterThan(services);
  });

  it('reads back each product’s services given their whole extras menus, beside what the product gives them', () => {
    const unread = [...menus].flatMap(([key, cell]) => {
      if (!('scopes' in cell)) return [`${key}: not keel new`];
      const services = Object.keys(cell.scopes).filter((scope) => scope !== '');
      const named = services.filter((scope) => {
        const wrote = cell.wrote[scope];
        return wrote !== undefined && wrote.extras.length > wrote.given.length;
      });
      return services.length > 0 && named.length === services.length
        ? []
        : [`${key}: read back ${named.join(', ')} of ${services.join(', ')}`];
    });
    expect(menus.size).toBeGreaterThan(0);
    expect(listed(unread)).toEqual([]);
  });

  it('refuses where the paths golden refuses, code for code, and converges where its run comes back Ok', () => {
    const ran = new Map(
      PATHS_FAMILIES.flatMap(({ name }) =>
        Object.entries(
          readJson(new URL(`./${name}.golden.json`, import.meta.url)) as Readonly<
            Record<string, { readonly verdict: string }>
          >,
        ).map(([key, cell]) => [key, cell.verdict] as const),
      ),
    );
    const disagree = [...cells].flatMap(([key, cell]) => {
      const verdict = ran.get(key);
      const read =
        'scopes' in cell
          ? (Object.values(cell.scopes)
              .map(verdictOf)
              .find((each) => each !== OK) ?? OK)
          : verdictOf(cell);
      // Answers are no part of a request: keel new's check of them is its handler's alone.
      if (verdict === 'keel.unknown-answer' && read === OK) return [];
      return read === verdict ? [] : [`${key}: read ${read}, ran ${String(verdict)}`];
    });
    expect(listed(disagree)).toEqual([]);
    // Every keel new that comes back Ok is read back in each scope it writes, a monorepo
    // product's root apart.
    const unread = [...cells].flatMap(([key, cell]) => {
      if (!('scopes' in cell) || ran.get(key) !== OK) return [];
      const scopes = Object.keys(cell.scopes);
      const expected = scopes.length === 1 ? scopes : scopes.filter((scope) => scope !== '');
      return JSON.stringify(Object.keys(cell.wrote).sort()) === JSON.stringify(expected.sort())
        ? []
        : [`${key}: read back ${Object.keys(cell.wrote).join(', ')}`];
    });
    expect(listed(unread)).toEqual([]);
  });

  it('records, where keel add module and keel add entrypoint converge, what the run records', () => {
    expect(listed(records), 'the record each run leaves, against its reading').toEqual([]);
    expect(held.module).toBeGreaterThan(0);
    expect(held.entrypoint).toBeGreaterThan(0);
    expect(held.adapters).toBe(held.module);
  });

  it('reads each cell as its golden records', () => {
    if (UPDATE) return;
    const golden = readJson(GOLDEN) as Readonly<Record<string, Cell>>;
    const now = sweptCells();
    const moved = Object.keys({ ...golden, ...now })
      .sort()
      .filter((key) => JSON.stringify(golden[key]) !== JSON.stringify(now[key]));
    expect(listed(moved), 'a deliberate change is recorded by KEEL_UPDATE_GOLDEN=1').toEqual([]);
  });
});

/** Each product under each layout, every service naming the whole extras menu it offers ({@link menus}). */
async function sweepServiceMenus(paths: PathsSweep): Promise<void> {
  const { stacks } = await paths.catalog();
  for (const stack of stacks.filter((each) => each.services.length > 0)) {
    for (const layout of await paths.layouts(stack.id)) {
      const settled = await paths.dials({ kind: 'new-project', stack: stack.id, layout });
      const services = Object.fromEntries(
        settled.services.flatMap((service) => {
          const menu = service.verticals.filter(offeredAsExtra).map(({ id }) => id);
          return menu.length === 0 ? [] : [[service.path, { extraVerticals: menu }] as const];
        }),
      );
      const named = await paths.dials({ ...(settled.target as NewProjectTarget), services });
      await paths.cell(null, [newStep(named.target as NewProjectTarget)]);
    }
  }
}

/** Every cell read, keyed and sorted as the golden holds them. */
function sweptCells(): Readonly<Record<string, Cell>> {
  return Object.fromEntries([...cells.keys()].sort().map((key) => [key, cells.get(key) as Cell]));
}

/** What the cell's last command converges, read before it runs. */
async function readingOf(cell: CellReading): Promise<Cell> {
  if (cell.stopped !== null) return { stopped: cell.stopped };
  const { target } = cell.step;
  const cwd = path.join(cell.dir, cell.step.at);
  switch (target.kind) {
    case 'new-project':
      return newReading(cell, target);
    case 'add-vertical':
      return addReading(await scopeOf({ registry, manifests: cell.manifests }, cwd), target);
    case 'add-entrypoint':
      return entrypointReading(
        cell,
        await scopeOf({ registry, manifests: cell.manifests }, cwd),
        target,
      );
    case 'add-module':
      return moduleReading(cell, await cell.manifests.read(projectScopeRoot(cwd)), cwd, target);
  }
}

/**
 * `keel add`'s request, as the handler builds it before it plans: its
 * gates — no project, a vertical a product root cannot carry, a
 * re-render of one not installed, or refused by its own rules — then
 * the verticals it installs, named less what the project has (or its
 * product gives it, or its services have), and those it re-renders,
 * planned on its scope.
 */
function addReading(where: DirectoryScope, target: AddVerticalTarget): Reading {
  const stored = where.manifest;
  if (stored === null) return { gate: NOT_INITIALISED_CODE };
  const byId = (id: string) => {
    const vertical = registry.vertical(id);
    if (vertical === null)
      throw new Error(`the paths golden names '${id}', which is not registered`);
    return vertical;
  };
  const named = target.verticals.map(byId);
  const refresh = [...new Set(target.refresh ?? [])].map(byId);
  const inServices: string[] = [];
  for (const vertical of named) {
    const reading = productRootReading(registry, where, vertical);
    if (reading === null) continue;
    if (reading.kind === 'refused') return { gate: reading.refusal.code };
    inServices.push(vertical.id);
  }
  const installed = new Set(stored.verticals.map(({ id }) => id));
  const provisions = provisionsHere(registry, where);
  const given = (id: string) => provisions.some((provision) => provision.vertical.id === id);
  const member = where.product !== null && where.product.service !== null;
  const notInstalled = (id: string): string => {
    const vertical = byId(id);
    const reading = productRootReading(registry, where, vertical);
    if (reading !== null) {
      return reading.kind === 'refused'
        ? reading.refusal.code
        : elsewhereRefusal(registry, vertical, reading.services).code;
    }
    if (given(id)) return VERTICAL_NOT_INSTALLED_CODE;
    if (member && vertical.placement?.scope === 'repository') {
      return placementRefusal(registry, vertical).code;
    }
    return VERTICAL_NOT_INSTALLED_CODE;
  };
  if (target.reapply === true) {
    const missing = named.find(({ id }) => !installed.has(id));
    if (missing !== undefined) return { gate: notInstalled(missing.id) };
    for (const vertical of named) {
      const refusal = ruleRefusal(registry, vertical, stored.tags);
      if (refusal !== null) return { gate: refusal.code };
    }
    return recorded(
      convergeOf(registry, stored, { kind: 'reapply', verticals: named.map(({ id }) => id) }),
    );
  }
  const unrefreshable = refresh.find(({ id }) => !installed.has(id));
  if (unrefreshable !== undefined) return { gate: notInstalled(unrefreshable.id) };
  const adding = named
    .map(({ id }) => id)
    .filter((id) => !installed.has(id) && !given(id) && !inServices.includes(id));
  const rerendered = stored.verticals
    .map(({ id }) => id)
    .filter((id) => refresh.some((vertical) => vertical.id === id));
  return recorded(
    convergeOf(registry, stored, {
      kind: 'add',
      verticals: adding,
      refresh: refresh.map(({ id }) => id),
      scope: addScopeOf(registry, where, rerendered),
      siblings: siblingsOf(registry, where),
    }),
  );
}

/** `keel add entrypoint`'s request, after its gates: no project, or inside a monorepo product. */
async function entrypointReading(
  cell: CellReading,
  where: DirectoryScope,
  target: AddEntrypointTarget,
): Promise<Reading> {
  if (where.manifest === null) return { gate: NOT_INITIALISED_CODE };
  if (productPlaceOf(where) !== null) return { gate: WRONG_SCOPE_CODE };
  const plan = convergeOf(registry, where.manifest, {
    kind: 'entrypoint',
    word: target.entrypoint,
  });
  await heldToRun(cell, plan);
  return recorded(plan);
}

/** `keel add module`'s request, after the gates its project status reads (`moduleRefusal`). */
async function moduleReading(
  cell: CellReading,
  stored: ManifestV2 | null,
  cwd: string,
  target: AddModuleTarget,
): Promise<Reading> {
  const refusal = moduleRefusal(stored, projectScopeRoot(cwd), target.module);
  if (refusal !== null || stored === null) return { gate: refusal?.code ?? NOT_INITIALISED_CODE };
  const plan = convergeOf(registry, stored, {
    kind: 'module',
    name: target.module,
    consumes: target.consumes ?? null,
  });
  await heldToRun(cell, plan);
  return recorded(plan);
}

/**
 * Where `plan` converges, runs the cell's last command and holds what
 * it records against the plan's target: its verticals, in their order,
 * and the contexts `keel add module` added; for `keel add module`, the
 * adapters of keel's `bounded-context` its report resolved, against
 * those the plan wires.
 */
async function heldToRun(cell: CellReading, plan: ConvergePlan): Promise<void> {
  if (plan.kind !== 'converges') return;
  const module = cell.step.target.kind === 'add-module';
  held[module ? 'module' : 'entrypoint']++;
  const { verdict, manifests, report } = await cell.run();
  const manifest = manifests.get(cell.step.at);
  if (verdict !== OK || manifest === undefined) {
    records.push(`${cell.key} — ran ${verdict}${manifest === undefined ? ', no manifest' : ''}`);
    return;
  }
  const moved: string[] = [];
  const rows = manifest.verticals.map(({ id }) => id);
  if (rows.join(' ') !== plan.target.recorded.join(' ')) {
    moved.push(`verticals ${rows.join(' ')} for ${plan.target.recorded.join(' ')}`);
  }
  const { contexts } = compositionOf(registry, manifest);
  if (contexts.join(' ') !== plan.target.contexts.join(' ')) {
    moved.push(`contexts ${contexts.join(' ')} for ${plan.target.contexts.join(' ')}`);
  }
  if (module) {
    held.adapters++;
    const resolved = (report?.resolvedAdapters ?? [])
      .map(({ id }) => id)
      .filter((id) => id.startsWith(`${boundedContextVertical.id}/`));
    const wired = plan.modules.flatMap(({ adapters }) => adapters);
    if (resolved.join(' ') !== wired.join(' ')) {
      moved.push(`adapters ${resolved.join(' ')} for ${wired.join(' ')}`);
    }
  }
  if (moved.length > 0) records.push(`${cell.key} — ${moved.join('; ')}`);
}

/** One scope `keel new` converges: its seed, its request, and what it is to read back as. */
interface NewScope {
  readonly seed: ManifestV2;
  readonly request: Extract<ConvergeRequest, { kind: 'new' }>;
  /** Null where the round trip does not hold it: a product root, which is U's. */
  readonly wrote: Wrote | null;
}

/**
 * `keel new`'s reading of each scope, on its seed manifest; then the
 * run, and the round trip on each manifest it leaves.
 */
async function newReading(cell: CellReading, target: NewProjectTarget): Promise<Cell> {
  const scopes = newScopesOf(target);
  const readings = Object.fromEntries(
    [...scopes].map(([scope, { seed, request }]) => [
      scope,
      recorded(convergeOf(registry, seed, request)),
    ]),
  );
  const { verdict, manifests } = await cell.run();
  const wrote: Record<string, Wrote> = {};
  if (verdict !== 'ok') return { scopes: readings, wrote };
  for (const [scope, expected] of scopes) {
    const manifest = manifests.get(scope);
    if (manifest === undefined) {
      trips.push(`${cell.key} [${scope}] — no manifest`);
      continue;
    }
    if (expected.wrote === null) continue;
    const composition = compositionOf(registry, manifest);
    const read = wroteOf(composition);
    wrote[scope] = read;
    tripped++;
    if (scope !== '') services++;
    const moved = [
      ...(JSON.stringify(read) === JSON.stringify(expected.wrote)
        ? []
        : [`${JSON.stringify(read)} for ${JSON.stringify(expected.wrote)}`]),
      ...(composition.member === expected.request.member ? [] : ['member']),
      ...(sameOrder(composition.order, manifest)
        ? []
        : [`order ${composition.order.join(' ')} for ${recordedOf(manifest)}`]),
      ...(sameOrder(stepsOf(readings[scope]), manifest)
        ? []
        : [`the reading's run for ${recordedOf(manifest)}`]),
    ];
    if (moved.length > 0) trips.push(`${cell.key} [${scope}] — ${moved.join('; ')}`);
  }
  return { scopes: readings, wrote };
}

/**
 * The scopes a `keel new` of `target` converges, each from the seed
 * manifest it starts from, as `keel new` seeds it: a single-service
 * preset's own; a product's root, under the monorepo layout, and each
 * of its services, on the build system the settled target names for
 * it and its preset's default module layout, linked to the others.
 */
function newScopesOf(target: NewProjectTarget): ReadonlyMap<string, NewScope> {
  const stack = presetOf(target.stack);
  if (stack.services === undefined) {
    const build = optionTag(stack.buildSystems, target.buildSystem);
    const layout = optionTag(stack.moduleLayouts, target.moduleLayout);
    const peer = target.withPeerContext === true;
    const harness = target.agentHarness !== false;
    const extras = target.extraVerticals ?? [];
    const request = { kind: 'new', stack: stack.id, harness, extras, member: false } as const;
    return new Map([
      [
        '',
        {
          seed: seedOf(stack, [build, layout, peer ? PEER_CONTEXT_TAG : null], []),
          request,
          wrote: {
            preset: stack.id,
            dials: [build, layout, peer ? PEER_CONTEXT_TAG : null].flatMap((tag) => tag ?? []),
            harness,
            given: [],
            extras: [...extras].sort(),
          },
        },
      ],
    ]);
  }
  if ((target.extraVerticals ?? []).length > 0) {
    throw new Error(`${stack.id}: keel new routes a product's extras, which this reading does not`);
  }
  const monorepo = target.layout === 'monorepo';
  const builds = new Map(
    (target.buildSystem ?? '')
      .split(',')
      .filter((pair) => pair.includes('='))
      .map((pair) => pair.split('=') as [string, string]),
  );
  const scopes = new Map<string, NewScope>();
  if (monorepo) {
    scopes.set('', {
      seed: {
        ...seedOf(stack, [], []),
        services: (stack.services ?? []).map((service) => ({
          path: service.path,
          stack: service.stack,
          ...(builds.has(service.path) ? { buildSystem: builds.get(service.path) as string } : {}),
        })),
      },
      request: { kind: 'new', stack: stack.id, harness: true, extras: [], member: false },
      wrote: null,
    });
  }
  const members = stack.services ?? [];
  for (const service of members) {
    const own = presetOf(service.stack);
    const build = optionTag(own.buildSystems, builds.get(service.path));
    const layout = own.moduleLayouts?.[0]?.tag ?? null;
    const peers: PeerLink[] = members
      .filter((other) => other.path !== service.path)
      .map((other) => ({
        ref: path.posix.relative(service.path, other.path),
        tags: [...(presetOf(other.stack).projects ?? [])].sort(),
      }));
    const given = (service.extraVerticals ?? []).map(({ id }) => id);
    const extras = target.services?.[service.path]?.extraVerticals ?? [];
    scopes.set(service.path, {
      seed: seedOf(own, [build, layout], peers),
      request: {
        kind: 'new',
        stack: own.id,
        harness: true,
        extras,
        member: monorepo,
        service: { product: stack.id, path: service.path },
      },
      wrote: {
        preset: own.id,
        dials: [build, layout].flatMap((tag) => tag ?? []),
        harness: true,
        given,
        extras: [...given, ...extras].sort(),
      },
    });
  }
  return scopes;
}

/**
 * The manifest `keel new` starts a scope of `stack` from: the preset's
 * and `dials`' tags, its `projects`, `peers`, and on the modulith the
 * skeleton's context, with the peer's where its marker is among them.
 */
function seedOf(stack: Stack, dials: readonly (Tag | null)[], peers: readonly PeerLink[]) {
  const tags = [...stack.tags, ...dials.flatMap((tag) => tag ?? [])].sort();
  const modules: InstalledModule[] = !tags.includes(MODULITH_LAYOUT_TAG)
    ? []
    : [
        { name: SKELETON_MODULE, installedAt: PINNED_NOW, seam: true },
        ...(tags.includes(PEER_CONTEXT_TAG)
          ? [
              {
                name: PEER_MODULE,
                installedAt: PINNED_NOW,
                seam: false,
                consumes: SKELETON_MODULE,
              },
            ]
          : []),
      ];
  return {
    ...emptyManifestV2(PINNED_NOW, '0.0.0'),
    tags,
    projects: [...(stack.projects ?? [])],
    peers,
    modules,
  } satisfies ManifestV2;
}

/** The tag of the option `id` names, of those a preset offers — the first where none is named. */
function optionTag(
  options: readonly { readonly id: string; readonly tag: Tag }[] | undefined,
  id: string | undefined,
): Tag | null {
  return (options?.find((option) => option.id === id) ?? options?.[0])?.tag ?? null;
}

function presetOf(id: string | undefined): Stack {
  const stack = id === undefined ? null : registry.stack(id);
  if (stack === null)
    throw new Error(`the paths golden names preset '${String(id)}', which is not registered`);
  return stack;
}

/** What the round trip records of a composition. */
function wroteOf(composition: Composition): Wrote {
  return {
    preset: composition.preset,
    dials: composition.dials,
    harness: composition.harness,
    given: composition.given,
    extras: [...composition.extras].sort(),
  };
}

/** Whether `order` is the order `manifest` records its verticals in. */
function sameOrder(order: readonly string[], manifest: ManifestV2): boolean {
  return order.join(' ') === recordedOf(manifest);
}

function recordedOf(manifest: ManifestV2): string {
  return manifest.verticals.map(({ id }) => id).join(' ');
}

/** The verticals a reading runs, in its order; none where it does not converge. */
function stepsOf(reading: Reading | undefined): readonly string[] {
  return reading !== undefined && 'run' in reading
    ? reading.run.map((step) => step.split(' ')[0] ?? step)
    : [];
}

/** A plan as a cell records it. */
function recorded(plan: ConvergePlan): Reading {
  if (plan.kind === 'refused') {
    const { refusal } = plan;
    return refusal.kind === 'growth'
      ? { refused: refusal.refusal.code }
      : { refused: refusal.error.code, sentence: refusal.error.message };
  }
  return {
    order: plan.target.order.join(' '),
    run: plan.run.map(stepLine),
    ...(plan.modules.length > 0
      ? { modules: plan.modules.map(({ name, adapters }) => `${name} ${adapters.join(',')}`) }
      : {}),
    placement: `${plan.placement.rows}/${plan.placement.harness}`,
  };
}

/** What a reading comes to, as the paths golden's verdicts spell it. */
function verdictOf(reading: Reading): string {
  if ('gate' in reading) return reading.gate;
  if ('refused' in reading) return reading.refused;
  if ('stopped' in reading) return reading.stopped;
  return OK;
}

/** A step as a cell records it: `<vertical> <posture>[+settle][ <adapters>]`. */
function stepLine(step: ConvergeStep): string {
  const settles = step.settles === true ? '+settle' : '';
  const adapters = step.adapters === undefined ? '' : ` ${step.adapters.join(',')}`;
  return `${step.vertical.id} ${step.posture}${settles}${adapters}`;
}

function readJson(file: URL): Readonly<Record<string, unknown>> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/** The first {@link LISTED} of `items`, then how many more there are. */
function listed(items: readonly string[]): readonly string[] {
  if (items.length <= LISTED) return items;
  return [...items.slice(0, LISTED), `… and ${items.length - LISTED} more`];
}
