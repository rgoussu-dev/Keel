/**
 * The filesystem Tree's change bookkeeping: what `changes()` reports
 * is the net against disk, not the number of writes. Two adapters
 * writing a shared file in turn — one pristine, the next filling its
 * own region — must not surface a `modify` whose diff is empty.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fs-tree-'));
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'prose\nsection\n');
});

afterEach(async () => {
  await fs.remove(root);
});

describe('FsTree.changes()', () => {
  it('reports nothing for a write that lands the file back on its disk content', () => {
    const tree = new FsTree(root);
    tree.write('AGENTS.md', 'prose\n');
    tree.write('AGENTS.md', 'prose\nsection\n');
    expect(tree.changes()).toEqual([]);
  });

  it('reports nothing for a write identical to disk, read first or not', () => {
    const unread = new FsTree(root);
    unread.write('AGENTS.md', 'prose\nsection\n');
    expect(unread.changes()).toEqual([]);

    const read = new FsTree(root);
    read.read('AGENTS.md');
    read.write('AGENTS.md', 'prose\nsection\n');
    expect(read.changes()).toEqual([]);
  });

  it('reports a modify once the content differs from disk', () => {
    const tree = new FsTree(root);
    tree.write('AGENTS.md', 'prose\nsection\nmore\n');
    expect(tree.changes()).toEqual([{ kind: 'modify', path: 'AGENTS.md' }]);
  });

  it('reports a mode change even over identical content, and keeps it through a later content-only write', () => {
    const tree = new FsTree(root);
    tree.write('AGENTS.md', 'prose\nsection\n', { mode: 0o755 });
    expect(tree.changes()).toEqual([{ kind: 'modify', path: 'AGENTS.md' }]);
    tree.write('AGENTS.md', 'prose\nsection\n');
    expect(tree.changes()).toEqual([{ kind: 'modify', path: 'AGENTS.md' }]);
  });

  it('commits a staged mode that a later content-only write did not clear', async () => {
    const tree = new FsTree(root);
    tree.write('AGENTS.md', 'prose\nsection\n', { mode: 0o755 });
    tree.write('AGENTS.md', 'prose\nsection\n');
    await tree.commit();
    expect((await fs.stat(path.join(root, 'AGENTS.md'))).mode & 0o111).not.toBe(0);
  });

  it('does not report a mode disk already carries', async () => {
    await fs.chmod(path.join(root, 'AGENTS.md'), 0o755);
    const tree = new FsTree(root);
    tree.write('AGENTS.md', 'prose\nsection\n', { mode: 0o755 });
    expect(tree.changes()).toEqual([]);
  });

  it('reports a create for a path disk does not hold, and a delete only for one it does', () => {
    const tree = new FsTree(root);
    tree.write('new.md', 'x\n');
    tree.delete('AGENTS.md');
    tree.delete('never.md');
    expect(tree.changes()).toEqual([
      { kind: 'delete', path: 'AGENTS.md' },
      { kind: 'create', path: 'new.md' },
    ]);
  });
});
