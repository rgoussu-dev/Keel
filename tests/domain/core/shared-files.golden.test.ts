/**
 * The files more than one adapter writes into, pinned byte for byte on
 * every single-service preset (`docs/roadmap.md` → R.1a): the root
 * `README.md`, `settings.gradle.kts`, `pom.xml`, `package.json`,
 * `Cargo.toml` and `.devcontainer/devcontainer.json`. Epic R moves
 * their writers from appending to a ranked place (R.1), with ranks
 * chosen to reproduce the order a scaffold already has; this golden
 * landed first, on the appending code, and R.1 leaves every cell of it
 * byte-identical. Beside them, each Rust modulith assembly's
 * `Cargo.toml` and `src/main.rs`, and each TypeScript assembly's
 * `package.json` and `src/main.ts`, which the bootstrap, observability,
 * and the peer's and each context's wiring all write into: R.3b and
 * R.3c moved that wiring into an adapter per entrypoint, and the bytes
 * it leaves were pinned on the code before each.
 *
 * **Scenario.** Cells are derived, never listed: the presets from
 * `keel.catalog`, every dial setting each offers from `keel.dials`
 * ({@link walkDials}: build system × module layout, and the peer
 * context wherever the modulith offers it), and on each setting three
 * extras sets — none, the whole menu `keel.dials` offers, and `dev-env`
 * alone wherever it is an extra rather than the preset's own. Each set
 * is snapped by `keel.dials`, so an extra comes with what it needs, in
 * the order the install runs them. Beside those, on each preset's
 * opening setting:
 *
 * - `keel add dev-env` on its scaffold wherever dev-env is an extra —
 *   every CLI and SPA preset: the brownfield path, where the dev
 *   environment arrives after the dev container;
 * - its whole menu again with {@link LIQUIBASE} chosen, wherever the
 *   preview offers it: the one writer of these files no default answer
 *   reaches;
 * - its whole menu over {@link USER_README}, a README of the user's
 *   that `keel new` adopts, with headings keel ranks its own by above
 *   keel's part.
 *
 * Those three read the opening setting alone, as the grid's I9 does.
 * Learning where Liquibase is offered takes a preview, and a preview on
 * every setting adds about a quarter to the suite's time.
 *
 * And on every modulith setting that takes a bounded context, with no
 * extras, the {@link moduleHistory} after the scaffold — `keel add module
 * orders --consumes <skeleton>`, then `shipping --consumes orders` —
 * whose contexts register themselves in the build files (roadmap R.3,
 * which splits the context adapters and holds these cells as it does).
 *
 * The agent harness is left on throughout: it writes none of these
 * files, and left out, every cell hashes the same.
 *
 * **Factory.** {@link installMediator} over the real templates and
 * filesystem, with a fake process runner and no deferred action — the
 * staged bytes, the convention the composition grid and
 * `agent-harness.golden.test.ts` pin — and its Tree factory watched, so
 * a dry run can be read back. Every cell is a dry run, read through the
 * Tree that staged it, but for the opening scaffold `keel add dev-env`
 * runs on, and a module history's scaffold and every add but its last,
 * which are written for real so the add has a project on disk to read:
 * a real run commits those same bytes, and writing a whole project to
 * disk for each cell costs the suite half as much again.
 *
 * **Port.** `Mediator.dispatch`.
 *
 * `shared-files.golden.json` holds each cell's sha256 of every one of
 * those files it writes, keyed by the command line that makes it; a
 * cell that moves fails naming the cell and the file.
 * `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate change, reviewed
 * in the diff like any other golden.
 */

import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  installCommandFor,
  type InstallReport,
  type InstallTarget,
  type NewProjectTarget,
} from '../../../src/domain/contract/commands.js';
import type { Tree } from '../../../src/domain/contract/ports/tree.js';
import {
  catalogQuery,
  dialsQuery,
  previewQuery,
  projectStatusQuery,
  type DialOptions,
} from '../../../src/domain/contract/queries.js';
import {
  MIGRATIONS_TOOL_QUESTION,
  type MigrationsTool,
} from '../../../src/domain/core/adapters/migrations-tool.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { fsTreeFactory } from '../../../src/infrastructure/tree/fs-tree.js';
import { eachStack } from '../../support/composition-grid.js';
import {
  addModuleCommandLine,
  moduleHistory,
  offeredAsExtra,
  walkDials,
} from '../../support/dial-walk.js';
import { expectOk, installMediator } from '../../support/factory.js';

