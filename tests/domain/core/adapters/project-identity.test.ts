/**
 * Where a reader downstream of a bootstrap finds the project's
 * identity: the answers of the bootstrap its tags say it ran
 * (`bootstrapAnswers`), among every shipped bootstrap that asks one
 * (`IDENTITY_BOOTSTRAPS`).
 *
 * The list is the one hand-kept thing here, so it is held to the
 * shipped registry: exactly the adapters declaring a question
 * `shared: 'project'`.
 */

import { describe, expect, it } from 'vitest';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { IDENTITY_BOOTSTRAPS } from '../../../../src/domain/core/adapters/identity-bootstraps.js';
import { bootstrapAnswers } from '../../../../src/domain/core/adapters/project-identity.js';
import { shippedRegistry } from '../../../../src/domain/core/registry.js';

const manifest = (tags: readonly string[], answers: ManifestV2['answers']): ManifestV2 => ({
  ...emptyManifestV2('2026-09-24T00:00:00Z', '0.0.0-test'),
  tags: [...tags],
  answers,
});

describe('IDENTITY_BOOTSTRAPS', () => {
  it('is every shipped adapter asking a question shared with the project', () => {
    const verticals = [
      ...shippedRegistry.verticals(),
      ...shippedRegistry.stacks().flatMap((stack) => stack.verticals),
    ];
    const asking = new Set(
      verticals
        .flatMap((vertical) => vertical.adapters)
        .filter((adapter) =>
          (adapter.questions ?? []).some((question) => question.shared === 'project'),
        )
        .map((adapter) => adapter.id),
    );
    expect(IDENTITY_BOOTSTRAPS.map((bootstrap) => bootstrap.id).sort()).toEqual([...asking].sort());
  });
});

describe('bootstrapAnswers', () => {
  const spring = ['framework.spring', 'arch.server-http', 'lang.java', 'runtime.jvm'];

  it('reads the bootstrap the tags say ran, whatever else the manifest records', () => {
    const recorded = manifest(spring, {
      'walking-skeleton/quarkus-cli-bootstrap': { basePackage: 'org.foreign' },
      'walking-skeleton/spring-rest-bootstrap': { basePackage: 'org.own' },
    });
    expect(bootstrapAnswers(recorded, IDENTITY_BOOTSTRAPS)).toEqual({ basePackage: 'org.own' });
  });

  it('reads nothing where the bootstrap that ran has not answered yet', () => {
    const recorded = manifest(spring, {
      'walking-skeleton/quarkus-cli-bootstrap': { basePackage: 'org.foreign' },
    });
    expect(bootstrapAnswers(recorded, IDENTITY_BOOTSTRAPS)).toBeUndefined();
  });
});
