/**
 * What a front door makes of a plan: the request in install order, or
 * the refusal in words — the one reading `keel new --with` and
 * `keel add` share.
 *
 * **Scenario.** A fixture registry the way a plugin's would be: an
 * image a release builds on, two caches either of which serves a
 * session store, a signer a fat bundle rules out, a vertical selected
 * by a peer's tag alone, and one whose own rule the scope breaks.
 *
 * **Factory.** `registryOf`, the one door any piece comes in by.
 *
 * **Port.** `admit`, a pure function; the handlers' own suites drive
 * it through the mediator on the shipped registry.
 */

import { describe, expect, it } from 'vitest';
import type { Adapter, Tag, Vertical } from '../../../src/domain/contract/composition.js';
import { admit } from '../../../src/domain/core/plan-refusal.js';
import type { PlanScope } from '../../../src/domain/core/planner.js';
import { pluginOrigin, registryOf } from '../../../src/domain/core/registry.js';
import { DomainError, type Result } from '../../../src/domain/kernel/result.js';

/* ---- Scenario ---------------------------------------------------- */

function adapter(id: string, requires: readonly Tag[], extra: Partial<Adapter> = {}): Adapter {
  return {
    id: `${id}/main`,
    vertical: id,
    covers: ['only'],
    predicate: { requires },
    contribute: () => ({}),
    ...extra,
  };
}

function vertical(
  id: string,
  title: string,
  adapters: readonly Adapter[],
  extra: Partial<Vertical> = {},
): Vertical {
  return { id, title, description: '', dimensions: ['only'], adapters, ...extra };
}

const image = vertical('acme-image', 'Image', [adapter('acme-image', ['lang.acme'])], {
  promotes: ['acme.image'],
});
const release = vertical('acme-release', 'Release', [adapter('acme-release', ['acme.image'])], {
  promotes: ['acme.release'],
});
const deploy = vertical('acme-deploy', 'Deploy', [adapter('acme-deploy', ['acme.release'])]);
const redis = vertical('redis-cache', 'Redis', [adapter('redis-cache', ['lang.acme'])], {
  promotes: ['acme.cache'],
});
const memcached = vertical(
  'memcached-cache',
  'Memcached',
  [adapter('memcached-cache', ['lang.acme'])],
  {
    promotes: ['acme.cache'],
  },
);
const session = vertical('acme-session', 'Session', [adapter('acme-session', ['acme.cache'])]);
const fat = vertical('acme-fat', 'Fat bundle', [adapter('acme-fat', ['lang.acme'])], {
  promotes: ['acme.fat'],
});
const sign = vertical('acme-sign', 'Signing', [
  adapter('acme-sign', [], { predicate: { requires: ['lang.acme'], excludes: ['acme.fat'] } }),
]);
const bridge = vertical('acme-bridge', 'Bridge', [adapter('acme-bridge', ['peer.acme.api'])], {
  dimensions: [],
});
const strict = vertical('acme-strict', 'Strict', [adapter('acme-strict', ['lang.acme'])], {
  conflicts: [
    { id: 'acme-strict/not-loose', when: ['acme.loose'], reason: 'strict will not run loose' },
  ],
});

/* ---- Factory ----------------------------------------------------- */

const registry = registryOf([
  {
    origin: pluginOrigin('acme'),
    verticals: [image, release, deploy, redis, session, fat, sign, bridge, strict],
  },
  { origin: pluginOrigin('other'), verticals: [memcached] },
]);

const scope = (tags: readonly Tag[] = ['lang.acme']): PlanScope => ({ tags, installed: [] });

const refusal = <T>(result: Result<T>): DomainError => {
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
};

/* ---- Tests ------------------------------------------------------- */

describe('admit', () => {
  it('admits a request in the order it installs, and says whether that moved it', () => {
    const named = admit(registry, scope(), [deploy, release, image]);
    expect(named.ok && named.value.order.map((v) => v.id)).toEqual([
      'acme-image',
      'acme-release',
      'acme-deploy',
    ]);
    expect(named.ok && named.value.reordered).toBe(true);
    const inOrder = admit(registry, scope(), [image, release]);
    expect(inOrder.ok && inOrder.value.reordered).toBe(false);
  });

  it('takes a request as a set: two verticals nothing ties together go in by id, unremarked', () => {
    for (const request of [
      [redis, fat],
      [fat, redis],
    ]) {
      const admitted = admit(registry, scope(), request);
      expect(admitted.ok && admitted.value.order.map((v) => v.id)).toEqual([
        'acme-fat',
        'redis-cache',
      ]);
      // A different order from the one named, but no dependency moved
      // it: nothing for a report to say.
      expect(admitted.ok && admitted.value.reordered).toBe(false);
    }
  });

  it('refuses a request missing a prerequisite, naming every one in install order', () => {
    const error = refusal(admit(registry, scope(), [deploy]));
    expect(error.code).toBe('keel.missing-prerequisites');
    expect(error.message).toBe(
      'Deploy needs Image and Release installed before it, in that order — add acme-image, acme-release as well',
    );
  });

  it('names only what needs the missing prerequisite, when the rest of the request has it', () => {
    const error = refusal(admit(registry, scope(), [release, redis]));
    expect(error.message).toBe('Release needs Image installed before it — add acme-image as well');
  });

  it('refuses a tie between two providers under the same code, naming both', () => {
    const error = refusal(admit(registry, scope(), [session]));
    expect(error.code).toBe('keel.missing-prerequisites');
    expect(error.message).toContain('(redis-cache) or (memcached-cache)');
  });

  it("refuses a vertical the scope cannot carry, in the front door's own words", () => {
    const error = refusal(
      admit(registry, scope(['lang.beta']), [image], {
        unavailable: (vertical, sentence) => `${sentence}; drop '${vertical.id}'`,
      }),
    );
    expect(error.code).toBe('keel.uncoverable-vertical');
    expect(error.message).toBe("Image has no adapter for this project's stack; drop 'acme-image'");
  });

  it('points a vertical waiting on a linked project at keel link', () => {
    const error = refusal(admit(registry, scope(), [bridge]));
    expect(error.code).toBe('keel.uncoverable-vertical');
    expect(error.message).toBe("Bridge wires linked projects — run 'keel link <path>' first");
  });

  it("refuses a vertical whose own rule the scope breaks as incompatible, in the rule's words", () => {
    const error = refusal(admit(registry, scope(['lang.acme', 'acme.loose']), [strict]));
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toContain('strict will not run loose');
  });

  it('refuses two verticals no order installs together as incompatible', () => {
    const error = refusal(admit(registry, scope(), [sign, fat]));
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toBe(
      'Fat bundle and Signing cannot be installed together here — each installs on its own, but no order installs them all; drop one',
    );
  });
});
