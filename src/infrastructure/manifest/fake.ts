/**
 * Canonical fake for the ManifestStore port: manifests held in
 * memory, keyed by scope root. Validates writes with the same schema
 * as the filesystem adapter so tests catch malformed manifests too.
 */

import { ManifestV2Schema, type ManifestV2 } from '../../domain/contract/manifest.js';
import type { ManifestStore } from '../../domain/contract/ports/manifest-store.js';

/** ManifestStore fake backed by a map. */
export class FakeManifestStore implements ManifestStore {
  private readonly byScope = new Map<string, ManifestV2>();

  read(scopeRoot: string): Promise<ManifestV2 | null> {
    return Promise.resolve(this.byScope.get(scopeRoot) ?? null);
  }

  write(scopeRoot: string, manifest: ManifestV2): Promise<void> {
    this.byScope.set(scopeRoot, ManifestV2Schema.parse(manifest));
    return Promise.resolve();
  }
}
