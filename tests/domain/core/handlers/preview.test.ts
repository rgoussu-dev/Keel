/**
 * `keel.preview` — the loop a form runs.
 *
 * Three properties carry the feature, and each is a way the naive
 * implementation would be wrong:
 *
 *   1. **It writes nothing.** A form previews on every keystroke's
 *      worth of change; a preview that touched disk would scaffold a
 *      project by accident.
 *   2. **An answered question stays in the list.** Preset answers
 *      travel through the prompt rather than the manifest precisely
 *      so the field does not vanish the moment it is used — the bug
 *      a `PresetAnswers`-shaped implementation would ship.
 *   3. **The answers actually take.** A preview that listed the
 *      questions but resolved them to defaults would look right and
 *      plan the wrong tree.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Vertical } from '../../../../src/domain/contract/composition.js';
import { registryOf, shippedRegistry } from '../../../../src/domain/core/registry.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { installCommandFor, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { catalogQuery, dialsQuery, previewQuery } from '../../../../src/domain/contract/queries.js';
import type { InstallPreview, PendingQuestion } from '../../../../src/domain/contract/queries.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

/** Nothing under test here runs a deferred action. */
const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-preview-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function previewNew(
  overrides: {
    stack?: string;
    moduleLayout?: string;
    buildSystem?: string;
    withPeerContext?: boolean;
  } = {},
  answers: Record<string, Record<string, string>> = {},
): Promise<InstallPreview> {
  const result = await installMediator().dispatch(
    previewQuery({
      cwd,
      target: {
        kind: 'new-project',
        stack: overrides.stack ?? 'ts-cli',
        buildSystem: overrides.buildSystem ?? 'npm',
        moduleLayout: overrides.moduleLayout ?? 'basic',
        ...(overrides.withPeerContext === undefined
          ? {}
          : { withPeerContext: overrides.withPeerContext }),
      },
      answers,
    }),
  );
  return expectOk(result);
}

const valueOf = (preview: InstallPreview, adapter: string, question: string): string | undefined =>
  preview.questions.find(
    (pending) =>
      pending.binding.kind === 'answer' &&
      pending.binding.adapter === adapter &&
      pending.binding.question === question,
  )?.value;

const BOOTSTRAP = 'walking-skeleton/ts-cli-bootstrap';

