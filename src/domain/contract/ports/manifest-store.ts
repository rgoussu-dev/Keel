/**
 * The ManifestStore port — persistence for the keel state file. The
 * domain reads and writes manifests only through this interface; the
 * on-disk JSON adapter lives in `infrastructure/manifest`, and the
 * shipped fake keeps manifests in memory.
 */

import type { ManifestV2 } from '../manifest.js';

/** Reads and writes the manifest under a project scope root. */
export interface ManifestStore {
  /**
   * Returns the manifest stored under `scopeRoot`, or `null` on a
   * fresh project. Version migration (v1 → v2) is the adapter's
   * concern; callers always receive v2.
   */
  read(scopeRoot: string): Promise<ManifestV2 | null>;
  /** Persists the manifest under `scopeRoot`, validating its shape. */
  write(scopeRoot: string, manifest: ManifestV2): Promise<void>;
}
