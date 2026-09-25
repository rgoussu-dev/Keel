/**
 * `keel new` in a directory that already holds `README.md` and
 * `.gitignore` — the most common first run: a repository created on a
 * hosting service with both, cloned, then scaffolded. Every family
 * adopts the two files rather than refusing them: the README keeps
 * the user's content and gains keel's below its title, the
 * `.gitignore` keeps the user's entries and gains the ones keel's
 * lacks, and every other file is the one an empty directory gets.
 * Any other file of the user's in the way is still refused, naming
 * it (`new-project.test.ts`). The composition grid holds the seeded
 * `keel new` cell Ok on every stack; this holds what lands on disk,
 * one stack per family that writes the two files, and what a later
 * `--reapply` makes of them: of the walking skeleton, and on a CRLF
 * README of every vertical that writes a section into it.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  newProjectCommand,
  type PresetAnswers,
} from '../../../../src/domain/contract/commands.js';
import { MIGRATIONS_TOOL_QUESTION } from '../../../../src/domain/core/adapters/migrations-tool.js';
import { PERSISTENCE_DIALS_ID } from '../../../../src/domain/core/adapters/persistence-engine.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const USER_README = '# my-repo\n\nWhat this repository is for.\n';
const USER_GITIGNORE = '# mine\n.env\n*.log\n';

const LIQUIBASE: PresetAnswers = {
  [PERSISTENCE_DIALS_ID]: { [MIGRATIONS_TOOL_QUESTION.id]: 'liquibase' },
};

/**
 * The CRLF cells: a scaffold whose README sections come from every
 * writer of one — both entrypoints, observability and monitoring, the
 * dev environment and container, persistence under Flyway and under
 * Liquibase, the toolchain — and the verticals a reapply re-renders
 * beside its extras.
 */
const CRLF_CELLS: readonly {
  readonly stack: string;
  readonly extras: readonly string[];
  readonly answers: PresetAnswers;
  readonly reapplied: readonly string[];
}[] = [
  ...['go-cli-http', 'rust-cli-http', 'quarkus-cli-rest', 'ts-cli-http'].map((stack) => ({
    stack,
    extras: ['persistence', 'toolchain'],
    answers: {},
    reapplied: ['walking-skeleton', 'observability', 'dev-env', 'dev-container'],
  })),
  { stack: 'go-cli-http', extras: ['persistence'], answers: LIQUIBASE, reapplied: [] },
  {
    stack: 'go-cli',
    extras: ['dev-env', 'toolchain'],
    answers: {},
    reapplied: ['walking-skeleton', 'dev-container'],
  },
];

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.remove(directory)));
});

const mediator = () => installMediator({ runDeferred: async () => {} });

/** Runs `keel new --stack=<stack> --with <extras>` in a new directory holding `seeded`, and returns it. */
async function scaffoldIn(
  stack: string,
  seeded: Readonly<Record<string, string>>,
  extras: readonly string[] = [],
  answers: PresetAnswers = {},
): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-adoption-'));
  directories.push(cwd);
  for (const [file, content] of Object.entries(seeded)) {
    await fs.outputFile(path.join(cwd, file), content);
  }
  expectOk(
    await mediator().dispatch(
      newProjectCommand({
        cwd,
        stack,
        extraVerticals: extras,
        answers,
        interactive: false,
        dryRun: false,
      }),
    ),
  );
  return cwd;
}

/** Every file `keel new --stack=<stack>` leaves in a directory holding `seeded`, by path. */
async function scaffold(
  stack: string,
  seeded: Readonly<Record<string, string>>,
): Promise<Record<string, string>> {
  return read(await scaffoldIn(stack, seeded));
}

async function read(root: string, directory = root): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const at = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await read(root, at));
    else files[path.relative(root, at).split(path.sep).join('/')] = await fs.readFile(at, 'utf8');
  }
  return files;
}

const entriesOf = (gitignore: string): readonly string[] =>
  gitignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

