import path from 'node:path';
import fs from 'fs-extra';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../util/log.js';
import { sha256 } from '../util/hash.js';
import { paths, type AssetKind } from '../util/paths.js';
import type { Manifest, ManifestEntry } from '../manifest/schema.js';
import { readManifest, writeManifest } from '../manifest/store.js';
import { planInstall } from './plan.js';

/**
 * Resolves the current kit version from the packaged `package.json`. Used
 * to stamp the manifest so `update` can detect out-of-date installs.
 */
function kitVersion(): string {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json',
  );
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

export interface InstallOptions {
  scope: 'global' | 'project';
  cwd: string;
  force: boolean;
  dryRun: boolean;
}

/**
 * Installs the kit assets for the requested scope into the target
 * directory. Refuses to overwrite existing non-keel files unless `force`
 * is set; refuses to reinstall over an existing manifest unless `force`.
 */
export async function install(opts: InstallOptions): Promise<void> {
  const targetRoot = opts.scope === 'global' ? paths.global : paths.project(opts.cwd);
  const assetKind: AssetKind = opts.scope;
  const assetRoot = paths.asset(assetKind);

  logger.info(`installing ${opts.scope} assets → ${targetRoot}`);

  const existing = await readManifest(targetRoot);
  if (existing && !opts.force) {
    logger.error(
      `manifest already present at ${targetRoot} (kit ${existing.kitVersion}). ` +
        `use \`keel update\` to upgrade, or \`--force\` to reinstall.`,
    );
    throw new Error('install refused: existing manifest');
  }

  const plan = await planInstall(assetRoot, targetRoot);
  if (opts.dryRun) {
    for (const file of plan) logger.info(`would install ${file.relative}`);
    return;
  }

  const entries: ManifestEntry[] = [];
  const now = new Date().toISOString();

  for (const file of plan) {
    await fs.ensureDir(path.dirname(file.targetAbs));
    const content = await fs.readFile(file.sourceAbs);
    if ((await fs.pathExists(file.targetAbs)) && !opts.force) {
      const current = await fs.readFile(file.targetAbs);
      if (sha256(current) !== sha256(content)) {
        logger.warn(`skipping existing (modified) ${file.relative} — use --force to overwrite`);
        continue;
      }
    }
    await fs.writeFile(file.targetAbs, content);
    if (file.relative.endsWith('.sh') && process.platform !== 'win32') {
      await fs.chmod(file.targetAbs, 0o755);
    }
    const hash = sha256(content);
    entries.push({
      source: path.posix.join(assetKind, file.relative.split(path.sep).join('/')),
      target: file.relative.split(path.sep).join('/'),
      sha256Shipped: hash,
      sha256Current: hash,
      installedAt: now,
    });
  }

  const manifest: Manifest = {
    kitVersion: kitVersion(),
    scope: opts.scope,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
    entries,
  };
  await writeManifest(targetRoot, manifest);
  logger.success(`installed ${entries.length} file(s)`);
}
