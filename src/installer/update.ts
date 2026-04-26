import path from 'node:path';
import fs from 'fs-extra';
import { confirm, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { logger } from '../util/log.js';
import { sha256 } from '../util/hash.js';
import { paths } from '../util/paths.js';
import type { Manifest, ManifestEntry } from '../manifest/schema.js';
import { readManifest, writeManifest } from '../manifest/store.js';
import { planInstall } from './plan.js';

export interface UpdateOptions {
  cwd: string;
  dryRun: boolean;
  nonInteractive: boolean;
}

/**
 * Upgrades an existing project install to the current kit version. For
 * each file, compares three hashes — the user's current file, the hash
 * shipped at the last install, and the hash of the newly-packaged file —
 * and applies a three-way reconciliation.
 *
 * Unchanged user files are overwritten silently. User-modified files
 * prompt for keep / overwrite / show-diff unless `nonInteractive` is set,
 * in which case user edits are preserved (safe default).
 *
 * Files present on disk with no prior manifest entry are treated as
 * pre-existing user files and route to the conflict prompt rather than
 * being silently overwritten.
 *
 * Files that were previously kit-owned but are no longer in the shipped
 * assets become orphans: unmodified orphans are deleted; modified orphans
 * are kept but un-tracked and reported to the user.
 *
 * The user's home directory (`~/.claude`) is never touched.
 */
export async function update(opts: UpdateOptions): Promise<void> {
  const targetRoot = paths.project(opts.cwd);
  const assetRoot = paths.claudeCoreTemplates();

  const existing = await readManifest(targetRoot);
  if (!existing) {
    logger.error(`no manifest at ${targetRoot} — run \`keel install\` first.`);
    throw new Error('update refused: no manifest');
  }

  logger.info(`updating project install at ${targetRoot}`);

  const plan = await planInstall(assetRoot, targetRoot);
  const existingByTarget = new Map(existing.entries.map((e) => [e.target, e]));
  const newEntries: ManifestEntry[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  for (const file of plan) {
    const relPosix = file.relative.split(path.sep).join('/');
    seen.add(relPosix);
    const shipped = await fs.readFile(file.sourceAbs);
    const shippedHash = sha256(shipped);
    const prior = existingByTarget.get(relPosix);

    if (!(await fs.pathExists(file.targetAbs))) {
      // New file introduced by this kit version.
      if (!opts.dryRun) {
        await fs.ensureDir(path.dirname(file.targetAbs));
        await fs.writeFile(file.targetAbs, shipped);
        await restoreExecBit(file.targetAbs, relPosix);
      }
      logger.success(`+ ${relPosix}`);
      newEntries.push(freshEntry(relPosix, shippedHash, now));
      continue;
    }

    const current = await fs.readFile(file.targetAbs);
    const currentHash = sha256(current);

    if (currentHash === shippedHash) {
      // User file already matches the new shipped file — nothing to do.
      newEntries.push({
        ...freshEntry(relPosix, shippedHash, prior?.installedAt ?? now),
      });
      continue;
    }

    // User file differs from new shipped file. Decide the reconciliation.
    const userModified = !prior || currentHash !== prior.sha256Shipped;

    if (!userModified) {
      // User has not touched the file since install → safe to overwrite.
      if (!opts.dryRun) {
        await fs.writeFile(file.targetAbs, shipped);
        await restoreExecBit(file.targetAbs, relPosix);
      }
      logger.success(`~ ${relPosix} (upgraded)`);
      newEntries.push(freshEntry(relPosix, shippedHash, prior?.installedAt ?? now));
      continue;
    }

    // Conflict. If no prior entry exists, the file pre-existed the kit
    // (or the manifest is stale) — treat as user content regardless.
    const reason = prior
      ? 'user-modified and kit-updated'
      : 'pre-existing on disk (no prior manifest entry)';
    logger.warn(`! ${relPosix} — ${reason}`);

    const resolution = opts.nonInteractive
      ? 'keep'
      : await resolveConflict(relPosix, current, shipped);
    if (resolution === 'overwrite' && !opts.dryRun) {
      await fs.writeFile(file.targetAbs, shipped);
      await restoreExecBit(file.targetAbs, relPosix);
    }
    newEntries.push({
      source: path.posix.join('claude-core', relPosix),
      target: relPosix,
      sha256Shipped: shippedHash,
      sha256Current: resolution === 'overwrite' ? shippedHash : currentHash,
      installedAt: prior?.installedAt ?? now,
    });
  }

  // Orphans: previously kit-owned files no longer shipped.
  // Stack-specific schematics (`claude-quarkus`, future `claude-<stack>`,
  // `walking-skeleton`, …) have their own template roots; until update is
  // stack-aware, we leave their files alone and preserve their manifest
  // entries verbatim. Only entries owned by claude-core are eligible for
  // orphan removal here, since `assetRoot` only walks claude-core. The
  // legacy `project/` prefix is treated as core-equivalent to keep
  // pre-v0.2 manifests upgrading cleanly.
  for (const prior of existing.entries) {
    if (seen.has(prior.target)) continue;
    if (!isCoreOwned(prior.source)) {
      newEntries.push(prior);
      continue;
    }
    const abs = path.join(targetRoot, prior.target);
    if (!(await fs.pathExists(abs))) continue;
    const current = await fs.readFile(abs);
    const currentHash = sha256(current);
    if (currentHash === prior.sha256Current) {
      if (!opts.dryRun) await fs.remove(abs);
      logger.info(`- ${prior.target} (removed: no longer shipped)`);
    } else {
      logger.warn(`? ${prior.target} — user-modified orphan; kept, no longer tracked`);
    }
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

type Resolution = 'keep' | 'overwrite';

async function resolveConflict(
  file: string,
  current: Buffer,
  shipped: Buffer,
): Promise<Resolution> {
  for (;;) {
    const choice = await select<Resolution | 'diff'>({
      message: `Resolve ${file}`,
      choices: [
        { name: 'keep your version', value: 'keep' },
        { name: 'overwrite with shipped version', value: 'overwrite' },
        { name: 'show diff (your → shipped)', value: 'diff' },
      ],
    });
    if (choice === 'diff') {
      printDiff(current.toString('utf8'), shipped.toString('utf8'));
      continue;
    }
    if (choice === 'overwrite') {
      const ok = await confirm({ message: 'confirm overwrite?', default: false });
      if (!ok) continue;
    }
    return choice;
  }
}

/**
 * Prints a compact unified-ish diff of two strings — enough to judge
 * whether to keep or overwrite. Not a full Myers implementation.
 */
function printDiff(current: string, shipped: string): void {
  const a = current.split('\n');
  const b = shipped.split('\n');
  const max = Math.max(a.length, b.length);
  let printed = 0;
  const limit = 40;
  for (let i = 0; i < max && printed < limit; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) continue;
    if (left !== undefined) {
      console.error(chalk.red(`-${i + 1}: ${left}`));
      printed++;
    }
    if (right !== undefined && printed < limit) {
      console.error(chalk.green(`+${i + 1}: ${right}`));
      printed++;
    }
  }
  if (printed === 0)
    console.error(chalk.gray('(no line differences visible; may be whitespace/newline)'));
  else if (printed >= limit) console.error(chalk.gray(`... diff truncated at ${limit} lines`));
}

async function restoreExecBit(absPath: string, relPosix: string): Promise<void> {
  if (process.platform === 'win32') return;
  if (!relPosix.endsWith('.sh')) return;
  await fs.chmod(absPath, 0o755);
}

/** Source prefixes that identify a manifest entry as owned by claude-core
 *  (the universal scaffold). `project/` is the pre-v0.2 prefix; `claude-core/`
 *  the current one. Both route through the same orphan/update path. */
const CORE_SOURCE_PREFIXES = ['claude-core/', 'project/'];

function isCoreOwned(source: string): boolean {
  return CORE_SOURCE_PREFIXES.some((p) => source.startsWith(p));
}

function freshEntry(relPosix: string, hash: string, installedAt: string): ManifestEntry {
  return {
    source: path.posix.join('claude-core', relPosix),
    target: relPosix,
    sha256Shipped: hash,
    sha256Current: hash,
    installedAt,
  };
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
