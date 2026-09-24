/**
 * `keel.preview` reads the answers it is sent as the install reads
 * them.
 *
 * The preview answers adapters' questions from its prompt, the install
 * from sticky memory; until both read one precedence — the adapter's
 * own id, then each `sharesAnswersWith` sibling it lists — an answer
 * keyed to a sibling previewed as the default and installed as given:
 * a Quarkus REST bootstrap's package sent to `quarkus-cli-rest`, whose
 * CLI bootstrap asks first, previewed `com/example` and installed
 * `org/acme`. And where the install refuses an answer nothing reads,
 * the preview said nothing and planned without it.
 *
 * **Scenario.** One body — a target and its answers — sent to a
 * preview and to an install. **Factory.** `installMediator` over the
 * real templates, deferred actions discarded. **Port.**
 * `Mediator.dispatch`: the preview's changes and its
 * `unusedAnswers`, against the install's changes, its refusal, and
 * what it wrote.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  installCommandFor,
  newProjectCommand,
  type InstallTarget,
  type PresetAnswers,
} from '../../../../src/domain/contract/commands.js';
import { previewQuery, type InstallPreview } from '../../../../src/domain/contract/queries.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

const mediator = () => installMediator({ runDeferred: discardDeferred() });

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-preview-answers-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const preview = async (target: InstallTarget, answers: PresetAnswers): Promise<InstallPreview> =>
  expectOk(await mediator().dispatch(previewQuery({ cwd, target, answers })));

/** The same body, installed as `keel ui` installs it: non-interactive. */
const install = (target: InstallTarget, answers: PresetAnswers, dryRun = true) =>
  mediator().dispatch(installCommandFor(target, { cwd, answers, interactive: false, dryRun }));

/** Every file under `dir`, relative to it. */
const filesUnder = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(full)).map((f) => `${entry.name}/${f}`));
    else out.push(entry.name);
  }
  return out;
};

const QUARKUS_CLI = 'walking-skeleton/quarkus-cli-bootstrap';
const QUARKUS_REST = 'walking-skeleton/quarkus-rest-bootstrap';

describe('keel.preview — an answer keyed to a sibling', () => {
  const target: InstallTarget = { kind: 'new-project', stack: 'quarkus-cli-rest' };
  const answers: PresetAnswers = { [QUARKUS_REST]: { basePackage: 'org.acme' } };

  it('previews a Quarkus REST bootstrap’s package on quarkus-cli-rest as the install writes it', async () => {
    const previewed = await preview(target, answers);
    const paths = previewed.changes.map((change) => change.path);
    expect(paths.filter((p) => p.includes('org/acme')).length).toBeGreaterThan(0);
    expect(paths.filter((p) => p.includes('com/example'))).toEqual([]);
    // Asked of the CLI bootstrap, which runs first, and bound to the
    // key the answer came under: sent back there, it is read again.
    const asked = previewed.questions.find((question) => question.id === 'basePackage');
    expect(asked).toMatchObject({
      value: 'org.acme',
      shared: 'project',
      binding: { kind: 'answer', adapter: QUARKUS_REST, question: 'basePackage' },
    });
    expect(previewed.unusedAnswers).toBeUndefined();

    const dry = expectOk(await install(target, answers));
    expect(dry.changes).toEqual(previewed.changes);
    expectOk(await install(target, answers, false));
    const files = await filesUnder(cwd);
    expect(files.filter((f) => f.includes('org/acme')).length).toBeGreaterThan(0);
    expect(files.filter((f) => f.includes('com/example'))).toEqual([]);
    const manifest = await fs.readJson(path.join(cwd, '.claude', '.keel-manifest.json'));
    expect(manifest.answers[QUARKUS_CLI]).toMatchObject({ basePackage: 'org.acme' });
    expect(manifest.answers[QUARKUS_REST]).toMatchObject({ basePackage: 'org.acme' });
  });

  it('takes the same answer sent under both bootstraps, as a script that answers each by id does', async () => {
    const both: PresetAnswers = {
      [QUARKUS_CLI]: { basePackage: 'org.acme' },
      [QUARKUS_REST]: { basePackage: 'org.acme' },
    };
    const previewed = await preview(target, both);
    expect(previewed.unusedAnswers).toBeUndefined();
    expect(expectOk(await install(target, both)).changes).toEqual(previewed.changes);
  });

  it('reports a second answer to the same question, which the install refuses in the same words', async () => {
    const twice: PresetAnswers = {
      [QUARKUS_CLI]: { basePackage: 'org.acme' },
      [QUARKUS_REST]: { basePackage: 'org.other' },
    };
    const previewed = await preview(target, twice);
    expect(previewed.unusedAnswers).toEqual([
      {
        adapter: QUARKUS_REST,
        question: 'basePackage',
        code: 'keel.unknown-answer',
        message: `${QUARKUS_REST}:basePackage is not read: it answers the same question as ${QUARKUS_CLI}:basePackage, which is read first — send one answer for it`,
      },
    ]);
    // Until now the REST bootstrap took its own and the CLI one the
    // other: one project, two packages.
    const refused = expectErr(await install(target, twice));
    expect({ code: refused.code, message: refused.message }).toEqual({
      code: 'keel.unknown-answer',
      message: previewed.unusedAnswers?.[0]?.message,
    });
    expect(await fs.readdir(cwd)).toEqual([]);
  });
});

