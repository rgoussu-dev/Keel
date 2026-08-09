/**
 * The keel manifest — the state file keel maintains inside a consumer
 * project, and therefore part of keel's public contract. The domain
 * types, the zod schemas that govern the on-disk shape, and the
 * v1 → v2 migration all live here; actual disk I/O is behind the
 * `ManifestStore` port (`infrastructure/manifest` implements it).
 *
 * v1 manifests are migrated on first read by {@link migrateV1}; the
 * v1 write path is gone — once a v1 manifest is read and the caller
 * writes back, it is persisted as v2.
 */

import path from 'node:path';
import { z } from 'zod';
import type { Tag } from './composition.js';

/** The on-disk manifest filename, under `<project>/.claude/`. */
export const MANIFEST_FILENAME = '.keel-manifest.json';

/**
 * The project scope root keel owns: `<cwd>/.claude`. keel installs
 * are scoped to the **project** only — the user's home directory
 * (`~/.claude`) is never read, written, or otherwise touched.
 */
export function projectScopeRoot(cwd: string): string {
  return path.join(cwd, '.claude');
}

/**
 * Manifest v2 — the keel state file. Adds capability-tag composition
 * to the file-tracking entries from v1 (which remain for drift
 * detection on `keel doctor`).
 */
export interface ManifestV2 {
  readonly version: 2;
  readonly keelVersion: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly tags: readonly Tag[];
  readonly verticals: readonly InstalledVertical[];
  /** Installed package versions, keyed by package id, for migrations. */
  readonly versions: Readonly<Record<string, string>>;
  /** Sticky question answers: adapterId → questionId → value. */
  readonly answers: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** File-tracking entries carried over from v1, used for drift detection. */
  readonly entries: readonly ManifestEntry[];
}

/** Record of a vertical the user installed. */
export interface InstalledVertical {
  readonly id: string;
  readonly installedAt: string;
}

/**
 * File-tracking entry — unchanged from v1. `sha256Shipped` is the
 * hash at install time; `sha256Current` is the hash at last manifest
 * write. Divergence indicates a user edit.
 */
export interface ManifestEntry {
  readonly source: string;
  readonly target: string;
  readonly sha256Shipped: string;
  readonly sha256Current: string;
  readonly installedAt: string;
}

/** Schema for a v1/v2 file-tracking entry. */
export const ManifestEntrySchema = z.object({
  source: z.string(),
  target: z.string(),
  sha256Shipped: z.string(),
  sha256Current: z.string(),
  installedAt: z.string(),
});

/**
 * v1 manifest schema. Kept around solely so {@link parseManifest}
 * can recognise an on-disk v1 file and migrate it to v2 in memory.
 * Nothing in keel writes v1 manifests anymore.
 */
const ManifestV1Schema = z.object({
  kitVersion: z.string(),
  installedAt: z.string(),
  updatedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
});

/** Schema for an installed-vertical record. */
export const InstalledVerticalSchema = z.object({
  id: z.string(),
  installedAt: z.string(),
});

/** Schema governing the v2 on-disk shape. */
export const ManifestV2Schema = z.object({
  version: z.literal(2),
  keelVersion: z.string(),
  installedAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  verticals: z.array(InstalledVerticalSchema),
  versions: z.record(z.string(), z.string()),
  answers: z.record(z.string(), z.record(z.string(), z.string())),
  entries: z.array(ManifestEntrySchema),
});

/**
 * Reads either a v1 or v2 manifest and returns v2 data, migrating
 * in memory if needed. Migration is non-destructive — the file on
 * disk stays v1 until something writes it back.
 */
export function parseManifest(raw: unknown): ManifestV2 {
  if (typeof raw === 'object' && raw !== null && (raw as { version?: unknown }).version === 2) {
    return ManifestV2Schema.parse(raw);
  }
  const v1 = ManifestV1Schema.parse(raw);
  return migrateV1(v1);
}

/**
 * Promotes a v1 manifest to v2 with empty tag/vertical/answer state.
 * Existing file-tracking entries are preserved verbatim.
 */
export function migrateV1(v1: z.infer<typeof ManifestV1Schema>): ManifestV2 {
  return {
    version: 2,
    keelVersion: v1.kitVersion,
    installedAt: v1.installedAt,
    updatedAt: v1.updatedAt,
    tags: [],
    verticals: [],
    versions: {},
    answers: {},
    entries: v1.entries,
  };
}

/** A new, empty v2 manifest. */
export function emptyManifestV2(now: string, keelVersion: string): ManifestV2 {
  return {
    version: 2,
    keelVersion,
    installedAt: now,
    updatedAt: now,
    tags: [],
    verticals: [],
    versions: {},
    answers: {},
    entries: [],
  };
}
