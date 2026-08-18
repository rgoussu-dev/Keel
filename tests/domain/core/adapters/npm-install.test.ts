/**
 * Test for the `npm-install` adapter — verifies the contribution
 * shape (a single deferred action, no file writes) and the action's
 * behaviour against the ProcessRunner fake. End-to-end execution
 * against a real `npm` binary is exercised by the web-components
 * walking-skeleton e2e test rather than here.
 */

import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import {
  npmInstallAdapter,
  NPM_INSTALL_ID,
} from '../../../../src/domain/core/adapters/npm-install.js';
import {
  TS_CLI_BOOTSTRAP_ID,
  TS_HTTP_BOOTSTRAP_ID,
} from '../../../../src/domain/core/adapters/ts-bootstrap.js';
import { WC_SPA_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/wc-spa-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import type { DeferredAction } from '../../../../src/domain/contract/composition.js';

const contributeAction = async (): Promise<DeferredAction> => {
  const ctx = makeCtx(
    npmInstallAdapter,
    {},
    {
      manifest: emptyManifestV2('2026-08-09T00:00:00Z', '0.5.0-alpha'),
      logger: new FakeLogger(),
      cwd: '/tmp/dummy',
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    },
  );
  const contribution = await npmInstallAdapter.contribute(ctx);
  expect(contribution.files ?? []).toEqual([]);
  expect(contribution.patches ?? []).toEqual([]);
  expect(contribution.actions).toHaveLength(1);
  const [action] = contribution.actions ?? [];
  if (!action) throw new Error('no action emitted');
  return action;
};

describe('npm-install adapter', () => {
  it('declares the right vertical, predicate, and ordering', () => {
    expect(npmInstallAdapter.id).toBe(NPM_INSTALL_ID);
    expect(npmInstallAdapter.vertical).toBe('walking-skeleton');
    expect(npmInstallAdapter.covers).toEqual(['build-tool']);
    expect(npmInstallAdapter.predicate).toEqual({ requires: ['pkg.npm'] });
    expect(npmInstallAdapter.after).toEqual([
      WC_SPA_BOOTSTRAP_ID,
      TS_HTTP_BOOTSTRAP_ID,
      TS_CLI_BOOTSTRAP_ID,
    ]);
    expect(npmInstallAdapter.questions ?? []).toEqual([]);
  });

  it('emits a single npm install action and no files', async () => {
    const action = await contributeAction();
    expect(action.id).toBe(NPM_INSTALL_ID);
    expect(action.description).toBe('npm install --no-fund --no-audit');
  });

  it('runs npm install through the ProcessRunner port', async () => {
    const action = await contributeAction();
    const processes = new FakeProcessRunner();
    await action.run({ cwd: '/tmp/project', logger: new FakeLogger(), processes });
    expect(processes.ran('npm')).toHaveLength(1);
    expect(processes.ran('npm')[0]?.args).toEqual(['install', '--no-fund', '--no-audit']);
  });

  it('fails with a friendly message when npm is not on PATH', async () => {
    const action = await contributeAction();
    const processes = new FakeProcessRunner([
      {
        command: 'npm',
        result: {
          status: null,
          startFailure: { code: 'ENOENT', message: 'spawn npm ENOENT' },
        },
      },
    ]);
    expect(() => action.run({ cwd: '/tmp/project', logger: new FakeLogger(), processes })).toThrow(
      /'npm' is not on PATH/,
    );
  });

  it('surfaces npm output when the install fails', async () => {
    const action = await contributeAction();
    const processes = new FakeProcessRunner([
      { command: 'npm', result: { status: 1, stderr: 'ERESOLVE unable to resolve' } },
    ]);
    expect(() => action.run({ cwd: '/tmp/project', logger: new FakeLogger(), processes })).toThrow(
      /ERESOLVE unable to resolve/,
    );
  });
});
