/**
 * The guard on the stack registry.
 *
 * `stack-registry.golden.json` is the resolved registry as the
 * TypeScript object literals produced it, frozen before the presets
 * became data. Everything a user can observe about a preset —
 * `keel new --list`, `keel.catalog`, the drill-down grid's cells, the
 * verticals a scaffold installs and in what order, the dials it
 * offers and which one defaults — is one of the fields projected
 * here, so the registry projecting onto that file unchanged is the
 * acceptance test for the move.
 *
 * It is a whole-registry comparison rather than a handful of spot
 * checks on purpose. A spot check on `quarkus-cli` says nothing about
 * the thirty-two presets beside it, and the failure mode a data file
 * introduces — one preset's list quietly reordered, one dial
 * dropped — is precisely the kind a sample misses.
 *
 * Same job as `tests/version-pins.test.ts` and
 * `tests/ci-workflow.test.ts` one level up: a registry nobody checks
 * rots silently.
 */

import { describe, expect, it } from 'vitest';
import { STACKS } from '../../../src/domain/core/stacks.js';
import { describeStacks, type StackShape } from '../../support/stack-registry.js';
import golden from './stack-registry.golden.json' with { type: 'json' };

const expected = golden.stacks as readonly StackShape[];

describe('the resolved stack registry', () => {
  it('projects onto the frozen shape, preset for preset and field for field', () => {
    expect(describeStacks(Object.values(STACKS))).toEqual(expected);
  });

  it('registers every preset under its own id', () => {
    for (const [key, stack] of Object.entries(STACKS)) {
      expect(stack.id, `registered under '${key}'`).toBe(key);
    }
  });
});
