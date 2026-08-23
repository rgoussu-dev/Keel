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
 * Beside it, the guards on the data file itself: that every preset in
 * it resolves and none is quietly dropped, that a reference resolves
 * to the registered object rather than a copy of it, and that a
 * composite names a stack that exists and does not nest. Then the
 * resolver's own two failure modes, which are deliberately different
 * in kind — a malformed document throws, a dangling reference drops
 * the preset and is reported.
 *
 * Same job as `tests/version-pins.test.ts` and
 * `tests/ci-workflow.test.ts` one level up: a registry nobody checks
 * rots silently.
 */

import { describe, expect, it } from 'vitest';
import {
  getBuildSystem,
  getStack,
  resolveStackPresets,
  STACKS,
} from '../../../src/domain/core/stacks.js';
import { getModuleLayoutOption } from '../../../src/domain/core/adapters/module-layout.js';
import { getDeclaredVertical } from '../../../src/domain/core/verticals/index.js';
import { describeStacks, type StackShape } from '../../support/stack-registry.js';
import golden from './stack-registry.golden.json' with { type: 'json' };
import presetDocument from '../../../src/domain/core/stack-presets.json' with { type: 'json' };

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

describe('resolving the preset data', () => {
  it('resolves every preset in the file, in the order it is written', () => {
    expect(Object.keys(STACKS)).toEqual(presetDocument.presets.map((preset) => preset.id));
  });

  it('reports no problem against the registries this build carries', () => {
    // The load in stacks.ts throws on a problem, so a red here is the
    // readable version of a crash every other suite would show as an
    // import failure.
    expect(resolveStackPresets(presetDocument).problems).toEqual([]);
  });

  it('resolves each reference to the registered object itself, not a copy', () => {
    for (const stack of Object.values(STACKS)) {
      for (const vertical of stack.verticals) {
        expect(getDeclaredVertical(vertical.id), `${stack.id}/${vertical.id}`).toBe(vertical);
      }
      for (const option of stack.buildSystems ?? []) {
        expect(getBuildSystem(option.id), `${stack.id}/${option.id}`).toBe(option);
      }
      for (const option of stack.moduleLayouts ?? []) {
        expect(getModuleLayoutOption(option.id), `${stack.id}/${option.id}`).toBe(option);
      }
    }
  });

  it('names a registered, non-composite stack in every composite service', () => {
    // Composites cannot nest, and the install refuses one that does.
    // Here the same rule is checked against the shipped data, so a
    // preset that could only ever fail never reaches a menu.
    for (const stack of Object.values(STACKS)) {
      for (const service of stack.services ?? []) {
        const target = getStack(service.stack);
        expect(target, `${stack.id}/${service.path} → ${service.stack}`).not.toBeNull();
        expect(target?.services, `${stack.id}/${service.path} is nested`).toBeUndefined();
      }
    }
  });
});

describe('resolveStackPresets', () => {
  const preset = {
    id: 'probe',
    description: 'a probe preset',
    tags: ['lang.java'],
    verticals: ['vcs'],
  };

  it('throws on a document that is not a preset document', () => {
    // A shape violation is never "a piece is not installed": there is
    // no partial answer to give, so it fails the way parseManifest
    // fails on a manifest that is not a manifest.
    expect(() => resolveStackPresets({ presets: [{ id: 'x' }] })).toThrow();
    expect(() => resolveStackPresets({ presets: [{ ...preset, verticals: 'vcs' }] })).toThrow();
    expect(() => resolveStackPresets({ presets: [{ ...preset, buildSystems: [] }] })).toThrow();
  });

  it('drops a preset naming a piece this build does not carry, and keeps its neighbours', () => {
    const resolution = resolveStackPresets({
      presets: [
        preset,
        { ...preset, id: 'ghost', verticals: ['vcs', 'telepathy'], buildSystems: ['bazel'] },
      ],
    });
    expect(Object.keys(resolution.stacks)).toEqual(['probe']);
    expect(resolution.problems).toEqual([
      {
        preset: 'ghost',
        field: 'verticals',
        missing: 'telepathy',
        message: "stack preset 'ghost': verticals names 'telepathy', which is not registered",
      },
      {
        preset: 'ghost',
        field: 'buildSystems',
        missing: 'bazel',
        message: "stack preset 'ghost': buildSystems names 'bazel', which is not registered",
      },
    ]);
  });

  it('reports a duplicate id rather than letting the second win', () => {
    const resolution = resolveStackPresets({ presets: [preset, { ...preset, tags: [] }] });
    expect(resolution.stacks['probe']?.tags).toEqual(['lang.java']);
    expect(resolution.problems.map((p) => p.field)).toEqual(['id']);
  });

  it('carries a declared conflict through unchanged — it is already pure data', () => {
    const conflict = {
      id: 'probe/no-maven-modulith',
      when: ['pkg.maven', 'layout.modulith'],
      reason: 'a probe rule',
    };
    const withUnless = { ...conflict, id: 'probe/needs-jvm', unless: ['runtime.jvm'] };
    const resolution = resolveStackPresets({
      presets: [{ ...preset, conflicts: [conflict, withUnless] }],
    });
    expect(resolution.problems).toEqual([]);
    expect(resolution.stacks['probe']?.conflicts).toEqual([conflict, withUnless]);
  });

  it('omits an absent optional rather than carrying it as undefined', () => {
    const resolved = resolveStackPresets({ presets: [preset] }).stacks['probe'];
    for (const field of ['buildSystems', 'moduleLayouts', 'projects', 'services', 'conflicts']) {
      expect(resolved, field).not.toHaveProperty(field);
    }
  });
});