describe('keel.preview', () => {
  it('reports suppressed plugin harness elements without printing or writing a preview', async () => {
    const producer: Vertical = {
      id: 'acme-domain',
      description: 'Domain files and an optional agent skill',
      dimensions: [],
      skills: ['inspect-domain'],
      adapters: [
        {
          id: 'acme-domain/content',
          vertical: 'acme-domain',
          covers: [],
          predicate: {},
          contribute: () => ({
            files: [{ path: 'domain.txt', content: 'domain content\n' }],
            skills: [
              {
                name: 'inspect-domain',
                description: 'Inspect the domain.',
                body: 'Read domain.txt.',
              },
            ],
          }),
        },
      ],
    };
    const logger = new FakeLogger();
    const mediator = installMediator({
      logger,
      registry: registryOf([
        {
          origin: 'plugin-preview-test',
          verticals: [producer],
          stacks: [
            {
              id: 'acme',
              description: 'Plugin without a harness',
              tags: [],
              verticals: [producer],
            },
          ],
        },
      ]),
    });
    const preview = expectOk(
      await mediator.dispatch(
        previewQuery({ cwd, target: { kind: 'new-project', stack: 'acme' }, answers: {} }),
      ),
    );
    expect(preview.skippedHarnessElements).toBe(1);
    expect(preview.changes).toEqual([{ kind: 'create', path: 'domain.txt' }]);
    expect(logger.entries).toEqual([]);
    expect(await fs.readdir(cwd)).toEqual([]);
  });

  it('writes nothing to disk', async () => {
    const preview = await previewNew();
    expect(preview.changes.length).toBeGreaterThan(0);
    expect(preview).not.toHaveProperty('skippedHarnessElements');
    expect(await fs.readdir(cwd)).toEqual([]);
  });

  it('reports the questions an interactive install would ask, with their bindings', async () => {
    const preview = await previewNew();
    expect(preview.subject).toBe('ts-cli');
    // Adapter order inside a vertical orders its questions: id, except
    // where an `after` moves one — `vcs/commit-conventions` declares
    // `after: ['vcs/git-init']`, because `core.hooksPath` needs the
    // repository to exist, and its question follows its adapter.
    expect(preview.questions.map((pending) => pending.id)).toEqual([
      'extraVerticals',
      'changelog',
      'remote',
      'defaultBranch',
      'commitHook',
      'npmScope',
      'projectName',
    ]);
    expect(preview.questions.map((pending) => pending.binding)).toEqual([
      { kind: 'extraVerticals' },
      { kind: 'answer', adapter: 'vcs/changelog', question: 'changelog' },
      { kind: 'answer', adapter: 'vcs/git-init', question: 'remote' },
      { kind: 'answer', adapter: 'vcs/git-init', question: 'defaultBranch' },
      { kind: 'answer', adapter: 'vcs/commit-conventions', question: 'commitHook' },
      { kind: 'answer', adapter: BOOTSTRAP, question: 'npmScope' },
      { kind: 'answer', adapter: BOOTSTRAP, question: 'projectName' },
    ]);
  });

  it('keeps a question in the list once it has been answered', async () => {
    const answered = await previewNew({}, { [BOOTSTRAP]: { projectName: 'demo-app' } });
    expect(answered.questions.map((pending) => pending.id)).toContain('projectName');
    expect(valueOf(answered, BOOTSTRAP, 'projectName')).toBe('demo-app');
    // …and the untouched ones still report their defaults.
    expect(valueOf(answered, 'vcs/git-init', 'defaultBranch')).toBe('main');
  });

  it('resolves an answer the way the install would', async () => {
    // The plan is paths and kinds, so an answer that only changes
    // file *contents* leaves it identical — which is why this asserts
    // against the install rather than against the tree. What has to
    // hold is that the value the form was shown is the value the
    // commit uses; anything else and the preview is decoration.
    const answers = { [BOOTSTRAP]: { npmScope: 'acme', projectName: 'demo-app' } };
    const preview = await previewNew({}, answers);
    expect(valueOf(preview, BOOTSTRAP, 'npmScope')).toBe('acme');

    expectOk(
      await installMediator({ runDeferred: discardDeferred() }).dispatch(
        newProjectCommand({
          cwd,
          stack: 'ts-cli',
          answers,
          interactive: false,
          dryRun: false,
          buildSystem: 'npm',
          moduleLayout: 'basic',
        }),
      ),
    );
    const manifest = await fs.readJson(path.join(cwd, '.claude', '.keel-manifest.json'));
    expect(manifest.answers[BOOTSTRAP]).toMatchObject({
      npmScope: 'acme',
      projectName: 'demo-app',
    });
    expect(preview.changes.map((change) => change.path)).toContain('package.json');
  });

  it('re-plans when a stack dial moves', async () => {
    const basic = await previewNew({ moduleLayout: 'basic' });
    const modulith = await previewNew({ moduleLayout: 'modulith' });
    expect(modulith.changes.map((change) => change.path)).not.toEqual(
      basic.changes.map((change) => change.path),
    );
    expect(modulith.changes.some((change) => change.path.startsWith('modules/'))).toBe(true);
  });

  it('reports the deferred actions without running them', async () => {
    const preview = await previewNew();
    expect(preview.actions).toContain('git init -b main');
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
  });

  it('leaves the wizard’s review step out of the question set', async () => {
    // `keel new`'s interactive flow ends each staging attempt with a
    // proceed/edit/cancel question. It is flow control, not part of
    // the plan — a preview takes its default (which is what ends the
    // loop at the first plan) and must not report it, or a form would
    // render "Review the plan above" as a field to fill in.
    const preview = await previewNew();
    expect(preview.questions.map((pending) => pending.id)).not.toContain('keel.review');
  });

  it('reports the drill-down when the target names no stack, and still lands on the default', async () => {
    const preview = expectOk(
      await installMediator().dispatch(
        previewQuery({ cwd, target: { kind: 'new-project' }, answers: {} }),
      ),
    );
    // A front end with a stack picker sends `stack` and never gets
    // here — `keel ui` does exactly that. One that does not gets the
    // wizard's own four steps, each an ordinary answer it can send
    // back, and the defaults compose to the same preset an omitted
    // `--stack` has always meant.
    expect(preview.questions.slice(0, 4).map((q) => q.id)).toEqual([
      'shape',
      'language',
      'framework',
      'entrypoints',
    ]);
    expect(preview.questions[3]).toMatchObject({ kind: 'multi-select' });
    expect(preview.questions[0]?.binding).toEqual({
      kind: 'answer',
      adapter: 'keel.new-project',
      question: 'shape',
    });
    expect(preview.subject).toBe('quarkus-cli');
  });

  it('resolves a drill-down answer sent back into the preset it names', async () => {
    const preview = expectOk(
      await installMediator().dispatch(
        previewQuery({
          cwd,
          target: { kind: 'new-project' },
          answers: {
            'keel.new-project': {
              shape: 'backend',
              language: 'go',
              entrypoints: 'cli,server-http',
            },
          },
        }),
      ),
    );
    expect(preview.subject).toBe('go-cli-http');
  });

  it('does not ask about the peer context once the target has decided', async () => {
    // An absent `withPeerContext` is what makes the install ask, so a
    // caller that already offered the choice sends it either way.
    const decided = await previewNew({ moduleLayout: 'modulith', withPeerContext: false });
    expect(decided.questions.map((pending) => pending.id)).not.toContain('withPeerContext');

    const undecided = expectOk(
      await installMediator().dispatch(
        previewQuery({
          cwd,
          target: { kind: 'new-project', stack: 'ts-cli', moduleLayout: 'modulith' },
          answers: {},
        }),
      ),
    );
    expect(undecided.questions.map((pending) => pending.binding)).toContainEqual({
      kind: 'withPeerContext',
    });
  });

  it('surfaces a domain refusal as an Err, exactly as the command would', async () => {
    const result = await installMediator().dispatch(
      previewQuery({ cwd, target: { kind: 'new-project', stack: 'nope' }, answers: {} }),
    );
    expect(expectErr(result).code).toBe('keel.unknown-stack');
  });

  it('previews a vertical onto a real project without touching it', async () => {
    const mediator = installMediator({ runDeferred: discardDeferred() });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'ts-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'npm',
        }),
      ),
    );
    const before = await fs.readdir(cwd);
    const preview = expectOk(
      await mediator.dispatch(
        previewQuery({ cwd, target: { kind: 'add-vertical', vertical: 'ci' }, answers: {} }),
      ),
    );
    expect(preview.subject).toBe('ci');
    expect(preview.changes.some((change) => change.path.startsWith('.github/'))).toBe(true);
    expect(await fs.readdir(cwd)).toEqual(before);
  });

  it('reports a vertical this project cannot carry as an Err, not a crash', async () => {
    // The exact call the page makes on every keystroke, against the
    // one refusal that used to escape the install engine by throwing:
    // `resolveVertical` hard-fails when no adapter covers a dimension,
    // and a CLI project has nothing to build a container image from.
    // A throw is all an HTTP layer can read as a crash, so `keel ui`
    // answered 500 with a bare string for a refusal that names what
    // would close the gap.
    const mediator = installMediator({ runDeferred: discardDeferred() });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'ts-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'npm',
        }),
      ),
    );
    const error = expectErr(
      await mediator.dispatch(
        previewQuery({
          cwd,
          target: { kind: 'add-vertical', vertical: 'containerization' },
          answers: {},
        }),
      ),
    );
    expect(error.code).toBe('keel.uncoverable-vertical');
    expect(error.message).toContain('HTTP server — a REST endpoint');
  });
});

