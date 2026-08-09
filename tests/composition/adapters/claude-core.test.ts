/**
 * Test for the `claude-core` adapter — verifies the contribution
 * shape (one whole-file write at `.claude/CLAUDE.md`, no patches or
 * actions) and that the emitted content matches the canonical
 * binding spec on disk byte-for-byte. End-to-end placement under a
 * vertical is covered by the walking-skeleton smoke test.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import {
  claudeCoreAdapter,
  CLAUDE_CORE_ID,
} from '../../../src/domain/core/adapters/claude-core.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../src/domain/core/apply.js';
import {
  packagedAssetsRoot,
  ejsTemplateSource,
} from '../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';

const silent = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('claude-core adapter', () => {
  it('declares the right vertical, predicate, and coverage', () => {
    expect(claudeCoreAdapter.id).toBe(CLAUDE_CORE_ID);
    expect(claudeCoreAdapter.vertical).toBe('walking-skeleton');
    expect(claudeCoreAdapter.covers).toEqual(['agentic-baseline']);
    expect(claudeCoreAdapter.predicate).toEqual({});
    expect(claudeCoreAdapter.questions ?? []).toEqual([]);
  });

  it('emits the binding spec verbatim into .claude/CLAUDE.md', async () => {
    const ctx = makeCtx(
      claudeCoreAdapter,
      {},
      {
        manifest: emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
        logger: silent,
        cwd: '/tmp/dummy',
        templates: ejsTemplateSource,
        processes: new FakeProcessRunner(),
      },
    );
    const contribution = await claudeCoreAdapter.contribute(ctx);
    expect(contribution.patches ?? []).toEqual([]);
    expect(contribution.actions ?? []).toEqual([]);
    expect(contribution.files).toHaveLength(1);
    const [file] = contribution.files ?? [];
    expect(file?.path).toBe('.claude/CLAUDE.md');

    const expected = await fs.readFile(
      path.join(path.join(packagedAssetsRoot, 'project'), 'CLAUDE.md'),
      'utf8',
    );
    expect(file?.content).toBe(expected);
  });
});
