import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emptyManifestV2,
  MANIFEST_FILENAME,
  migrateV1,
  parseManifest,
} from '../../../src/domain/contract/manifest.js';
import { fsManifestStore } from '../../../src/infrastructure/manifest/fs-manifest-store.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-manifest-v2-'));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe('manifest v2', () => {
  it('returns null when the manifest file is absent', async () => {
    expect(await fsManifestStore.read(tmp)).toBeNull();
  });

  it('round-trips a v2 manifest', async () => {
    const m = emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha');
    const withState = {
      ...m,
      tags: ['lang.java', 'framework.quarkus'],
      verticals: [{ id: 'distribution', installedAt: '2026-04-26T00:00:00Z' }],
      versions: { java: '21', quarkus: '3.16.0' },
      answers: { 'distribution/quarkus-cli-native': { targets: 'linux-amd64' } },
    };
    await fsManifestStore.write(tmp, withState);
    const read = await fsManifestStore.read(tmp);
    expect(read).toEqual(withState);
  });

  it('migrates a v1 manifest in memory on read', async () => {
    const v1 = {
      kitVersion: '0.3.0-alpha',
      installedAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      entries: [
        {
          source: 'a',
          target: 'b',
          sha256Shipped: 'x',
          sha256Current: 'x',
          installedAt: '2026-04-01T00:00:00Z',
        },
      ],
    };
    await fs.writeJson(path.join(tmp, MANIFEST_FILENAME), v1);
    const read = await fsManifestStore.read(tmp);
    expect(read).not.toBeNull();
    expect(read!.version).toBe(2);
    expect(read!.keelVersion).toBe('0.3.0-alpha');
    expect(read!.tags).toEqual([]);
    expect(read!.verticals).toEqual([]);
    expect(read!.entries).toEqual(v1.entries);
  });

  it('migration is in memory only — file stays v1 until written', async () => {
    const v1 = {
      kitVersion: '0.3.0-alpha',
      installedAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      entries: [],
    };
    await fs.writeJson(path.join(tmp, MANIFEST_FILENAME), v1);
    await fsManifestStore.read(tmp);
    const onDisk = await fs.readJson(path.join(tmp, MANIFEST_FILENAME));
    expect(onDisk).toEqual(v1);
    expect(onDisk.version).toBeUndefined();
  });

  it('parseManifest accepts v2 directly', () => {
    const m = emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha');
    expect(parseManifest(m)).toEqual(m);
  });

  it('migrateV1 preserves entries verbatim', () => {
    const v1 = {
      kitVersion: '0.3.0',
      installedAt: 'a',
      updatedAt: 'b',
      entries: [
        { source: 's', target: 't', sha256Shipped: 'h1', sha256Current: 'h2', installedAt: 'i' },
      ],
    };
    const v2 = migrateV1(v1);
    expect(v2.entries).toEqual(v1.entries);
  });
});
