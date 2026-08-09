/**
 * Disk I/O for the v2 manifest. Reads are version-aware (v1 → v2
 * migration in memory). Writes always emit v2 format.
 */

import path from 'node:path';
import fs from 'fs-extra';
import {
  MANIFEST_FILENAME,
  ManifestV2Schema,
  parseManifest,
  type ManifestV2,
} from '../domain/contract/manifest.js';

/**
 * Reads the manifest from `<scopeRoot>/.keel-manifest.json`. Returns
 * null on a fresh project. Migrates v1 manifests transparently.
 */
export async function readManifestV2(scopeRoot: string): Promise<ManifestV2 | null> {
  const file = path.join(scopeRoot, MANIFEST_FILENAME);
  if (!(await fs.pathExists(file))) return null;
  const raw = await fs.readJson(file);
  return parseManifest(raw);
}

/**
 * Writes the v2 manifest. Validates against the v2 schema before
 * write so a malformed in-memory state can't poison the file.
 */
export async function writeManifestV2(scopeRoot: string, manifest: ManifestV2): Promise<void> {
  const validated = ManifestV2Schema.parse(manifest);
  await fs.ensureDir(scopeRoot);
  await fs.writeJson(path.join(scopeRoot, MANIFEST_FILENAME), validated, { spaces: 2 });
}
