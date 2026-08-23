/**
 * The dial menus, and the one property that makes them worth having:
 * **what a form can put in a body is exactly what the install gate
 * accepts.**
 *
 * The terminal already had that property, by construction — it
 * settles one dial before offering the next, so every menu is
 * filtered against a complete tag set. A form has no such order, and
 * the catalog it renders from describes a preset's dials without
 * knowing which combination the user is on. So the property has to be
 * asserted here rather than assumed, and asserted in both directions:
 * a menu that offers an illegal combination sends the user into a
 * `keel.incompatible` they cannot navigate out of, and one that hides
 * a legal combination takes away a preset they were entitled to.
 *
 * Driven against a **fixture** rule, because the registry ships none
 * that constrains one dial against another — the shipped
 * `peer-context-needs-modulith` constrains the peer context, which a
 * form sends explicitly, so it cannot exercise the failure this
 * exists to prevent. Rules are properties of the pieces, so a fixture
 * stack carrying one is the same input a plugin's would be
 * (`stack-assembly.test.ts` builds its scenarios the same way).
 */

import { describe, expect, it } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import type { Conflict, Tag, Vertical } from '../../../src/domain/contract/composition.js';
import type { DialOptions } from '../../../src/domain/contract/queries.js';
import { assemblyRefusal } from '../../../src/domain/core/compatibility.js';
import { piecesOf, stackDials } from '../../../src/domain/core/dials.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import {
  stackTagsFor,
  type ModuleLayoutOption,
  type Stack,
} from '../../../src/domain/core/stacks.js';

/* ---- Scenario ---------------------------------------------------- */

const GRADLE = { id: 'gradle', tag: 'pkg.gradle' as Tag, label: 'Gradle', doc: 'gradle' };
const MAVEN = { id: 'maven', tag: 'pkg.maven' as Tag, label: 'Maven', doc: 'maven' };
const BASIC: ModuleLayoutOption = {
  id: 'basic',
  tag: 'layout.basic' as Tag,
  label: 'basic',
  doc: 'flat',
};
const MODULITH: ModuleLayoutOption = {
  id: 'modulith',
  tag: 'layout.modulith' as Tag,
  label: 'modulith',
  doc: 'modules',
};

/** A vertical carrying nothing but a rule. */
const ruleBearer = (conflicts: readonly Conflict[]): Vertical => ({
  id: 'demo/rules',
  description: '',
  dimensions: [],
  adapters: [],
  conflicts,
});

/**
 * `Partial<Stack>` that can also say **"this stack has none"**.
 *
 * `exactOptionalPropertyTypes` separates an absent optional property
 * from one set to `undefined`, and a fixture overriding a dial away
 * means the first. {@link stackWith} therefore drops the keys whose
 * override is `undefined` rather than assigning them.
 */
type StackOverrides = { [K in keyof Stack]?: Stack[K] | undefined };

const stackWith = (conflicts: readonly Conflict[], overrides: StackOverrides = {}): Stack =>
  settled({
    id: 'demo-stack',
    description: '',
    tags: ['lang.java', 'runtime.jvm', 'arch.cli'],
    buildSystems: [GRADLE, MAVEN],
    moduleLayouts: [BASIC, MODULITH],
    verticals: [ruleBearer(conflicts)],
    ...overrides,
  });

/** The same object with every `undefined`-valued key removed. */
const settled = (draft: StackOverrides): Stack => {
  for (const key of Object.keys(draft) as (keyof Stack)[]) {
    if (draft[key] === undefined) delete draft[key];
  }
  return draft as Stack;
};

/**
 * The rule no shipped piece declares: one dial constrained against
 * another. Maven cannot carry the modulith; everything else is legal.
 */
const MAVEN_NEEDS_BASIC: Conflict = {
  id: 'demo/maven-needs-basic',
  when: ['pkg.maven', 'layout.modulith'],
  reason: 'the Maven reactor cannot carry the modulith here — use Gradle, or the flat layout',
};

