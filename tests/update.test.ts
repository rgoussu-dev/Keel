import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { sha256 } from '../src/util/hash.js';
import { update } from '../src/installer/update.js';
import { paths } from '../src/util/paths.js';
import type { Manifest } from '../src/manifest/schema.js';

/**
 * update() resolves asset paths via `paths.asset('project')`, which is
 * package-root relative. We override the resolver to point at a
 * test-controlled fake asset directory so each case stages its own
 * scenario without touching the real shipped assets.
 */
function withFakeAsset(dir: string): () => void {
  const spy = vi.spyOn(paths, 'asset').mockImplementation(() => dir);
  return () => spy.mockRestore();
}

function writeManifestFile(root: string, m: Manifest): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, '.keel-manifest.json'), JSON.stringify(m, null, 2));
}

describe('update()', () => {
  let tmpRoot: string;
  let assetDir: string;
  let projectCwd: string;
  let targetRoot: string;
  let restore: () => void;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'keel-upd-'));
    assetDir = path.join(tmpRoot, 'asset');
    projectCwd = path.join(tmpRoot, 'project');
    targetRoot = path.join(projectCwd, '.claude');
    mkdirSync(assetDir, { recursive: true });
    mkdirSync(targetRoot, { recursive: true });
    restore = withFakeAsset(assetDir);
  });

  afterEach(() => {
    restore();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeAsset(rel: string, content: string): string {
    const abs = path.join(assetDir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return abs;
  }

  function writeTarget(rel: string, content: string): string {
    const abs = path.join(targetRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return abs;
  }

  // 1. unchanged user file is overwritten with the new shipped content.
  it('overwrites an unchanged user file with the new shipped content', async () => {
    const oldContent = 'old\n';
    const newContent = 'new\n';
    writeAsset('a.txt', newContent);
    writeTarget('a.txt', oldContent);
    writeManifestFile(targetRoot, {
      kitVersion: '0.0.0',
      installedAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      entries: [
        {
          source: 'project/a.txt',
          target: 'a.txt',
          sha256Shipped: sha256(oldContent),
          sha256Current: sha256(oldContent),
          installedAt: '2000-01-01T00:00:00.000Z',
        },
      ],
    });

    await update({ cwd: projectCwd, dryRun: false, nonInteractive: true });

    expect(readFileSync(path.join(targetRoot, 'a.txt'), 'utf8')).toBe(newContent);
  });

  // 2. user-modified file is preserved in --yes mode.
  it('keeps user-modified file in non-interactive mode', async () => {
    const oldShipped = 'ship-v1\n';
    const newShipped = 'ship-v2\n';
    const userEdited = 'user-edit\n';
    writeAsset('b.txt', newShipped);
    writeTarget('b.txt', userEdited);
    writeManifestFile(targetRoot, {
      kitVersion: '0.0.0',
      installedAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      entries: [
        {
          source: 'project/b.txt',
          target: 'b.txt',
          sha256Shipped: sha256(oldShipped),
          sha256Current: sha256(oldShipped),
          installedAt: '2000-01-01T00:00:00.000Z',
        },
      ],
    });

    await update({ cwd: projectCwd, dryRun: false, nonInteractive: true });

    expect(readFileSync(path.join(targetRoot, 'b.txt'), 'utf8')).toBe(userEdited);

    const m = JSON.parse(
      readFileSync(path.join(targetRoot, '.keel-manifest.json'), 'utf8'),
    ) as Manifest;
    const entry = m.entries.find((e) => e.target === 'b.txt')!;
    expect(entry.sha256Shipped).toBe(sha256(newShipped));
    expect(entry.sha256Current).toBe(sha256(userEdited));
  });

  // 3. pre-existing file with no prior manifest entry is NOT silently overwritten.
  it('treats a pre-existing file without prior manifest entry as a conflict', async () => {
    const newShipped = 'fresh\n';
    const preExisting = 'user-was-here\n';
    writeAsset('c.txt', newShipped);
    writeTarget('c.txt', preExisting);
    writeManifestFile(targetRoot, {
      kitVersion: '0.0.0',
      installedAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      entries: [], // no prior entry for c.txt
    });

    await update({ cwd: projectCwd, dryRun: false, nonInteractive: true });

    // Non-interactive defaults to 'keep' → user content preserved.
    expect(readFileSync(path.join(targetRoot, 'c.txt'), 'utf8')).toBe(preExisting);
  });

  // 4. orphan tracked file: unmodified orphan is deleted, modified orphan is kept & untracked.
  it('removes unmodified orphans and keeps user-modified orphans untracked', async () => {
    const orphanUnmodified = 'orphan-clean\n';
    const orphanModified = 'orphan-modified-by-user\n';
    const originalShipped = 'orphan-shipped-v1\n';
    writeTarget('orphan-clean.txt', orphanUnmodified);
    writeTarget('orphan-mod.txt', orphanModified);
    writeManifestFile(targetRoot, {
      kitVersion: '0.0.0',
      installedAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      entries: [
        {
          source: 'project/orphan-clean.txt',
          target: 'orphan-clean.txt',
          sha256Shipped: sha256(orphanUnmodified),
          sha256Current: sha256(orphanUnmodified),
          installedAt: '2000-01-01T00:00:00.000Z',
        },
        {
          source: 'project/orphan-mod.txt',
          target: 'orphan-mod.txt',
          sha256Shipped: sha256(originalShipped),
          sha256Current: sha256(originalShipped),
          installedAt: '2000-01-01T00:00:00.000Z',
        },
      ],
    });
    // Asset dir has NO files → everything is an orphan.

    await update({ cwd: projectCwd, dryRun: false, nonInteractive: true });

    expect(existsSync(path.join(targetRoot, 'orphan-clean.txt'))).toBe(false);
    expect(existsSync(path.join(targetRoot, 'orphan-mod.txt'))).toBe(true);
    const m = JSON.parse(
      readFileSync(path.join(targetRoot, '.keel-manifest.json'), 'utf8'),
    ) as Manifest;
    expect(m.entries.map((e) => e.target)).not.toContain('orphan-clean.txt');
    expect(m.entries.map((e) => e.target)).not.toContain('orphan-mod.txt');
  });

  // 5. .sh exec bit is restored after a silent (non-modified) upgrade.
  it('restores exec bit on .sh files after a clean upgrade', async () => {
    if (process.platform === 'win32') return;
    const oldContent = '#!/bin/sh\necho old\n';
    const newContent = '#!/bin/sh\necho new\n';
    writeAsset('hook.sh', newContent);
    const targetAbs = writeTarget('hook.sh', oldContent);
    chmodSync(targetAbs, 0o644); // simulate loss of +x
    writeManifestFile(targetRoot, {
      kitVersion: '0.0.0',
      installedAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      entries: [
        {
          source: 'project/hook.sh',
          target: 'hook.sh',
          sha256Shipped: sha256(oldContent),
          sha256Current: sha256(oldContent),
          installedAt: '2000-01-01T00:00:00.000Z',
        },
      ],
    });

    await update({ cwd: projectCwd, dryRun: false, nonInteractive: true });

    const mode = statSync(targetAbs).mode & 0o777;
    expect(mode & 0o100).toBe(0o100); // owner exec set
  });

  it('refuses to update without an existing manifest', async () => {
    rmSync(path.join(targetRoot, '.keel-manifest.json'), { force: true });
    await expect(update({ cwd: projectCwd, dryRun: false, nonInteractive: true })).rejects.toThrow(
      /no manifest/,
    );
  });
});
