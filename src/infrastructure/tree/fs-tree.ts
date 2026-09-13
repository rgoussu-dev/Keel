/**
 * Filesystem adapter for the Tree port. Staged in memory, rooted at
 * an absolute path: reads fall through to disk lazily on first
 * access; writes stage in memory; `commit()` materialises staged
 * changes, each file written atomically via write-to-temp + rename
 * (see {@link atomicWrite}). If the process crashes mid-commit some
 * files may be written and others not, but no file is observed in a
 * half-written state.
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import fs from 'fs-extra';
import type { Tree, TreeChange, TreeFactory } from '../../domain/contract/ports/tree.js';

/** What disk held when a path was first touched — the base every write is measured against. */
interface OnDisk {
  readonly content: Buffer;
  /** Permission bits, so an explicit mode that matches disk is not a change either. */
  readonly mode: number;
}

type Entry =
  | {
      kind: 'present';
      content: Buffer;
      mode: number | null;
      /** Content differs from disk, or a mode was set that disk does not carry. */
      dirty: boolean;
      /** A mode was staged that differs from disk; survives later content-only writes. */
      modeDirty: boolean;
      wasOnDisk: boolean;
      onDisk: OnDisk | null;
    }
  | { kind: 'deleted'; wasOnDisk: boolean; onDisk: OnDisk | null };

/** The default Tree adapter, staging over the real filesystem. */
export class FsTree implements Tree {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly root: string) {}

  read(filePath: string): Buffer | null {
    const key = this.key(filePath);
    const entry = this.entries.get(key) ?? this.touch(key);
    this.entries.set(key, entry);
    return entry.kind === 'present' ? entry.content : null;
  }

  /**
   * Stages content. A write that lands the file back on what disk
   * holds is not a change: two adapters may write a shared file in
   * turn — one pristine, the next filling its own region — and what
   * `changes()` reports is the net against disk, not the number of
   * writes. A mode is tracked on its own terms: one that differs from
   * disk stays staged through later content-only writes, and one
   * disk already carries is no change either.
   */
  write(filePath: string, content: Buffer | string, options?: { mode?: number }): void {
    const key = this.key(filePath);
    const prior = this.entries.get(key) ?? this.touch(key);
    const explicitMode = options?.mode;
    const priorMode = prior.kind === 'present' ? prior.mode : null;
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const modeDirty =
      (prior.kind === 'present' && prior.modeDirty) ||
      (explicitMode !== undefined && explicitMode !== prior.onDisk?.mode);
    const contentDirty = prior.onDisk === null || !prior.onDisk.content.equals(next);
    this.entries.set(key, {
      kind: 'present',
      content: next,
      mode: explicitMode ?? priorMode ?? null,
      dirty: modeDirty || contentDirty,
      modeDirty,
      wasOnDisk: prior.wasOnDisk,
      onDisk: prior.onDisk,
    });
  }

  delete(filePath: string): void {
    const key = this.key(filePath);
    const prior = this.entries.get(key) ?? this.touch(key);
    this.entries.set(key, { kind: 'deleted', wasOnDisk: prior.wasOnDisk, onDisk: prior.onDisk });
  }

  /** The entry for a path not yet touched: what disk holds, untouched. */
  private touch(key: string): Entry {
    const abs = path.join(this.root, key);
    if (!fs.pathExistsSync(abs)) return { kind: 'deleted', wasOnDisk: false, onDisk: null };
    const onDisk = { content: fs.readFileSync(abs), mode: fs.statSync(abs).mode & 0o777 };
    return {
      kind: 'present',
      content: onDisk.content,
      mode: null,
      dirty: false,
      modeDirty: false,
      wasOnDisk: true,
      onDisk,
    };
  }

  exists(filePath: string): boolean {
    const key = this.key(filePath);
    const entry = this.entries.get(key);
    if (entry) return entry.kind === 'present';
    return fs.pathExistsSync(path.join(this.root, key));
  }

  list(dirPath: string): readonly string[] {
    const key = this.key(dirPath);
    const abs = path.join(this.root, key);
    const onDisk = fs.pathExistsSync(abs)
      ? fs.readdirSync(abs).map((n) => path.posix.join(key, n))
      : [];
    const staged: string[] = [];
    for (const [p, entry] of this.entries) {
      if (entry.kind === 'present' && p.startsWith(`${key}/`)) staged.push(p);
    }
    return [...new Set([...onDisk, ...staged])].sort();
  }

  changes(): readonly TreeChange[] {
    const out: TreeChange[] = [];
    for (const [p, entry] of this.entries) {
      if (entry.kind === 'deleted' && entry.wasOnDisk) out.push({ kind: 'delete', path: p });
      else if (entry.kind === 'present' && entry.dirty)
        out.push({ kind: entry.wasOnDisk ? 'modify' : 'create', path: p });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async commit(): Promise<readonly TreeChange[]> {
    const changes = this.changes();
    for (const change of changes) {
      const abs = path.join(this.root, change.path);
      if (change.kind === 'delete') {
        await fs.remove(abs);
        continue;
      }
      const entry = this.entries.get(change.path);
      if (entry?.kind !== 'present') continue;
      await fs.ensureDir(path.dirname(abs));
      await atomicWrite(abs, entry.content, entry.mode);
    }
    return changes;
  }

  private key(filePath: string): string {
    // Normalise to forward-slash, strip leading slashes / `./`.
    const normal = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    return normal;
  }
}

/** TreeFactory over {@link FsTree} — what the composition root wires. */
export const fsTreeFactory: TreeFactory = (root) => new FsTree(root);

/**
 * Writes a file atomically: the payload is written to a unique temp path
 * in the same directory, then renamed onto the target. On POSIX systems
 * rename is atomic when source and destination are on the same
 * filesystem. The effective mode precedence is:
 *
 *   1. `explicitMode` (e.g. the Tree entry's stored mode).
 *   2. The target file's pre-existing mode (if overwriting).
 *   3. The platform default (no explicit chmod).
 */
async function atomicWrite(
  target: string,
  content: Buffer,
  explicitMode: number | null,
): Promise<void> {
  const dir = path.dirname(target);
  const base = path.basename(target);
  const suffix = randomBytes(6).toString('hex');
  const tmp = path.join(dir, `.${base}.keel.${suffix}`);

  let priorMode: number | null = null;
  try {
    priorMode = (await fs.stat(target)).mode & 0o777;
  } catch {
    priorMode = null;
  }
  const finalMode = explicitMode ?? priorMode;

  await fs.writeFile(tmp, content);
  try {
    if (finalMode !== null) await fs.chmod(tmp, finalMode);
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.remove(tmp).catch(() => {});
    throw err;
  }
}
