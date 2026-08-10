/**
 * Test for the `maven-wrapper` adapter — verifies the contribution
 * shape (a single deferred action, no file writes), the action's
 * description, and the ProcessRunner interaction including the
 * friendly ENOENT message. End-to-end execution against a real `mvn`
 * binary is left to the walking-skeleton e2e tests.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import {
  mavenWrapperAdapter,
  MAVEN_WRAPPER_ID,
} from '../../../../src/domain/core/adapters/maven-wrapper.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-cli-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-rest-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import type { DeferredAction } from '../../../../src/domain/contract/composition.js';

const contributeAction = async (): Promise<DeferredAction> => {
  const ctx = makeCtx(
    mavenWrapperAdapter,
    {},
    {
      manifest: emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
      logger: new FakeLogger(),
      cwd: '/tmp/dummy',
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    },
  );
  const contribution = await mavenWrapperAdapter.contribute(ctx);
  expect(contribution.files ?? []).toEqual([]);
  expect(contribution.patches ?? []).toEqual([]);
  expect(contribution.actions).toHaveLength(1);
  const [action] = contribution.actions ?? [];
  if (!action) throw new Error('no action emitted');
  return action;
};

describe('maven-wrapper adapter', () => {
  it('declares the right vertical, predicate, and ordering', () => {
    expect(mavenWrapperAdapter.id).toBe(MAVEN_WRAPPER_ID);
    expect(mavenWrapperAdapter.vertical).toBe('walking-skeleton');
    expect(mavenWrapperAdapter.covers).toEqual(['build-tool']);
    expect(mavenWrapperAdapter.predicate).toEqual({ requires: ['pkg.maven'] });
    expect(mavenWrapperAdapter.after).toContain(QUARKUS_CLI_BOOTSTRAP_ID);
    expect(mavenWrapperAdapter.after).toContain(QUARKUS_REST_BOOTSTRAP_ID);
    expect(mavenWrapperAdapter.after?.every((id) => id.endsWith('-bootstrap'))).toBe(true);
    expect(mavenWrapperAdapter.questions ?? []).toEqual([]);
  });

  it('runs mvn wrapper:wrapper through the ProcessRunner port', async () => {
    const action = await contributeAction();
    expect(action.id).toBe(MAVEN_WRAPPER_ID);
    expect(action.description).toMatch(/^mvn -N wrapper:wrapper -Dmaven=\d+\.\d+/);
    const processes = new FakeProcessRunner();
    await action.run({ cwd: '/tmp/project', logger: new FakeLogger(), processes });
    expect(processes.ran('mvn')).toHaveLength(1);
    const args = processes.ran('mvn')[0]?.args ?? [];
    expect(args[0]).toBe('-N');
    expect(args[1]).toBe('wrapper:wrapper');
    expect(args[2]).toMatch(/^-Dmaven=\d+\.\d+/);
  });

  it('fails with a friendly message when mvn is not on PATH', async () => {
    const action = await contributeAction();
    const processes = new FakeProcessRunner([
      {
        command: 'mvn',
        result: {
          status: null,
          startFailure: { code: 'ENOENT', message: 'spawn mvn ENOENT' },
        },
      },
    ]);
    expect(() => action.run({ cwd: '/tmp/project', logger: new FakeLogger(), processes })).toThrow(
      /'mvn' is not on PATH/,
    );
  });
});
