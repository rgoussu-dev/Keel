/**
 * The walk over a preset's dials: every setting `keel.dials` offers,
 * reached the way `<keel-new-form>`'s controls reach them — a build
 * system on its menu, a module layout on its menu, a service's build
 * system on its menu, the peer-context box ticked where it is shown and
 * unticked everywhere.
 *
 * A product's build system is one dial per service, travelling as
 * `path=id` pairs in one field; a move sets one service's pair and
 * keeps the others', through the page's own `withServiceBuild`.
 *
 * One enumeration, shared: `application/web/dials.test.ts` walks it
 * over `POST /api/dials`, the page's own route, and the weekly
 * composition sweep (`tests/sweep/`) and the shared-file byte golden
 * (`domain/core/shared-files.golden.test.ts`) over the mediator. None
 * keeps a list of settings: what a preset offers is whatever the
 * replies offer, so a dial or a rule registered tomorrow is walked
 * without an edit. The first two then tick the extras on what they
 * reached as the page does, from the run it holds once a reply has
 * settled ({@link settledRun}), over the boxes it draws
 * ({@link offeredAsExtra}); the golden names those boxes to
 * `keel.dials`.
 */

import { settle, withServiceBuild } from '../../assets/web/src/target.js';
import type { NewProjectTarget } from '../../src/domain/contract/commands.js';
import type { DialOptions, VerticalOption } from '../../src/domain/contract/queries.js';

/**
 * Every distinct setting reachable from `seeds`, as `dials` settles it:
 * each reply once, keyed by the target it settled, in the order first
 * reached — the first seed's own reply first, which is the setting the
 * page opens with. Breadth-first, so a preset with four combinations
 * costs four round trips rather than a tree of them.
 *
 * A seed is where the walk starts: the blank target of a preset, or
 * one per repository layout of a product, a dial `keel.dials` settles
 * but does not list (the preview asks it). The agent harness left out
 * is not walked here: the page presses it once, and the sweep crosses
 * it with every setting — each caller's own gesture over these replies.
 *
 * `dials` answers null for a target it could not settle — the sweep
 * reports that as a finding rather than stopping — and the walk goes
 * on without it.
 */
export async function walkDials(
  dials: (target: NewProjectTarget) => Promise<DialOptions | null>,
  seeds: readonly NewProjectTarget[],
): Promise<readonly DialOptions[]> {
  const reached = new Map<string, DialOptions>();
  const queue = [...seeds];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const reply = await dials(next);
    if (reply === null) continue;
    const settled = reply.target as NewProjectTarget;
    const key = JSON.stringify(settled);
    if (reached.has(key)) continue;
    reached.set(key, reply);
    for (const build of reply.buildSystems) queue.push({ ...settled, buildSystem: build.id });
    for (const layout of reply.moduleLayouts) queue.push({ ...settled, moduleLayout: layout.id });
    for (const service of reply.services) {
      for (const build of service.buildSystems) {
        queue.push({
          ...settled,
          buildSystem: withServiceBuild(settled.buildSystem, service.path, build.id),
        });
      }
    }
    if (reply.peerContext) queue.push({ ...settled, withPeerContext: true });
    queue.push({ ...settled, withPeerContext: false });
  }
  return [...reached.values()];
}

/** What `<keel-app>` stores between transitions. */
export type Run = ReturnType<typeof settle>;

/** The page's run once `keel.dials` has replied `dials`, as it holds it after `settle`. */
export const settledRun = (dials: DialOptions): Run =>
  settle(
    {
      target: { kind: 'new-project' },
      answers: {},
      dials: null,
      generation: 0,
      carried: null,
      notice: '',
      held: [],
      identity: [],
    },
    dials,
  );

/** Whether a menu entry is a box the page draws: ready, or ready once others are. */
export const offeredAsExtra = (vertical: VerticalOption): boolean =>
  vertical.readiness === 'ready' || vertical.readiness === 'needs';