/** The files R.1 ranks entries in, each at the project's root. */
const SHARED_FILES = [
  'README.md',
  'settings.gradle.kts',
  'pom.xml',
  'package.json',
  'Cargo.toml',
  '.devcontainer/devcontainer.json',
] as const;

/**
 * The files of a Rust modulith's assemblies, and of a TypeScript
 * project's, that more than one adapter writes into, whose writers R.3
 * splits per entrypoint.
 */
const ASSEMBLY_FILES = [
  'application/cli/Cargo.toml',
  'application/cli/src/main.rs',
  'application/http/Cargo.toml',
  'application/http/src/main.rs',
  'application/cli/package.json',
  'application/cli/src/main.ts',
  'application/rest/package.json',
  'application/rest/src/main.ts',
] as const;

/** The extra swept alone, and added to a scaffold. */
const DEV_ENV = 'dev-env';

/**
 * The one writer of these files that no default answer reaches:
 * Liquibase's `### Database` README section, behind persistence's
 * migrations question, whose default is Flyway. Measured on each
 * preset's opening whole menu, every other non-default choice moves
 * none of these files, or, like the SQL engine, rewords a section whose
 * writer the defaults already run.
 */
const LIQUIBASE = {
  question: MIGRATIONS_TOOL_QUESTION.id,
  choice: 'liquibase' satisfies MigrationsTool,
} as const;

/**
 * A README the directory holds before `keel new`, which adopts it: its
 * headings are ones keel ranks its own sections by, above keel's part.
 */
const USER_README = '# mine\n\n### Toolchain\n\nmine\n\n### Dev container\n\nmine\n';

const GOLDEN = new URL('./shared-files.golden.json', import.meta.url);
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

/**
 * Some seconds on their own; `verify` runs this beside the rest of the
 * suite on four cores, so the budget is far above that and far below a
 * hang.
 */
const SWEEP_TIMEOUT = 180_000;

/** Sticky answers sent with an install: adapter id → question id → value. */
type Answers = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** How a cell's last command runs, beside the commands that make it. */
interface Run {
  /** False only where a later command reads the project from disk. */
  readonly dryRun: boolean;
  /** Sent with the command; none when absent. */
  readonly answers?: Answers;
  /** Whether the directory holds {@link USER_README} first. */
  readonly seeded?: boolean;
}

/** The Trees each dispatch opens, by the directory it runs in. */
const watched = new Map<string, Tree[]>();
const mediator = installMediator({
  processes: new FakeProcessRunner(),
  runDeferred: async () => {},
  trees: (root) => {
    const tree = fsTreeFactory(root);
    watched.get(root)?.push(tree);
    return tree;
  },
});
const scratches: string[] = [];
const cells = new Map<string, Readonly<Record<string, string>>>();
let swept = false;

