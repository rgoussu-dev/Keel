/**
 * Test for the `rust-cors` adapter's patch semantics: it wraps the
 * bootstrap-emitted serve call, is idempotent on re-apply, applies
 * even when the marker substring appears incidentally, and fails
 * loudly — rather than appending a dead decorator or silently
 * no-op'ing — when the assembly point has diverged or is only
 * partially decorated.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { RUST_CORS_ID, rustCorsAdapter } from '../../../../src/domain/core/adapters/rust-cors.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import type { ContributionPatch } from '../../../../src/domain/contract/composition.js';

const BOOTSTRAP_MAIN = `//! The http deployment unit.

mod handler;

#[tokio::main]
async fn main() {
    let greeter: handler::SharedGreeter = Arc::new(new_greeter());
    axum::serve(listener, handler::router(greeter))
        .await
        .expect("serve HTTP");
}
`;

const contributePatch = async (): Promise<ContributionPatch> => {
  const ctx = makeCtx(
    rustCorsAdapter,
    {},
    {
      manifest: emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
      logger: new FakeLogger(),
      cwd: '/tmp/dummy',
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    },
  );
  const contribution = await rustCorsAdapter.contribute(ctx);
  const [patch] = contribution.patches ?? [];
  if (!patch) throw new Error('no patch emitted');
  return patch;
};

describe('rust-cors adapter', () => {
  it('declares the right vertical and predicate', () => {
    expect(rustCorsAdapter.id).toBe(RUST_CORS_ID);
    expect(rustCorsAdapter.vertical).toBe('gateway');
    expect(rustCorsAdapter.predicate).toEqual({
      requires: ['lang.rust', 'arch.server-http', 'peer.ui.spa'],
    });
  });

  it('wraps the serve call and appends the decorator', async () => {
    const patch = await contributePatch();
    const patched = patch.apply(BOOTSTRAP_MAIN);
    expect(patched).toContain(
      'handler::router(greeter).layer(axum::middleware::from_fn(with_cors))',
    );
    expect(patched).toContain('async fn with_cors(');
  });

  it('is idempotent when the decorator is already in place', async () => {
    const patch = await contributePatch();
    const once = patch.apply(BOOTSTRAP_MAIN);
    expect(patch.apply(once)).toBe(once);
  });

  it('still applies when the marker substring appears incidentally', async () => {
    const patch = await contributePatch();
    const commented = `// TODO: consider with_cors here\n${BOOTSTRAP_MAIN}`;
    const patched = patch.apply(commented);
    expect(patched).toContain(
      'handler::router(greeter).layer(axum::middleware::from_fn(with_cors))',
    );
  });

  it('fails loudly when the assembly point has diverged', async () => {
    const patch = await contributePatch();
    const diverged = BOOTSTRAP_MAIN.replace('axum::serve', 'my_serve');
    expect(() => patch.apply(diverged)).toThrow(/could not find the serve call/);
  });

  it('fails loudly on a partially decorated assembly point', async () => {
    const patch = await contributePatch();
    const once = patch.apply(BOOTSTRAP_MAIN);

    const fnGone = once.replace(/\n\/\/\/ Allows the sibling SPA[\s\S]*$/, '\n');
    expect(() => patch.apply(fnGone)).toThrow(/partially CORS-decorated/);

    const unwrapped = `${BOOTSTRAP_MAIN}\nasync fn with_cors() {}\n`;
    expect(() => patch.apply(unwrapped)).toThrow(/partially CORS-decorated/);
  });
});