const target = (dials: Partial<NewProjectTarget> = {}): NewProjectTarget => ({
  kind: 'new-project',
  stack: 'demo-stack',
  ...dials,
});

const ids = (choices: DialOptions['buildSystems']): readonly string[] =>
  choices.map((choice) => choice.id);

/** One combination, as a line a failure can be read from. */
const key = (chosen: NewProjectTarget): string =>
  [
    chosen.buildSystem ?? '(pinned)',
    chosen.moduleLayout ?? '(pinned)',
    chosen.withPeerContext === true ? 'peer' : 'no-peer',
  ].join(' + ');

/* ---- what a form can put in a body ------------------------------- */

/**
 * Every target `keel ui` can post for this stack: start at the blank
 * one, settle it, and follow every move a control offers — each value
 * on each menu, and the peer-context checkbox where it is shown —
 * until nothing new turns up. The page's controls can do exactly
 * this and nothing else, so this set *is* the answer to "what can it
 * send?".
 */
function reachable(stack: Stack): readonly NewProjectTarget[] {
  const found = new Map<string, NewProjectTarget>();
  const queue: NewProjectTarget[] = [target()];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const dials = stackDials(shippedRegistry, stack, next);
    const settled = dials.target as NewProjectTarget;
    const key = JSON.stringify(settled);
    if (found.has(key)) continue;
    found.set(key, settled);
    for (const build of dials.buildSystems) queue.push({ ...settled, buildSystem: build.id });
    for (const layout of dials.moduleLayouts) queue.push({ ...settled, moduleLayout: layout.id });
    queue.push({ ...settled, withPeerContext: false });
    if (dials.peerContext) queue.push({ ...settled, withPeerContext: true });
  }
  return [...found.values()];
}

/**
 * Every combination of this stack's build system and module layout,
 * legal or not. The peer context is off throughout: these fixtures
 * ship no adapters, so no stack here can emit one, and whether it may
 * be switched on is its own menu's question below.
 */
function everyCombination(stack: Stack): readonly NewProjectTarget[] {
  return (stack.buildSystems ?? []).flatMap((build) =>
    (stack.moduleLayouts ?? []).map((layout) =>
      target({ buildSystem: build.id, moduleLayout: layout.id, withPeerContext: false }),
    ),
  );
}

/**
 * Whether the install would accept this target — the assembly gate
 * `keel new` runs after the last dial and before the first file, read
 * over the same arithmetic it stages from.
 */
function installAccepts(stack: Stack, chosen: NewProjectTarget): boolean {
  const buildTag = stack.buildSystems?.find((o) => o.id === chosen.buildSystem)?.tag ?? null;
  const layoutTag = stack.moduleLayouts?.find((o) => o.id === chosen.moduleLayout)?.tag ?? null;
  const tags: Tag[] = [...stackTagsFor(stack, buildTag, layoutTag)];
  if (chosen.withPeerContext === true) tags.push('modules.peer-context' as Tag);
  return assemblyRefusal(piecesOf(stack), tags) === null;
}

/* ---- the assertion ----------------------------------------------- */

