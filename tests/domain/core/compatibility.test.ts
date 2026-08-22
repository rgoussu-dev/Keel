/**
 * The compatibility declaration and its two readings.
 *
 * What has to hold is that the two readings are the *same* rule seen
 * from both ends: whatever `violatedBy` would refuse, `wouldViolate`
 * keeps off the menu, and neither can be taught something the other
 * was not. The suite is written against that property rather than
 * against a list of cases, because the failure mode this design
 * exists to prevent is precisely the two answers drifting apart.
 */

import { describe, expect, it } from 'vitest';
import type { Conflict } from '../../../src/domain/contract/composition.js';
import {
  assemblyRefusal,
  conflictsOf,
  legalWith,
  violatedBy,
  violationMessage,
  validateConflict,
  wouldViolate,
} from '../../../src/domain/core/compatibility.js';

/** A requirement, spelled as its violation. */
const NEEDS_MODULITH: Conflict = {
  id: 'demo/peer-needs-modulith',
  when: ['modules.peer-context'],
  unless: ['layout.modulith'],
  reason: 'a second bounded context needs the seam the modulith puts between them',
};

/** A mutual exclusion. */
const NOT_BOTH: Conflict = {
  id: 'demo/one-build-system',
  when: ['pkg.gradle', 'pkg.maven'],
  reason: 'a project is built by one build system',
};

/** A rule over a namespace rather than a literal tag. */
const NO_JVM_IN_BROWSER: Conflict = {
  id: 'demo/no-jvm-in-browser',
  when: ['runtime.browser', 'pkg.gradle*'],
  reason: 'the browser target is not built by a JVM build system',
};

const RULES = [NEEDS_MODULITH, NOT_BOTH, NO_JVM_IN_BROWSER];

describe('violatedBy', () => {
  it('bites when every tag of the combination is present', () => {
    expect(violatedBy(RULES, ['pkg.gradle', 'pkg.maven']).map((c) => c.id)).toEqual([NOT_BOTH.id]);
  });

  it('leaves a partial combination alone', () => {
    expect(violatedBy(RULES, ['pkg.gradle'])).toEqual([]);
  });

  it('reads a requirement as the absence that violates it', () => {
    expect(violatedBy(RULES, ['modules.peer-context', 'layout.basic']).map((c) => c.id)).toEqual([
      NEEDS_MODULITH.id,
    ]);
    expect(violatedBy(RULES, ['modules.peer-context', 'layout.modulith'])).toEqual([]);
  });

  it('matches a namespace the way a predicate does', () => {
    // `pkg.gradle*` covers `pkg.gradle-kts`, which no literal would.
    expect(violatedBy(RULES, ['runtime.browser', 'pkg.gradle-kts']).map((c) => c.id)).toEqual([
      NO_JVM_IN_BROWSER.id,
    ]);
  });

  it('reports every rule an assembly breaks, not just the first', () => {
    const broken = violatedBy(RULES, [
      'modules.peer-context',
      'layout.basic',
      'pkg.gradle',
      'pkg.maven',
    ]);
    expect(broken.map((c) => c.id)).toEqual([NEEDS_MODULITH.id, NOT_BOTH.id]);
  });
});

describe('wouldViolate', () => {
  it('answers exactly what violatedBy would refuse', () => {
    // The property the whole design rests on: the menu filter and the
    // refusal are one rule read from two ends. Anything `wouldViolate`
    // lets through must survive `violatedBy` on the assembled set.
    const base = ['layout.basic'];
    for (const candidate of ['modules.peer-context', 'pkg.gradle', 'runtime.browser']) {
      const filtered = wouldViolate(RULES, base, [candidate]).length === 0;
      const assembled = violatedBy(RULES, [...base, candidate]).length === 0;
      expect(filtered).toBe(assembled);
    }
  });

  it('reports only what the addition newly breaks', () => {
    // The base is already illegal. A menu that hid every remaining
    // choice for that reason would answer a question nobody asked —
    // "is this option a dead end?" is about the option.
    const brokenBase = ['pkg.gradle', 'pkg.maven'];
    expect(violatedBy(RULES, brokenBase).map((c) => c.id)).toEqual([NOT_BOTH.id]);
    expect(wouldViolate(RULES, brokenBase, ['layout.modulith'])).toEqual([]);
    expect(legalWith(RULES, brokenBase, ['layout.modulith'])).toBe(true);
  });

  it('hides the choice that would break a requirement', () => {
    expect(legalWith(RULES, ['layout.basic'], ['modules.peer-context'])).toBe(false);
    expect(legalWith(RULES, ['layout.modulith'], ['modules.peer-context'])).toBe(true);
  });
});