/**
 * The refusals raised *inside* an adapter, below every front-door
 * check. Each used to be a plain `Error` — a 500 in `keel ui` for a
 * choice the page itself offered — and each is now a `DomainError`
 * the mediator hands back as an `Err`. Previewed through a new
 * project, because that is where the page reaches them first.
 * Distribution's missing image was the first of them; it is a
 * declaration now, refused at the front door before any adapter runs,
 * under the code it had.
 */
describe('keel.preview — refusals from inside an adapter', () => {
  const previewGoHttp = (
    extraVerticals: readonly string[],
    answers: Record<string, Record<string, string>> = {},
  ) =>
    installMediator().dispatch(
      previewQuery({
        cwd,
        target: { kind: 'new-project', stack: 'go-http', extraVerticals },
        answers,
      }),
    );

  it('refuses distribution without its image as a missing prerequisite, naming no command', async () => {
    const error = expectErr(await previewGoHttp(['distribution']));
    expect(error.code).toBe('keel.missing-prerequisites');
    // The same sentence reaches `keel new` and `keel add`, so it names
    // the vertical and the order rather than either command.
    expect(error.message).toBe(
      'Distribution needs Container image installed before it — add containerization as well',
    );
  });

  it('refuses a value the question does not list as an invalid answer', async () => {
    const error = expectErr(
      await previewGoHttp(['persistence'], {
        'persistence/database-compose': { engine: 'oracle' },
      }),
    );
    expect(error.code).toBe('keel.invalid-answer');
    expect(error.message).toContain('persistence/database-compose:engine');
  });
});

