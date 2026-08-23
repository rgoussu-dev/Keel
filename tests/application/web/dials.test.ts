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
import { catalogQuery, dialsQuery } from '../../../src/domain/contract/queries.js';
import type { Catalog, DialOptions } from '../../../src/domain/contract/queries.js';
import { assemblyRefusal } from '../../../src/domain/core/compatibility.js';
import { piecesOf } from '../../../src/domain/core/dials.js';
import { getStack, stackTagsFor } from '../../../src/domain/core/stacks.js';
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
  const stack = getStack(target.stack ?? '');
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
    const target = { kind: 'add-vertical', vertical: 'ci', reapply: true } as const;
    const response = await post(mediator, '/api/dials', { cwd: '/tmp/demo', target });
    const dials = bodyOf(response) as unknown as DialOptions;
    expect(dials.target).toEqual(target);
    expect(dials.buildSystems).toEqual([]);
    expect(dials.moduleLayouts).toEqual([]);
    expect(dials.peerContext).toBe(false);
  });

  it('prunes an extra vertical no adapter here can cover, and pins none when asked for none', async () => {
    const mediator = installMediator();
    const withExtras = await dialsFor(mediator, {
      kind: 'new-project',
      stack: 'go-cli',
      extraVerticals: ['persistence', 'ci'],
    });
    const kept = (withExtras.target as NewProjectTarget).extraVerticals ?? [];
    expect(kept).toContain('ci');
    expect(kept).not.toContain('persistence');
    expect(withExtras.extraVerticals.map((choice) => choice.id)).toContain('ci');

    // Absent stays absent: the extras list only ever reaches the page
    // as a `keel.preview` question, and pinning it here would stop
    // that question being asked at all.
    const blank = await dialsFor(mediator, { kind: 'new-project', stack: 'go-cli' });
    expect((blank.target as NewProjectTarget).extraVerticals).toBeUndefined();
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