describe('conflictsOf', () => {
  it('gathers the rules the pieces declare, in order', () => {
    const gathered = conflictsOf([{ conflicts: [NOT_BOTH] }, {}, { conflicts: [NEEDS_MODULITH] }]);
    expect(gathered.map((c) => c.id)).toEqual([NOT_BOTH.id, NEEDS_MODULITH.id]);
  });

  it('declares a rule once however many pieces carry it', () => {
    // A vertical named by the stack and again by `--with` is one
    // piece; two copies of its rule would read as two problems.
    const gathered = conflictsOf([{ conflicts: [NOT_BOTH] }, { conflicts: [NOT_BOTH] }]);
    expect(gathered).toHaveLength(1);
  });
});

describe('violationMessage', () => {
  it('states the reason, then the evidence', () => {
    const message = violationMessage(NOT_BOTH, ['pkg.gradle', 'pkg.maven', 'lang.java']);
    expect(message).toContain('a project is built by one build system');
    expect(message).toContain('pkg.gradle + pkg.maven');
    expect(message).toContain(NOT_BOTH.id);
    // The tags that had nothing to do with it stay out of it.
    expect(message).not.toContain('lang.java');
  });

  it('names the tag a namespace matched, not the pattern', () => {
    // `pkg.gradle*` is what the rule says; `pkg.gradle-kts` is what
    // the user has, and it is the one worth printing.
    const message = violationMessage(NO_JVM_IN_BROWSER, ['runtime.browser', 'pkg.gradle-kts']);
    expect(message).toContain('pkg.gradle-kts');
    expect(message).not.toContain('pkg.gradle*');
  });
});

describe('assemblyRefusal', () => {
  const pieces = [{ conflicts: [NEEDS_MODULITH] }, { conflicts: [NOT_BOTH] }];

  it('is null for an assembly its pieces allow', () => {
    expect(assemblyRefusal(pieces, ['layout.modulith', 'modules.peer-context'])).toBeNull();
  });

  it('spells out every violation, not just the first', () => {
    // An assembly broken two ways is fixed twice; revealing the
    // second only after the first is fixed wastes a round trip.
    const refusal = assemblyRefusal(pieces, [
      'modules.peer-context',
      'layout.basic',
      'pkg.gradle',
      'pkg.maven',
    ]);
    expect(refusal).toContain(NEEDS_MODULITH.reason);
    expect(refusal).toContain(NOT_BOTH.reason);
  });

  it('reads the rules of every piece coming together', () => {
    // Neither piece alone knows the whole assembly, which is why the
    // stack's rules and its verticals' are gathered as one set.
    expect(
      assemblyRefusal([{ conflicts: [NOT_BOTH] }], ['pkg.gradle', 'pkg.maven']),
    ).not.toBeNull();
    expect(assemblyRefusal([{}], ['pkg.gradle', 'pkg.maven'])).toBeNull();
  });
});

describe('validateConflict', () => {
  it('refuses an empty combination', () => {
    // It would match every tag set — so it forbids every assembly,
    // and it is what an author who meant `unless` writes by mistake.
    expect(() => validateConflict({ id: 'demo/empty', when: [], reason: 'x' })).toThrow(
      /forbids every assembly/,
    );
  });

  it('refuses a malformed pattern, on either side', () => {
    expect(() => validateConflict({ id: 'demo/star', when: ['*'], reason: 'x' })).toThrow();
    expect(() =>
      validateConflict({ id: 'demo/star', when: ['a.b'], unless: ['*x'], reason: 'x' }),
    ).toThrow();
  });

  it('runs on evaluation, since a rule can arrive from a plugin', () => {
    expect(() => violatedBy([{ id: 'demo/empty', when: [], reason: 'x' }], ['a.b'])).toThrow(
      /forbids every assembly/,
    );
  });
});
