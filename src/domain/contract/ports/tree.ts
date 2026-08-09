/**
 * The Tree port — the staged filesystem composition adapters write
 * into. Contributions mutate a Tree in memory; nothing reaches disk
 * until the owning handler calls {@link Tree.commit} after the plan
 * has been reviewed (or skips it under dry-run).
 *
 * The default adapter (`infrastructure/tree`) stages over the real
 * filesystem; the shipped fake stays fully in memory. Alternative
 * substrates (a Yjs CRDT, a remote VFS) would ship as separate
 * packages implementing this same port.
 */

/** A virtual filesystem staged in memory. */
export interface Tree {
  /** Returns the content of a file in the tree, or `null` if absent. */
  read(filePath: string): Buffer | null;
  /**
   * Writes (or overwrites) a file in the tree. The optional `mode` is
   * propagated on `commit`; omit it to preserve any prior mode bits
   * on the target file, or to let the platform default apply on
   * create. Mode is required to round-trip executable template files
   * such as `gradlew`.
   */
  write(filePath: string, content: Buffer | string, options?: { mode?: number }): void;
  /** Deletes a file from the tree. No-op if absent. */
  delete(filePath: string): void;
  /** Reports whether the given file exists in the tree. */
  exists(filePath: string): boolean;
  /** Lists files under the given directory in the tree. */
  list(dirPath: string): readonly string[];
  /** Returns every file affected (created, modified, deleted) by staged actions. */
  changes(): readonly TreeChange[];
  /**
   * Materialises staged changes to the tree's backing store and
   * returns them in the same order as {@link changes}. Idempotence
   * and atomicity guarantees are the adapter's to document.
   */
  commit(): Promise<readonly TreeChange[]>;
}

/** A staged change to the tree, surfaced via {@link Tree.changes}. */
export type TreeChange =
  | { kind: 'create'; path: string }
  | { kind: 'modify'; path: string }
  | { kind: 'delete'; path: string };

/**
 * Creates a Tree rooted at an absolute path. Handlers receive this
 * factory instead of a concrete Tree class so the composition root
 * decides the substrate.
 */
export type TreeFactory = (root: string) => Tree;
