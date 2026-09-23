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
import { buildProgram } from '../../../src/application/cli/contract/program.js';
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

/** The `e.g. '…'` example in `keel new --with`'s help line. */
function helpExample(): string {
  const command = program(new FakeLogger()).commands.find((c) => c.name() === 'new');
  const description = command?.options.find((o) => o.long === '--with')?.description ?? '';
  const example = /e\.g\. '([^']+)'/.exec(description)?.[1];
  if (example === undefined) throw new Error(`no example in --with help: ${description}`);
  return example;
}

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

  it('is the example docs/cli.md shows for the flag', async () => {
    const page = await fs.readFile(path.resolve('docs/cli.md'), 'utf8');
    const row = page.split('\n').find((line) => line.startsWith('| `--with <ids>`'));
    expect(row).toContain(`\`--with ${helpExample()}\``);
  });
});
