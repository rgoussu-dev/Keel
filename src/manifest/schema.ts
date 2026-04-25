import { z } from 'zod';

/**
 * Shape of a single installed file tracked by the manifest. `sha256Shipped`
 * is the hash of the file as it was at install time; `sha256Current` is the
 * hash of the file on disk at the last manifest write. A difference between
 * the two indicates the user has modified the file since install.
 */
export const ManifestEntrySchema = z.object({
  source: z.string(),
  target: z.string(),
  sha256Shipped: z.string(),
  sha256Current: z.string(),
  installedAt: z.string(),
});

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

/**
 * Top-level manifest written to `<project>/.claude/.keel-manifest.json`.
 * Tracks the kit version that produced the installation plus every file
 * owned by keel in this project. keel is project-scoped only — the user's
 * home directory is never touched.
 */
export const ManifestSchema = z.object({
  kitVersion: z.string(),
  installedAt: z.string(),
  updatedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;

export const MANIFEST_FILENAME = '.keel-manifest.json';