const withoutTitle = (readme: string): string => readme.replace(/^#[^\n]*\n+/, '');

describe('keel new in a directory holding README.md and .gitignore', () => {
  it.each([
    'go-cli-http',
    'rust-cli',
    'web-components',
    'quarkus-cli-rest',
    'ts-cli-http',
    'fullstack-go',
  ])(
    '%s keeps both, adds its own part to each, and writes every other file as it would',
    async (stack) => {
      const fresh = await scaffold(stack, {});
      const adopted = await scaffold(stack, {
        'README.md': USER_README,
        '.gitignore': USER_GITIGNORE,
      });

      // The user's README, then keel's below its title — the entrypoints'
      // sections included, as they follow it in a fresh project.
      expect(adopted['README.md']).toBe(`${USER_README}\n${withoutTitle(fresh['README.md']!)}`);

      // The user's .gitignore, then keel's entries it lacked — each once.
      const gitignore = adopted['.gitignore']!;
      expect(gitignore.startsWith(`${USER_GITIGNORE}\n`)).toBe(true);
      const entries = entriesOf(gitignore);
      expect(entries).toEqual([...new Set(entries)]);
      expect(entries).toEqual(expect.arrayContaining([...entriesOf(fresh['.gitignore']!)]));
      const added = entriesOf(gitignore.slice(USER_GITIGNORE.length));
      expect(entriesOf(fresh['.gitignore']!)).toEqual(expect.arrayContaining([...added]));

      const rest = (files: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(files).filter(([file]) => file !== 'README.md' && file !== '.gitignore'),
        );
      expect(rest(adopted)).toEqual(rest(fresh));
    },
  );

  it('adds keel’s entries in its own groups, under its own comments', async () => {
    const adopted = await scaffold('go-cli', {
      '.gitignore': '# mine\n.env\n*.test\n',
    });
    expect(adopted['.gitignore']).toBe(
      '# mine\n.env\n*.test\n\n# build output\n/bin/\n\n# test artifacts\ncover.out\n',
    );
  });

  it('adopts the README inside a product’s service as it does at the root', async () => {
    const fresh = await scaffold('fullstack-go', {});
    const adopted = await scaffold('fullstack-go', { 'backend/README.md': USER_README });
    expect(adopted['backend/README.md']).toBe(
      `${USER_README}\n${withoutTitle(fresh['backend/README.md']!)}`,
    );
    expect(adopted['README.md']).toBe(fresh['README.md']);
  });

  it.each(
    CRLF_CELLS.map((cell) => {
      const liquibase = cell.answers === LIQUIBASE ? ' (liquibase)' : '';
      return [`${cell.stack} --with ${cell.extras.join(',')}${liquibase}`, cell] as const;
    }),
  )(
    '%s adopts a CRLF README in its line endings, and --reapply finds nothing to add',
    async (_, { stack, extras, answers, reapplied }) => {
      // A README cloned on Windows under `core.autocrlf`: the
      // adoption and every section keep its CRLF, and each section's
      // marker is found again in them, so a reapply of every vertical
      // that wrote one neither appends a second copy nor refuses as a
      // divergence. The monitoring stack's guard once looked for its
      // marker in LF alone, and a reapply of observability added its
      // section twice.
      const cwd = await scaffoldIn(
        stack,
        { 'README.md': USER_README.replace(/\n/g, '\r\n') },
        extras,
        answers,
      );
      const readme = await fs.readFile(path.join(cwd, 'README.md'), 'utf8');
      expect(readme.startsWith(USER_README.replace(/\n/g, '\r\n'))).toBe(true);
      expect(readme).not.toMatch(/[^\r]\n/);

      const report = expectOk(
        await mediator().dispatch(
          addVerticalCommand({
            cwd,
            verticals: [...reapplied, ...extras],
            answers: {},
            interactive: false,
            dryRun: false,
            reapply: true,
          }),
        ),
      );
      expect(await fs.readFile(path.join(cwd, 'README.md'), 'utf8')).toBe(readme);
      expect(report.changes.map((change) => change.path)).not.toContain('README.md');
    },
  );

  it('keeps both the user’s under --reapply, adding back only keel’s missing entries', async () => {
    const cwd = await scaffoldIn('go-cli', { 'README.md': USER_README });
    const file = (name: string) => path.join(cwd, name);
    const readme = `${await fs.readFile(file('README.md'), 'utf8')}\nMy own notes.\n`;
    await fs.writeFile(file('README.md'), readme.replace('Go walking skeleton', 'Our Go service'));
    await fs.writeFile(file('.gitignore'), '# build output\n\n*.test\ncover.out\n.env\n');

    const report = expectOk(
      await mediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['walking-skeleton'],
          answers: {},
          interactive: false,
          dryRun: false,
          reapply: true,
        }),
      ),
    );

    // The README has keel's sections, edited or not: nothing to add.
    expect(await fs.readFile(file('README.md'), 'utf8')).toBe(
      readme.replace('Go walking skeleton', 'Our Go service'),
    );
    // The entry the user dropped comes back; the one they added stays.
    expect(await fs.readFile(file('.gitignore'), 'utf8')).toBe(
      '# build output\n\n*.test\ncover.out\n.env\n\n# build output\n/bin/\n',
    );
    expect(report.changes.filter((change) => /README|gitignore/.test(change.path))).toEqual([
      expect.objectContaining({ path: '.gitignore', kind: 'modify' }),
    ]);
  });
});
