/**
 * Test for the `ts-cors` adapter's patch semantics: it wraps the
 * bootstrap-emitted listen call at the assembly point, is idempotent
 * on re-apply, and fails loudly — rather than appending a dead
 * decorator — when the assembly point has diverged from the shape it
 * knows how to patch.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { TS_CORS_ID, tsCorsAdapter } from '../../../../src/domain/core/adapters/ts-cors.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import type { ContributionPatch } from '../../../../src/domain/contract/composition.js';

const BOOTSTRAP_MAIN = `import { createGreetHandler, createRegistryMediator } from '@acme/domain-core';
import { createGreetServer } from './server.ts';

const mediator = createRegistryMediator([createGreetHandler()]);
const port = Number(process.env['PORT'] ?? 8080);

createGreetServer(mediator).listen(port, () => {
  console.log(\`listening on http://localhost:\${port} — try /greet?name=World\`);
});
`;

const contributePatch = async (): Promise<ContributionPatch> => {
  const ctx = makeCtx(
    tsCorsAdapter,
    {},
    {
      manifest: emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
      logger: new FakeLogger(),
      cwd: '/tmp/dummy',
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    },
  );
  const contribution = await tsCorsAdapter.contribute(ctx);
  const [patch] = contribution.patches ?? [];
  if (!patch) throw new Error('no patch emitted');
  return patch;
};

describe('ts-cors adapter', () => {
  it('declares the right vertical and predicate', () => {
    expect(tsCorsAdapter.id).toBe(TS_CORS_ID);
    expect(tsCorsAdapter.vertical).toBe('gateway');
    expect(tsCorsAdapter.predicate).toEqual({
      requires: ['lang.typescript', 'runtime.node', 'arch.server-http', 'peer.ui.spa'],
    });
  });

  it('wraps the listen call and appends the decorator with its import', async () => {
    const patch = await contributePatch();
    const patched = patch.apply(BOOTSTRAP_MAIN);
    expect(patched).toContain('withCors(createGreetServer(mediator)).listen(port, () => {');
    expect(patched).toContain('function withCors(server: Server): Server {');
    expect(patched).toContain("import type { Server } from 'node:http';");
    expect(patched).toContain('access-control-allow-origin');
  });

  it('is idempotent when the decorator is already in place', async () => {
    const patch = await contributePatch();
    const once = patch.apply(BOOTSTRAP_MAIN);
    expect(patch.apply(once)).toBe(once);
  });

  it('fails loudly when the assembly point has diverged', async () => {
    const patch = await contributePatch();
    const diverged = BOOTSTRAP_MAIN.replace('.listen(port', '.listen(portNumber');
    expect(() => patch.apply(diverged)).toThrow(/could not find the listen call/);
  });

  it('fails loudly on a partially decorated assembly point', async () => {
    const patch = await contributePatch();
    const once = patch.apply(BOOTSTRAP_MAIN);

    const fnGone = once.replace(/\n\/\*\*\n \* Allows the sibling SPA[\s\S]*$/, '\n');
    expect(() => patch.apply(fnGone)).toThrow(/partially CORS-decorated/);

    const unwrapped = `${BOOTSTRAP_MAIN}\nfunction withCors(server: Server): Server {\n  return server;\n}\n`;
    expect(() => patch.apply(unwrapped)).toThrow(/partially CORS-decorated/);
  });
});