describe('shared files: every writer, byte for byte', () => {
  beforeAll(async () => {
    const { stacks } = expectOk(await mediator.dispatch(catalogQuery()));
    const single = stacks.filter((stack) => stack.services.length === 0);
    await eachStack(single, async (stack) => {
      const settings = await walkDials(dialsOf, [{ kind: 'new-project', stack: stack.id }]);
      for (const [index, setting] of settings.entries()) {
        const target = setting.target as NewProjectTarget;
        const menu = setting.verticals.filter(offeredAsExtra).map((vertical) => vertical.id);
        const opening = index === 0;
        // The opening scaffold `keel add dev-env` runs on is committed:
        // the add reads the project from disk.
        const brownfield = opening && menu.includes(DEV_ENV);
        const cwd = await scratch();
        await record([target], cwd, { dryRun: !brownfield });
        if (brownfield) {
          const add: InstallTarget = { kind: 'add-vertical', verticals: [DEV_ENV] };
          await record([target, add], cwd, { dryRun: true });
        }
        if (menu.length > 0) {
          const whole = await snapped(target, menu);
          const report = await record([whole], await scratch(), { dryRun: true });
          if (opening) {
            for (const answers of await liquibaseAnswers(whole, report)) {
              await record([whole], await scratch(), { dryRun: true, answers });
            }
            await record([whole], await scratch(), { dryRun: true, seeded: true });
          }
        }
        if (menu.includes(DEV_ENV)) {
          await record([await snapped(target, [DEV_ENV])], await scratch(), { dryRun: true });
        }
        if (target.moduleLayout === 'modulith') await recordHistory(target);
      }
    });
    swept = true;
  }, SWEEP_TIMEOUT);

  afterAll(async () => {
    await Promise.all(scratches.splice(0).map((directory) => fs.remove(directory)));
    if (!UPDATE || !swept) return;
    const sorted = Object.fromEntries(
      [...cells.keys()].sort().map((cell) => [cell, cells.get(cell)]),
    );
    await fs.writeFile(GOLDEN, `${JSON.stringify(sorted, null, 2)}\n`);
  });

  it('pins every cell the catalog and the dials offer, and no other', () => {
    if (UPDATE) return;
    const golden = readGolden();
    expect(
      {
        unrecorded: [...cells.keys()].filter((cell) => golden[cell] === undefined).sort(),
        gone: Object.keys(golden).filter((cell) => !cells.has(cell)),
      },
      'a new cell is recorded by KEEL_UPDATE_GOLDEN=1, and a gone one dropped',
    ).toEqual({ unrecorded: [], gone: [] });
  });

  it('writes every shared file as its golden records', () => {
    if (UPDATE) return;
    const golden = readGolden();
    const moved: string[] = [];
    for (const [cell, files] of cells) {
      const pinned = golden[cell];
      if (pinned === undefined) continue;
      for (const file of new Set([...Object.keys(pinned), ...Object.keys(files)])) {
        if (files[file] === pinned[file]) continue;
        moved.push(`${cell} — ${file}: ${pinned[file] ?? 'absent'} → ${files[file] ?? 'absent'}`);
      }
    }
    expect(moved, 'shared files that moved — R.1 and R.3 leave every one byte-identical').toEqual(
      [],
    );
  });
});

async function dialsOf(target: NewProjectTarget): Promise<DialOptions> {
  return expectOk(await mediator.dispatch(dialsQuery({ target })));
}

/** `target` naming `extras`, as `keel.dials` snaps it: their closure, in install order. */
async function snapped(
  target: NewProjectTarget,
  extras: readonly string[],
): Promise<NewProjectTarget> {
  return (await dialsOf({ ...target, extraVerticals: extras })).target as NewProjectTarget;
}

/**
 * The answers choosing {@link LIQUIBASE} on `target`, whose dry run
 * `report` is: one set where the preview offers it, and none where the
 * run asks no migrations question or the preview offers only Flyway —
 * the JVM presets, whose dev and test replay rides Flyway.
 */
async function liquibaseAnswers(
  target: NewProjectTarget,
  report: InstallReport,
): Promise<readonly Answers[]> {
  const asks = (report.resolvedAdapters ?? []).some((adapter) =>
    adapter.questions.includes(LIQUIBASE.question),
  );
  if (!asks) return [];
  const { questions } = expectOk(
    await mediator.dispatch(previewQuery({ cwd: await scratch(), target, answers: {} })),
  );
  return questions.flatMap((question) => {
    const { binding } = question;
    const offered = (question.choices ?? []).some((choice) => choice.value === LIQUIBASE.choice);
    if (binding.kind !== 'answer' || binding.question !== LIQUIBASE.question || !offered) return [];
    return [{ [binding.adapter]: { [binding.question]: LIQUIBASE.choice } }];
  });
}

/**
 * Scaffolds `target` for real and, where it takes a bounded context,
 * gives it the {@link moduleHistory}, recording the cell its last add
 * makes as a dry run — the adds before it write, so the next reads them.
 */
