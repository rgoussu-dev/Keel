/**
 * Tests for the peer-composition manifest fields: schema defaults for
 * pre-peer manifests on disk, and the effective tag set adapter
 * resolution runs against.
 */

import { describe, expect, it } from 'vitest';
import {
  effectiveTags,
  emptyManifestV2,
  ManifestV2Schema,
  parseManifest,
} from '../../../src/domain/contract/manifest.js';

const base = () => emptyManifestV2('2026-08-09T00:00:00Z', '0.6.0-alpha');

describe('manifest peers', () => {
  it('parses a pre-peer v2 manifest, defaulting the composition fields', () => {
    const legacy = {
      version: 2,
      keelVersion: '0.5.0-alpha',
      installedAt: '2026-08-09T00:00:00Z',
      updatedAt: '2026-08-09T00:00:00Z',
      tags: [],
      verticals: [],
      versions: {},
      answers: {},
      entries: [],
    };
    const parsed = ManifestV2Schema.parse(legacy);
    expect(parsed.projects).toEqual([]);
    expect(parsed.peers).toEqual([]);
    expect(parsed.services).toEqual([]);
  });

  it('round-trips projects, peers, and services through parseManifest', () => {
    const manifest = {
      ...base(),
      projects: ['peer.ui.spa'],
      peers: [{ ref: '../backend', tags: ['peer.api.rest'] }],
      services: [{ path: 'backend', stack: 'quarkus-rest' }],
    };
    expect(parseManifest(manifest)).toEqual(manifest);
  });

  it('effectiveTags is the union of own tags and every peer projection, sorted', () => {
    const manifest = {
      ...base(),
      tags: ['framework.web-components', 'arch.spa'],
      peers: [
        { ref: '../backend', tags: ['peer.api.rest'] },
        { ref: '../worker', tags: ['peer.api.rest', 'peer.queue.amqp'] },
      ],
    };
    expect(effectiveTags(manifest)).toEqual([
      'arch.spa',
      'framework.web-components',
      'peer.api.rest',
      'peer.queue.amqp',
    ]);
  });

  it('effectiveTags never folds peer tags into the manifest tags themselves', () => {
    const manifest = { ...base(), tags: ['a'], peers: [{ ref: '../b', tags: ['peer.x'] }] };
    effectiveTags(manifest);
    expect(manifest.tags).toEqual(['a']);
  });
});
