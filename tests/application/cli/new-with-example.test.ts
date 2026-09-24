/**
 * The `--with` example `keel new --help` prints, run as written.
 *
 * An example is the one line of help a reader copies without
 * thinking, so it has to work. It did not: `persistence,iac` in the
 * help and `distribution,iac` in `docs/cli.md` fail on every shipped
 * stack, and `distribution,ci` in `docs/cli.md` on every one but the
 * two Quarkus CLIs — `iac` is keyed on the tag `distribution`
 * promotes, and `distribution` builds the image `containerization`
 * emits. Nothing ran them, so nothing noticed.
 *
 * This reads the example out of the real commander program, rather
 * than restating it, and plans it (`--dry-run --yes`) on the two
 * families the help is most likely read against. `docs/cli.md`'s
 * option table must show the same example, so the page and the help
 * cannot drift apart again.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProgram, parseWith } from '../../../src/application/cli/contract/program.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { installMediator } from '../../support/factory.js';

let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-with-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});

function program(logger: FakeLogger) {
  return buildProgram({
    mediator: installMediator({
      logger,
      processes: new FakeProcessRunner(),
      runDeferred: async () => {},
    }),
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

/**
 * The `e.g. '…'` examples in `keel new --with`'s help line: a single
 * stack's first, then a product's, whose ids name their service.
 */
function helpExamples(): readonly string[] {
  const command = program(new FakeLogger()).commands.find((c) => c.name() === 'new');
  const description = command?.options.find((o) => o.long === '--with')?.description ?? '';
  const examples = [...description.matchAll(/e\.g\. '([^']+)'/g)].map((match) => match[1] ?? '');
  if (examples.length !== 2) throw new Error(`not two examples in --with help: ${description}`);
  return examples;
}

/** The single stack's example. */
const helpExample = (): string => helpExamples()[0] ?? '';

/** The product's example, each id named with its service. */
const productExample = (): string => helpExamples()[1] ?? '';

describe('keel new --with, the example in --help', () => {
  it.each(['quarkus-rest', 'go-http'])('plans on %s exactly as printed', async (stack) => {
    const example = helpExample();
    const logger = new FakeLogger();
    await program(logger).parseAsync(
      ['new', `--stack=${stack}`, '--with', example, '--yes', '--dry-run'],
      { from: 'user' },
    );
    expect(logger.messages('info')).toContain('dry run — nothing committed');
    expect(await fs.readdir(cwd)).toEqual([]);
  });

  it('takes the extras in any order, and says the order it installs them in', async () => {
    const logger = new FakeLogger();
    await program(logger).parseAsync(
      [
        'new',
        '--stack=quarkus-rest',
        '--with',
        'iac,distribution,containerization',
        '--yes',
        '--dry-run',
      ],
      { from: 'user' },
    );
    expect(logger.messages('info')).toContain(
      '  note: installed in dependency order: containerization, distribution, iac',
    );
  });

  it.each(['monorepo', 'polyrepo'])(
    'plans the product example on fullstack exactly as printed (%s)',
    async (layout) => {
      const logger = new FakeLogger();
      await program(logger).parseAsync(
        [
          'new',
          '--stack=fullstack',
          `--layout=${layout}`,
          '--with',
          productExample(),
          '--yes',
          '--dry-run',
        ],
        { from: 'user' },
      );
      expect(logger.messages('info')).toContain('dry run — nothing committed');
      expect(await fs.readdir(cwd)).toEqual([]);
    },
  );

  it('are the examples docs/cli.md shows for the flag', async () => {
    const page = await fs.readFile(path.resolve('docs/cli.md'), 'utf8');
    const row = page.split('\n').find((line) => line.startsWith('| `--with <ids>`'));
    expect(row).toContain(`\`--with ${helpExample()}\``);
    expect(row).toContain(`\`--with ${productExample()}\``);
  });
});

describe('keel new --with, read into the command', () => {
  it('takes bare ids as the extras and path:id pairs as each service’s', () => {
    expect(parseWith('persistence, ci')).toEqual({ extraVerticals: ['persistence', 'ci'] });
    expect(parseWith('')).toEqual({ extraVerticals: [] });
    expect(parseWith('backend:persistence,frontend:dev-env,backend:toolchain')).toEqual({
      services: {
        backend: { extraVerticals: ['persistence', 'toolchain'] },
        frontend: { extraVerticals: ['dev-env'] },
      },
    });
    // A service named with nothing for it names none, and the two
    // forms together are passed on for `keel new` to refuse.
    expect(parseWith('backend:')).toEqual({ services: { backend: { extraVerticals: [] } } });
    expect(parseWith('ci,backend:persistence')).toEqual({
      extraVerticals: ['ci'],
      services: { backend: { extraVerticals: ['persistence'] } },
    });
  });

  it('refuses the two forms mixed, and a service the product does not list', async () => {
    const logger = new FakeLogger();
    const run = (withs: string) =>
      program(logger).parseAsync(
        ['new', '--stack=fullstack', '--with', withs, '--yes', '--dry-run'],
        { from: 'user' },
      );
    await expect(run('toolchain,backend:persistence')).rejects.toThrow(
      /names some verticals with a service and some without/,
    );
    await expect(run('worker:persistence')).rejects.toThrow(/has no service 'worker'/);
    // Named without a service, one two services could each take is
    // theirs to choose between, and the hint spells both.
    await expect(run('toolchain')).rejects.toThrow(
      "hint: name the service it goes in: '--with backend:toolchain' or '--with frontend:toolchain'",
    );
  });
});
