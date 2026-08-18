import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../../src/domain/core/diff.js';

describe('unifiedDiff', () => {
  it('returns the empty string for identical texts', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n')).toBe('');
  });

  it('renders a single hunk with context around a changed line', () => {
    const diff = unifiedDiff('line1\nline2\nline3\n', 'line1\nchanged\nline3\n');
    expect(diff).toBe(['@@ -1,3 +1,3 @@', ' line1', '-line2', '+changed', ' line3'].join('\n'));
  });

  it('caps context at three lines on each side', () => {
    const old = ['a', 'b', 'c', 'd', 'e', 'X', 'f', 'g', 'h', 'i', 'j'].join('\n') + '\n';
    const neu = ['a', 'b', 'c', 'd', 'e', 'Y', 'f', 'g', 'h', 'i', 'j'].join('\n') + '\n';
    expect(unifiedDiff(old, neu)).toBe(
      ['@@ -3,7 +3,7 @@', ' c', ' d', ' e', '-X', '+Y', ' f', ' g', ' h'].join('\n'),
    );
  });

  it('splits distant changes into separate hunks', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
    const old = lines.join('\n') + '\n';
    const edited = [...lines];
    edited[1] = 'first';
    edited[17] = 'second';
    const diff = unifiedDiff(old, edited.join('\n') + '\n');
    expect(diff.split('\n').filter((l) => l.startsWith('@@'))).toEqual([
      '@@ -1,5 +1,5 @@',
      '@@ -15,6 +15,6 @@',
    ]);
    expect(diff).toContain('-l2');
    expect(diff).toContain('+first');
    expect(diff).toContain('-l18');
    expect(diff).toContain('+second');
  });

  it('merges changes within shared context into one hunk', () => {
    const old = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n') + '\n';
    const neu = ['a', 'B', 'c', 'd', 'e', 'F', 'g'].join('\n') + '\n';
    expect(
      unifiedDiff(old, neu)
        .split('\n')
        .filter((l) => l.startsWith('@@')),
    ).toEqual(['@@ -1,7 +1,7 @@']);
  });

  it('reports pure additions and removals', () => {
    expect(unifiedDiff('a\nb\n', 'a\nx\nb\n')).toBe(
      ['@@ -1,2 +1,3 @@', ' a', '+x', ' b'].join('\n'),
    );
    expect(unifiedDiff('a\nx\nb\n', 'a\nb\n')).toBe(
      ['@@ -1,3 +1,2 @@', ' a', '-x', ' b'].join('\n'),
    );
  });

  it('surfaces a missing trailing newline as the diff -u marker line', () => {
    const diff = unifiedDiff('a\nb', 'a\nb\n');
    expect(diff).toBe(['@@ -1,3 +1,2 @@', ' a', ' b', '-\\ No newline at end of file'].join('\n'));
  });
});
