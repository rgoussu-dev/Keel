import path from 'node:path';
import { randomBytes } from 'node:crypto';
import fs from 'fs-extra';
import type { Tree, TreeChange } from './types.js';

type Entry =
  | {
      kind: 'present';
      content: Buffer;
      mode: number | null;
      dirty: boolean;
      wasOnDisk: boolean;
    }
  | { kind: 'deleted'; wasOnDisk: boolean };

/**
 * In-memory tree rooted at an absolute path. Reads fall through to disk
 * lazily on first access; writes stage in memory. `commit()` materialises
 * staged changes to disk, each file written atomically via write-to-temp
 * + rename (see {@link atomicWrite}). If the process crashes mid-commit
 * some files may be written and others not, but no file is observed in a
 * half-written state.
 */
export class InMemoryTree implements Tree {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly root: string) {}

  read(filePath: string): Buffer | null {
    const key = this.key(filePath);
    const entry = this.entries.get(key);
    if (entry) return entry.kind === 'present' ? entry.content : null;
    const abs = path.join(this.root, key);
    if (!fs.pathExistsSync(abs)) {
      this.entries.set(key, { kind: 'deleted', wasOnDisk: false });
      return null;
    }
    const content = fs.readFileSync(abs);
    this.entries.set(key, {
      kind: 'present',
      content,
      mode: null,
      dirty: false,
      wasOnDisk: true,
    });
    return content;
  }

  write(filePath: string, content: Buffer | string, options?: { mode?: number }): void {
    const key = this.key(filePath);
    const prior = this.entries.get(key);
    const wasOnDisk =
      prior?.kind === 'present' ? prior.wasOnDisk : fs.pathExistsSync(path.join(this.root, key));
    const explicitMode = options?.mode;
    const priorMode = prior?.kind === 'present' ? prior.mode : null;
    this.entries.set(key, {
      kind: 'present',
      content: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
      mode: explicitMode ?? priorMode ?? null,
      dirty: true,
      wasOnDisk,
    });
  }

  delete(filePath: string): void {
    const key = this.key(filePath);
    const wasOnDisk =
      this.entries.get(key)?.kind === 'present'
        ? (this.entries.get(key) as { wasOnDisk: boolean }).wasOnDisk
        : fs.pathExistsSync(path.join(this.root, key));
    this.entries.set(key, { kind: 'deleted', wasOnDisk });
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

  /**
   * Materialises staged changes to disk. Each file is written atomically
   * (write-to-temp + rename on the same filesystem) so observers never
   * see a half-written file; if an existing file is being replaced its
   * permission bits are preserved across the rename.
   *
   * @returns the changes applied, in the same order as {@link changes}.
   */
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
