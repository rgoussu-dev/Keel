/**
 * The rank rule at its writers (`src/domain/core/rank.ts`): a README
 * section that arrives in a later run — a `keel add`, or a `--reapply`
 * putting back one the user deleted — lands where one run puts it.
 * `rank.test.ts` holds the rule on README text alone, and
 * `shared-files.golden.test.ts` holds it to moving no scaffold, where
 * the rule and an append write the same bytes; this holds each writer
 * to going through it, where they do not.
 *
 * **Scenario.** Two kinds of cell, one preset per family among them:
 *
 * - {@link GROWN}: `keel new --with <first>`, then `keel add <then>`,
 *   whose section one run puts above one `<first>` wrote, against
 *   `keel new --with <first>,<then>` in one run;
 * - {@link RESTORED}: a scaffold, on the dials it names, whose sections
 *   under `deleted` the user took out, then
 *   `keel add <verticals> --reapply`, against the scaffold as it was.
 *
 * **Factory.** {@link installMediator} over the real templates and
 * filesystem, with a fake process runner and no deferred action — the
 * composition grid's wiring. Every run is real, so the next command
 * has a project on disk.
 *
 * **Port.** `Mediator.dispatch`; each cell compares the `README.md`
 * the two paths leave, byte for byte.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  newProjectCommand,
  type NewProjectCommand,
  type PresetAnswers,
} from '../../../src/domain/contract/commands.js';
import { MIGRATIONS_TOOL_QUESTION } from '../../../src/domain/core/adapters/migrations-tool.js';
import { PERSISTENCE_DIALS_ID } from '../../../src/domain/core/adapters/persistence-engine.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { expectOk, installMediator } from '../../support/factory.js';

/** A project grown over two runs, against the same extras in one. */
interface Grown {
  readonly stack: string;
  /** The extras `keel new` installs. */
  readonly first: readonly string[];
  /** The vertical `keel add` installs afterwards. */
  readonly then: string;
  /** Sent with the run that installs {@link then}. */
  readonly answers?: PresetAnswers;
}

/** A scaffold whose sections under `deleted` are put back by a reapply. */
interface Restored {
  readonly stack: string;
  /** The extras `keel new` installs. */
  readonly with: readonly string[];
  /** The build system and module layout `keel new` is sent; the preset's own when absent. */
  readonly dials?: Pick<NewProjectCommand, 'buildSystem' | 'moduleLayout'>;
  /** The `### ` headings whose sections the user deletes. */
  readonly deleted: readonly string[];
  /** The verticals `keel add --reapply` re-renders. */
  readonly verticals: readonly string[];
}

const LIQUIBASE: PresetAnswers = {
  [PERSISTENCE_DIALS_ID]: { [MIGRATIONS_TOOL_QUESTION.id]: 'liquibase' },
};

/**
 * Persistence's `### Database` and `### Persistence` land above an
 * existing `### Toolchain`, on each family's writers; the dev
 * environment below a CLI's or an SPA's dev container and above its
 * toolchain.
 */
const GROWN: readonly Grown[] = [
  { stack: 'quarkus-rest', first: ['toolchain'], then: 'persistence' },
  { stack: 'go-http', first: ['toolchain'], then: 'persistence' },
  { stack: 'go-http', first: ['toolchain'], then: 'persistence', answers: LIQUIBASE },
  { stack: 'rust-http', first: ['toolchain'], then: 'persistence' },
  { stack: 'ts-http', first: ['toolchain'], then: 'persistence' },
  { stack: 'go-cli', first: ['toolchain'], then: 'dev-env' },
  { stack: 'web-components', first: ['toolchain'], then: 'dev-env' },
];

/**
 * Both entrypoints' sections back above the dev environment's, in
 * their order — on the JVM under each build system and layout, whose
 * roots add them apart — the observability and monitoring sections
 * back above the dev container on each family, the dev environment's
 * back above an HTTP project's dev container with neither monitoring
 * section between them yet (it reapplies first), and the dev
 * container's back at the rank the tags give it: above persistence on
 * HTTP, above the dev environment on a CLI.
 */
