import path from 'node:path';
import fs from 'fs-extra';
import type { Tree, TreeChange } from './types.js';

type Entry =
  | { kind: 'present'; content: Buffer; dirty: boolean; wasOnDisk: boolean }
  | { kind: 'deleted'; wasOnDisk: boolean };

/**
 * In-memory tree rooted at an absolute path. Reads fall through to disk
 * lazily on first access; writes stage in memory. `commit()` materialises
 * staged changes to disk atomically per file.
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
    this.entries.set(key, { kind: 'present', content, dirty: false, wasOnDisk: true });
    return content;
  }

  write(filePath: string, content: Buffer | string): void {
    const key = this.key(filePath);
    const prior = this.entries.get(key);
    const wasOnDisk = prior?.kind === 'present' ? prior.wasOnDisk : fs.pathExistsSync(path.join(this.root, key));
    this.entries.set(key, {
      kind: 'present',
      content: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
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

  /** Materialises staged changes to disk. Returns the list of changes applied. */
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
      await fs.writeFile(abs, entry.content);
    }
    return changes;
  }

  private key(filePath: string): string {
    // Normalise to forward-slash, strip leading slashes / `./`.
    const normal = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    return normal;
  }
}
