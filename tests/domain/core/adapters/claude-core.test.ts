/**
 * Test for the `claude-core` adapter — verifies the contribution
 * shape (the three loading shims as whole files, the root `AGENTS.md`
 * as a seeded upsert the project then owns, no actions), that the
 * seeded spec matches the canonical binding spec on disk
 * byte-for-byte, and that each shim parses in its own format — which
 * is all a test can honestly assert for a file another tool reads.
 * End-to-end placement under a vertical is covered by the
 * walking-skeleton smoke test.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import {
  AIDER_CONF_TARGET,
  claudeCoreAdapter,
  CLAUDE_CORE_ID,
  GEMINI_SETTINGS_TARGET,
} from '../../../../src/domain/core/adapters/claude-core.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import {
  packagedAssetsRoot,
  ejsTemplateSource,
} from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';

describe('claude-core adapter', () => {
  it('declares the right vertical, predicate, and coverage', () => {
    expect(claudeCoreAdapter.id).toBe(CLAUDE_CORE_ID);
    expect(claudeCoreAdapter.vertical).toBe('agent-harness');
    expect(claudeCoreAdapter.covers).toEqual(['agentic-baseline']);
    expect(claudeCoreAdapter.predicate).toEqual({});
    expect(claudeCoreAdapter.questions ?? []).toEqual([]);
  });

  it('emits the binding spec as AGENTS.md plus the loading shims', async () => {
    const ctx = makeCtx(
      claudeCoreAdapter,
      {},
      {
        manifest: emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
        logger: new FakeLogger(),
        cwd: '/tmp/dummy',
        templates: ejsTemplateSource,
        processes: new FakeProcessRunner(),
      },
    );
    const contribution = await claudeCoreAdapter.contribute(ctx);
    expect(contribution.actions ?? []).toEqual([]);
    expect(contribution.files).toHaveLength(3);
    const [pointer, gemini, aider] = contribution.files ?? [];

    // The spec seeds AGENTS.md and never rewrites one that exists:
    // keel owns the sentinel regions, the project owns the document.
    expect(contribution.patches).toHaveLength(1);
    const spec = contribution.patches?.[0];
    expect(spec?.target).toBe('AGENTS.md');
    const expected = await fs.readFile(
      path.join(path.join(packagedAssetsRoot, 'project'), 'AGENTS.md'),
      'utf8',
    );
    expect(spec?.seed).toBe(expected);
    expect(spec?.apply('# the project’s own\n')).toBe('# the project’s own\n');

    expect(pointer?.path).toBe('CLAUDE.md');
    expect(pointer?.content).toBe('@AGENTS.md\n');

    // Gemini CLI reads `context.fileName`; AGENTS.md must come first.
    expect(gemini?.path).toBe(GEMINI_SETTINGS_TARGET);
    const settings = JSON.parse(String(gemini?.content ?? '')) as {
      context: { fileName: string[] };
    };
    expect(settings.context.fileName[0]).toBe('AGENTS.md');

    // aider loads `read:` entries read-only on start.
    expect(aider?.path).toBe(AIDER_CONF_TARGET);
    const conf = parseYaml(String(aider?.content ?? '')) as { read: string[] };
    expect(conf.read).toEqual(['AGENTS.md']);
  });

  it("ships a spec under the redesign budget, with its slots and no other tool's import syntax", async () => {
    const spec = await fs.readFile(path.join(packagedAssetsRoot, 'project', 'AGENTS.md'), 'utf8');
    const lines = spec.split('\n');
    // Leaves room for the family's stack section inside the 120-line root.
    expect(lines.length).toBeLessThanOrEqual(75);
    for (const slot of ['stack-runbook', 'map', 'skills-index']) {
      expect(spec).toContain(`<!-- keel:${slot}:begin -->\n<!-- keel:${slot}:end -->`);
    }
    // The universal body carries no `@`-import: only CLAUDE.md speaks that.
    expect(lines.some((l) => /^@/.test(l))).toBe(false);
    expect(spec).toContain('augmented-coding-patterns');
  });
});
