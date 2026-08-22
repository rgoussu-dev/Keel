/**
 * Whether a preset can be built at all, and what that hides from a
 * menu.
 *
 * The guard's job is narrow and worth stating exactly: a stack is
 * offered unless **every** setting of its dials is refused. Anything
 * stricter takes away a preset the user could have reached by moving
 * a dial; anything looser puts a dead end on a menu that has no way
 * to explain itself.
 */

import { describe, expect, it } from 'vitest';
import type { Conflict, Tag, Vertical } from '../../../src/domain/contract/composition.js';
import {
  assemblableStacks,
  assemblies,
  isAssemblable,
  listStackIds,
  stackTagsFor,
  type Stack,
} from '../../../src/domain/core/stacks.js';
import { wizardPaths } from '../../../src/domain/core/stack-wizard.js';

const GRADLE = { id: 'gradle', tag: 'pkg.gradle' as Tag, label: 'Gradle', doc: '' };
const MAVEN = { id: 'maven', tag: 'pkg.maven' as Tag, label: 'Maven', doc: '' };
const BASIC = { id: 'basic', tag: 'layout.basic' as Tag, label: 'basic', doc: '' };
const MODULITH = { id: 'modulith', tag: 'layout.modulith' as Tag, label: 'modulith', doc: '' };

/** A vertical carrying nothing but a rule. */
const ruleBearer = (conflicts: readonly Conflict[]): Vertical => ({
  id: 'demo/rules',
  description: '',
  dimensions: [],
  adapters: [],
  conflicts,
});

const stackWith = (conflicts: readonly Conflict[], overrides: Partial<Stack> = {}): Stack => ({
  id: 'demo-stack',
  description: '',
  tags: ['lang.java', 'runtime.jvm', 'arch.cli'],
  buildSystems: [GRADLE, MAVEN],
  moduleLayouts: [BASIC, MODULITH],
  verticals: [ruleBearer(conflicts)],
  ...overrides,
});

describe('assemblies', () => {
  it('enumerates one tag set per setting of the dials', () => {
    const combinations = assemblies(stackWith([]));
    expect(combinations).toHaveLength(4);
    expect(combinations).toContainEqual([...stackWith([]).tags, 'pkg.maven', 'layout.modulith']);
  });

  it('is a single tag set for a stack offering no dial', () => {
    const pinned = stackWith([], { buildSystems: undefined, moduleLayouts: undefined });
    expect(assemblies(pinned)).toEqual([pinned.tags]);
  });

  it('agrees with the arithmetic the install stages from', () => {
    expect(stackTagsFor(stackWith([]), 'pkg.gradle', null)).toEqual([
      'lang.java',
      'runtime.jvm',
      'arch.cli',
      'pkg.gradle',
    ]);
  });
});

describe('isAssemblable', () => {
  it('keeps a stack one setting of its dials can still build', () => {
    // Gradle is refused; Maven is not. Hiding the preset here would
    // take away three combinations to punish one.
    const stack = stackWith([
      { id: 'demo/no-gradle', when: ['pkg.gradle'], reason: 'not on this preset' },
    ]);
    expect(isAssemblable(stack)).toBe(true);
  });

  it('drops a stack whose every setting is refused', () => {
    const stack = stackWith([
      { id: 'demo/no-jvm', when: ['runtime.jvm'], reason: 'this preset cannot be built' },
    ]);
    expect(isAssemblable(stack)).toBe(false);
  });

  it('reads the rules of the stack itself, not only its verticals', () => {
    const stack = stackWith([], {
      verticals: [],
      conflicts: [{ id: 'demo/self', when: ['arch.cli'], reason: 'no' }],
    });
    expect(isAssemblable(stack)).toBe(false);
  });

  it('does not count the peer context against a stack', () => {
    // Opt-in and off by default, so "can this be built?" is asked
    // without it; whether it may be switched on is its own menu's
    // question, filtered by the same rules at that point.
    const stack = stackWith([
      {
        id: 'demo/peer',
        when: ['modules.peer-context'],
        unless: ['layout.modulith'],
        reason: 'needs the modulith',
      },
    ]);
    expect(isAssemblable(stack)).toBe(true);
  });
});

describe('the guard over the shipped registry', () => {
  it('offers every preset keel ships', () => {
    // The equivalence that makes this change safe to land: with the
    // rules the registry declares today, the guarded menus offer
    // exactly what the enumerated ones did. A preset disappearing
    // from here is a real regression, not a filter working.
    expect(assemblableStacks().map((stack) => stack.id)).toEqual([...listStackIds()]);
  });

  it('hides an unbuildable preset from every step of the drill-down at once', () => {
    // The drill-down's three menus are one walk over the same set, so
    // filtering the input is the whole of guarding it: language,
    // adapters and framework all narrow within what survives.
    const doomed = stackWith([{ id: 'demo/no-jvm', when: ['runtime.jvm'], reason: 'nope' }], {
      id: 'doomed-stack',
    });
    const fine = stackWith([], { id: 'fine-stack' });

    const unguarded = wizardPaths([doomed, fine]).map((path) => path.stackId);
    const guarded = wizardPaths([doomed, fine].filter(isAssemblable)).map((path) => path.stackId);

    expect(unguarded).toContain('doomed-stack');
    expect(guarded).toEqual(['fine-stack']);
  });
});
