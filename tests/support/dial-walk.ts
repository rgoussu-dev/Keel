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
 * composition sweep (`tests/sweep/`), the shared-file byte golden
 * (`domain/core/shared-files.golden.test.ts`), the growth golden
 * (`domain/core/growth.golden.test.ts`) and its render guard
 * (`domain/core/growth-render.test.ts`, which keeps the opening build
 * system only), and the composition grid's growth axis
 * (`domain/core/composition-grid/growth.test.ts`) over the mediator.
 * None keeps a list of settings: what a preset offers is whatever the
 * replies offer, so a dial or a rule registered tomorrow is walked
 * without an edit. The first two then
 * tick the extras on what they reached as the page does, from the run
 * it holds once a reply has settled ({@link settledRun}), over the
 * boxes it draws ({@link offeredAsExtra}); the shared-file golden names
 * those boxes to `keel.dials`.
 */

import { settle, withServiceBuild } from '../../assets/web/src/target.js';
import type { AddModuleTarget, NewProjectTarget } from '../../src/domain/contract/commands.js';
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
 * is not walked here: the page presses it once, and the sweep and the
 * growth golden cross it with every setting — each caller's own
 * gesture over these replies.
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

/**
 * Every setting `keel.dials` offers the single-service preset `stack`,
 * as the target it settled: the {@link walkDials} walk, and each
 * setting again with the agent harness left out wherever the reply
 * lets it be. What the growth golden (`domain/core/growth.golden.test.ts`)
 * reads growth on, and the composition grid's growth axis grows.
 */
export async function harnessSettings(
  dials: (target: NewProjectTarget) => Promise<DialOptions>,
  stack: string,
): Promise<readonly NewProjectTarget[]> {
  const walked = await walkDials(dials, [{ kind: 'new-project', stack }]);
  const settings = new Map<string, NewProjectTarget>();
  for (const reply of walked) {
    const target = reply.target as NewProjectTarget;
    settings.set(JSON.stringify(target), target);
    if (!reply.agentHarness) continue;
    const off = (await dials({ ...target, agentHarness: false })).target as NewProjectTarget;
    settings.set(JSON.stringify(off), off);
  }
  return [...settings.values()];
}

/**
 * A single-service setting as the command line that scaffolds it —
 * spelled here rather than by the page's own `command.js`, so a change
 * to how the page prints a command moves no golden's key.
 */
export function newCommandLine(target: NewProjectTarget): string {
  return [
    `keel new --stack ${target.stack ?? ''}`,
    target.buildSystem === undefined ? '' : ` --build-system ${target.buildSystem}`,
    target.moduleLayout === undefined ? '' : ` --module-layout ${target.moduleLayout}`,
    target.withPeerContext === true ? ' --with-peer-context' : '',
    target.agentHarness === false ? ' --no-agent-harness' : '',
  ].join('');
}

/**
 * The bounded contexts a modulith is given before it is read with a
 * history of its own — `orders` consuming the skeleton's context
 * (`skeleton`), then `shipping` consuming `orders` — as the `keel add
 * module` targets that add them, in order. A chain, so each context's
 * wiring calls the wiring of the one it consumes, which is what growing
 * an entrypoint has to replay in that order (roadmap R.3). What the
 * shared-file byte golden, the growth golden and the composition grid's
 * growth axis each add to every modulith setting.
 */
export function moduleHistory(skeleton: string): readonly AddModuleTarget[] {
  return [
    { kind: 'add-module', module: 'orders', consumes: skeleton },
    { kind: 'add-module', module: 'shipping', consumes: 'orders' },
  ];
}

/** An `add-module` target as the command line that runs it, spelled as {@link newCommandLine} is. */
export function addModuleCommandLine(target: AddModuleTarget): string {
  const consumes = target.consumes === undefined ? '' : ` --consumes ${target.consumes}`;
  return `keel add module ${target.module}${consumes}`;
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
