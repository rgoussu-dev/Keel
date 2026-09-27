/**
 * The loop `keel ui` closes with `POST /api/dials`: **what the page
 * can put in a body is exactly what `POST /api/install` accepts.**
 *
 * `tests/domain/core/dials.test.ts` proves that as a property of the
 * engine, against a fixture rule that really constrains one dial
 * against another. This is the same assertion from the other end —
 * over the shipped registry, through the mediator, on the routes the
 * page actually calls — plus the anchor that ties "the gate accepts
 * it" to "the API accepts it": a combination the dials keep off the
 * menu really does come back 422 from the install route.
 *
 * The walk models the page's controls. `<keel-new-form>` can set a
 * dial to any value on its menu, tick the peer-context box where it
 * is shown, press the agent harness off where it may be left out, and
 * tick or untick an "Also scaffold" box — a gesture
 * that can move several boxes at once, which is why the walk makes it
 * through `target.js`'s own `toggleExtra` rather than a copy of it.
 * Every dial setting is followed from the blank target until nothing
 * new shows up (`support/dial-walk.ts`); the extras are ticked one at
 * a time on each preset's opening dials, and each box a tick moved is
 * unticked again. The full powerset of extras, on every dial setting,
 * is the weekly composition sweep's (`tests/sweep/`, report-only):
 * too many previews for `verify`.
 *
 * **The oracle is the route itself**: every body reached is posted to
 * `POST /api/preview` and must come back 200. It used to be the
 * assembly gate re-derived over tags, which is how an offered extra
 * that threw inside its adapter passed a test claiming the menu and
 * the gate agree.
 *
 * A preset move is the one control that posts a target the menus did
 * not draw: it keeps the old preset's dials and extras (`target.js`)
 * and leaves the snapping to this route. The last block drives that
 * move the way `<keel-app>` does — retarget, round trip, settle — so
 * "the page keeps what the new preset can take, and names what it
 * could not" is proved on the route that decides what it can take.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApi } from '../../../src/application/web/contract/api.js';
import type { DirectoryReader } from '../../../src/application/web/contract/api.js';
import type { UiRequest, UiResponse } from '../../../src/application/web/contract/http.js';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { pickShape, locate } from '../../../assets/web/src/finder.js';
import {
  extrasOf,
  retarget,
  serviceExtrasOf,
  settle,
  toggleExtra,
} from '../../../assets/web/src/target.js';
import { catalogQuery, dialsQuery } from '../../../src/domain/contract/queries.js';
import type { Catalog, DialOptions } from '../../../src/domain/contract/queries.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { offeredAsExtra, settledRun, walkDials } from '../../support/dial-walk.js';
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
 * What `POST /api/preview` answers a body with: `200`, or the status
 * and the refusal it carried — so a failure names the refusal rather
 * than only a number.
 */
async function previewOf(
  mediator: Mediator,
  cwd: string,
  target: NewProjectTarget,
): Promise<string> {
  const response = await post(mediator, '/api/preview', { cwd, target, answers: {} });
  return response.status === 200 ? '200' : `${response.status} ${response.body}`;
}

/** Where the walk got to for one stack. */
interface Walk {
  /** Every distinct body the page can post that the walk reached. */
  readonly bodies: readonly NewProjectTarget[];
  /**
   * Each extras gesture, by what it did — `+iac` ticks IaC on the
   * opening dials, `+iac-containerization` then unticks the image —
   * with the `keel.dials` reply that settled it.
   */
  readonly gestures: ReadonlyMap<string, DialOptions>;
}

/**
 * Every target the page can post for `stack` that the walk reaches:
 * settle the blank one, follow every dial move its controls offer
 * until nothing new shows up (`walkDials`, the enumeration the weekly
 * sweep walks too), then, on the dials the page opens with, tick each
 * extra it offers and untick each box that tick moved.
 */
