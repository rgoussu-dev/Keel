/**
 * The loop `keel ui` closes with `POST /api/dials`: **what the page
 * can put in a body is exactly what `POST /api/install` accepts.**
 *
 * `tests/domain/core/dials.test.ts` proves that as a property of the
 * engine, against a fixture rule that really constrains one dial
 * against another. This is the same assertion from the other end —
 * over the shipped registry, through the mediator, on the route the
 * page actually calls — plus the anchor that ties "the gate accepts
 * it" to "the API accepts it": a combination the dials keep off the
 * menu really does come back 422 from the install route.
 *
 * The walk models the page's controls exactly. `<keel-new-form>` can
 * set a dial to any value on its menu and tick the peer-context box
 * where it is shown; it can do nothing else. So following every such
 * move from the blank target enumerates every body the page can post.
 *
 * A preset move is the one control that posts a target the menus did
 * not draw: it keeps the old preset's dials (`target.js`) and leaves
 * the snapping to this route. The last block drives that move the way
 * `<keel-app>` does — retarget, round trip, settle — so "the page keeps
 * what the new preset can take" is proved on the route that decides
 * what it can take.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApi } from '../../../src/application/web/contract/api.js';
import type { DirectoryReader } from '../../../src/application/web/contract/api.js';
import type { UiRequest, UiResponse } from '../../../src/application/web/contract/http.js';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import type { Tag } from '../../../src/domain/contract/composition.js';
import { pickShape, locate } from '../../../assets/web/src/finder.js';
import { retarget, settle } from '../../../assets/web/src/target.js';
import { catalogQuery, dialsQuery } from '../../../src/domain/contract/queries.js';
import type { Catalog, DialOptions } from '../../../src/domain/contract/queries.js';
import { assemblyRefusal } from '../../../src/domain/core/compatibility.js';
import { piecesOf } from '../../../src/domain/core/dials.js';
import { stackTagsFor } from '../../../src/domain/core/stacks.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import { PEER_CONTEXT_TAG } from '../../../src/domain/core/adapters/module-layout.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { expectOk, installMediator } from '../../support/factory.js';

const directories: DirectoryReader = {
  defaultPath: () => '/home/dev',
  list: (listed) =>
    Promise.resolve({ path: listed, parent: null, entries: [], empty: true, exists: true }),
};

function post(mediator: Mediator, route: string, body: unknown): Promise<UiResponse> {
  const request: UiRequest = {
    method: 'POST',
    path: route,
    query: {},
    headers: {},
    body: JSON.stringify(body),
  };
  return buildApi({ mediator, directories })(request).then((response) => {
    if (response === null) throw new Error(`the API declined ${route}`);
    return response;
  });
}

const bodyOf = (response: UiResponse): Record<string, never> =>
  JSON.parse(response.body) as Record<string, never>;

/** One `POST /api/dials` round trip, as the page makes it. */
async function dialsFor(mediator: Mediator, target: NewProjectTarget): Promise<DialOptions> {
  const response = await post(mediator, '/api/dials', { cwd: '/tmp/demo', target, answers: {} });
  expect(response.status).toBe(200);
  return bodyOf(response) as unknown as DialOptions;
}

/**
 * Every target the page can post for `stack`: settle the blank one,
 * then follow every move its controls offer until nothing new shows
 * up. Breadth-first, so a stack with four combinations costs four
 * round trips rather than a tree of them.
 */
async function reachable(mediator: Mediator, stack: string): Promise<readonly NewProjectTarget[]> {
  const found = new Map<string, NewProjectTarget>();
  const queue: NewProjectTarget[] = [{ kind: 'new-project', stack }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const dials = await dialsFor(mediator, next);
    const settled = dials.target as NewProjectTarget;
    const key = JSON.stringify(settled);
    if (found.has(key)) continue;
    found.set(key, settled);
    for (const build of dials.buildSystems) queue.push({ ...settled, buildSystem: build.id });
    for (const layout of dials.moduleLayouts) queue.push({ ...settled, moduleLayout: layout.id });
    for (const service of dials.services) {
      for (const build of service.buildSystems) {
        queue.push({ ...settled, buildSystem: `${service.path}=${build.id}` });
      }
    }
    if (dials.peerContext) queue.push({ ...settled, withPeerContext: true });
    queue.push({ ...settled, withPeerContext: false });
  }
  return [...found.values()];
}

