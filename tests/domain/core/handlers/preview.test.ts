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
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { previewQuery } from '../../../../src/domain/contract/queries.js';
import type { InstallPreview } from '../../../../src/domain/contract/queries.js';
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
  it('writes nothing to disk', async () => {
    const preview = await previewNew();
    expect(preview.changes.length).toBeGreaterThan(0);
    expect(await fs.readdir(cwd)).toEqual([]);
  });

  it('reports the questions an interactive install would ask, with their bindings', async () => {
    const preview = await previewNew();
    expect(preview.subject).toBe('ts-cli');
    expect(preview.questions.map((pending) => pending.id)).toEqual([
      'extraVerticals',
      'remote',
      'defaultBranch',
      'npmScope',
      'projectName',
    ]);
    expect(preview.questions.map((pending) => pending.binding)).toEqual([
      { kind: 'extraVerticals' },
      { kind: 'answer', adapter: 'vcs/git-init', question: 'remote' },
      { kind: 'answer', adapter: 'vcs/git-init', question: 'defaultBranch' },
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
    // wizard's own three steps, each an ordinary answer it can send
    // back, and the defaults compose to the same preset an omitted
    // `--stack` has always meant.
    expect(preview.questions.slice(0, 3).map((q) => q.id)).toEqual([
      'language',
      'entrypoints',
      'framework',
    ]);
    expect(preview.questions[1]).toMatchObject({ kind: 'multi-select' });
    expect(preview.questions[0]?.binding).toEqual({
      kind: 'answer',
      adapter: 'keel.new-project',
      question: 'language',
    });
    expect(preview.subject).toBe('quarkus-cli');
  });

  it('resolves a drill-down answer sent back into the preset it names', async () => {
    const preview = expectOk(
      await installMediator().dispatch(
        previewQuery({
          cwd,
          target: { kind: 'new-project' },
          answers: { 'keel.new-project': { language: 'go', entrypoints: 'cli,server-http' } },
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
});
