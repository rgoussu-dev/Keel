/**
 * Test for the `rust-bootstrap` adapter — verifies the declarations
 * (vertical, coverage, predicate, sticky question) and the
 * contribution shape: the package shell's files plus the single
 * deferred `cargo check` action. End-to-end placement, answer
 * threading, and template content are covered by the
 * walking-skeleton-rust vertical test.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import {
  rustBootstrapAdapter,
  RUST_BOOTSTRAP_ID,
} from '../../../../src/domain/core/adapters/rust-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';

const contributeWith = (answers: Record<string, string>) => {
  const ctx = makeCtx(rustBootstrapAdapter, answers, {
    manifest: emptyManifestV2('2026-08-09T00:00:00Z', '0.5.0-alpha'),
    logger: new FakeLogger(),
    cwd: '/tmp/dummy',
    templates: ejsTemplateSource,
    processes: new FakeProcessRunner(),
  });
  return rustBootstrapAdapter.contribute(ctx);
};

describe('rust-bootstrap adapter', () => {
  it('declares the right vertical, predicate, coverage, and question', () => {
    expect(rustBootstrapAdapter.id).toBe(RUST_BOOTSTRAP_ID);
    expect(rustBootstrapAdapter.vertical).toBe('walking-skeleton');
    expect(rustBootstrapAdapter.covers).toEqual(['build-tool']);
    expect(rustBootstrapAdapter.predicate).toEqual({ requires: ['lang.rust'] });
    expect(rustBootstrapAdapter.questions?.map((q) => q.id)).toEqual(['projectName']);
    expect(rustBootstrapAdapter.questions?.every((q) => q.memory === 'sticky')).toBe(true);
  });

  it('emits the package shell plus a single deferred cargo check action', async () => {
    const contribution = await contributeWith({ projectName: 'shipper' });
    const paths = (contribution.files ?? []).map((f) => f.path);
    expect(paths).toContain('Cargo.toml');
    expect(paths).toContain('src/lib.rs');
    expect(paths).toContain('src/domain.rs');
    expect(paths).toContain('src/domain/greet.rs');
    expect(paths).toContain('tests/greet.rs');
    expect(contribution.patches ?? []).toEqual([]);
    expect(contribution.actions).toHaveLength(1);
    expect(contribution.actions?.[0]?.id).toBe(RUST_BOOTSTRAP_ID);
    expect(contribution.actions?.[0]?.description).toBe('cargo check');
  });

  it('rejects an invalid projectName with a clear message', async () => {
    await expect(contributeWith({ projectName: 'Has Spaces' })).rejects.toThrow(
      /invalid projectName/,
    );
  });
});