/**
 * Why `POST /api/install` would refuse this target, or null when it
 * would not: the assembly gate `keel new` runs after the last dial
 * and before the first file, read over the arithmetic it stages from.
 *
 * A composite is a different claim and made below — its services are
 * separate installs of separate stacks, so the product root never
 * assembles their tags together and there is no combination for a
 * rule to bite on.
 */
function installRefusal(target: NewProjectTarget): string | null {
  const stack = shippedRegistry.stack(target.stack ?? '');
  if (stack === null || stack.services !== undefined) return null;
  const buildTag = stack.buildSystems?.find((o) => o.id === target.buildSystem)?.tag ?? null;
  const layoutTag = stack.moduleLayouts?.find((o) => o.id === target.moduleLayout)?.tag ?? null;
  const tags: Tag[] = [...stackTagsFor(stack, buildTag, layoutTag)];
  if (target.withPeerContext === true) tags.push(PEER_CONTEXT_TAG);
  return assemblyRefusal(piecesOf(stack), tags);
}

describe('every body keel ui can post', () => {
  it('is one POST /api/install accepts, for every stack and every setting of its dials', async () => {
    const mediator = installMediator();
    const catalog: Catalog = expectOk(await mediator.dispatch(catalogQuery()));
    expect(catalog.stacks.length).toBeGreaterThan(0);

    for (const descriptor of catalog.stacks) {
      for (const target of await reachable(mediator, descriptor.id)) {
        expect(
          installRefusal(target),
          `${descriptor.id}: the page can post ${JSON.stringify(target)}`,
        ).toBeNull();
      }
    }
  });

  it('reaches every setting the shipped stacks offer, so nothing legal is hidden', async () => {
    // The other half. A menu that offered nothing at all would pass
    // the assertion above; what stops it is that the walk still
    // arrives at every combination the registry declares legal.
    const mediator = installMediator();
    const reached = await reachable(mediator, 'quarkus-rest');
    expect(
      reached
        .map(
          (target) =>
            `${target.buildSystem}/${target.moduleLayout}${target.withPeerContext === true ? '+peer' : ''}`,
        )
        .sort(),
    ).toEqual([
      'gradle/basic',
      'gradle/modulith',
      'gradle/modulith+peer',
      'maven/basic',
      'maven/modulith',
      'maven/modulith+peer',
    ]);
    // All four build × layout combinations, and the peer context on
    // top of the two that can carry it — the shipped rule
    // `peer-context-needs-modulith`, read as a menu.
  });

  it('never posts a composite dial the install refuses outright', async () => {
    // `--module-layout`, `--with-peer-context` and `--with` are hard
    // errors on a composite, so a settled product target must carry
    // none of them however the caller asks.
    const mediator = installMediator();
    const settled = await dialsFor(mediator, {
      kind: 'new-project',
      stack: 'fullstack',
      moduleLayout: 'modulith',
      withPeerContext: true,
      extraVerticals: ['ci'],
    });
    expect(settled.target).toEqual({
      kind: 'new-project',
      stack: 'fullstack',
      layout: 'monorepo',
      buildSystem: 'backend=gradle,frontend=npm',
    });
  });
});

