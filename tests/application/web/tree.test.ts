/**
 * The page's one piece of real logic: folding a flat change list into
 * the tree the plan renders.
 *
 * It lives in `assets/web/` because that is where the page lives, and
 * it is tested here because it is a pure function over data the
 * domain produces — no DOM, no fetch, nothing that needs a browser.
 * The elements around it are thin enough that driving them would test
 * the DOM API; this is the part with an answer that can be wrong.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM shipped to the browser, no declarations.
import { countKinds, foldTree } from '../../../assets/web/src/tree.js';

interface Node {
  name: string;
  path: string;
  kind?: string;
  children: Node[];
}

const change = (path: string, kind = 'create'): { path: string; kind: string } => ({ path, kind });

const names = (nodes: Node[]): string[] => nodes.map((node) => node.name);

describe('foldTree', () => {
  it('folds paths into nested directories', () => {
    const tree = foldTree([
      change('src/domain/core/install.ts'),
      change('src/domain/core/apply.ts'),
      change('README.md'),
    ]) as Node[];
    expect(names(tree)).toEqual(['src', 'README.md']);
    expect(names(tree[0]!.children[0]!.children[0]!.children)).toEqual(['apply.ts', 'install.ts']);
  });

  it('puts directories before files at every level', () => {
    const tree = foldTree([
      change('a.txt'),
      change('z/inner.txt'),
      change('b.txt'),
      change('m/inner.txt'),
    ]) as Node[];
    expect(names(tree)).toEqual(['m', 'z', 'a.txt', 'b.txt']);
  });

  it('carries each leaf’s kind and leaves directories without one', () => {
    const tree = foldTree([
      change('src/kept.ts', 'modify'),
      change('src/gone.ts', 'delete'),
    ]) as Node[];
    expect(tree[0]?.kind).toBeUndefined();
    expect(tree[0]?.children.map((node) => [node.name, node.kind])).toEqual([
      ['gone.ts', 'delete'],
      ['kept.ts', 'modify'],
    ]);
  });

  it('gives every node its full path, for a stable key', () => {
    const tree = foldTree([change('a/b/c.ts')]) as Node[];
    expect(tree[0]?.path).toBe('a');
    expect(tree[0]?.children[0]?.path).toBe('a/b');
    expect(tree[0]?.children[0]?.children[0]?.path).toBe('a/b/c.ts');
  });

  it('folds an empty plan into nothing', () => {
    expect(foldTree([])).toEqual([]);
  });
});

describe('countKinds', () => {
  it('counts each kind, and zero for the ones absent', () => {
    expect(
      countKinds([change('a', 'create'), change('b', 'create'), change('c', 'modify')]),
    ).toEqual({ create: 2, modify: 1, delete: 0 });
  });

  it('ignores a kind it does not know', () => {
    expect(countKinds([change('a', 'invented')])).toEqual({ create: 0, modify: 0, delete: 0 });
  });
});
