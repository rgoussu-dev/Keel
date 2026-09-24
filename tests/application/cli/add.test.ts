/**
 * `keel add`'s grammar, through the real commander program over a
 * recording Mediator: what a command line becomes.
 *
 * The engine's answers are the handler suites' subject; this is the
 * CLI half of the contract — that `keel add a b` is **one** dispatch
 * naming both, so the planner sees the set whole (a second dispatch
 * would install `a` before anyone asked what `b` needs), that
 * `--refresh` travels as a list, and that `module` stays a reserved
 * first word. And what a run that has nothing to do exits with: the
 * executable turns a thrown error into exit code 1, so an add of what
 * is already there — an empty plan, over the real engine — must
 * return, printing why.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import { newProjectCommand, type InstallReport } from '../../../src/domain/contract/commands.js';
import type { Action } from '../../../src/domain/kernel/action.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { ok, type Result } from '../../../src/domain/kernel/result.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { expectOk, installMediator } from '../../support/factory.js';

/** Mediator fake recording what it was asked to dispatch, answering each with an empty plan. */
class RecordingMediator implements Mediator {
  readonly dispatched: Action[] = [];

  dispatch<A extends Action>(action: A): Promise<Result<never>> {
    this.dispatched.push(action);
    const report: InstallReport = {
      subject: 'recorded',
      changes: [],
      actions: [],
      committed: false,
    };
    return Promise.resolve(ok(report) as Result<never>);
  }
}

async function run(args: readonly string[]): Promise<readonly Action[]> {
  const mediator = new RecordingMediator();
  await buildProgram({
    mediator,
    logger: new FakeLogger(),
    version: 'test',
    availableStacks: [],
    availableVerticals: [],
    cwd: () => '/tmp/demo',
    serveUi: () => {
      throw new Error('unexpected UI start');
    },
  }).parseAsync([...args], { from: 'user' });
  return mediator.dispatched;
}

describe('keel add, as a command line', () => {
  it('is one dispatch naming every vertical, in the order typed', async () => {
    const dispatched = await run(['add', 'iac', 'containerization', '--yes', '--dry-run']);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      kind: 'keel.add-vertical',
      cwd: '/tmp/demo',
      verticals: ['iac', 'containerization'],
      interactive: false,
      dryRun: true,
    });
    expect(Object.keys(dispatched[0] ?? {})).not.toContain('refresh');
  });

  it('carries --refresh as the list of installed verticals to re-render', async () => {
    const [command] = await run(['add', 'persistence', '--refresh', 'distribution, ci', '--yes']);
    expect(command).toMatchObject({
      verticals: ['persistence'],
      refresh: ['distribution', 'ci'],
    });
  });

  it("keeps 'module' as the first word that means a bounded context", async () => {
    const [command] = await run(['add', 'module', 'billing', '--consumes', 'greeting', '--yes']);
    expect(command).toMatchObject({
      kind: 'keel.add-module',
      module: 'billing',
      consumes: 'greeting',
    });
  });

  it('refuses a second context name, and --refresh on a context, before dispatching', async () => {
    await expect(run(['add', 'module', 'billing', 'shipping'])).rejects.toThrow(/one name/);
    await expect(run(['add', 'module', 'billing', '--refresh', 'ci'])).rejects.toThrow(
      /--refresh applies to verticals/,
    );
  });
});

describe('keel add, of what is there already', () => {
  it('returns — exit code 0 — printing the note that says why nothing changed', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-add-'));
    try {
      const logger = new FakeLogger();
      const mediator = installMediator({
        logger,
        processes: new FakeProcessRunner(),
        runDeferred: async () => {},
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'go-cli',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      await buildProgram({
        mediator,
        logger,
        version: 'test',
        availableStacks: [],
        availableVerticals: [],
        cwd: () => cwd,
        serveUi: () => {
          throw new Error('unexpected UI start');
        },
      }).parseAsync(['add', 'vcs', '--yes'], { from: 'user' });
      expect(logger.messages('info')).toContain(
        "  note: Version control is already installed; 'keel add vcs --reapply' re-renders it",
      );
      expect(logger.messages('success')).toContain('keel add vcs: ready');
    } finally {
      await fs.remove(cwd);
    }
  });
});
