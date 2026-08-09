/**
 * Test for the `gradle-wrapper` adapter — verifies the contribution
 * shape (a single deferred action, no file writes) and the action's
 * description. End-to-end execution against a real `gradle` binary is
 * exercised by the walking-skeleton vertical smoke test rather than
 * here, since spawning Gradle is slow and would couple the unit test
 * to a system tool.
 */

import { describe, expect, it } from 'vitest';
import {
  gradleWrapperAdapter,
  GRADLE_WRAPPER_ID,
} from '../../../src/composition/adapters/gradle-wrapper.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from '../../../src/composition/adapters/quarkus-cli-bootstrap.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { makeCtx } from '../../../src/composition/apply.js';

const silent = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('gradle-wrapper adapter', () => {
  it('declares the right vertical, predicate, and ordering', () => {
    expect(gradleWrapperAdapter.id).toBe(GRADLE_WRAPPER_ID);
    expect(gradleWrapperAdapter.vertical).toBe('walking-skeleton');
    expect(gradleWrapperAdapter.covers).toEqual(['build-tool']);
    expect(gradleWrapperAdapter.predicate).toEqual({ requires: ['pkg.gradle'] });
    expect(gradleWrapperAdapter.after).toEqual([QUARKUS_CLI_BOOTSTRAP_ID]);
    expect(gradleWrapperAdapter.questions ?? []).toEqual([]);
  });

  it('emits a single action and no files', async () => {
    const ctx = makeCtx(
      gradleWrapperAdapter,
      {},
      {
        manifest: emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
        logger: silent,
        cwd: '/tmp/dummy',
      },
    );
    const contribution = await gradleWrapperAdapter.contribute(ctx);
    expect(contribution.files ?? []).toEqual([]);
    expect(contribution.patches ?? []).toEqual([]);
    expect(contribution.actions).toHaveLength(1);
    const [action] = contribution.actions ?? [];
    expect(action?.id).toBe(GRADLE_WRAPPER_ID);
    expect(action?.description).toMatch(/^gradle wrapper --gradle-version=\d+\.\d+/);
  });
});