/**
 * A choice declares where it applies (`QuestionChoice.predicate`), and
 * the preview offers it exactly there — the list a form renders, and
 * the list a posted answer is held to, are one list. Before, the
 * persistence dials offered `mariadb` and `liquibase` everywhere, and a
 * guard deep in the install refused the stacks that could not serve
 * them: a choice the page offered, answered with a refusal.
 */
describe('keel.preview — a choice is offered where it is taken', () => {
  const DIALS = 'persistence/database-compose';

  const previewPersistence = (stack: string, answers: Record<string, string> = {}) =>
    installMediator().dispatch(
      previewQuery({
        cwd,
        target: { kind: 'new-project', stack, extraVerticals: ['persistence'] },
        answers: Object.keys(answers).length === 0 ? {} : { [DIALS]: answers },
      }),
    );

  const offered = (preview: InstallPreview, question: string): readonly string[] =>
    (
      preview.questions.find(
        (pending) =>
          pending.binding.kind === 'answer' &&
          pending.binding.adapter === DIALS &&
          pending.binding.question === question,
      )?.choices ?? []
    ).map((choice) => choice.value);

  it('does not offer mariadb on go-http, and refuses it supplied as an invalid answer', async () => {
    const preview = expectOk(await previewPersistence('go-http'));
    expect(offered(preview, 'engine')).toEqual(['postgres']);
    expect(offered(preview, 'migrations')).toEqual(['flyway', 'liquibase']);

    const error = expectErr(await previewPersistence('go-http', { engine: 'mariadb' }));
    expect(error.code).toBe('keel.invalid-answer');
    expect(error.message).toBe(
      "'mariadb' is not a choice for persistence/database-compose:engine; choices: postgres",
    );
  });

  it('offers mariadb on a JVM stack, and not liquibase', async () => {
    const preview = expectOk(await previewPersistence('quarkus-rest'));
    expect(offered(preview, 'engine')).toEqual(['postgres', 'mariadb']);
    expect(offered(preview, 'migrations')).toEqual(['flyway']);
    // The list arrives applied: no choice carries its predicate, and so
    // no tag, to the page.
    expect(
      preview.questions.flatMap((pending) => pending.choices ?? []).filter((c) => 'predicate' in c),
    ).toEqual([]);

    const error = expectErr(await previewPersistence('quarkus-rest', { migrations: 'liquibase' }));
    expect(error.code).toBe('keel.invalid-answer');
  });

  it('takes every persistence choice a stack is offered, and refuses every one it is not', async () => {
    // The class the default-answer grid cannot see: it posts no
    // answers. Every stack whose menu offers persistence, every choice
    // the dials declare — offered must preview and install Ok, hidden
    // must be refused by both as outside the choices, never deeper in
    // the install. The preview holds a posted answer to the list at
    // the prompt, the install holds a `--set` to it where the answer
    // reaches its adapter: two doors, one list.
    const mediator = installMediator();
    // Defaults are left out: the preview posting no answers resolves
    // to them, and it must be Ok for the stack to be swept at all.
    const declared = (shippedRegistry.vertical('persistence')?.adapters ?? []).flatMap((adapter) =>
      (adapter.questions ?? []).flatMap((question) =>
        (question.choices ?? [])
          .filter((choice) => choice.value !== question.default)
          .map((choice) => ({ adapter: adapter.id, question: question.id, value: choice.value })),
      ),
    );
    expect(declared.length).toBeGreaterThan(0);
    const verdicts: Record<string, string> = {};
    const hidden: string[] = [];
    const catalog = expectOk(await mediator.dispatch(catalogQuery()));
    // Stacks share nothing, and dry runs write nothing, so they overlap.
    await Promise.all(
      catalog.stacks.map(async ({ id: stack }) => {
        const dials = expectOk(
          await mediator.dispatch(dialsQuery({ target: { kind: 'new-project', stack } })),
        );
        if (!dials.extraVerticals.some((extra) => extra.id === 'persistence')) return;
        if (dials.target.kind !== 'new-project') throw new Error(`${stack} settled elsewhere`);
        const target = { ...dials.target, extraVerticals: ['persistence'] };
        const asked = expectOk(
          await mediator.dispatch(previewQuery({ cwd, target, answers: {} })),
        ).questions;
        for (const choice of declared) {
          const pending = asked.find(
            (question: PendingQuestion) =>
              question.binding.kind === 'answer' &&
              question.binding.adapter === choice.adapter &&
              question.binding.question === choice.question,
          );
          if (pending === undefined) continue;
          const key = `${stack} ${choice.question}=${choice.value}`;
          const shown = (pending.choices ?? []).some((c) => c.value === choice.value);
          if (!shown) hidden.push(key);
          const answers = { [choice.adapter]: { [choice.question]: choice.value } };
          const results = [
            await mediator.dispatch(previewQuery({ cwd, target, answers })),
            await mediator.dispatch(
              installCommandFor(target, { cwd, answers, interactive: false, dryRun: true }),
            ),
          ];
          const [previewed, installed] = results.map((result) =>
            result.ok ? 'ok' : result.error.code,
          );
          const expected = shown ? 'ok' : 'keel.invalid-answer';
          verdicts[key] =
            previewed === expected && installed === expected
              ? 'as offered'
              : `${shown ? 'offered' : 'not offered'}, yet preview ${previewed}, install ${installed}`;
        }
      }),
    );
    // Both halves of the class, so neither can pass by sweeping nothing
    // — or by offering everything everywhere.
    expect(hidden).toEqual(
      expect.arrayContaining(['go-http engine=mariadb', 'quarkus-rest migrations=liquibase']),
    );
    expect(Object.keys(verdicts)).toEqual(
      expect.arrayContaining(['quarkus-rest engine=mariadb', 'go-http migrations=liquibase']),
    );
    expect(Object.entries(verdicts).filter(([, verdict]) => verdict !== 'as offered')).toEqual([]);
  });
});