describe('the dial menus and the install gate', () => {
  it('offers exactly the combinations the gate accepts, under a rule spanning two dials', () => {
    const stack = stackWith([MAVEN_NEEDS_BASIC]);
    const offered = reachable(stack);
    const legal = everyCombination(stack).filter((chosen) => installAccepts(stack, chosen));

    // ⊆ — nothing the form can put in a body is refused.
    for (const chosen of offered) {
      expect(installAccepts(stack, chosen), `offered but refused: ${key(chosen)}`).toBe(true);
    }
    // ⊇ — and nothing the gate accepts is off the menu. Without this
    // half a menu that offered nothing at all would pass.
    const reachableKeys = new Set(offered.map(key));
    for (const chosen of legal) {
      expect(reachableKeys.has(key(chosen)), `legal but unreachable: ${key(chosen)}`).toBe(true);
    }
    expect(offered).toHaveLength(legal.length);
    expect([...reachableKeys].sort()).toEqual([
      'gradle + basic + no-peer',
      'gradle + modulith + no-peer',
      'maven + basic + no-peer',
    ]);
  });

  it('offers exactly the combinations the gate accepts with no rule at all', () => {
    // The page keeps working with nothing declared, which is the
    // state the registry ships in today.
    const stack = stackWith([]);
    const offered = reachable(stack);
    expect(offered).toHaveLength(4);
    for (const chosen of offered) expect(installAccepts(stack, chosen)).toBe(true);
  });
});

describe('narrowing one dial against another', () => {
  const stack = stackWith([MAVEN_NEEDS_BASIC]);

  it('drops the layout the settled build system cannot carry', () => {
    expect(
      ids(stackDials(shippedRegistry, stack, target({ buildSystem: 'maven' })).moduleLayouts),
    ).toEqual(['basic']);
    expect(
      ids(stackDials(shippedRegistry, stack, target({ buildSystem: 'gradle' })).moduleLayouts),
    ).toEqual(['basic', 'modulith']);
  });

  it('keeps both build systems on the menu under either layout', () => {
    // Optimism, and it is load-bearing: narrowing this dial against
    // the layout as it stands would make maven unreachable from the
    // modulith, and with it the perfectly legal maven + basic.
    const onModulith = stackDials(shippedRegistry, stack, target({ moduleLayout: 'modulith' }));
    expect(ids(onModulith.buildSystems)).toEqual(['gradle', 'maven']);
  });

  it('snaps the layout when a build system the rules refuse it with is chosen', () => {
    const settled = stackDials(
      shippedRegistry,
      stack,
      target({ buildSystem: 'maven', moduleLayout: 'modulith' }),
    ).target as NewProjectTarget;
    expect(settled).toMatchObject({ buildSystem: 'maven', moduleLayout: 'basic' });
  });

  it('hands the dial back whole when every value of it is refused', () => {
    // Every option refused is not a menu, it is a refusal — and the
    // gate is what says so, in the rule's own words.
    const doomed = stackWith([{ id: 'demo/no-jvm', when: ['runtime.jvm'], reason: 'never' }]);
    expect(ids(stackDials(shippedRegistry, doomed, target()).buildSystems)).toEqual([
      'gradle',
      'maven',
    ]);
    expect(ids(stackDials(shippedRegistry, doomed, target()).moduleLayouts)).toEqual([
      'basic',
      'modulith',
    ]);
  });
});

describe('the settled target', () => {
  it('pins every dial, so the install asks about none of them', () => {
    // An absent dial is one the install would *ask* about, and the
    // answer would arrive at a form that already renders it as a
    // control of its own.
    const settled = stackDials(shippedRegistry, stackWith([]), target()).target as NewProjectTarget;
    expect(settled).toEqual({
      kind: 'new-project',
      stack: 'demo-stack',
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      withPeerContext: false,
    });
  });

  it('leaves the extras absent when the caller sent none', () => {
    // The one dial that must stay unpinned: `extraVerticals` is only
    // ever offered as a preview question, and pinning it here would
    // stop the question being asked at all.
    const settled = stackDials(shippedRegistry, stackWith([]), target()).target as NewProjectTarget;
    expect(settled.extraVerticals).toBeUndefined();
  });

  it('keeps a dial the caller set where the rules still allow it', () => {
    const settled = stackDials(shippedRegistry, stackWith([]), target({ moduleLayout: 'modulith' }))
      .target as NewProjectTarget;
    expect(settled.moduleLayout).toBe('modulith');
  });

  it('pins nothing a stack with no dials does not have', () => {
    const pinned = stackWith([], { buildSystems: undefined, moduleLayouts: undefined });
    expect(stackDials(shippedRegistry, pinned, target()).target).toEqual({
      kind: 'new-project',
      stack: 'demo-stack',
      withPeerContext: false,
    });
  });
});

