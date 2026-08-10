/**
 * Test for the `go-cors` adapter's patch semantics: it wraps the
 * bootstrap-emitted serve call, is idempotent on re-apply, and fails
 * loudly — rather than appending a dead decorator — when the
 * assembly point has diverged from the shape it knows how to patch.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { GO_CORS_ID, goCorsAdapter } from '../../../../src/domain/core/adapters/go-cors.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import type { ContributionPatch } from '../../../../src/domain/contract/composition.js';

const BOOTSTRAP_MAIN = `package main

func main() {
	greeter := domain.NewGreeter()
	log.Fatal(http.Serve(listener, resthttp.NewHandler(greeter)))
}
`;

const contributePatch = async (): Promise<ContributionPatch> => {
  const ctx = makeCtx(
    goCorsAdapter,
    {},
    {
      manifest: emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
      logger: new FakeLogger(),
      cwd: '/tmp/dummy',
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    },
  );
  const contribution = await goCorsAdapter.contribute(ctx);
  const [patch] = contribution.patches ?? [];
  if (!patch) throw new Error('no patch emitted');
  return patch;
};

describe('go-cors adapter', () => {
  it('declares the right vertical and predicate', () => {
    expect(goCorsAdapter.id).toBe(GO_CORS_ID);
    expect(goCorsAdapter.vertical).toBe('gateway');
    expect(goCorsAdapter.predicate).toEqual({
      requires: ['lang.go', 'arch.server-http', 'peer.ui.spa'],
    });
  });

  it('wraps the serve call and appends the decorator', async () => {
    const patch = await contributePatch();
    const patched = patch.apply(BOOTSTRAP_MAIN);
    expect(patched).toContain('withCORS(resthttp.NewHandler(greeter))');
    expect(patched).toContain('func withCORS(next http.Handler) http.Handler {');
  });

  it('gates the decoration to dev and answers preflights completely', async () => {
    const patch = await contributePatch();
    const patched = patch.apply(BOOTSTRAP_MAIN);
    expect(patched).toContain('if os.Getenv("GO_ENV") != "dev" {');
    expect(patched).toContain('w.Header().Set("Access-Control-Allow-Methods", http.MethodGet)');
    expect(patched).toContain('r.Header.Get("Access-Control-Request-Headers")');
  });

  it('is idempotent when the decorator is already in place', async () => {
    const patch = await contributePatch();
    const once = patch.apply(BOOTSTRAP_MAIN);
    expect(patch.apply(once)).toBe(once);
  });

  it('still applies when the marker substring appears incidentally', async () => {
    const patch = await contributePatch();
    const commented = `// TODO: consider withCORS here\n${BOOTSTRAP_MAIN}`;
    const patched = patch.apply(commented);
    expect(patched).toContain('withCORS(resthttp.NewHandler(greeter))');
    expect(patched).toContain('func withCORS(next http.Handler) http.Handler {');
  });

  it('fails loudly when the assembly point has diverged', async () => {
    const patch = await contributePatch();
    const diverged = BOOTSTRAP_MAIN.replace('http.Serve', 'myServe');
    expect(() => patch.apply(diverged)).toThrow(/could not find the serve call/);
  });

  it('fails loudly on a partially decorated assembly point', async () => {
    const patch = await contributePatch();
    const once = patch.apply(BOOTSTRAP_MAIN);

    const funcGone = once.replace(/\n\/\/ withCORS allows[\s\S]*$/, '\n');
    expect(() => patch.apply(funcGone)).toThrow(/partially CORS-decorated/);

    const unwrapped = `${BOOTSTRAP_MAIN}\nfunc withCORS(next http.Handler) http.Handler {\n\treturn next\n}\n`;
    expect(() => patch.apply(unwrapped)).toThrow(/partially CORS-decorated/);
  });
});