async function reachable(mediator: Mediator, stack: string): Promise<Walk> {
  const bodies = new Map<string, NewProjectTarget>();
  const keep = (dials: DialOptions): boolean => {
    const target = dials.target as NewProjectTarget;
    const key = JSON.stringify(target);
    if (bodies.has(key)) return false;
    bodies.set(key, target);
    return true;
  };

  const settings = await walkDials(
    (target) => dialsFor(mediator, target),
    [{ kind: 'new-project', stack }],
  );
  for (const dials of settings) keep(dials);
  const opening = settings[0] ?? null;

  const gestures = new Map<string, DialOptions>();
  if (opening === null) return { bodies: [...bodies.values()], gestures };
  // The agent harness's chip, pressed off once, on the dials the page
  // opens with: a field no shipped rule couples to another dial, so
  // one body per preset holds it. Its product with every other dial
  // setting, and the extras' full powerset on each, are the weekly
  // composition sweep's (`tests/sweep/`), which posts them all.
  if (opening.agentHarness) {
    keep(
      await dialsFor(mediator, {
        ...(opening.target as NewProjectTarget),
        agentHarness: false,
      }),
    );
  }
  const blank = settledRun(opening);
  // A product's groups are its services', one per service: the boxes
  // the page draws, and the gestures it makes, are those.
  const groups =
    opening.services.length === 0
      ? [{ service: null, offered: opening.extraVerticals.map((extra) => extra.id) }]
      : opening.services.map((service) => ({
          service: service.path,
          offered: service.verticals.filter(offeredAsExtra).map((vertical) => vertical.id),
        }));
  for (const { service, offered } of groups) {
    const named = (id: string): string => (service === null ? id : `${service}:${id}`);
    const selection = (target: object): readonly string[] =>
      service === null ? extrasOf(target) : serviceExtrasOf(target, service);
    for (const extra of offered) {
      const moved = toggleExtra(blank, extra, true, service);
      const tickedDials = await dialsFor(mediator, moved.target as unknown as NewProjectTarget);
      keep(tickedDials);
      gestures.set(`+${named(extra)}`, tickedDials);
      const ticked = settle(moved, tickedDials);
      for (const id of selection(ticked.target)) {
        const back = toggleExtra(ticked, id, false, service);
        const untickedDials = await dialsFor(mediator, back.target as unknown as NewProjectTarget);
        keep(untickedDials);
        gestures.set(`+${named(extra)}-${id}`, untickedDials);
      }
    }
  }
  return { bodies: [...bodies.values()], gestures };
}

/**
 * The walk for each stack, made once and shared by the cases that
 * read it — it is the expensive part of this file.
 */
const walks = new Map<string, Promise<Walk>>();
const walk = (mediator: Mediator, stack: string): Promise<Walk> => {
  let walked = walks.get(stack);
  if (walked === undefined) {
    walked = reachable(mediator, stack);
    walks.set(stack, walked);
  }
  return walked;
};

const sharedMediator = installMediator();

/**
 * About 370 previews behind the walk — every dial setting of every
 * preset, every extra ticked on each, and the harness left out once
 * per single preset — at some 10 s uncontended,
 * so the walk gets a budget of its own well above the suite's 30 s
 * default rather than a flake on a busy runner. Stacks walk and
 * preview concurrently: a preview writes nothing, so one scratch
 * directory serves them all.
 */
const WALK_TIMEOUT_MS = 120_000;

