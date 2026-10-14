/**
 * `keel.dials` — the tier of the cell it settles (roadmap T.2e).
 *
 * The menus are `../dials.test.ts`'; this holds the one field the
 * reply carries about the settled cell itself, `support`. It is read
 * off the target as settled, so every case moves one dial and reads
 * the tier through the port, over the shipped facts or over a
 * `SupportSource` the case builds (the Factory's `support`).
 */

import { describe, expect, it } from 'vitest';
import type { InstallTarget, NewProjectTarget } from '../../../../src/domain/contract/commands.js';
import { dialsQuery, type DialOptions } from '../../../../src/domain/contract/queries.js';
import {
  pluginOrigin,
  registryOf,
  shippedSource,
  shippedSupport,
} from '../../../../src/domain/core/registry.js';
import type { Stack } from '../../../../src/domain/core/stacks.js';
import type { SupportSource } from '../../../../src/domain/core/support-tier.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const shipped = installMediator();

/** A plugin's preset: registered beside keel's, and vouched for by no CI job of keel's. */
const PLUGIN_STACK: Stack = {
  id: 'acme-widget',
  description: 'Acme widget',
  tags: ['lang.acme', 'arch.hexagonal', 'arch.cli'],
  verticals: [{ id: 'acme-greeting', description: '', dimensions: [], adapters: [] }],
};

const pluginRegistry = registryOf([
  shippedSource,
  { origin: pluginOrigin('acme'), stacks: [PLUGIN_STACK] },
]);

async function dials(
  target: Omit<NewProjectTarget, 'kind'> | InstallTarget,
  mediator = shipped,
): Promise<DialOptions> {
  const full: InstallTarget = 'kind' in target ? target : { kind: 'new-project', ...target };
  return expectOk(await mediator.dispatch(dialsQuery({ target: full })));
}

describe('keel.dials — the settled cell’s tier', () => {
  it('reads the cell its target settles at, a facet spelling at its preset', async () => {
    expect((await dials({ stack: 'go-cli' })).support).toBe('first-class');
    expect((await dials({ stack: 'go-cli-http' })).support).toBe('best-effort');
    const spelled = await dials({ stack: 'go-rest' });
    expect([spelled.target, spelled.support]).toEqual([
      expect.objectContaining({ stack: 'go-http' }),
      'first-class',
    ]);
  });

  it('moves with each dial: the build system, the module layout, the peer context', async () => {
    // quarkus-cli-rest-kotlin's basic suite builds it on Maven, not on
    // Gradle, its default; its modulith suites build it with the peer
    // context.
    const stack = 'quarkus-cli-rest-kotlin';
    expect((await dials({ stack })).support).toBe('best-effort');
    expect((await dials({ stack, buildSystem: 'maven' })).support).toBe('first-class');
    expect((await dials({ stack, moduleLayout: 'modulith' })).support).toBe('best-effort');
    expect((await dials({ stack, moduleLayout: 'modulith', withPeerContext: true })).support).toBe(
      'first-class',
    );
  });

  it('reads a cell without the agent harness by its twin with it (P1)', async () => {
    expect((await dials({ stack: 'go-cli', agentHarness: false })).support).toBe('first-class');
    expect((await dials({ stack: 'go-cli-http', agentHarness: false })).support).toBe(
      'best-effort',
    );
  });

  it('reads a product by its services, on its layout and build systems (P2)', async () => {
    expect((await dials({ stack: 'fullstack-go' })).support).toBe('first-class');
    expect((await dials({ stack: 'fullstack-go', layout: 'polyrepo' })).support).toBe(
      'best-effort',
    );
    expect((await dials({ stack: 'fullstack' })).support).toBe('best-effort');
  });

  it('moves a product’s tier with one service’s build system', async () => {
    // fullstack-go's suite builds its front end on npm, its default.
    expect((await dials({ stack: 'fullstack-go', buildSystem: 'frontend=npm' })).support).toBe(
      'first-class',
    );
    expect((await dials({ stack: 'fullstack-go', buildSystem: 'frontend=pnpm' })).support).toBe(
      'best-effort',
    );
  });

  it('keeps the tier when extras are ticked, since extras are not a dial', async () => {
    const bare = await dials({ stack: 'go-cli' });
    const ready = bare.verticals.find((vertical) => vertical.readiness === 'ready');
    expect(ready, 'a vertical go-cli takes on its own').toBeDefined();
    const ticked = await dials({ stack: 'go-cli', extraVerticals: [ready?.id ?? ''] });
    expect(ticked.target).toEqual(
      expect.objectContaining({ extraVerticals: expect.arrayContaining([ready?.id]) }),
    );
    expect(ticked.support).toBe('first-class');
  });

  it('has no tier off a new project, or on a stack it cannot read', async () => {
    expect((await dials({ kind: 'add-vertical', verticals: ['persistence'] })).support).toBeNull();
    expect((await dials({ stack: 'nonsense' })).support).toBeNull();
    expect((await dials({})).support).toBeNull();
  });

  it('reads the source it is handed: its facts, and the stacks it vouches for', async () => {
    const over = (support: SupportSource) => installMediator({ support });
    const bare = over({ ...shippedSupport, facts: { singles: [], products: [] } });
    expect((await dials({ stack: 'go-cli' }, bare)).support).toBe('best-effort');

    // A stack the source does not vouch for has no tier, as a plugin's.
    const without = over({
      ...shippedSupport,
      stacks: shippedSupport.stacks.filter((stack) => stack.id !== 'go-cli'),
    });
    expect((await dials({ stack: 'go-cli' }, without)).support).toBeNull();
    expect((await dials({ stack: 'go-http' }, without)).support).toBe('first-class');
  });

  it('has no tier on a plugin’s preset, over the source keel ships', async () => {
    const withPlugin = installMediator({ registry: pluginRegistry });
    expect((await dials({ stack: PLUGIN_STACK.id }, withPlugin)).support).toBeNull();
    expect((await dials({ stack: 'go-cli' }, withPlugin)).support).toBe('first-class');
  });
});
