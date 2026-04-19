import path from 'node:path';
import fs from 'fs-extra';
import { confirm, select } from '@inquirer/prompts';
import { logger } from '../util/log.js';
import { sha256 } from '../util/hash.js';
import { paths, type AssetKind } from '../util/paths.js';
import type { Manifest, ManifestEntry } from '../manifest/schema.js';
import { readManifest, writeManifest } from '../manifest/store.js';
import { planInstall } from './plan.js';

export interface UpdateOptions {
  scope: 'global' | 'project';
  cwd: string;
  dryRun: boolean;
  nonInteractive: boolean;
}

/**
 * Upgrades an existing install to the current kit version. For each file,
 * compares three hashes — the user's current file, the hash shipped at the
 * last install, and the hash of the newly-packaged file — and applies a
 * three-way reconciliation.
 *
 * Unchanged user files are overwritten silently. User-modified files prompt
 * for keep / overwrite / show-diff unless `nonInteractive` is set, in
 * which case user edits are preserved (safe default).
 */
export async function update(opts: UpdateOptions): Promise<void> {
  const targetRoot = opts.scope === 'global' ? paths.global : paths.project(opts.cwd);
  const assetKind: AssetKind = opts.scope;
  const assetRoot = paths.asset(assetKind);

  const existing = await readManifest(targetRoot);
  if (!existing) {
    logger.error(`no manifest at ${targetRoot} — run \`keel install\` first.`);
    throw new Error('update refused: no manifest');
  }

  logger.info(`updating ${opts.scope} install at ${targetRoot}`);

  const plan = await planInstall(assetRoot, targetRoot);
  const existingByTarget = new Map(existing.entries.map((e) => [e.target, e]));
  const newEntries: ManifestEntry[] = [];
  const now = new Date().toISOString();

  for (const file of plan) {
    const relPosix = file.relative.split(path.sep).join('/');
    const shipped = await fs.readFile(file.sourceAbs);
    const shippedHash = sha256(shipped);
    const prior = existingByTarget.get(relPosix);

    if (!(await fs.pathExists(file.targetAbs))) {
      // New file introduced by this kit version.
      if (!opts.dryRun) {
        await fs.ensureDir(path.dirname(file.targetAbs));
        await fs.writeFile(file.targetAbs, shipped);
        if (relPosix.endsWith('.sh') && process.platform !== 'win32') {
          await fs.chmod(file.targetAbs, 0o755);
        }
      }
      logger.success(`+ ${relPosix}`);
      newEntries.push({
        source: path.posix.join(assetKind, relPosix),
        target: relPosix,
        sha256Shipped: shippedHash,
        sha256Current: shippedHash,
        installedAt: now,
      });
      continue;
    }

    const current = await fs.readFile(file.targetAbs);
    const currentHash = sha256(current);

    if (currentHash === shippedHash) {
      // Nothing to do; user file already matches new shipped file.
      newEntries.push({
        source: path.posix.join(assetKind, relPosix),
        target: relPosix,
        sha256Shipped: shippedHash,
        sha256Current: shippedHash,
        installedAt: prior?.installedAt ?? now,
      });
      continue;
    }

    const userModified = prior && currentHash !== prior.sha256Shipped;

    if (!userModified) {
      // User has not touched the file since install → safe to overwrite.
      if (!opts.dryRun) {
        await fs.writeFile(file.targetAbs, shipped);
        if (relPosix.endsWith('.sh') && process.platform !== 'win32') {
          await fs.chmod(file.targetAbs, 0o755);
        }
      }
      logger.success(`~ ${relPosix} (upgraded)`);
      newEntries.push({
        source: path.posix.join(assetKind, relPosix),
        target: relPosix,
        sha256Shipped: shippedHash,
        sha256Current: shippedHash,
        installedAt: prior?.installedAt ?? now,
      });
      continue;
    }

    // User modified file AND shipped file changed → conflict.
    logger.warn(`! ${relPosix} — user-modified and kit-updated`);
    const resolution = opts.nonInteractive
      ? 'keep'
      : await resolveConflict(relPosix, current, shipped);
    if (resolution === 'overwrite' && !opts.dryRun) {
      await fs.writeFile(file.targetAbs, shipped);
    }
    newEntries.push({
      source: path.posix.join(assetKind, relPosix),
      target: relPosix,
      sha256Shipped: shippedHash,
      sha256Current: resolution === 'overwrite' ? shippedHash : currentHash,
      installedAt: prior?.installedAt ?? now,
    });
  }

  if (opts.dryRun) {
    logger.info('dry run — no files written');
    return;
  }

  const manifest: Manifest = {
    ...existing,
    kitVersion: (await loadKitVersion()) ?? existing.kitVersion,
    updatedAt: now,
    entries: newEntries,
  };
  await writeManifest(targetRoot, manifest);
  logger.success(`update complete (${newEntries.length} files tracked)`);
}

async function resolveConflict(
  file: string,
  _current: Buffer,
  _shipped: Buffer,
): Promise<'keep' | 'overwrite'> {
  const choice = await select<'keep' | 'overwrite'>({
    message: `Resolve ${file}`,
    choices: [
      { name: 'keep your version', value: 'keep' },
      { name: 'overwrite with shipped version', value: 'overwrite' },
    ],
  });
  if (choice === 'overwrite') {
    const ok = await confirm({ message: 'confirm overwrite?', default: false });
    if (!ok) return 'keep';
  }
  return choice;
}

async function loadKitVersion(): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const pkgPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'package.json',
    );
    const raw = await readFile(pkgPath, 'utf8');
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return null;
  }
}