describe('every body keel ui can post', () => {
  it(
    'is one POST /api/preview accepts, for every stack, every setting of its dials, and every extra',
    async () => {
      const catalog: Catalog = expectOk(await sharedMediator.dispatch(catalogQuery()));
      expect(catalog.stacks.length).toBeGreaterThan(0);
      const cwd = await mkdtemp(path.join(tmpdir(), 'keel-dials-walk-'));
      try {
        const walked = await Promise.all(
          catalog.stacks.map((descriptor) => walk(sharedMediator, descriptor.id)),
        );
        let previewed = 0;
        await Promise.all(
          catalog.stacks.map(async (descriptor, index) => {
            const { bodies, gestures } = walked[index] as Walk;
            for (const target of bodies) {
              expect(
                await previewOf(sharedMediator, cwd, target),
                `${descriptor.id}: the page can post ${JSON.stringify(target)}`,
              ).toBe('200');
              previewed += 1;
            }
            // The page's own gestures leave `keel.dials` nothing to add or
            // drop: a tick already carries what the box needs, and an
            // untick already took what needed it.
            for (const [gesture, dials] of gestures) {
              expect(dials.adjustments, `${descriptor.id} ${gesture}`).toEqual([]);
            }
          }),
        );
        expect(previewed).toBeGreaterThan(catalog.stacks.length);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
    WALK_TIMEOUT_MS,
  );

  it(
    'reaches every setting the shipped stacks offer, so nothing legal is hidden',
    async () => {
      // The other half. A menu that offered nothing at all would pass
      // the assertion above; what stops it is that the walk still
      // arrives at every combination the registry declares legal.
      const { bodies } = await walk(sharedMediator, 'quarkus-rest');
      expect(
        bodies
          .filter((target) => extrasOf(target).length === 0 && target.agentHarness !== false)
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
    },
    WALK_TIMEOUT_MS,
  );

  it(
    'ticks each extra with what it needs, and unticks what needs a box unticked',
    async () => {
      const { gestures } = await walk(sharedMediator, 'quarkus-rest');
      const after = (gesture: string): readonly string[] | undefined => {
        const dials = gestures.get(gesture);
        return dials === undefined ? undefined : extrasOf(dials.target);
      };
      // Ticking IaC brings the image and the distribution, in the order
      // the install runs them…
      expect(after('+iac')).toEqual(['containerization', 'distribution', 'iac']);
      // …and unticking the image takes both of them with it, where
      // unticking IaC leaves what it brought.
      expect(after('+iac-containerization')).toEqual([]);
      expect(after('+iac-iac')).toEqual(['containerization', 'distribution']);
      // Every extra the menu offers was ticked on its own.
      const offered = (
        await dialsFor(sharedMediator, { kind: 'new-project', stack: 'quarkus-rest' })
      ).extraVerticals;
      for (const extra of offered) expect(after(`+${extra.id}`), extra.id).toContain(extra.id);
    },
    WALK_TIMEOUT_MS,
  );

  it(
    'presses the harness off on every single preset, and never offers it on a product',
    async () => {
      const catalog: Catalog = expectOk(await sharedMediator.dispatch(catalogQuery()));
      for (const descriptor of catalog.stacks) {
        const { bodies } = await walk(sharedMediator, descriptor.id);
        const off = bodies.filter((target) => target.agentHarness === false);
        expect(off.length, descriptor.id).toBe(descriptor.services.length > 0 ? 0 : 1);
      }
    },
    WALK_TIMEOUT_MS,
  );

  it('never posts a composite dial the install refuses outright', async () => {
    // `--module-layout`, `--with-peer-context` and `--no-agent-harness`
    // are hard errors on a composite, and so is a vertical named
    // without a service that no service of it can take — a pipeline
    // has no place in a monorepo service — so a settled product target
    // must carry none of them however the caller asks.
    const mediator = installMediator();
    const settled = await dialsFor(mediator, {
      kind: 'new-project',
      stack: 'fullstack',
      moduleLayout: 'modulith',
      withPeerContext: true,
      extraVerticals: ['ci'],
      agentHarness: false,
    });
    expect(settled.target).toEqual({
      kind: 'new-project',
      stack: 'fullstack',
      layout: 'monorepo',
      buildSystem: 'backend=gradle,frontend=npm',
    });
  });
});

describe("a product's extras are its services'", () => {
  it('gives each service its own menu, read over the scope it is scaffolded in', async () => {
    const monorepo = await dialsFor(sharedMediator, { kind: 'new-project', stack: 'fullstack' });
    const menu = (dials: DialOptions, path: string): Record<string, string> =>
      Object.fromEntries(
        (dials.services.find((service) => service.path === path)?.verticals ?? []).map(
          (vertical) => [vertical.id, vertical.readiness],
        ),
      );
    // The backend takes persistence; the front end cannot. A pipeline
    // goes at the product root of a monorepo, and each service has the
    // image the root builds for it.
    expect(menu(monorepo, 'backend')).toMatchObject({
      persistence: 'ready',
      ci: 'unavailable',
      containerization: 'included',
      gateway: 'included',
    });
    expect(menu(monorepo, 'frontend')).toMatchObject({
      persistence: 'unavailable',
      'dev-env': 'ready',
      ci: 'unavailable',
    });
    // Under the polyrepo layout each service is a repository of its
    // own, with a pipeline, an image and a release to take.
    const polyrepo = await dialsFor(sharedMediator, {
      kind: 'new-project',
      stack: 'fullstack',
      layout: 'polyrepo',
    });
    expect(menu(polyrepo, 'backend')).toMatchObject({
      ci: 'ready',
      containerization: 'ready',
      iac: 'needs',
    });
    // What a service's menu offers, the preview of it takes.
    const cwd = await mkdtemp(path.join(tmpdir(), 'keel-dials-services-'));
    try {
      for (const dials of [monorepo, polyrepo]) {
        for (const service of dials.services) {
          for (const vertical of service.verticals.filter(offeredAsExtra)) {
            const target = {
              ...(dials.target as NewProjectTarget),
              services: { [service.path]: { extraVerticals: [...vertical.requires, vertical.id] } },
            };
            expect(await previewOf(sharedMediator, cwd, target), JSON.stringify(target)).toBe(
              '200',
            );
          }
        }
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('sends an extra named without a service to the one service that takes it', async () => {
    // What a single preset's selection becomes on a product: each
    // extra in the one service that can take it, said so; the rest
    // dropped with the sentence `keel new --with` refuses them in.
    const settled = await dialsFor(sharedMediator, {
      kind: 'new-project',
      stack: 'fullstack',
      extraVerticals: ['persistence', 'toolchain'],
    });
    expect(settled.target).toEqual({
      kind: 'new-project',
      stack: 'fullstack',
      layout: 'monorepo',
      buildSystem: 'backend=gradle,frontend=npm',
      services: { backend: { extraVerticals: ['persistence'] } },
    });
    expect(settled.adjustments).toEqual([
      {
        id: 'persistence',
        change: 'added',
        service: 'backend',
        because: 'Persistence goes in backend/, the one service of fullstack that can take it',
      },
      {
        id: 'toolchain',
        change: 'dropped',
        because:
          'Toolchain belongs to a service, not to the product root — it goes in backend/ or frontend/',
      },
    ]);
    // Back on a single preset, a product's service extras are its own.
    const single = await dialsFor(sharedMediator, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      services: { backend: { extraVerticals: ['persistence'] } },
    });
    expect(single.target).toMatchObject({ extraVerticals: ['persistence'] });
    expect(single.target).not.toHaveProperty('services');
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

    // Absent is pinned to none. The extras used to be left absent so
    // `keel.preview` would keep asking for them — and a question the
    // install stops asking once answered is a control that vanishes
    // after its first tick. They are the Options step's own group now,
    // so the preview of a settled target asks nothing about them.
    const blank = await dialsFor(mediator, { kind: 'new-project', stack: 'go-cli' });
    expect((blank.target as NewProjectTarget).extraVerticals).toEqual([]);
    const preview = await post(mediator, '/api/preview', {
      cwd: '/tmp/keel-dials-preview',
      target: blank.target,
      answers: {},
    });
    expect(preview.status).toBe(200);
    const asked = (bodyOf(preview) as unknown as { questions: { binding: { kind: string } }[] })
      .questions;
    expect(asked.map((question) => question.binding.kind)).not.toContain('extraVerticals');
  });

  it('adds the prerequisites of an extra posted without them, and says so', async () => {
    // The page ticks them itself (`toggleExtra`); a set that arrives
    // without them gets them here, as both front doors include them.
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
      held: [],
      identity: [],
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

  it('keeps Maven, the modulith and the pipeline from quarkus-rest onto quarkus-cli-rest', async () => {
    // Ticking the CLI adapter is a preset move. It used to cost the
    // two dials set on the way and the extra ticked, although the new
    // preset takes all three.
    const mediator = installMediator();
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
      extraVerticals: ['ci'],
    });
    const after = await moveTo(mediator, before, 'quarkus-cli-rest');
    expect(after.target).toMatchObject({
      stack: 'quarkus-cli-rest',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
      extraVerticals: ['ci'],
    });
    expect(after.dials?.adjustments).toEqual([]);
    expect(after.notice).toBe('');
    expect(
      await previewOf(
        mediator,
        '/tmp/keel-dials-preview',
        after.target as unknown as NewProjectTarget,
      ),
    ).toBe('200');
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

  it('says which extras the new preset cannot carry, each with the reason keel.dials gave', async () => {
    const mediator = installMediator();
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      extraVerticals: ['ci', 'containerization', 'distribution'],
    });
    // Unticking the HTTP adapter: a CLI has no image to build.
    const after = await moveTo(mediator, before, 'quarkus-cli');
    expect(extrasOf(after.target)).toEqual(['ci', 'distribution']);
    expect(after.notice).toBe(
      'Container image dropped: it needs an entrypoint this project does not have: ' +
        'HTTP server — a REST endpoint.',
    );
    expect(
      await previewOf(
        mediator,
        '/tmp/keel-dials-preview',
        after.target as unknown as NewProjectTarget,
      ),
    ).toBe('200');
  });

  it('keeps quiet about an extra the new preset comes with', async () => {
    // quarkus-cli-rest installs a development environment of its own:
    // the box goes, the environment stays.
    const mediator = installMediator();
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'quarkus-cli',
      extraVerticals: ['dev-env'],
    });
    const after = await moveTo(mediator, before, 'quarkus-cli-rest');
    expect(extrasOf(after.target)).toEqual([]);
    expect((after.dials?.adjustments ?? []).map((adjustment) => adjustment.id)).toEqual([
      'dev-env',
    ]);
    expect(after.notice).toBe('');
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

  it('keeps the harness left out onto another preset, and names it where a product puts it back', async () => {
    const mediator = installMediator();
    const before = await settledOn(mediator, {
      kind: 'new-project',
      stack: 'go-cli',
      agentHarness: false,
    });
    const kept = await moveTo(mediator, before, 'go-cli-http');
    expect(kept.target).toMatchObject({ stack: 'go-cli-http', agentHarness: false });
    expect(kept.notice).toBe('');
    expect(
      await previewOf(
        mediator,
        '/tmp/keel-dials-preview',
        kept.target as unknown as NewProjectTarget,
      ),
    ).toBe('200');

    // Every service of a product carries the harness: the move keeps
    // the rest and says it could not keep this.
    const product = await moveTo(mediator, before, 'fullstack-go');
    expect(product.target).not.toHaveProperty('agentHarness');
    expect(product.notice).toBe('Moving to fullstack-go did not keep the agent harness off.');
  });
});