describe('keel.preview — an answer the install would refuse', () => {
  const target: InstallTarget = { kind: 'new-project', stack: 'quarkus-rest' };
  const stray: PresetAnswers = { 'walking-skeleton/spring-rest-bootstrap': { basePackage: 'x.y' } };

  it('is reported with the install’s refusal, and the plan is the body without it', async () => {
    const previewed = await preview(target, stray);
    const refused = expectErr(await install(target, stray));
    expect(previewed.unusedAnswers).toEqual([
      {
        adapter: 'walking-skeleton/spring-rest-bootstrap',
        question: 'basePackage',
        code: refused.code,
        message: refused.message,
      },
    ]);
    expect(refused.code).toBe('keel.unknown-answer');
    expect(previewed.changes).toEqual(expectOk(await install(target, {})).changes);
  });
});

describe('keel.preview — a product asks each service for its own name', () => {
  it('keeps two services’ project names apart, each bound to its own bootstrap', async () => {
    const target: InstallTarget = { kind: 'new-project', stack: 'fullstack' };
    const answers: PresetAnswers = {
      [QUARKUS_REST]: { projectName: 'orders-api' },
      'walking-skeleton/wc-spa-bootstrap': { projectName: 'orders-web' },
    };
    const previewed = await preview(target, answers);
    const names = previewed.questions
      .filter((question) => question.id === 'projectName')
      .map((question) => [question.binding, question.value, question.shared]);
    expect(names).toEqual([
      [{ kind: 'answer', adapter: QUARKUS_REST, question: 'projectName' }, 'orders-api', 'project'],
      [
        { kind: 'answer', adapter: 'walking-skeleton/wc-spa-bootstrap', question: 'projectName' },
        'orders-web',
        'project',
      ],
    ]);
    expect(previewed.unusedAnswers).toBeUndefined();

    expectOk(await install(target, answers, false));
    const backend = await fs.readFile(path.join(cwd, 'backend', 'settings.gradle.kts'), 'utf8');
    expect(backend).toContain('orders-api');
    expect(backend).not.toContain('orders-web');
    const frontend = await fs.readJson(path.join(cwd, 'frontend', 'package.json'));
    expect(frontend.name).toBe('orders-web');
  });
});