async function recordHistory(target: NewProjectTarget): Promise<void> {
  const cwd = await scratch();
  const run = { cwd, answers: {}, interactive: false, dryRun: false };
  expectOk(await mediator.dispatch(installCommandFor(target, run)));
  const status = expectOk(await mediator.dispatch(projectStatusQuery({ cwd })));
  const skeleton = status.modules[0]?.name;
  if (!status.canAddModule || skeleton === undefined) return;
  const history = moduleHistory(skeleton);
  for (const [index, add] of history.entries()) {
    if (index === history.length - 1) {
      await record([target, ...history.slice(0, index), add], cwd, { dryRun: true });
    } else {
      expectOk(await mediator.dispatch(installCommandFor(add, run)));
    }
  }
}

async function scratch(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-shared-files-'));
  scratches.push(directory);
  return directory;
}

/**
 * Runs the last of `targets` in `cwd` as `run` says — the ones before
 * it have run there already — and records the cell they make: the
 * sha256 of each shared file as the run leaves it, read from the Tree
 * that staged it, or from disk where the run did not touch it.
 */
async function record(
  targets: readonly [...InstallTarget[], InstallTarget],
  cwd: string,
  run: Run,
): Promise<InstallReport> {
  const answers = run.answers ?? {};
  const cell = `${cellOf(targets, answers)}${run.seeded === true ? ' (README.md seeded)' : ''}`;
  if (run.seeded === true) await fs.writeFile(path.join(cwd, 'README.md'), USER_README);
  const trees: Tree[] = [];
  watched.set(cwd, trees);
  let report: InstallReport;
  try {
    const target = targets[targets.length - 1] as InstallTarget;
    const result = await mediator.dispatch(
      installCommandFor(target, { cwd, answers, interactive: false, dryRun: run.dryRun }),
    );
    if (!result.ok) throw new Error(`${cell}: refused as ${result.error.code}`);
    report = result.value;
  } finally {
    watched.delete(cwd);
  }
  const found: Record<string, string> = {};
  for (const file of [...SHARED_FILES, ...ASSEMBLY_FILES]) {
    const staging = trees.find((tree) => tree.changes().some((change) => change.path === file));
    const bytes = staging === undefined ? await onDisk(path.join(cwd, file)) : staging.read(file);
    if (bytes !== null) found[file] = createHash('sha256').update(bytes).digest('hex');
  }
  cells.set(cell, found);
  return report;
}

async function onDisk(file: string): Promise<Buffer | null> {
  return (await fs.pathExists(file)) ? fs.readFile(file) : null;
}

/**
 * A cell's key: the commands that make it, as a command line — the
 * dials `keel.dials` settled and the extras it snapped, in the order
 * the install runs them, then the answers the last is sent. Spelled
 * here rather than by the page's own `command.js`, so a change to how
 * the page prints a command moves no key.
 */
function cellOf(targets: readonly InstallTarget[], answers: Answers): string {
  const set = Object.entries(answers).flatMap(([adapter, questions]) =>
    Object.entries(questions).map(([question, value]) => ` --set ${adapter}:${question}=${value}`),
  );
  const commands = targets.map((target) => {
    if (target.kind === 'add-vertical') return `keel add ${target.verticals.join(' ')}`;
    if (target.kind === 'add-module') return addModuleCommandLine(target);
    if (target.kind !== 'new-project') throw new Error(`no cell is made by '${target.kind}'`);
    const extras = target.extraVerticals ?? [];
    return [
      `keel new --stack ${target.stack ?? ''}`,
      target.buildSystem === undefined ? '' : ` --build-system ${target.buildSystem}`,
      target.moduleLayout === undefined ? '' : ` --module-layout ${target.moduleLayout}`,
      target.withPeerContext === true ? ' --with-peer-context' : '',
      extras.length === 0 ? '' : ` --with ${extras.join(',')}`,
    ].join('');
  });
  return `${commands.join(' && ')}${set.join('')}`;
}

function readGolden(): Readonly<Record<string, Readonly<Record<string, string>>>> {
  return JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<
    string,
    Readonly<Record<string, string>>
  >;
}
