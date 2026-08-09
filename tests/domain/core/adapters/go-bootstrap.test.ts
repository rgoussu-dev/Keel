/**
 * Test for the `go-bootstrap` adapter — verifies the declarations
 * (vertical, coverage, predicate, sticky questions) and the
 * contribution shape: the module shell's files plus the single
 * deferred `go mod tidy` action. End-to-end placement, answer
 * threading, and template content are covered by the
 * walking-skeleton-go vertical test.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import {
  goBootstrapAdapter,
  GO_BOOTSTRAP_ID,
} from '../../../../src/domain/core/adapters/go-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';

const contributeWith = (answers: Record<string, string>) => {
  const ctx = makeCtx(goBootstrapAdapter, answers, {
    manifest: emptyManifestV2('2026-04-26T00:00:00Z', '0.5.0-alpha'),
    logger: new FakeLogger(),
    cwd: '/tmp/dummy',
    templates: ejsTemplateSource,
    processes: new FakeProcessRunner(),
  });
  return goBootstrapAdapter.contribute(ctx);
};

describe('go-bootstrap adapter', () => {
  it('declares the right vertical, predicate, coverage, and questions', () => {
    expect(goBootstrapAdapter.id).toBe(GO_BOOTSTRAP_ID);
    expect(goBootstrapAdapter.vertical).toBe('walking-skeleton');
    expect(goBootstrapAdapter.covers).toEqual(['build-tool']);
    expect(goBootstrapAdapter.predicate).toEqual({ requires: ['lang.go'] });
    expect(goBootstrapAdapter.questions?.map((q) => q.id)).toEqual(['modulePath', 'projectName']);
    expect(goBootstrapAdapter.questions?.every((q) => q.memory === 'sticky')).toBe(true);
  });

  it('emits the module shell plus a single deferred go mod tidy action', async () => {
    const contribution = await contributeWith({
      modulePath: 'github.com/acme/shipper',
      projectName: 'shipper',
    });
    const paths = (contribution.files ?? []).map((f) => f.path);
    expect(paths).toContain('go.mod');
    expect(paths).toContain('internal/domain/greet.go');
    expect(paths).toContain('internal/domain/internal/greet/greet.go');
    expect(contribution.patches ?? []).toEqual([]);
    expect(contribution.actions).toHaveLength(1);
    expect(contribution.actions?.[0]?.id).toBe(GO_BOOTSTRAP_ID);
    expect(contribution.actions?.[0]?.description).toBe('go mod tidy');
  });

  it('rejects an invalid modulePath with a clear message', async () => {
    await expect(
      contributeWith({ modulePath: 'not a module path', projectName: 'shipper' }),
    ).rejects.toThrow(/invalid modulePath/);
  });

  it('rejects an invalid projectName with a clear message', async () => {
    await expect(
      contributeWith({ modulePath: 'github.com/acme/shipper', projectName: 'Has Spaces' }),
    ).rejects.toThrow(/invalid projectName/);
  });
});