describe('the anchor: the gate and the route agree', () => {
  it('refuses at POST /api/install exactly what the dials keep off the menu', async () => {
    const mediator = installMediator();
    const cwd = await mkdtemp(path.join(tmpdir(), 'keel-dials-'));
    try {
      const illegal: NewProjectTarget = {
        kind: 'new-project',
        stack: 'quarkus-cli',
        buildSystem: 'gradle',
        moduleLayout: 'basic',
        withPeerContext: true,
      };
      // The route refuses it, in the rule's own words…
      const refused = await post(mediator, '/api/install', { cwd, target: illegal, answers: {} });
      expect(refused.status).toBe(422);
      expect(bodyOf(refused)).toMatchObject({ error: { code: 'keel.incompatible' } });

      // …and the dials had already taken it off the menu, so the page
      // never had it to send.
      const dials = await dialsFor(mediator, illegal);
      expect(dials.peerContext).toBe(false);
      expect((dials.target as NewProjectTarget).withPeerContext).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('offers the peer context back the moment the layout allows it', async () => {
    const mediator = installMediator();
    const dials = await dialsFor(mediator, {
      kind: 'new-project',
      stack: 'quarkus-cli',
      moduleLayout: 'modulith',
      withPeerContext: true,
    });
    expect(dials.peerContext).toBe(true);
    expect((dials.target as NewProjectTarget).withPeerContext).toBe(true);
  });
});

describe('the dials query as a menu service', () => {
  it('answers for an unknown stack rather than refusing', async () => {
    // Refusing is `keel.preview`'s job. A menu that will not answer
    // where the target is broken is a menu that cannot be used to fix
    // it.
    const mediator = installMediator();
    const dials = await dialsFor(mediator, { kind: 'new-project', stack: 'nope' });
    expect(dials.target).toEqual({ kind: 'new-project', stack: 'nope' });
    expect(dials.buildSystems).toEqual([]);
  });

  it('reports no dials for a brownfield target, and hands it back untouched', async () => {
    const mediator = installMediator();
    const target = { kind: 'add-vertical', verticals: ['ci'], reapply: true } as const;
    const response = await post(mediator, '/api/dials', { cwd: '/tmp/demo', target });
    const dials = bodyOf(response) as unknown as DialOptions;
    expect(dials.target).toEqual(target);
    expect(dials.buildSystems).toEqual([]);
    expect(dials.moduleLayouts).toEqual([]);
    expect(dials.peerContext).toBe(false);

    // The one-vertical alias the page posts comes back as the list it
    // stands for.
    const alias = await post(mediator, '/api/dials', {
      cwd: '/tmp/demo',
      target: { kind: 'add-vertical', vertical: 'ci', reapply: true },
    });
    expect((bodyOf(alias) as unknown as DialOptions).target).toEqual(target);
  });

  it('drops an extra this preset cannot carry, says why, and pins none when asked for none', async () => {
    const mediator = installMediator();
    const withExtras = await dialsFor(mediator, {
      kind: 'new-project',
      stack: 'go-cli',
      extraVerticals: ['persistence', 'ci'],
    });
    const kept = (withExtras.target as NewProjectTarget).extraVerticals ?? [];
    expect(kept).toContain('ci');
    expect(kept).not.toContain('persistence');
    expect(withExtras.adjustments).toEqual([
      expect.objectContaining({ id: 'persistence', change: 'dropped' }),
    ]);
    expect(withExtras.extraVerticals.map((choice) => choice.id)).toContain('ci');

    // Absent stays absent: the extras list only ever reaches the page
    // as a `keel.preview` question, and pinning it here would stop
    // that question being asked at all.
    const blank = await dialsFor(mediator, { kind: 'new-project', stack: 'go-cli' });
    expect((blank.target as NewProjectTarget).extraVerticals).toBeUndefined();
  });

  it('adds the prerequisites of an extra the page ticks, and says so', async () => {
    // The page includes them for the user; the command line refuses a
    // set without them, naming the same ones.
    const mediator = installMediator();
    const dials = await dialsFor(mediator, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      extraVerticals: ['iac'],
    });
    expect((dials.target as NewProjectTarget).extraVerticals).toEqual([
      'containerization',
      'distribution',
      'iac',
    ]);
    expect(dials.adjustments.map((adjustment) => [adjustment.id, adjustment.change])).toEqual([
      ['containerization', 'added'],
      ['distribution', 'added'],
    ]);
    const response = await post(mediator, '/api/preview', {
      cwd: '/tmp/keel-dials-preview',
      target: dials.target,
      answers: {},
    });
    expect(response.status).toBe(200);
  });

  it('validates the body it is given', async () => {
    const mediator = installMediator();
    const response = await post(mediator, '/api/dials', { target: { kind: 'nope' } });
    expect(response.status).toBe(400);
    expect(bodyOf(response)).toMatchObject({ error: { code: 'keel.web.bad-request' } });
  });
});

describe('the dials query, dispatched directly', () => {
  it('is a query the mediator resolves without any port', async () => {
    const dials: DialOptions = expectOk(
      await installMediator().dispatch(
        dialsQuery({ target: { kind: 'new-project', stack: 'quarkus-rest' } }),
      ),
    );
    expect(dials.buildSystems.map((choice) => choice.id)).toEqual(['gradle', 'maven']);
    expect(dials.moduleLayouts.map((choice) => choice.id)).toEqual(['basic', 'modulith']);
  });
});

describe('a preset move, the way the page makes it', () => {
  type Run = ReturnType<typeof settle>;

  /** The page's run once `keel.dials` has settled `target`, as it opens on a preset. */
  async function settledOn(mediator: Mediator, target: NewProjectTarget): Promise<Run> {
    const blank = { kind: 'new-project', stack: target.stack };
    const run: Run = {
      target: blank,
      answers: {},
      dials: null,
      generation: 0,
      carried: null,
      notice: '',
    };
    return settle(run, await dialsFor(mediator, target));
  }

  /** Retarget onto `stack`, round-trip the carried target, settle — `<keel-app>`'s three moves. */
  async function moveTo(mediator: Mediator, run: Run, stack: string): Promise<Run> {
    const catalog: Catalog = expectOk(await mediator.dispatch(catalogQuery()));
    const moved = retarget(run, { stack });
    const dials = await dialsFor(mediator, moved.target as unknown as NewProjectTarget);
    return settle(moved, dials, catalog.finder);
  }

  it('keeps Maven and the modulith from quarkus-rest onto quarkus-cli-rest', async () => {
    // Ticking the CLI adapter is a preset move. It used to cost the
    // two dials set on the way, although the new preset takes both.
    const mediator = installMediator();
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
    });
    const after = await moveTo(mediator, before, 'quarkus-cli-rest');
    expect(after.target).toMatchObject({
      stack: 'quarkus-cli-rest',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
    });
    expect(after.notice).toBe('');
    expect(installRefusal(after.target as unknown as NewProjectTarget)).toBeNull();
  });

  it('snaps what the new preset cannot take, and says so in one line', async () => {
    const mediator = installMediator();
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
      withPeerContext: true,
    });
    const after = await moveTo(mediator, before, 'ts-cli');
    // TypeScript builds with npm or pnpm, so Maven snaps to the first;
    // the modulith and the peer context it takes as they are.
    expect(after.target).toMatchObject({
      stack: 'ts-cli',
      buildSystem: 'npm',
      moduleLayout: 'modulith',
      withPeerContext: true,
    });
    expect(after.notice).toBe('Moving to ts-cli did not keep build system maven.');
  });

  it('announces the language a shape move had to leave behind', async () => {
    const mediator = installMediator();
    const catalog: Catalog = expectOk(await mediator.dispatch(catalogQuery()));
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'spring-cli-rest-kotlin',
      moduleLayout: 'modulith',
    });
    const here = locate(catalog.finder, 'spring-cli-rest-kotlin');
    const landed = pickShape(catalog.finder, 'fullstack', here);
    expect(landed).toBe('fullstack-spring');

    const after = await moveTo(mediator, before, landed ?? '');
    expect(after.notice).toBe(
      'Kotlin has no fullstack preset, so the language is now Java. ' +
        'Moving to fullstack-spring did not keep module layout modulith.',
    );
  });
});
