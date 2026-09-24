/**
 * `keel add`'s grammar, through the real commander program over a
 * recording Mediator: what a command line becomes.
 *
 * The engine's answers are the handler suites' subject; this is the
 * CLI half of the contract — that `keel add a b` is **one** dispatch
 * naming both, so the planner sees the set whole (a second dispatch
 * would install `a` before anyone asked what `b` needs), that
 * `--refresh` travels as a list, and that `module` stays a reserved
 * first word.
 */

import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import type { InstallReport } from '../../../src/domain/contract/commands.js';
import type { Action } from '../../../src/domain/kernel/action.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { ok, type Result } from '../../../src/domain/kernel/result.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';

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
