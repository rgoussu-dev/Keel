/**
 * `keel add`'s grammar, through the real commander program over a
 * recording Mediator: what a command line becomes.
 *
 * The engine's answers are the handler suites' subject; this is the
 * CLI half of the contract — that `keel add a b` is **one** dispatch
 * naming both, so the planner sees the set whole (a second dispatch
 * would install `a` before anyone asked what `b` needs), that
 * `--refresh` travels as a list, and that `module` and `entrypoint`
 * stay reserved first words. And what a run that has nothing to do
 * exits with: the executable turns a thrown error into exit code 1,
 * so an add of what is already there — an empty plan, over the real
 * engine — must return, printing why. And that `keel add --list` is
 * the project's status — one dispatch of `keel.project-status` —
 * printed as what each add would do, so the list and the command
 * cannot disagree. And that a re-render refused at a product root
 * sends the user only where one runs.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import type { Vertical } from '../../../src/domain/contract/composition.js';
import {
  addVerticalCommand,
  newProjectCommand,
  type InstallReport,
} from '../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  projectScopeRoot,
} from '../../../src/domain/contract/manifest.js';
import { projectStatusQuery } from '../../../src/domain/contract/queries.js';
import { pluginOrigin, registryOf } from '../../../src/domain/core/registry.js';
import type { Action } from '../../../src/domain/kernel/action.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { ok, type Result } from '../../../src/domain/kernel/result.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { expectErr, expectOk, installMediator } from '../../support/factory.js';

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

  it('takes a comma list as --with and --refresh do', async () => {
    const [command] = await run(['add', 'ci,persistence', 'iac', '--yes']);
    expect(command).toMatchObject({ verticals: ['ci', 'persistence', 'iac'] });
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

describe('keel add entrypoint, as a command line', () => {
  it("keeps 'entrypoint' as the first word that means an entrypoint, the word after it the domain's", async () => {
    const dispatched = await run(['add', 'entrypoint', 'http', '--yes', '--dry-run']);
    expect(dispatched).toEqual([
      {
        kind: 'keel.add-entrypoint',
        intent: 'command',
        cwd: '/tmp/demo',
        entrypoint: 'http',
        answers: {},
        interactive: false,
        dryRun: true,
      },
    ]);
  });

  it('carries --set answers as any add does', async () => {
    const [command] = await run([
      'add',
      'entrypoint',
      'http',
      '--set',
      'observability/monitoring-compose:stack=lgtm',
    ]);
    expect(command).toMatchObject({
      answers: { 'observability/monitoring-compose': { stack: 'lgtm' } },
      interactive: true,
    });
  });

  it.each([
    [['add', 'entrypoint'], /missing entrypoint/],
    [['add', 'entrypoint', 'cli', 'http'], /takes one entrypoint, got 2: cli http/],
    [['add', 'entrypoint', 'http', '--reapply'], /--reapply applies to verticals/],
    [['add', 'entrypoint', 'http', '--refresh', 'ci'], /--refresh applies to verticals/],
    [
      ['add', 'entrypoint', 'http', '--consumes', 'greeting'],
      /--consumes applies to 'keel add module'/,
    ],
  ])('refuses %j before dispatching', async (args, message) => {
    const mediator = new RecordingMediator();
    await expect(
      buildProgram({
        mediator,
        logger: new FakeLogger(),
        version: 'test',
        availableStacks: [],
        availableVerticals: [],
        cwd: () => '/tmp/demo',
        serveUi: () => {
          throw new Error('unexpected UI start');
        },
      }).parseAsync([...args], { from: 'user' }),
    ).rejects.toThrow(message);
    expect(mediator.dispatched).toEqual([]);
  });

  it('names the third form where the target is missing, and in its help', async () => {
    await expect(run(['add'])).rejects.toThrow(/'entrypoint <cli\|http>'/);
    const add = buildProgram({
      mediator: new RecordingMediator(),
      logger: new FakeLogger(),
      version: 'test',
      availableStacks: [],
      availableVerticals: [],
      cwd: () => '/tmp/demo',
      serveUi: () => {
        throw new Error('unexpected UI start');
      },
    }).commands.find((command) => command.name() === 'add');
    expect(add?.description()).toContain(
      "the entrypoint a project lacks with 'keel add entrypoint <cli|http>'",
    );
  });
});

describe('keel add --list', () => {
  it('is one status dispatch for the directory it runs in, and nothing else', async () => {
    const dispatched = await run(['add', '--list']);
    expect(dispatched).toEqual([projectStatusQuery({ cwd: '/tmp/demo' })]);
  });

  it('prints what keel add would do with each vertical here, refusals in their own words', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-list-'));
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
      const list = async (): Promise<readonly string[]> => {
        logger.entries.length = 0;
        await program(mediator, logger, cwd).parseAsync(['add', '--list'], { from: 'user' });
        return logger.messages('info');
      };
      const printed = await list();
      const heading = (text: string): number => printed.indexOf(text);
      expect(heading('Ready to add here:')).toBeGreaterThanOrEqual(0);
      expect(heading('Not for this project:')).toBeGreaterThan(heading('Ready to add here:'));
      const line = (id: string): string | undefined =>
        printed.find((entry) => entry.trimStart().startsWith(`${id} `));
      expect(line('ci')).toContain('Continuous integration');
      expect(line('observability')).toContain(
        'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
      );
      expect(printed.at(-1)).toMatch(/^Installed: .*vcs.*--reapply' re-renders one$/);
      expect(logger.messages('warn')).toEqual([]);

      // A harness from another generation stops every add but the
      // harness's own: said once, first, not on every line.
      const file = path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);
      const { harnessGeneration: _dropped, ...unmarked } = JSON.parse(
        await fs.readFile(file, 'utf8'),
      ) as Record<string, unknown>;
      await fs.writeFile(file, JSON.stringify(unmarked));
      expect(await list()).toContain('Ready to add here:');
      expect(logger.messages('warn')).toEqual([
        `this project's harness carries no generation marker, and this keel writes generation ${String(HARNESS_GENERATION)} — 'keel add' refuses everything but 'keel add agent-harness' until the harness is brought forward; any other 'keel add' says how`,
      ]);
    } finally {
      await fs.remove(cwd);
    }
  });

  it('lists a vertical two sets of prerequisites tie on with what needs something first', async () => {
    // A plugin's session store, which either of two caches serves: the
    // add refuses it until one is named, because the choice is the
    // user's — which makes it a vertical for this project that needs
    // something first, not one this project cannot carry.
    const cache = (id: string): Vertical => ({
      id,
      title: id === 'redis-cache' ? 'Redis' : 'Memcached',
      description: 'A cache.',
      dimensions: ['cache'],
      promotes: ['acme.cache'],
      adapters: [
        {
          id: `${id}/main`,
          vertical: id,
          covers: ['cache'],
          predicate: { requires: ['lang.acme'] },
          contribute: () => ({
            files: [{ path: `${id}.txt`, content: 'cache\n' }],
            tagsAdd: ['acme.cache'],
          }),
        },
      ],
    });
    const session: Vertical = {
      id: 'acme-session',
      title: 'Session store',
      description: 'Sessions kept in the cache.',
      dimensions: ['session'],
      adapters: [
        {
          id: 'acme-session/main',
          vertical: 'acme-session',
          covers: ['session'],
          predicate: { requires: ['acme.cache'] },
          contribute: () => ({ files: [{ path: 'session.txt', content: 'session\n' }] }),
        },
      ],
    };
    const base: Vertical = {
      id: 'acme-base',
      title: 'Base',
      description: 'The build.',
      dimensions: ['base'],
      adapters: [
        {
          id: 'acme-base/main',
          vertical: 'acme-base',
          covers: ['base'],
          predicate: { requires: ['lang.acme'] },
          contribute: () => ({ files: [{ path: 'base.txt', content: 'base\n' }] }),
        },
      ],
    };
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-list-'));
    try {
      const logger = new FakeLogger();
      const mediator = installMediator({
        logger,
        runDeferred: async () => {},
        registry: registryOf([
          {
            origin: pluginOrigin('acme'),
            verticals: [base, cache('redis-cache'), cache('memcached-cache'), session],
            stacks: [
              { id: 'acme', description: 'A build', tags: ['lang.acme'], verticals: [base] },
            ],
          },
        ]),
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({ cwd, stack: 'acme', answers: {}, interactive: false, dryRun: false }),
        ),
      );
      const refused = expectErr(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['acme-session'],
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        ),
      );
      const status = expectOk(await mediator.dispatch(projectStatusQuery({ cwd })));
      expect(status.available.find((v) => v.id === 'acme-session')).toMatchObject({
        readiness: 'needs',
        requires: [],
        refusal: { code: refused.code, message: refused.message },
      });

      await program(mediator, logger, cwd).parseAsync(['add', '--list'], { from: 'user' });
      expect(logger.messages('info')).toEqual([
        'Ready to add here:',
        '  memcached-cache  Memcached — A cache.',
        '  redis-cache      Redis — A cache.',
        'Ready, with what each needs installed first:',
        `  acme-session     ${refused.message}`,
        "Installed: acme-base — 'keel add <id> --reapply' re-renders one",
      ]);
    } finally {
      await fs.remove(cwd);
    }
  });

  it('lists apart what a product root installed, what it does not re-render, and what its services have', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-list-'));
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
            stack: 'fullstack-ts',
            answers: {},
            interactive: false,
            dryRun: false,
            layout: 'monorepo',
          }),
        ),
      );
      await program(mediator, logger, cwd).parseAsync(['add', '--list'], { from: 'user' });
      const printed = logger.messages('info');
      expect(printed.at(-2)).toBe("Installed: vcs — 'keel add <id> --reapply' re-renders one");
      expect(printed.at(-1)).toBe("Also installed, which 'keel add' does not re-render: fullstack");
      // What its services have is no refusal of the root's, and nothing
      // it installed: said apart, in the note the add answers with.
      const there = printed.indexOf('In its services, nothing to add:');
      expect(there).toBeGreaterThan(printed.indexOf('Not for this project:'));
      expect(printed).toContain(
        '  code-style        Code style is already there: backend/ and frontend/ have it',
      );
      expect(printed.slice(printed.indexOf('Not for this project:'), there).join('\n')).not.toMatch(
        /code-style|containerization|agent-harness/,
      );

      // One directory down, a service: what the product gives it is
      // said apart, each with where it comes from.
      logger.entries.length = 0;
      await program(mediator, logger, path.join(cwd, 'backend')).parseAsync(['add', '--list'], {
        from: 'user',
      });
      const service = logger.messages('info');
      const from = service.indexOf('From the product, nothing to add:');
      expect(from).toBeGreaterThan(service.indexOf('Not for this project:'));
      expect(service.slice(from + 1, from + 3)).toEqual([
        '  containerization  Container image is already there: the product root builds it for this service',
        '  vcs               Version control is already there: the product root has it, for the one repository its services share',
      ]);

      // A product root from another harness generation: no `keel add`
      // brings its harness forward, and the line says so — and what
      // the refusals there say: one not for the root as the list says,
      // one it or its services have already as nothing to run, any
      // other naming the pin.
      const file = path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);
      const { harnessGeneration: _dropped, ...unmarked } = JSON.parse(
        await fs.readFile(file, 'utf8'),
      ) as Record<string, unknown>;
      await fs.writeFile(file, JSON.stringify(unmarked));
      logger.entries.length = 0;
      await program(mediator, logger, cwd).parseAsync(['add', '--list'], { from: 'user' });
      expect(logger.messages('warn')).toEqual([
        `this product root's harness carries no generation marker, and this keel writes generation ${String(HARNESS_GENERATION)} — no 'keel add' brings a product root's harness forward, and 'keel add' refuses everything here: what is not for this root as it says below, what it or its services have already as nothing to run, and anything else naming the keel that scaffolded it, to pin`,
      ]);
      const refusal = async (vertical: string) =>
        expectErr(
          await mediator.dispatch(
            addVerticalCommand({
              cwd,
              verticals: [vertical],
              answers: {},
              interactive: false,
              dryRun: true,
            }),
          ),
        );
      const theirs = await refusal('agent-harness');
      expect(theirs.message).toContain("no 'keel add' brings it forward");
      expect(theirs.message).toContain("its services have what 'keel add agent-harness' names");
      expect((await refusal('vcs')).message).toContain(
        "this root has what 'keel add vcs' names already, so there is nothing to run here",
      );
      expect((await refusal('dev-env')).message).toContain('pin keel@0.4.0-alpha');
      const notHere = await refusal('persistence');
      expect(notHere.code).toBe('keel.wrong-scope');
      const row = logger.messages('info').find((line) => /^ {2}persistence /.test(line));
      expect(row?.replace(/^ {2}persistence +/, '')).toBe(notHere.message);
    } finally {
      await fs.remove(cwd);
    }
  });

  it('prints the plain list where there is no project to ask about', async () => {
    const logger = new FakeLogger();
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-list-'));
    try {
      await buildProgram({
        mediator: installMediator({ logger }),
        logger,
        version: 'test',
        availableStacks: [],
        availableVerticals: [{ id: 'ci', description: 'Continuous integration.' }],
        cwd: () => cwd,
        serveUi: () => {
          throw new Error('unexpected UI start');
        },
      }).parseAsync(['add', '--list'], { from: 'user' });
      expect(logger.messages('info')).toEqual([
        'Available verticals:',
        '  ci  Continuous integration.',
      ]);
    } finally {
      await fs.remove(cwd);
    }
  });
});

/** The real program over `mediator`, run in `cwd`. */
function program(mediator: Mediator, logger: FakeLogger, cwd: string) {
  return buildProgram({
    mediator,
    logger,
    version: 'test',
    availableStacks: [],
    availableVerticals: [],
    cwd: () => cwd,
    serveUi: () => {
      throw new Error('unexpected UI start');
    },
  });
}