const RESTORED: readonly Restored[] = [
  ...[
    {},
    { buildSystem: 'maven' },
    { moduleLayout: 'modulith' },
    { buildSystem: 'maven', moduleLayout: 'modulith' },
  ].map((dials) => ({
    stack: 'quarkus-cli-rest',
    with: [],
    dials,
    deleted: ['cli', 'rest'],
    verticals: ['walking-skeleton'],
  })),
  { stack: 'go-cli-http', with: [], deleted: ['cli', 'http'], verticals: ['walking-skeleton'] },
  { stack: 'rust-cli-http', with: [], deleted: ['cli', 'http'], verticals: ['walking-skeleton'] },
  { stack: 'ts-cli-http', with: [], deleted: ['cli', 'rest'], verticals: ['walking-skeleton'] },
  ...['quarkus-rest', 'go-http', 'rust-http', 'ts-http'].map((stack) => ({
    stack,
    with: ['toolchain'],
    deleted: ['Observability', 'Monitoring stack'],
    verticals: ['observability'],
  })),
  {
    stack: 'go-http',
    with: ['toolchain'],
    deleted: ['Dev environment', 'Observability', 'Monitoring stack'],
    verticals: ['dev-env', 'observability'],
  },
  {
    stack: 'go-http',
    with: ['persistence', 'toolchain'],
    deleted: ['Dev container'],
    verticals: ['dev-container'],
  },
  { stack: 'go-cli', with: ['dev-env'], deleted: ['Dev container'], verticals: ['dev-container'] },
];

const mediator = installMediator({
  processes: new FakeProcessRunner(),
  runDeferred: async () => {},
});

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.remove(directory)));
});

describe('a README section arriving in a later run', () => {
  it.each(GROWN.map((cell) => [label(cell), cell] as const))(
    'lands where one run puts it: %s',
    async (_, { stack, first, then, answers = {} }) => {
      const oneRun = await scaffold(stack, [...first, then], answers);
      const grown = await scaffold(stack, first);
      await add(grown, [then], { answers });
      expect(await readme(grown)).toBe(await readme(oneRun));
    },
  );

  it.each(RESTORED.map((cell) => [label(cell), cell] as const))(
    'goes back in its place under --reapply: %s',
    async (_, { stack, with: extras, dials, deleted, verticals }) => {
      const cwd = await scaffold(stack, extras, {}, dials);
      const scaffolded = await readme(cwd);
      await fs.writeFile(path.join(cwd, 'README.md'), deleted.reduce(without, scaffolded));
      await add(cwd, verticals, { reapply: true });
      expect(await readme(cwd)).toBe(scaffolded);
    },
  );
});

function label(cell: Grown | Restored): string {
  if ('then' in cell) {
    const set = cell.answers === undefined ? '' : ' (liquibase)';
    return `${cell.stack} --with ${cell.first.join(',')}, then keel add ${cell.then}${set}`;
  }
  const extras = cell.with.length === 0 ? '' : ` --with ${cell.with.join(',')}`;
  const { buildSystem, moduleLayout } = cell.dials ?? {};
  const dials = [
    buildSystem === undefined ? '' : ` --build-system ${buildSystem}`,
    moduleLayout === undefined ? '' : ` --module-layout ${moduleLayout}`,
  ].join('');
  return `${cell.stack}${dials}${extras}, ### ${cell.deleted.join(', ### ')} deleted, keel add ${cell.verticals.join(' ')}`;
}

/** Runs `keel new --stack <stack> --with <extras>` in a new directory, and returns it. */
async function scaffold(
  stack: string,
  extras: readonly string[],
  answers: PresetAnswers = {},
  dials: Restored['dials'] = {},
): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-rank-arrival-'));
  directories.push(cwd);
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        ...dials,
        extraVerticals: extras,
        answers,
        interactive: false,
        dryRun: false,
      }),
    ),
  );
  return cwd;
}

async function add(
  cwd: string,
  verticals: readonly string[],
  options: { readonly answers?: PresetAnswers; readonly reapply?: boolean },
): Promise<void> {
  expectOk(
    await mediator.dispatch(
      addVerticalCommand({
        cwd,
        verticals,
        answers: options.answers ?? {},
        interactive: false,
        dryRun: false,
        ...(options.reapply === true ? { reapply: true } : {}),
      }),
    ),
  );
}

async function readme(cwd: string): Promise<string> {
  return fs.readFile(path.join(cwd, 'README.md'), 'utf8');
}

/** `readme` with the section under `### <heading>` taken out, as a user deletes it. */
function without(readme: string, heading: string): string {
  const start = readme.indexOf(`\n### ${heading}\n`);
  if (start === -1) throw new Error(`no '### ${heading}' section to delete`);
  const next = readme.indexOf('\n### ', start + 1);
  return `${readme.slice(0, start)}${next === -1 ? '' : readme.slice(next)}`;
}
