/**
 * Tests for the versioned `toolchain` manifest block (roadmap N.0):
 * round-trip through the ManifestStore port, absence semantics for
 * manifests written before the block existed, and loud rejection of
 * malformed blocks.
 */

import { describe, expect, it } from 'vitest';
import { emptyManifestV2, parseManifest } from '../../../src/domain/contract/manifest.js';
import {
  TOOLCHAIN_SCHEMA_VERSION,
  ToolchainBlockSchema,
  type ToolchainBlock,
} from '../../../src/domain/contract/toolchain.js';
import { FakeManifestStore } from '../../../src/infrastructure/manifest/fake.js';

const base = () => emptyManifestV2('2026-08-19T00:00:00Z', '0.6.0-alpha');

const block = (): ToolchainBlock => ({
  schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
  needs: [
    { tool: 'jdk', version: '25', source: 'jdk' },
    { tool: 'gradle', version: '9.4.1', source: 'gradle-wrapper' },
  ],
});

describe('manifest toolchain block', () => {
  it('round-trips a manifest carrying the block through the ManifestStore port', async () => {
    const store = new FakeManifestStore();
    const manifest = { ...base(), toolchain: block() };
    await store.write('/p/.claude', manifest);
    expect(await store.read('/p/.claude')).toEqual(manifest);
  });

  it('a need without a source round-trips too — the registry citation is optional', async () => {
    const store = new FakeManifestStore();
    const manifest = {
      ...base(),
      toolchain: {
        schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
        needs: [{ tool: 'node', version: '22' }],
      } as ToolchainBlock,
    };
    await store.write('/p/.claude', manifest);
    expect(await store.read('/p/.claude')).toEqual(manifest);
  });

  it('round-trips the recorded manager choice, single or combination', async () => {
    const store = new FakeManifestStore();
    const manifest = { ...base(), toolchain: { ...block(), provider: 'nvm+corepack' } };
    await store.write('/p/.claude', manifest);
    expect((await store.read('/p/.claude'))?.toolchain?.provider).toBe('nvm+corepack');
  });

  it('a block written before the manager dial existed parses, with no choice recorded', () => {
    const parsed = parseManifest({ ...base(), toolchain: block() });
    expect(parsed.toolchain?.provider).toBeUndefined();
  });

  it('manifests written before the block parse, and its absence is preserved', () => {
    const parsed = parseManifest(base());
    expect(parsed.toolchain).toBeUndefined();
  });

  it('an absent block is distinct from a written block with no needs', () => {
    const parsed = parseManifest({
      ...base(),
      toolchain: { schemaVersion: TOOLCHAIN_SCHEMA_VERSION, needs: [] },
    });
    expect(parsed.toolchain).toEqual({ schemaVersion: TOOLCHAIN_SCHEMA_VERSION, needs: [] });
  });

  it('rejects a tool outside the closed vocabulary', async () => {
    const store = new FakeManifestStore();
    const manifest = {
      ...base(),
      toolchain: {
        schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
        needs: [{ tool: 'python', version: '3.13' }],
      },
    };
    await expect(async () => store.write('/p/.claude', manifest as never)).rejects.toThrow();
  });

  it('rejects a block written by an unknown schema version rather than half-reading it', () => {
    const raw = { schemaVersion: 2, needs: [] };
    expect(() => ToolchainBlockSchema.parse(raw)).toThrow();
    expect(() => parseManifest({ ...base(), toolchain: raw })).toThrow();
  });

  it('rejects a need with a missing or empty version', () => {
    expect(() =>
      ToolchainBlockSchema.parse({
        schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
        needs: [{ tool: 'jdk' }],
      }),
    ).toThrow();
    expect(() =>
      ToolchainBlockSchema.parse({
        schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
        needs: [{ tool: 'jdk', version: '' }],
      }),
    ).toThrow();
  });
});