describe('keel.preview — on a project that has answered already', () => {
  beforeEach(async () => {
    expectOk(
      await mediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-rest',
          extraVerticals: ['ci'],
          moduleLayout: 'modulith',
          answers: { 'ci/jvm-pipeline': { provider: 'gitlab-ci' } },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
  });

  it('reports an answer an installed sibling settled as frozen, as the install refuses it', async () => {
    // CI recorded the provider; distribution's container adapter reads
    // it as its own. Its own key, sent now, would be read by nobody —
    // until now the install took it, and the two disagreed.
    const target: InstallTarget = { kind: 'add-vertical', verticals: ['distribution'] };
    const answers: PresetAnswers = {
      'distribution/jvm-container': { provider: 'github-actions' },
    };
    const previewed = await preview(target, answers);
    const refused = expectErr(await install(target, answers));
    expect(previewed.unusedAnswers).toEqual([
      {
        adapter: 'distribution/jvm-container',
        question: 'provider',
        code: 'keel.frozen-answer',
        message: refused.message,
      },
    ]);
    expect(refused.message).toBe(
      'Continuous integration is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for distribution/jvm-container:provider)',
    );
    expect(previewed.changes.some((change) => change.path === '.gitlab-ci.yml')).toBe(true);
  });

  it('reports an answer for a re-rendered vertical’s recorded ones, as the install refuses it', async () => {
    const target: InstallTarget = { kind: 'add-vertical', verticals: ['ci'], reapply: true };
    const answers: PresetAnswers = { 'ci/jvm-pipeline': { provider: 'github-actions' } };
    const previewed = await preview(target, answers);
    const refused = expectErr(await install(target, answers));
    expect(refused.code).toBe('keel.reapply-frozen-answers');
    expect(previewed.unusedAnswers).toEqual([
      {
        adapter: 'ci/jvm-pipeline',
        question: 'provider',
        code: refused.code,
        message: refused.message,
      },
    ]);
  });

  it('reports an answer no bounded context reads, which keel add module now refuses', async () => {
    const target: InstallTarget = { kind: 'add-module', module: 'billing' };
    const answers: PresetAnswers = { 'walking-skeleton/quarkus-rest-bootstrap': { x: 'y' } };
    const previewed = await preview(target, answers);
    const refused = expectErr(
      await mediator().dispatch(
        addModuleCommand({ cwd, module: 'billing', answers, interactive: false, dryRun: true }),
      ),
    );
    expect(previewed.unusedAnswers).toEqual([
      {
        adapter: 'walking-skeleton/quarkus-rest-bootstrap',
        question: 'x',
        code: refused.code,
        message: refused.message,
      },
    ]);
    expect(refused.code).toBe('keel.frozen-answer');
  });

  it('holds keel add to the plan it resolved when it asks nothing, as the preview does', async () => {
    // A key no adapter reads: the preview words its refusal from the
    // plan the run resolved, and so does a run that asks no question.
    const target: InstallTarget = { kind: 'add-vertical', verticals: ['persistence'] };
    const answers: PresetAnswers = { 'nobody/here': { x: 'y' } };
    const previewed = await preview(target, answers);
    const refused = expectErr(
      await mediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['persistence'],
          answers,
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(previewed.unusedAnswers?.[0]).toMatchObject({
      code: refused.code,
      message: refused.message,
    });
  });
});

describe('keel.preview — a stray key where the plan is known only once staged', () => {
  it('is refused by a run that asks nothing in the words of the plan it resolved, as the preview reports it', async () => {
    // On quarkus-cli-rest, `iac` brings the image and distribution with
    // it, and distribution then resolves to the container, not the
    // native build: the adapters it could reach before the run name
    // one it does not run. A run that asks nothing waits for the plan
    // it resolved, so its refusal is the preview's, word for word.
    expectOk(
      await mediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli-rest',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const target: InstallTarget = { kind: 'add-vertical', verticals: ['iac'] };
    const answers: PresetAnswers = { 'nobody/here': { x: 'y' } };
    const previewed = await preview(target, answers);
    const refused = expectErr(await install(target, answers));
    expect(previewed.unusedAnswers).toEqual([
      { adapter: 'nobody/here', question: 'x', code: refused.code, message: refused.message },
    ]);
    expect(refused.code).toBe('keel.unknown-answer');
    expect(refused.message).toContain('distribution/jvm-container');
    expect(refused.message).not.toContain('distribution/quarkus-cli-native');
  });
});
