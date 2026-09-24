/**
 * Where a supplied answer may land — the rule every install handler
 * holds `--set` and an install body's `answers` to, once it knows the
 * plan, and the one `keel.preview` reports unread answers by. Scenario
 * adapters are plain data, told as a run's report tells them
 * (`resolvedAdapters`); the one registry-backed case reads the shipped
 * registry, the port's real source.
 */

import { describe, expect, it } from 'vitest';
import type { Adapter, Question, Vertical } from '../../../src/domain/contract/composition.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import type { AnswersByKey } from '../../../src/domain/core/answers.js';
import {
  FROZEN_ANSWER_CODE,
  historyOf,
  NOTHING_INSTALLED,
  REAPPLY_FROZEN_ANSWERS_CODE,
  resolvedAdapters,
  strayAnswerRefusal,
  UNKNOWN_ANSWER_CODE,
  unusedAnswers,
  type AnswerHistory,
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

const plan = resolvedAdapters([gitInit, cliBootstrap, portFake]);

const versionControl = vertical('vcs', 'Version control', [gitInit]);
const distribution = vertical('distribution', 'Distribution', [
  adapter('distribution/acme-container', ['provider', 'deploy'], ['ci/acme-pipeline']),
]);
const owning = (installed: readonly Vertical[], recorded: AnswersByKey = {}): AnswerHistory => ({
  owner: (adapterId) => installed.find((v) => v.adapters.some((a) => a.id === adapterId)) ?? null,
  recorded,
});

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
      strayAnswerRefusal(
        { 'vcs/git-init': { remote: 'x' } },
        resolvedAdapters([portFake]),
        NOTHING_INSTALLED,
      )?.message,
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
      resolvedAdapters([pipeline]),
      owning([versionControl]),
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
      resolvedAdapters([pipeline]),
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
        resolvedAdapters([pipeline]),
        owning([distribution]),
      )?.code,
    ).toBe(FROZEN_ANSWER_CODE);
  });

  it('never calls a key the plan resolves itself frozen', () => {
    expect(
      strayAnswerRefusal(
        { 'vcs/git-init': { defaultBranch: 'trunk' } },
        plan,
        owning([versionControl]),
      ),
    ).toBeNull();
  });

  it('refuses one for a re-rendered vertical whose answers are recorded, before any other', () => {
    // Its vertical is installed and runs, so it is being re-rendered —
    // from what the manifest records. That refusal leads, whatever
    // order the answers came in.
    const unused = unusedAnswers(
      {
        'nobody/here': { x: '1' },
        'vcs/git-init': { defaultBranch: 'trunk' },
      },
      plan,
      owning([versionControl], { 'vcs/git-init': { defaultBranch: 'main' } }),
    );
    expect(unused.map((each) => each.code)).toEqual([
      REAPPLY_FROZEN_ANSWERS_CODE,
      UNKNOWN_ANSWER_CODE,
    ]);
    expect(unused[0]?.message).toBe(
      "--set cannot change vcs/git-init's answers: re-rendering 'vcs' reads them as the manifest recorded them, and changing one is not supported yet",
    );
  });

  it('passes over a key with no answer under it', () => {
    expect(strayAnswerRefusal({ 'nobody/here': {} }, plan, NOTHING_INSTALLED)).toBeNull();
  });
});

