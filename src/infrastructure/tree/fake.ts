/**
 * Canonical fake for the Tree port: fully in-memory, no disk at all.
 * `commit()` freezes the staged changes as "committed" and returns
 * them; tests inspect content via `read` and the committed flag via
 * {@link FakeTree.committed}.
 */

import type { Tree, TreeChange } from '../../domain/contract/ports/tree.js';

type Entry = { content: Buffer; mode: number | null; dirty: boolean; preExisting: boolean };

/** Tree fake backed by a plain map. */
export class FakeTree implements Tree {
  private readonly entries = new Map<string, Entry>();
  private readonly deleted = new Set<string>();
  /** Changes returned by the last `commit()`, or null before it. */
  committed: readonly TreeChange[] | null = null;

  /** Seeds a file as if it already existed before the install ran. */
  seed(filePath: string, content: Buffer | string): void {
    this.entries.set(this.key(filePath), {
      content: toBuffer(content),
      mode: null,
      dirty: false,
      preExisting: true,
    });
  }

  read(filePath: string): Buffer | null {
    return this.entries.get(this.key(filePath))?.content ?? null;
  }

  write(filePath: string, content: Buffer | string, options?: { mode?: number }): void {
    const key = this.key(filePath);
    const prior = this.entries.get(key);
    this.deleted.delete(key);
    this.entries.set(key, {
      content: toBuffer(content),
      mode: options?.mode ?? prior?.mode ?? null,
      dirty: true,
      preExisting: prior?.preExisting ?? false,
    });
  }

  delete(filePath: string): void {
    const key = this.key(filePath);
    if (this.entries.get(key)?.preExisting) this.deleted.add(key);
    this.entries.delete(key);
  }

  exists(filePath: string): boolean {
    return this.entries.has(this.key(filePath));
  }

  list(dirPath: string): readonly string[] {
    const prefix = `${this.key(dirPath)}/`;
    return [...this.entries.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  changes(): readonly TreeChange[] {
    const out: TreeChange[] = [];
    for (const p of this.deleted) out.push({ kind: 'delete', path: p });
    for (const [p, e] of this.entries) {
      if (e.dirty) out.push({ kind: e.preExisting ? 'modify' : 'create', path: p });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  commit(): Promise<readonly TreeChange[]> {
    this.committed = this.changes();
    return Promise.resolve(this.committed);
  }

  private key(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  }
}

function toBuffer(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
}
