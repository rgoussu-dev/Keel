/**
 * Filesystem adapter for the ManifestStore port. Reads are
 * version-aware (v1 → v2 migration in memory, via the contract's
 * `parseManifest`); writes validate against the v2 schema before
 * touching disk so a malformed in-memory state can't poison the file.
 */

import path from 'node:path';
import fs from 'fs-extra';
import {
  MANIFEST_FILENAME,
  ManifestV2Schema,
  parseManifest,
  type ManifestV2,
} from '../../domain/contract/manifest.js';
import type { ManifestStore } from '../../domain/contract/ports/manifest-store.js';

/** The on-disk manifest store the CLI wires by default. */
export class FsManifestStore implements ManifestStore {
  async read(scopeRoot: string): Promise<ManifestV2 | null> {
    const file = path.join(scopeRoot, MANIFEST_FILENAME);
    if (!(await fs.pathExists(file))) return null;
    const raw = await fs.readJson(file);
    return parseManifest(raw);
  }

  async write(scopeRoot: string, manifest: ManifestV2): Promise<void> {
    const validated = ManifestV2Schema.parse(manifest);
    await fs.ensureDir(scopeRoot);
    await fs.writeJson(path.join(scopeRoot, MANIFEST_FILENAME), validated, { spaces: 2 });
  }
}

/** Shared default instance. */
export const fsManifestStore = new FsManifestStore();