describe('unusedAnswers', () => {
  it('lists every answer nothing reads, question by question, each with its refusal', () => {
    const unused = unusedAnswers(
      {
        'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.acme', basePackge: 'x' },
        'nobody/here': { a: '1', b: '2' },
      },
      plan,
      NOTHING_INSTALLED,
    );
    expect(unused.map(({ adapter, question, code }) => [adapter, question, code])).toEqual([
      ['walking-skeleton/acme-cli-bootstrap', 'basePackge', UNKNOWN_ANSWER_CODE],
      ['nobody/here', 'a', UNKNOWN_ANSWER_CODE],
      ['nobody/here', 'b', UNKNOWN_ANSWER_CODE],
    ]);
  });

  describe('once the run says what it read', () => {
    const restBootstrap = adapter(
      'walking-skeleton/acme-rest-bootstrap',
      ['basePackage', 'projectName'],
      ['walking-skeleton/acme-cli-bootstrap'],
    );
    const combo = resolvedAdapters([cliBootstrap, restBootstrap]);

    it('lets through an answer a reader took, under its key or a sibling’s', () => {
      expect(
        unusedAnswers(
          { 'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.acme' } },
          combo,
          NOTHING_INSTALLED,
          [
            {
              adapter: 'walking-skeleton/acme-cli-bootstrap',
              question: 'basePackage',
              key: 'walking-skeleton/acme-rest-bootstrap',
            },
          ],
        ),
      ).toEqual([]);
    });

    it('refuses a second answer to a shared question, naming the one read first', () => {
      // The CLI bootstrap asked first and read its own key; the REST
      // one took the CLI one's recorded answer, so its own key was
      // never read — keeping it would split the package.
      expect(
        unusedAnswers(
          {
            'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.acme' },
            'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.other' },
          },
          combo,
          NOTHING_INSTALLED,
          [
            {
              adapter: 'walking-skeleton/acme-cli-bootstrap',
              question: 'basePackage',
              key: 'walking-skeleton/acme-cli-bootstrap',
            },
          ],
        ),
      ).toEqual([
        {
          adapter: 'walking-skeleton/acme-rest-bootstrap',
          question: 'basePackage',
          code: UNKNOWN_ANSWER_CODE,
          message:
            'walking-skeleton/acme-rest-bootstrap:basePackage is not read: it answers the same question as walking-skeleton/acme-cli-bootstrap:basePackage, which is read first — send one answer for it',
        },
      ]);
    });

    it('lets through a second answer that agrees with the one read', () => {
      // Both bootstraps of a two-entrypoint project answered by id, as a
      // script that cannot know which of the two asks first does.
      expect(
        unusedAnswers(
          {
            'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.acme' },
            'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.acme' },
          },
          combo,
          NOTHING_INSTALLED,
          [
            {
              adapter: 'walking-skeleton/acme-cli-bootstrap',
              question: 'basePackage',
              key: 'walking-skeleton/acme-cli-bootstrap',
            },
          ],
        ),
      ).toEqual([]);
    });

    it('refuses one an installed sibling settled, as frozen', () => {
      // CI is installed and records the provider; distribution borrows
      // it, so the answer sent for distribution's own key is not read.
      const container = adapter(
        'distribution/acme-container',
        ['provider', 'deploy'],
        ['ci/acme-pipeline'],
      );
      const ci = vertical('ci', 'Continuous integration', [pipeline]);
      expect(
        unusedAnswers(
          { 'distribution/acme-container': { provider: 'gitlab-ci' } },
          resolvedAdapters([container]),
          owning([ci], { 'ci/acme-pipeline': { provider: 'github-actions' } }),
          [],
        ),
      ).toEqual([
        {
          adapter: 'distribution/acme-container',
          question: 'provider',
          code: FROZEN_ANSWER_CODE,
          message:
            'Continuous integration is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for distribution/acme-container:provider)',
        },
      ]);
    });

    it('lets through one that agrees with what the project records', () => {
      const container = adapter(
        'distribution/acme-container',
        ['provider', 'deploy'],
        ['ci/acme-pipeline'],
      );
      const ci = vertical('ci', 'Continuous integration', [pipeline]);
      expect(
        unusedAnswers(
          { 'distribution/acme-container': { provider: 'gitlab-ci' } },
          resolvedAdapters([container]),
          owning([ci], { 'ci/acme-pipeline': { provider: 'gitlab-ci' } }),
          [],
        ),
      ).toEqual([]);
    });

    it('refuses one a recorded answer no installed vertical owns settled', () => {
      expect(
        unusedAnswers(
          { 'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.acme' } },
          resolvedAdapters([cliBootstrap]),
          owning([], { 'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.old' } }),
          [],
        ).map(({ code, message }) => [code, message]),
      ).toEqual([
        [
          FROZEN_ANSWER_CODE,
          // Nothing is being reconfigured, and dropping the answer would
          // leave the stale one: the sentence says where it is.
          "walking-skeleton/acme-cli-bootstrap:basePackage is not read: this project's manifest records walking-skeleton/acme-rest-bootstrap:basePackage, written by an older keel although nothing installed here asked it, and that recorded answer is what is read — remove it from .claude/.keel-manifest.json to answer anew",
        ],
      ]);
    });
  });
});

describe('historyOf', () => {
  it('finds an installed vertical in the registry, and a product root’s glue among the stacks', () => {
    const history = historyOf(shippedRegistry, {
      ...emptyManifestV2('2026-09-24T00:00:00Z', '0.0.0-test'),
      verticals: [
        { id: 'vcs', installedAt: '2026-09-24T00:00:00Z' },
        { id: 'fullstack', installedAt: '2026-09-24T00:00:00Z' },
      ],
      answers: { 'vcs/git-init': { defaultBranch: 'main' } },
    });
    expect(history.owner('vcs/git-init')?.id).toBe('vcs');
    expect(history.owner('fullstack/product-compose')?.id).toBe('fullstack');
    expect(history.owner('ci/jvm-pipeline')).toBeNull();
    expect(history.recorded).toEqual({ 'vcs/git-init': { defaultBranch: 'main' } });
  });
});
