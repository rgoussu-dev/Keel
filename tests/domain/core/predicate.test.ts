import { describe, expect, it } from 'vitest';
import { matches, validatePattern } from '../../../src/domain/core/predicate.js';

const tagSet = (...tags: string[]): ReadonlySet<string> => new Set(tags);

describe('matches', () => {
  it('returns true for an empty predicate against any tag set', () => {
    expect(matches({}, tagSet())).toBe(true);
    expect(matches({ requires: [], excludes: [] }, tagSet('a', 'b'))).toBe(true);
  });

  it('requires every literal in `requires`', () => {
    const tags = tagSet('lang.java', 'framework.quarkus', 'arch.cli');
    expect(matches({ requires: ['lang.java', 'framework.quarkus'] }, tags)).toBe(true);
    expect(matches({ requires: ['lang.java', 'framework.spring'] }, tags)).toBe(false);
  });

  it('rejects when any literal in `excludes` is satisfied', () => {
    const tags = tagSet('lang.java', 'framework.quarkus');
    expect(matches({ excludes: ['framework.spring'] }, tags)).toBe(true);
    expect(matches({ excludes: ['framework.quarkus'] }, tags)).toBe(false);
  });

  it('honours both requires and excludes together', () => {
    const tags = tagSet('runtime.jvm', 'framework.quarkus');
    expect(matches({ requires: ['runtime.jvm'], excludes: ['framework.spring'] }, tags)).toBe(true);
    expect(matches({ requires: ['runtime.jvm'], excludes: ['framework.quarkus'] }, tags)).toBe(
      false,
    );
  });

  it('matches glob suffix patterns', () => {
    const tags = tagSet('runtime.jvm.graalvm-native', 'lang.java');
    expect(matches({ requires: ['runtime.jvm.*'] }, tags)).toBe(true);
    // The bare prefix is NOT covered by the glob — that's by design.
    expect(matches({ requires: ['runtime.jvm.*'] }, tagSet('runtime.jvm'))).toBe(false);
  });

  it('uses globs in excludes too', () => {
    const tags = tagSet('runtime.jvm.graalvm-native');
    expect(matches({ excludes: ['runtime.jvm.*'] }, tags)).toBe(false);
    expect(matches({ excludes: ['runtime.node.*'] }, tags)).toBe(true);
  });

  it('rejects malformed patterns at evaluation time', () => {
    expect(() => matches({ requires: ['*'] }, tagSet('a'))).toThrow();
    expect(() => matches({ requires: ['*.foo'] }, tagSet('a'))).toThrow();
    expect(() => matches({ requires: ['fo*o'] }, tagSet('a'))).toThrow();
  });
});

describe('validatePattern', () => {
  it('accepts valid literals and trailing-glob patterns', () => {
    expect(() => validatePattern('lang.java')).not.toThrow();
    expect(() => validatePattern('runtime.jvm.*')).not.toThrow();
    expect(() => validatePattern('a*')).not.toThrow();
  });

  it('rejects empty, bare-star, leading-star, and embedded-star', () => {
    expect(() => validatePattern('')).toThrow();
    expect(() => validatePattern('*')).toThrow();
    expect(() => validatePattern('*foo')).toThrow();
    expect(() => validatePattern('a*b')).toThrow();
  });
});