describe('keel add --reapply, at a product root', () => {
  /** The message `run` is refused with at the command line. */
  const refusedWith = async (run: Promise<unknown>): Promise<string> => {
    try {
      await run;
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error('expected the command line to be refused');
  };

  it('sends a re-render of what its services installed into each, and names none for the image the root builds', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-reapply-'));
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
            stack: 'fullstack',
            answers: {},
            interactive: false,
            dryRun: false,
            layout: 'monorepo',
          }),
        ),
      );
      const keel = (dir: string, args: readonly string[]) =>
        program(mediator, logger, dir).parseAsync([...args, '--yes', '--dry-run'], {
          from: 'user',
        });

      // Each re-render the hint names is one that runs.
      const style = await refusedWith(keel(cwd, ['add', 'code-style', '--reapply']));
      const [, hint = ''] = style.split('\n  hint: ');
      expect(hint).toBe(
        "'cd backend && keel add code-style --reapply' or 'cd frontend && keel add code-style --reapply'",
      );
      const hinted = [...hint.matchAll(/'cd (\S+) && keel ([^']+)'/g)];
      expect(hinted).toHaveLength(2);
      for (const [, dir = '', args = ''] of hinted) {
        await expect(keel(path.join(cwd, dir), args.split(' '))).resolves.toBeDefined();
      }

      // The image the root builds for them has no re-render to name,
      // at the root or in a service.
      expect(await refusedWith(keel(cwd, ['add', 'containerization', '--reapply']))).toBe(
        'Container image is not installed at the product root, which builds it for backend/ and frontend/: nothing to re-render here',
      );
      expect(
        await refusedWith(
          keel(path.join(cwd, 'backend'), ['add', 'containerization', '--reapply']),
        ),
      ).toBe(
        'Container image is not installed in this service — the product root builds it for this service: nothing to reapply here',
      );
    } finally {
      await fs.remove(cwd);
    }
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