describe('the peer context, as a dial', () => {
  const PEER_NEEDS_MODULITH: Conflict = {
    id: 'demo/peer-needs-modulith',
    when: ['modules.peer-context'],
    unless: ['layout.modulith'],
    reason: 'the peer context needs the modulith',
  };

  it('is off the menu where the rules refuse it', () => {
    const stack = stackWith([PEER_NEEDS_MODULITH]);
    expect(stackDials(shippedRegistry, stack, target({ moduleLayout: 'basic' })).peerContext).toBe(
      false,
    );
  });

  it('is off the menu where the rules allow it but no adapter emits one', () => {
    // The capability half, and it is not a conflict: a peer-context
    // adapter declares `covers: []`, so the resolver's
    // uncovered-dimension hard-fail structurally cannot speak for it.
    // This fixture ships no adapters at all.
    const stack = stackWith([]);
    expect(
      stackDials(shippedRegistry, stack, target({ moduleLayout: 'modulith' })).peerContext,
    ).toBe(false);
  });

  it('is switched back off when the layout it needs is settled away', () => {
    const stack = stackWith([PEER_NEEDS_MODULITH]);
    const settled = stackDials(
      shippedRegistry,
      stack,
      target({ moduleLayout: 'basic', withPeerContext: true }),
    ).target as NewProjectTarget;
    expect(settled.withPeerContext).toBe(false);
  });
});

describe('a composite product', () => {
  it('carries a repository layout and one build system per service, and no others', () => {
    // The install refuses `--module-layout`, `--with-peer-context` and
    // `--with` on a composite outright, so a settled target must not
    // carry them.
    const product = stackWith([], {
      id: 'demo-product',
      buildSystems: undefined,
      moduleLayouts: undefined,
      services: [{ path: 'backend', stack: 'quarkus-rest' }],
    });
    const dials = stackDials(shippedRegistry, product, {
      kind: 'new-project',
      stack: 'demo-product',
      moduleLayout: 'modulith',
      withPeerContext: true,
    });
    expect(dials.target).toEqual({
      kind: 'new-project',
      stack: 'demo-product',
      layout: 'monorepo',
      buildSystem: 'backend=gradle',
    });
    expect(dials.services.map((service) => service.path)).toEqual(['backend']);
    expect(dials.moduleLayouts).toEqual([]);
    expect(dials.peerContext).toBe(false);
  });

  it('keeps the service build system the caller chose', () => {
    const product = stackWith([], {
      id: 'demo-product',
      buildSystems: undefined,
      moduleLayouts: undefined,
      services: [{ path: 'backend', stack: 'quarkus-rest' }],
    });
    const settled = stackDials(shippedRegistry, product, {
      kind: 'new-project',
      stack: 'demo-product',
      buildSystem: 'backend=maven',
      layout: 'polyrepo',
    }).target as NewProjectTarget;
    expect(settled).toMatchObject({ buildSystem: 'backend=maven', layout: 'polyrepo' });
  });

  it('falls back to the service default rather than refusing a stale pair', () => {
    // A preference, not a command: the install handler refuses a
    // malformed `--build-system`, but a control still holding a value
    // from another preset is not a refusal, it is a default.
    const product = stackWith([], {
      id: 'demo-product',
      buildSystems: undefined,
      moduleLayouts: undefined,
      services: [{ path: 'backend', stack: 'quarkus-rest' }],
    });
    const settled = stackDials(shippedRegistry, product, {
      kind: 'new-project',
      stack: 'demo-product',
      buildSystem: 'nonsense',
    }).target as NewProjectTarget;
    expect(settled.buildSystem).toBe('backend=gradle');
  });
});
