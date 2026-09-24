/**
 * Where a supplied answer may land — the rule both install handlers
 * hold `--set` and an install body's `answers` to, once they know the
 * plan. Scenario adapters are plain data; the one registry-backed case
 * reads the shipped registry, the port's real source.
 */

import { describe, expect, it } from 'vitest';
import type { Adapter, Question, Vertical } from '../../../src/domain/contract/composition.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import {
  FROZEN_ANSWER_CODE,
  installedOwnerOf,
  NOTHING_INSTALLED,
  strayAnswerRefusal,
  UNKNOWN_ANSWER_CODE,
} from '../../../src/domain/core/supplied-answers.js';

const question = (id: string): Question => ({
  id,
  prompt: id,
  doc: '',
  default: '',
  memory: 'sticky',
});

const adapter = (
  id: string,
  questions: readonly string[],
  sharesAnswersWith: readonly string[] = [],
): Adapter => ({
  id,
  vertical: id.split('/')[0] ?? id,
  covers: [],
  predicate: {},
  questions: questions.map(question),
  ...(sharesAnswersWith.length > 0 ? { sharesAnswersWith } : {}),
  contribute: () => ({}),
});

const vertical = (id: string, title: string, adapters: readonly Adapter[]): Vertical => ({
  id,
  title,
  description: '',
  dimensions: [],
  adapters,
});

const gitInit = adapter('vcs/git-init', ['remote', 'defaultBranch']);
const cliBootstrap = adapter(
  'walking-skeleton/acme-cli-bootstrap',
  ['basePackage', 'projectName'],
  ['walking-skeleton/acme-rest-bootstrap'],
);
const pipeline = adapter('ci/acme-pipeline', ['provider'], ['distribution/acme-container']);
const portFake = adapter('walking-skeleton/sample-port-fake', []);

const plan: readonly Adapter[] = [gitInit, cliBootstrap, portFake];

const versionControl = vertical('vcs', 'Version control', [gitInit]);
const distribution = vertical('distribution', 'Distribution', [
  adapter('distribution/acme-container', ['provider', 'deploy'], ['ci/acme-pipeline']),
]);
const owning =
  (...installed: readonly Vertical[]) =>
  (adapterId: string): Vertical | null =>
    installed.find((v) => v.adapters.some((a) => a.id === adapterId)) ?? null;

describe('strayAnswerRefusal', () => {
  it('lets through an answer keyed to an adapter of the plan', () => {
    expect(
      strayAnswerRefusal(
        { 'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.acme' } },
        plan,
        NOTHING_INSTALLED,
      ),
    ).toBeNull();
  });

  it('lets through one keyed to a sibling an adapter of the plan borrows from', () => {
    expect(
      strayAnswerRefusal(
        { 'walking-skeleton/acme-rest-bootstrap': { projectName: 'demo' } },
        plan,
        NOTHING_INSTALLED,
      ),
    ).toBeNull();
  });

  it('refuses one no adapter of the plan reads, naming the ones that take answers', () => {
    const refusal = strayAnswerRefusal(
      { 'walking-skeleton/other-rest-bootstrap': { basePackage: 'org.acme' } },
      plan,
      NOTHING_INSTALLED,
    );
    expect(refusal).toMatchObject({
      code: UNKNOWN_ANSWER_CODE,
      message:
        'no adapter in this plan reads an answer for walking-skeleton/other-rest-bootstrap:basePackage; the adapters that take answers here: vcs/git-init, walking-skeleton/acme-cli-bootstrap',
    });
  });

  it('says so plainly when nothing in the plan asks a question', () => {
    expect(
      strayAnswerRefusal({ 'vcs/git-init': { remote: 'x' } }, [portFake], NOTHING_INSTALLED)
        ?.message,
    ).toBe(
      'no adapter in this plan reads an answer for vcs/git-init:remote; nothing in this plan asks a question',
    );
  });

  it('refuses a question its adapter does not ask, naming the ones it does', () => {
    const refusal = strayAnswerRefusal(
      { 'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.acme', basePackge: 'x' } },
      plan,
      NOTHING_INSTALLED,
    );
    expect(refusal).toMatchObject({
      code: UNKNOWN_ANSWER_CODE,
      message:
        "walking-skeleton/acme-cli-bootstrap asks no question 'basePackge'; it asks: basePackage, projectName",
    });
  });

  it('refuses an answer for an installed vertical as frozen, naming the vertical', () => {
    const refusal = strayAnswerRefusal(
      { 'vcs/git-init': { defaultBranch: 'trunk' } },
      [pipeline],
      owning(versionControl),
    );
    expect(refusal).toMatchObject({
      code: FROZEN_ANSWER_CODE,
      message:
        'Version control is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for vcs/git-init:defaultBranch)',
    });
  });

  it('refuses a question a borrowed key names that no adapter of the plan asks, as an unknown key', () => {
    // `distribution/acme-container` asks `deploy`; the pipeline that
    // borrows from it does not, so nothing here reads the answer —
    // and saying its own adapter asks no such question would be false.
    const refusal = strayAnswerRefusal(
      { 'distribution/acme-container': { provider: 'gitlab-ci', deploy: 'ssh' } },
      [pipeline],
      NOTHING_INSTALLED,
    );
    expect(refusal).toMatchObject({
      code: UNKNOWN_ANSWER_CODE,
      message:
        'no adapter in this plan reads an answer for distribution/acme-container:deploy; the adapters that take answers here: ci/acme-pipeline',
    });
  });

  it('refuses a borrowed key an installed vertical owns: that answer is already rendered', () => {
    expect(
      strayAnswerRefusal(
        { 'distribution/acme-container': { provider: 'gitlab-ci' } },
        [pipeline],
        owning(distribution),
      )?.code,
    ).toBe(FROZEN_ANSWER_CODE);
  });

  it('never calls a key the plan resolves itself frozen', () => {
    expect(
      strayAnswerRefusal(
        { 'vcs/git-init': { defaultBranch: 'trunk' } },
        plan,
        owning(versionControl),
      ),
    ).toBeNull();
  });

  it('passes over a key with no answer under it', () => {
    expect(strayAnswerRefusal({ 'nobody/here': {} }, plan, NOTHING_INSTALLED)).toBeNull();
  });
});

describe('installedOwnerOf', () => {
  it('finds an installed vertical in the registry, and a product root’s glue among the stacks', () => {
    const owner = installedOwnerOf(shippedRegistry, {
      ...emptyManifestV2('2026-09-24T00:00:00Z', '0.0.0-test'),
      verticals: [
        { id: 'vcs', installedAt: '2026-09-24T00:00:00Z' },
        { id: 'fullstack', installedAt: '2026-09-24T00:00:00Z' },
      ],
    });
    expect(owner('vcs/git-init')?.id).toBe('vcs');
    expect(owner('fullstack/product-compose')?.id).toBe('fullstack');
    expect(owner('ci/jvm-pipeline')).toBeNull();
  });
});
