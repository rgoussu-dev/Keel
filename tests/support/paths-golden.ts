/**
 * The paths golden (`docs/roadmap.md` → S.1a): every path that installs
 * or re-renders verticals — `keel new`, `keel add` with `--refresh` and
 * `--reapply`, `keel add module` and `keel add entrypoint` — pinned by
 * what it leaves, absolutely, so that epic S can move each path onto
 * one converge operation and prove it byte-identical, or name the cells
 * it moves. Every other golden pins one facet of a path, or compares
 * two projects that can move together; this one records each cell on
 * its own.
 *
 * **Scenario.** Cells are derived by the four families of paths in
 * `./paths-families.ts`, one sweep each, which the four suites
 * `domain/core/paths-*.golden.test.ts` record and the converge golden
 * reads, from `keel.catalog`, `keel.dials` and `keel.project-status` —
 * and from `keel.preview`, where a question or a proposal is what a
 * cell takes up — never from a hand list, but for the one pair Q3.4's
 * finding 2 names. A cell is keyed by the command lines that make it,
 * joined by ` && `, spelled here ({@link newProjectCommandLine},
 * {@link addCommandLine}) rather than by the page's own `command.js`,
 * so a change to how the page prints a command moves no key.
 *
 * **Factory.** {@link installMediator} over the real templates, with a
 * {@link FakeProcessRunner} whose git answers as outside any repository
 * ({@link OUTSIDE_ANY_REPOSITORY}), a deferred-action runner that
 * records what the last run of a cell queued and runs nothing, a clock
 * pinned per run ({@link instantAt}), and the shipped in-memory fakes of
 * the `Tree` and `ManifestStore` ports over one in-memory disk
 * ({@link MemoryDisk}): every `Tree` a run opens is a `FakeTree` seeded
 * with what the disk holds under its root, committing back into it —
 * each file's bytes, and its mode as git stores it ({@link pinnedMode})
 * — so a product root and its services see one another's files;
 * and staging, as the filesystem adapter does, the net of its writes
 * against what the disk held, so a report lists what the command line
 * would. Every run is real, not a dry one — a dry run stages no
 * manifest, and the manifest is what S moves — but the whole re-render,
 * which the measure defines as a dry run. A cell that starts from a
 * scaffold copies the scaffold's files and manifests, made once, into a
 * directory of its own ({@link PathsSweep.cell}).
 *
 * **Port.** `Mediator.dispatch`, for the runs and for every reading.
 *
 * A {@link PathsSweep} records every cell, or, given a
 * {@link PathsReader}, reads each in place of recording it: every
 * scaffold and every command before a cell's last run for real, and the
 * last only where the reader asks.
 *
 * What a cell records is a {@link PathsCell}: its verdict, a digest of
 * each top-level entry of the tree it leaves, each field of each
 * manifest under it, the deferred actions and the report of its last
 * run, and `keel docs check`'s drift. Digests, not bytes: a failure
 * names the cell and what moved in it, and a later step that needs the
 * file re-runs the cell's command lines. Nothing it records depends on
 * where the sweep runs: the directory a cell runs in, the machine's
 * git, the umask its checkout was made under, or the locale a `Tree`
 * sorts its changes by.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import * as prettier from 'prettier';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Action, ResultOf } from '../../src/domain/kernel/action.js';
import type { Mediator } from '../../src/domain/kernel/mediator.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import {
  installCommandFor,
  type AddEntrypointTarget,
  type AddModuleTarget,
  type AddVerticalTarget,
  type InstallReport,
  type InstallTarget,
  type NewProjectTarget,
  type PresetAnswers,
  type RepoLayout,
} from '../../src/domain/contract/commands.js';
import { projectScopeRoot, type ManifestV2 } from '../../src/domain/contract/manifest.js';
import type { ManifestStore } from '../../src/domain/contract/ports/manifest-store.js';
import type { Tree, TreeChange } from '../../src/domain/contract/ports/tree.js';
import {
  catalogQuery,
  dialsQuery,
  docsCheckQuery,
  previewQuery,
  projectStatusQuery,
  type Catalog,
  type DialOptions,
  type InstallPreview,
  type ProjectStatus,
} from '../../src/domain/contract/queries.js';
import { FakeManifestStore } from '../../src/infrastructure/manifest/fake.js';
import { FakeProcessRunner, type ScriptedProcess } from '../../src/infrastructure/process/fake.js';
import { FakeTree } from '../../src/infrastructure/tree/fake.js';
import { OK, THROWN, type Outcome } from './composition-grid.js';
import {
  addModuleCommandLine,
  harnessSettings,
  moduleHistory,
  newCommandLine,
  offeredAsExtra,
} from './dial-walk.js';
import { FakeClock } from '../../src/infrastructure/commons/fake-clock.js';
import { expectOk, installMediator, PINNED_NOW } from './factory.js';

/** The fake root every directory a cell or a scaffold runs in sits under: never the disk. */
const PATHS_ROOT = path.join(path.sep, 'keel-paths');

/**
 * A family's sweep alone is under a minute on four cores; `verify` runs
 * the four beside the rest of the suite, so the budget is far above that
 * and far below a hang.
 */
const SWEEP_TIMEOUT = 300_000;

/** The prefix of a verdict whose chain stopped before its last command, as `&&` does. */
const STOPPED = 'stopped:';

/** How many moved cells a failure lists before it counts the rest. */
const LISTED = 50;

const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

/**
 * What the process runner is scripted to answer: git's `rev-parse`, as
 * outside any repository. Unscripted, the fake answers it with an empty
 * toplevel, which resolves to the test process's own directory, so
 * version control's deferred actions would name wherever keel is
 * checked out. Scripted, they read the same on every machine, and a
 * cell pins them with the rest.
 */
const OUTSIDE_ANY_REPOSITORY: ScriptedProcess = {
  command: 'git',
  argsPrefix: ['rev-parse'],
  result: { status: 128, stderr: 'fatal: not a git repository' },
};

/**
 * What one cell leaves, as the golden records it. Every digest is the
 * first 16 hex characters of a sha256.
 */
export interface PathsCell {
  /**
   * `ok`, the refusal's code, or `thrown:<Error>` — of the cell's last
   * run; `stopped:<verdict>` where a run before it did not come back
   * Ok, and the chain stopped there, as `&&` does.
   */
  readonly verdict: string;
  /**
   * Each top-level entry of the cell's directory — a product's service
   * directories' entries each as `<service>/<entry>` — to the digest of
   * the sorted `path\0mode\0sha256` lines of every file under it, the
   * mode as git stores it ({@link pinnedMode}), in octal.
   */
  readonly tree: Readonly<Record<string, string>>;
  /**
   * Each scope's manifest under the cell's directory, keyed by its path
   * from it (`''` for the directory's own), each top-level field to the
   * digest of its JSON, key order kept — so a move of the manifest alone
   * reads as one, and names its field.
   */
  readonly manifest: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * The digest of the descriptions of the deferred actions the last run
   * queued, in order — or, as a dry run, would queue: its report's —
   * each after its scope's path and a colon, in a product's service.
   */
  readonly actions: string;
  /**
   * The digest of the last run's report: its subject, notes, refresh
   * proposals, changes (kind and path), diffs (path and a digest of the
   * hunks), resolved adapters and skipped harness elements — or, where
   * it did not come back Ok, of the sentence it answered with, the
   * cell's directory in it read as `<cell>`.
   */
  readonly report: string;
  /**
   * `keel docs check`'s drift over every scope the cell leaves, summed —
   * zero with no harness, and with no scope at all — or the code of the
   * first scope whose check refuses.
   */
  readonly docs: number | string;
}

/** One command of a cell: the line its key spells, and the install it dispatches. */
export interface Step {
  /** As the key spells it — `cd <service> && ` first, where it runs in a service. */
  readonly line: string;
  /** The directory it runs in, from the cell's: `''`, or a service's path. */
  readonly at: string;
  readonly target: InstallTarget;
  readonly answers: PresetAnswers;
  readonly dryRun: boolean;
}

/**
 * A cell as a reading of the paths golden's cells sees it, before its
 * last command runs — the converge golden's (roadmap S.2), which reads
 * what each cell's last command converges rather than what it leaves.
 */
export interface CellReading {
  /** The cell's key, as the golden keys it. */
  readonly key: string;
  /** The directory the project the last command runs on is in; its `at` is from here. */
  readonly dir: string;
  /** The last command. */
  readonly step: Step;
  /** `stopped:<verdict>` where a command before the last did not come back Ok; else null. */
  readonly stopped: string | null;
  /** The manifests every run wrote, behind the port a reading of where a directory sits walks. */
  readonly manifests: ManifestStore;
  /**
   * Runs the last command, once, at its instant, and returns its verdict,
   * each manifest it leaves under the cell's directory, by its scope's
   * path from it (`''` for the directory's own), and its report — null
   * where it did not come back Ok, and for a scaffold another cell ran.
   */
  readonly run: () => Promise<{
    readonly verdict: string;
    readonly manifests: ReadonlyMap<string, ManifestV2>;
    readonly report: InstallReport | null;
  }>;
}

/**
 * Reads each cell before its last command, in place of recording what
 * it leaves: a {@link PathsSweep} given one runs every scaffold and
 * every command before a cell's last, and the last only where the
 * reading asks.
 */
export type PathsReader = (cell: CellReading) => Promise<void>;

/**
 * A directory the commands that make it have run in, once, for cells to
 * copy: its path, the lines its key spells, and the verdict of the run
 * that did not come back Ok, where one did not.
 */
export interface Base {
  readonly dir: string;
  readonly lines: readonly string[];
  readonly stopped: string | null;
}

/** `keel new` of `target`, sent `answers`, as a {@link Step}. */
export function newStep(target: NewProjectTarget, answers: PresetAnswers = {}): Step {
  return { line: newProjectCommandLine(target, answers), at: '', target, answers, dryRun: false };
}

/** `keel add` of `target` — in the service `at`, where given — as a {@link Step}. */
export function addStep(
  target: AddVerticalTarget | AddEntrypointTarget | AddModuleTarget,
  options: {
    readonly at?: string;
    readonly answers?: PresetAnswers;
    readonly dryRun?: boolean;
  } = {},
): Step {
  const { at = '', answers = {}, dryRun = false } = options;
  const line = `${at === '' ? '' : `cd ${at} && `}${addCommandLine(target, { answers, dryRun })}`;
  return { line, at, target, answers, dryRun };
}

/** `keel add <verticals> --reapply` as a {@link Step} — in the service `at`, where given. */
export function reapplyStep(verticals: readonly string[], at = ''): Step {
  return addStep({ kind: 'add-vertical', verticals, reapply: true }, { at });
}

/**
 * The measure's whole re-render as a {@link Step} — in the service `at`,
 * where given: `keel add <verticals> --reapply`, as a dry run, naming
 * every vertical a project records that `keel add` can name. Named in
 * code-unit order, not the recorded one: a re-render runs in the order
 * the project installed them whatever order they are named in, so a
 * change to the record's order moves the cell rather than renaming it.
 */
export function wholeRerenderStep(recorded: readonly string[], at = ''): Step {
  const verticals = [...recorded].sort();
  return addStep({ kind: 'add-vertical', verticals, reapply: true }, { at, dryRun: true });
}

/**
 * A `keel new` target as the command line that runs it: the dials as
 * {@link newCommandLine} spells them, then a product's repository
 * layout, the extras — a service's as `<path>:<id>` — and each answer
 * sent, as `--set <adapter>:<question>=<value>`.
 */
export function newProjectCommandLine(
  target: NewProjectTarget,
  answers: PresetAnswers = {},
): string {
  const named = [
    ...(target.extraVerticals ?? []),
    ...Object.entries(target.services ?? {}).flatMap(([service, extras]) =>
      extras.extraVerticals.map((id) => `${service}:${id}`),
    ),
  ];
  return [
    newCommandLine(target),
    target.layout === undefined ? '' : ` --layout ${target.layout}`,
    named.length === 0 ? '' : ` --with ${named.join(',')}`,
    setFlags(answers),
  ].join('');
}

/**
 * A brownfield target as the command line that runs it:
 * `keel add a b [--reapply] [--refresh x,y] [--set a:q=v …] [--dry-run]`,
 * `keel add entrypoint <word>`, or `keel add module <name> [--consumes <c>]`.
 */
export function addCommandLine(
  target: AddVerticalTarget | AddEntrypointTarget | AddModuleTarget,
  options: { readonly answers?: PresetAnswers; readonly dryRun?: boolean } = {},
): string {
  const tail = `${setFlags(options.answers ?? {})}${options.dryRun === true ? ' --dry-run' : ''}`;
  switch (target.kind) {
    case 'add-module':
      return `${addModuleCommandLine(target)}${tail}`;
    case 'add-entrypoint':
      return `keel add entrypoint ${target.entrypoint}${tail}`;
    case 'add-vertical': {
      const refresh = target.refresh ?? [];
      return [
        `keel add ${target.verticals.join(' ')}`,
        target.reapply === true ? ' --reapply' : '',
        refresh.length === 0 ? '' : ` --refresh ${refresh.join(',')}`,
        tail,
      ].join('');
    }
  }
}

function setFlags(answers: PresetAnswers): string {
  return Object.entries(answers)
    .flatMap(([adapter, questions]) =>
      Object.entries(questions).map(
        ([question, value]) => ` --set ${adapter}:${question}=${value}`,
      ),
    )
    .join('');
}

/**
 * A file's mode as git stores it, and so as every checkout of keel
 * agrees on it: `0o755` where any executable bit is set, else `0o644`.
 * An executable template reaches a run with the permission bits its
 * checkout gave it, and git writes those under the contributor's umask
 * (`0o775` under `0o002`, the per-user default on many desktops), so
 * the other bits are the machine's, not keel's. The executable bit is
 * what a project sees move.
 */
export function pinnedMode(mode: number): number {
  return (mode & 0o111) === 0 ? 0o644 : 0o755;
}

/**
 * The mode a file takes where no write gave it one. A write that gives
 * none keeps the mode the file has, as the filesystem adapter does.
 */
const DEFAULT_MODE = 0o644;

/**
 * The instant a cell's command at `position` in its chain — `0` for the
 * first — runs at: {@link PINNED_NOW}, a minute later per position, the
 * same day. So a run that re-stamps what an earlier one recorded, or
 * that stops stamping, moves the manifest it leaves; and the instant is
 * the position's, whichever cell or scaffold runs it, in whatever order
 * the sweep reaches it.
 */
export function instantAt(position: number): string {
  return new Date(Date.parse(PINNED_NOW) + position * 60_000).toISOString().replace('.000Z', 'Z');
}

/** A file on the in-memory disk: its bytes and its mode, as git stores it. */
interface DiskFile {
  readonly bytes: Buffer;
  readonly mode: number;
}

/**
 * The in-memory disk every run of a family reads and writes: one map of
 * each file by absolute path, indexed by the directory under
 * {@link PATHS_ROOT} it lies in, so a `Tree` opened in a cell's
 * directory reads that directory alone rather than the whole disk.
 */
class MemoryDisk {
  private readonly files = new Map<string, DiskFile>();
  private readonly byDirectory = new Map<string, Set<string>>();

  /** A `FakeTree` over what `root` holds, which commits back into the disk. */
  treeAt(root: string): Tree {
    return new DiskTree(this, root);
  }

  /** Every file under `root`, by its `/`-separated path from `root`, in path order. */
  under(root: string): readonly (readonly [string, DiskFile])[] {
    const prefix = `${root}${path.sep}`;
    const directory = directoryOf(root);
    const candidates =
      directory === null ? this.files.keys() : (this.byDirectory.get(directory) ?? []);
    const found: [string, DiskFile][] = [];
    for (const file of candidates) {
      if (!file.startsWith(prefix)) continue;
      const held = this.files.get(file);
      if (held !== undefined) found.push([toPosix(path.relative(root, file)), held]);
    }
    return found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** Writes `held` at the absolute path `file`. */
  write(file: string, held: DiskFile): void {
    this.files.set(file, held);
    const directory = directoryOf(file);
    if (directory === null) return;
    const listed = this.byDirectory.get(directory) ?? new Set<string>();
    listed.add(file);
    this.byDirectory.set(directory, listed);
  }

  /** Removes the file at the absolute path `file`, if any. */
  delete(file: string): void {
    this.files.delete(file);
    const directory = directoryOf(file);
    if (directory !== null) this.byDirectory.get(directory)?.delete(file);
  }

  /** Every file under `from`, written again under `to` — the same bytes, not a copy of them. */
  copy(from: string, to: string): void {
    for (const [file, held] of this.under(from)) this.write(path.join(to, file), held);
  }

  /** Forgets every file under `root`, a directory of {@link PATHS_ROOT}'s. */
  drop(root: string): void {
    for (const [file] of this.under(root)) this.delete(path.join(root, file));
  }
}

/**
 * The shipped in-memory `Tree` fake over what the disk holds under
 * `root`: seeded with it when opened, and committing its changes back,
 * each file with the mode its last write gave it, as git stores it —
 * the fake keeps a mode, but has no way to read one back.
 */
class DiskTree extends FakeTree {
  /** What the disk held under `root` when the tree was opened. */
  private readonly opened: ReadonlyMap<string, DiskFile>;
  /** The mode each file was last written with, where a write gave one. */
  private readonly modes = new Map<string, number>();

  constructor(
    private readonly disk: MemoryDisk,
    private readonly root: string,
  ) {
    super();
    this.opened = new Map(disk.under(root));
    for (const [file, { bytes }] of this.opened) this.seed(file, bytes);
  }

  override write(filePath: string, content: Buffer | string, options?: { mode?: number }): void {
    super.write(filePath, content, options);
    if (options?.mode !== undefined) this.modes.set(treeKey(filePath), options.mode);
  }

  override delete(filePath: string): void {
    super.delete(filePath);
    this.modes.delete(treeKey(filePath));
  }

  /**
   * The net against what the disk held, as the filesystem adapter
   * reports it — where the fake reports every write: a file written
   * back onto its own bytes and its own mode is no change, so a
   * re-render that is a fixed point stages nothing, and its report says
   * so; one whose mode alone moves is a `modify`.
   */
  override changes(): readonly TreeChange[] {
    return super.changes().flatMap((change): TreeChange[] => {
      const before = this.opened.get(change.path) ?? null;
      const after = this.read(change.path);
      if (after === null) return before === null ? [] : [{ kind: 'delete', path: change.path }];
      if (before === null) return [{ kind: 'create', path: change.path }];
      const same = before.bytes.equals(after) && before.mode === this.modeOf(change.path);
      return same ? [] : [{ kind: 'modify', path: change.path }];
    });
  }

  override async commit(): Promise<readonly TreeChange[]> {
    const changes = await super.commit();
    for (const change of changes) {
      const file = path.join(this.root, change.path);
      const bytes = this.read(change.path);
      if (bytes === null) this.disk.delete(file);
      else this.disk.write(file, { bytes, mode: this.modeOf(change.path) });
    }
    return changes;
  }

  /** The mode `file` commits with: its last write's, else the disk's, else the default. */
  private modeOf(file: string): number {
    return pinnedMode(this.modes.get(file) ?? this.opened.get(file)?.mode ?? DEFAULT_MODE);
  }
}

/** A path as the shipped `FakeTree` keys it, and names it in its changes. */
function treeKey(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * The shipped in-memory `ManifestStore` fake, which validates every
 * write through the schema, and which also keeps the scope roots it was
 * written at — what a cell's manifests are read back from, and a
 * scaffold's are copied from.
 */
class ScopedManifests extends FakeManifestStore {
  private readonly scopes = new Map<string, Set<string>>();

  override async write(scopeRoot: string, manifest: ManifestV2): Promise<void> {
    await super.write(scopeRoot, manifest);
    const directory = directoryOf(scopeRoot);
    if (directory === null) return;
    const listed = this.scopes.get(directory) ?? new Set<string>();
    listed.add(scopeRoot);
    this.scopes.set(directory, listed);
  }

  /** Each manifest written under `root`, by its scope's path from `root`, in path order. */
  async under(root: string): Promise<ReadonlyMap<string, ManifestV2>> {
    const directory = directoryOf(root);
    const found: [string, ManifestV2][] = [];
    for (const scopeRoot of directory === null ? [] : (this.scopes.get(directory) ?? [])) {
      const scope = path.dirname(scopeRoot);
      if (scope !== root && !scope.startsWith(`${root}${path.sep}`)) continue;
      const manifest = await this.read(scopeRoot);
      if (manifest !== null) found.push([toPosix(path.relative(root, scope)), manifest]);
    }
    return new Map(found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
}

/**
 * The directory of {@link PATHS_ROOT} a path lies in — the one a cell
 * or a scaffold runs in — or null for a path outside every one.
 */
function directoryOf(file: string): string | null {
  const relative = path.relative(PATHS_ROOT, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep)[0] ?? null;
}

function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

/**
 * A sentence a run answered with, the directory it ran in read as
 * `<cell>`: a refusal may name where it looked, and where a cell runs
 * is the sweep's choice, not keel's.
 */
function inCell(sentence: string, dir: string): string {
  return toPosix(sentence.split(dir).join('<cell>'));
}

/** A deferred action's description, after its scope's path and a colon where that is a service. */
function scoped(scope: string, description: string): string {
  return scope === '' ? description : `${toPosix(scope)}: ${description}`;
}

/** The first 16 hex characters of the sha256 of `content`. */
function digest(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * What running a cell's commands came back as: its verdict, its last
 * run's outcome, and the deferred actions that run queued.
 */
interface Ran {
  readonly verdict: string;
  /** Null where the chain stopped before its last run. */
  readonly outcome: Outcome<InstallReport> | null;
  /** As {@link PathsCell.actions} digests them; none where the chain stopped. */
  readonly actions: readonly string[];
}

async function attempt<A extends Action>(
  mediator: Mediator,
  action: A,
): Promise<Outcome<ResultOf<A>>> {
  try {
    const result = await mediator.dispatch(action);
    if (result.ok) return { verdict: OK, value: result.value, message: null };
    return { verdict: result.error.code, value: null, message: result.error.message };
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    return { verdict: `${THROWN}${error.name}`, value: null, message: error.message };
  }
}

/**
 * One family's sweep: the mediators its runs and readings go through,
 * over its own in-memory disk and manifests, the scaffolds its cells
 * start from, each made once, and the cells recorded so far.
 */
export class PathsSweep {
  /**
   * The port every reading is dispatched through, and the first run of
   * every chain, wired by the Factory; the run at each later position
   * goes through one wired the same over the same fakes, its clock
   * pinned at {@link instantAt} that position.
   */
  readonly mediator: Mediator;
  private readonly mediators: Mediator[] = [];
  private readonly processes = new FakeProcessRunner([OUTSIDE_ANY_REPOSITORY]);
  private readonly disk = new MemoryDisk();
  private readonly manifests = new ScopedManifests();
  private readonly recorded = new Map<string, PathsCell>();
  private readonly cells = new Map<string, Promise<void>>();
  private readonly bases = new Map<string, Promise<Base>>();
  /** What the last run of each cell being recorded queued, by the directory it runs in. */
  private readonly queued = new Map<string, string[]>();
  /** `keel docs check`'s answer, by the state a cell leaves: its tree and manifests. */
  private readonly checked = new Map<string, Promise<number | string>>();
  private catalogRead: Promise<Catalog> | null = null;
  private readonly dialsRead = new Map<string, Promise<DialOptions>>();

  /**
   * @param reader where given, reads each cell before its last command
   *   in place of recording it ({@link PathsReader}); the sweep then
   *   records no cell, and {@link swept} is empty.
   */
  constructor(private readonly reader: PathsReader | null = null) {
    this.mediator = this.mediatorAt(0);
  }

  /**
   * Dispatches a query cells are derived from. Never a cell: a scenario
   * that cannot be read is a broken test, not a verdict.
   */
  async read<A extends Action>(action: A): Promise<ResultOf<A>> {
    return expectOk(await this.mediator.dispatch(action));
  }

  /** `keel.catalog`, read once. */
  catalog(): Promise<Catalog> {
    this.catalogRead ??= this.read(catalogQuery());
    return this.catalogRead;
  }

  /**
   * `keel.dials` of `target`, read once per target: a reading of the
   * registry alone, which every family asks again of the same settings.
   */
  dials(target: NewProjectTarget): Promise<DialOptions> {
    const key = JSON.stringify(target);
    const read = this.dialsRead.get(key) ?? this.read(dialsQuery({ target }));
    this.dialsRead.set(key, read);
    return read;
  }

  /**
   * Every setting of the single-service preset `stack`, as `keel.dials`
   * settles it — the walk, each again with the harness left out where
   * the reply lets it be ({@link harnessSettings}) — its opening setting
   * first.
   */
  settings(stack: string): Promise<readonly NewProjectTarget[]> {
    return harnessSettings((target) => this.dials(target), stack);
  }

  /** `target` naming `extras`, as `keel.dials` snaps it: their closure, in install order. */
  async snapped(target: NewProjectTarget, extras: readonly string[]): Promise<NewProjectTarget> {
    return (await this.dials({ ...target, extraVerticals: extras })).target as NewProjectTarget;
  }

  /**
   * The repository layouts a product's install offers: the choices of
   * the question its blank preview binds to the layout — the grid's
   * `layoutsOf`, over this sweep's mediator. Empty for a single-service
   * preset.
   */
  async layouts(stack: string): Promise<readonly RepoLayout[]> {
    const preview = await this.read(
      previewQuery({ cwd: this.nowhere(), target: { kind: 'new-project', stack }, answers: {} }),
    );
    const question = preview.questions.find((q) => q.binding.kind === 'layout');
    return (question?.choices ?? []).map((choice) => choice.value as RepoLayout);
  }

  /**
   * `keel.preview` of `target` — in `base`, in its service `at` where
   * given, or in an empty directory for a `keel new` — or null where it
   * does not come back Ok.
   */
  async preview(base: Base | null, target: InstallTarget, at = ''): Promise<InstallPreview | null> {
    const cwd = base === null ? this.nowhere() : path.join(base.dir, at);
    return (await attempt(this.mediator, previewQuery({ cwd, target, answers: {} }))).value;
  }

  /** `keel.project-status` in `base`, in its service `at` where given. */
  status(base: Base, at = ''): Promise<ProjectStatus> {
    return this.read(projectStatusQuery({ cwd: path.join(base.dir, at) }));
  }

  /**
   * The {@link moduleHistory} the modulith in `base` can be given — null
   * where it takes no bounded context — read off its status, which names
   * its skeleton's context first.
   */
  async historyOf(base: Base): Promise<readonly AddModuleTarget[] | null> {
    const { canAddModule, modules } = await this.status(base);
    const skeleton = modules[0]?.name;
    return canAddModule && skeleton !== undefined ? moduleHistory(skeleton) : null;
  }

  /**
   * The verticals `base` records, in its service `at` where given, that
   * `keel add --reapply` can name, in recorded order: every row but
   * `bounded-context` and a product root's `fullstack`
   * (`InstalledVerticalDescriptor.reapplicable`).
   */
  async reapplicable(base: Base, at = ''): Promise<readonly string[]> {
    const { installed } = await this.status(base, at);
    return installed.filter((vertical) => vertical.reapplicable).map((vertical) => vertical.id);
  }

  /**
   * Runs `steps` once, in a directory of their own — after copying
   * `from` into it, where given — for cells to copy; and, where
   * `record` says so, records the cell they make there too. Made once
   * per line of commands, however many cells ask for it — twice where
   * one asks for it recorded after one made it without, since what a
   * base leaves is no record of the run that made it.
   */
  extend(
    from: Base | null,
    steps: readonly Step[],
    options: { readonly record?: boolean } = {},
  ): Promise<Base> {
    const lines = [...(from?.lines ?? []), ...steps.map((step) => step.line)];
    const key = lines.join(' && ');
    const recorded = `${key} (recorded)`;
    const made =
      options.record === true
        ? this.bases.get(recorded)
        : (this.bases.get(key) ?? this.bases.get(recorded));
    if (made !== undefined) return made;
    const named = options.record === true ? recorded : key;
    const making = (async (): Promise<Base> => {
      const dir = path.join(PATHS_ROOT, `base-${digest(named)}`);
      let verdict: string;
      if (this.reader !== null && options.record === true) {
        verdict = await this.readCell(key, dir, from, steps, true);
      } else {
        await this.copy(from, dir);
        const ran = await this.run(dir, from, steps, options.record === true);
        if (options.record === true) await this.record(key, dir, ran);
        verdict = ran.verdict;
      }
      if (verdict === OK) return { dir, lines, stopped: null };
      const stopped = verdict.startsWith(STOPPED) ? verdict : `${STOPPED}${verdict}`;
      return { dir, lines, stopped };
    })();
    this.bases.set(named, making);
    return making;
  }

  /**
   * Records the cell `from`'s lines then `steps` make: `from` copied
   * into a directory of the cell's own — none where null — `steps` run
   * there, and what the last leaves read back. A cell already swept, or
   * being swept, is not run again.
   */
  cell(from: Base | null, steps: readonly Step[]): Promise<void> {
    const key = [...(from?.lines ?? []), ...steps.map((step) => step.line)].join(' && ');
    const swept = this.cells.get(key);
    if (swept !== undefined) return swept;
    const sweeping = (async (): Promise<void> => {
      const dir = path.join(PATHS_ROOT, `cell-${digest(key)}`);
      const [only] = steps;
      const made = from === null && steps.length === 1 ? this.bases.get(key) : undefined;
      if (this.reader !== null && made !== undefined && only !== undefined) {
        await this.readScaffold(key, dir, only, await made);
      } else if (this.reader !== null) {
        await this.readCell(key, dir, from, steps, false);
      } else {
        await this.copy(from, dir);
        await this.record(key, dir, await this.run(dir, from, steps, true));
      }
      this.disk.drop(dir);
    })();
    this.cells.set(key, sweeping);
    return sweeping;
  }

  /** Every cell recorded, keyed and sorted as the golden holds them. */
  swept(): Readonly<Record<string, PathsCell>> {
    return Object.fromEntries(
      [...this.recorded.keys()].sort().map((key) => [key, this.recorded.get(key) as PathsCell]),
    );
  }

  /** The mediator the command at `position` in a chain runs through, wired once. */
  private mediatorAt(position: number): Mediator {
    const wired = this.mediators[position];
    if (wired !== undefined) return wired;
    const mediator = installMediator({
      processes: this.processes,
      runDeferred: async ({ actions, cwd }) => this.defer(cwd, actions),
      trees: (root) => this.disk.treeAt(root),
      manifests: this.manifests,
      clock: new FakeClock(instantAt(position)),
    });
    this.mediators[position] = mediator;
    return mediator;
  }

  /** An empty directory a `keel new` preview runs in: nothing is ever written there. */
  private nowhere(): string {
    return path.join(PATHS_ROOT, 'empty');
  }

  private async copy(from: Base | null, dir: string): Promise<void> {
    if (from === null) return;
    this.disk.copy(from.dir, dir);
    for (const [scope, manifest] of await this.manifests.under(from.dir)) {
      await this.manifests.write(projectScopeRoot(path.join(dir, scope)), manifest);
    }
  }

  /**
   * Runs `steps` in `dir`, after `from`'s, in order, as `&&` does: none
   * where the base stopped already, and none after one that does not
   * come back Ok; each at the instant of its position in the chain.
   * Returns the verdict of the chain — the last run's, or what stopped
   * it — and the last run's outcome and actions, where it ran and
   * `recording`: what it queued, or, as a dry run, what its report
   * says it would.
   */
  private async run(
    dir: string,
    from: Base | null,
    steps: readonly Step[],
    recording: boolean,
  ): Promise<Ran> {
    if (from !== null && from.stopped !== null) {
      return { verdict: from.stopped, outcome: null, actions: [] };
    }
    const first = from?.lines.length ?? 0;
    for (const [index, step] of steps.entries()) {
      const last = index === steps.length - 1;
      if (last && recording) this.queued.set(dir, []);
      const outcome: Outcome<InstallReport> = await attempt(
        this.mediatorAt(first + index),
        installCommandFor(step.target, {
          cwd: path.join(dir, step.at),
          answers: step.answers,
          interactive: false,
          dryRun: step.dryRun,
        }),
      );
      if (last) {
        const queued = this.queued.get(dir) ?? [];
        this.queued.delete(dir);
        const actions = step.dryRun
          ? (outcome.value?.actions ?? []).map((action) => scoped(step.at, action))
          : queued;
        return { verdict: outcome.verdict, outcome, actions };
      }
      if (outcome.verdict !== OK) {
        return { verdict: `${STOPPED}${outcome.verdict}`, outcome: null, actions: [] };
      }
    }
    throw new Error(`${dir}: a cell is made by at least one command`);
  }

  /**
   * The reader's turn at the cell `key` of one command, `step`, which a
   * scaffold made already, in `base`: read before it in `dir`, where
   * nothing is, and run as the scaffold ran it — at the same instant,
   * into the same fakes — so what it leaves is read off the scaffold
   * rather than run again.
   */
  private async readScaffold(key: string, dir: string, step: Step, base: Base): Promise<void> {
    const reader = this.reader;
    if (reader === null) throw new Error(`${key}: nothing to read`);
    await reader({
      key,
      dir,
      step,
      stopped: null,
      manifests: this.manifests,
      run: async () => ({
        verdict: base.stopped === null ? OK : base.stopped.slice(STOPPED.length),
        manifests: await this.manifests.under(base.dir),
        report: null,
      }),
    });
  }

  /**
   * The reader's turn at the cell `key`, in place of recording it: the
   * commands before the last run in `dir`, after `from` is copied there;
   * the reader reads the cell before the last, which runs where the
   * reader asks, or where `always` — a scaffold's must. A cell of one
   * command from a scaffold is read in the scaffold's directory, and
   * copied only where its command runs. Returns the chain's verdict, as
   * {@link run} does: `ok` for a last command that did not run.
   */
  private async readCell(
    key: string,
    dir: string,
    from: Base | null,
    steps: readonly Step[],
    always: boolean,
  ): Promise<string> {
    const reader = this.reader;
    const last = steps[steps.length - 1];
    if (reader === null || last === undefined) throw new Error(`${key}: nothing to read`);
    const prefix = steps.slice(0, -1);
    let copied = false;
    const copyOnce = async (): Promise<void> => {
      if (!copied) await this.copy(from, dir);
      copied = true;
    };
    let before = from;
    let stopped = from?.stopped ?? null;
    if (stopped === null && prefix.length > 0) {
      await copyOnce();
      const ran = await this.run(dir, from, prefix, false);
      if (ran.verdict !== OK) {
        stopped = ran.verdict.startsWith(STOPPED) ? ran.verdict : `${STOPPED}${ran.verdict}`;
      }
      before = { dir, lines: [...(from?.lines ?? []), ...prefix.map((s) => s.line)], stopped };
    }
    let verdict: string | null = null;
    let report: InstallReport | null = null;
    const runLast = async () => {
      if (verdict === null) {
        await copyOnce();
        const ran = await this.run(dir, before, [last], false);
        verdict = ran.verdict;
        report = ran.outcome?.value ?? null;
      }
      return { verdict, manifests: await this.manifests.under(dir), report };
    };
    await reader({
      key,
      dir: before?.dir ?? dir,
      step: last,
      stopped,
      manifests: this.manifests,
      run: runLast,
    });
    if (stopped !== null) return stopped;
    if (always) await runLast();
    return verdict ?? OK;
  }

  private defer(cwd: string, actions: readonly DeferredAction[]): void {
    for (const [dir, queued] of this.queued) {
      if (cwd !== dir && !cwd.startsWith(`${dir}${path.sep}`)) continue;
      const scope = toPosix(path.relative(dir, cwd));
      for (const action of actions) queued.push(scoped(scope, action.description));
    }
  }

  /** Reads back what the cell `key` left in `dir`, which `ran` there, and records it. */
  private async record(
    key: string,
    dir: string,
    { verdict, outcome, actions }: Ran,
  ): Promise<void> {
    const manifests = await this.manifests.under(dir);
    const services = [...manifests.keys()].filter((scope) => scope !== '');
    const tree = this.treeOf(dir, services);
    const manifest = Object.fromEntries(
      [...manifests].map(([scope, recorded]) => [
        scope,
        Object.fromEntries(
          Object.keys(recorded)
            .sort()
            .map((field) => [
              field,
              digest(JSON.stringify(recorded[field as keyof ManifestV2]) ?? 'undefined'),
            ]),
        ),
      ]),
    );
    // What the check reads is the files and the manifests, so a cell
    // that leaves what another left — a refusal, a dry run, a re-render
    // that is a fixed point — drifts as that one does.
    const state = createHash('sha256')
      .update(JSON.stringify([tree, manifest]))
      .digest('hex');
    const docs = this.checked.get(state) ?? this.docsOf(dir, [...manifests.keys()]);
    this.checked.set(state, docs);
    this.recorded.set(key, {
      verdict,
      tree,
      manifest,
      actions: digest(JSON.stringify(actions)),
      report: digest(
        outcome === null || outcome.value === null
          ? inCell(outcome?.message ?? verdict, dir)
          : JSON.stringify(reportOf(outcome.value)),
      ),
      docs: await docs,
    });
  }

  private treeOf(dir: string, services: readonly string[]): Record<string, string> {
    const entries = new Map<string, string[]>();
    for (const [file, { bytes, mode }] of this.disk.under(dir)) {
      const service = services.find((scope) => file.startsWith(`${scope}/`));
      const rest = service === undefined ? file : file.slice(service.length + 1);
      const top = rest.split('/')[0] ?? rest;
      const entry = service === undefined ? top : `${service}/${top}`;
      const lines = entries.get(entry) ?? [];
      lines.push(
        `${file}\0${pinnedMode(mode).toString(8)}\0${createHash('sha256').update(bytes).digest('hex')}`,
      );
      entries.set(entry, lines);
    }
    return Object.fromEntries(
      [...entries.keys()]
        .sort()
        .map((entry) => [entry, digest((entries.get(entry) ?? []).sort().join('\n'))]),
    );
  }

  private async docsOf(dir: string, scopes: readonly string[]): Promise<number | string> {
    let drift = 0;
    for (const scope of scopes) {
      const checked = await attempt(this.mediator, docsCheckQuery({ cwd: path.join(dir, scope) }));
      if (checked.value === null) return checked.verdict;
      drift += checked.value.drift.length;
    }
    return drift;
  }
}

/**
 * The parts of an install report a cell pins, as it pins them. The
 * changes and diffs are pinned as sets, in code-unit order: a `Tree`
 * lists them by `localeCompare`, which follows the machine's locale.
 */
function reportOf(report: InstallReport): unknown {
  return {
    subject: report.subject,
    notes: report.notes ?? [],
    refreshProposals: report.refreshProposals ?? [],
    changes: report.changes.map((change) => `${change.kind} ${change.path}`).sort(),
    diffs: (report.diffs ?? []).map((diff) => `${diff.path}\0${digest(diff.diff)}`).sort(),
    resolvedAdapters: report.resolvedAdapters ?? [],
    skippedHarnessElements: report.skippedHarnessElements ?? 0,
  };
}

/** The menu `keel.dials` shows on a setting: the ids of the boxes it draws. */
export function menuOf(dials: DialOptions): readonly string[] {
  return dials.verticals.filter(offeredAsExtra).map((vertical) => vertical.id);
}

/** One family of the paths golden, as {@link pathsGolden} registers it. */
export interface PathsFamily {
  /** Names the family's golden: `<name>.golden.json`, beside the suite. */
  readonly name: string;
  /** The suite's `import.meta.url`. */
  readonly here: string;
  /** Derives the family's cells and records each through `paths`. */
  readonly sweep: (paths: PathsSweep) => Promise<void>;
}

/**
 * Registers a family as a suite: one sweep in `beforeAll`, a test that
 * the cells it derives are the ones its golden records, one that each
 * leaves what its golden records, and the regeneration under
 * `KEEL_UPDATE_GOLDEN=1` — written as `prettier --check` holds it.
 */
export function pathsGolden(family: PathsFamily): void {
  const file = new URL(`./${family.name}.golden.json`, family.here);
  const paths = new PathsSweep();
  let swept = false;

  beforeAll(async () => {
    await family.sweep(paths);
    swept = true;
  }, SWEEP_TIMEOUT);

  afterAll(async () => {
    if (!UPDATE || !swept) return;
    const target = fileURLToPath(file);
    const options = (await prettier.resolveConfig(target)) ?? {};
    await fs.writeFile(
      file,
      await prettier.format(JSON.stringify(paths.swept(), null, 2), {
        ...options,
        filepath: target,
      }),
    );
  });

  it('derives the cells its golden records, and no other', () => {
    if (UPDATE) return;
    const golden = readGolden(file);
    const cells = paths.swept();
    const unrecorded = Object.keys(cells).filter((cell) => golden[cell] === undefined);
    const gone = Object.keys(golden).filter((cell) => cells[cell] === undefined);
    expect(
      {
        unrecorded: listed(unrecorded),
        gone: listed(gone),
      },
      'a new cell is recorded by KEEL_UPDATE_GOLDEN=1, and a gone one dropped',
    ).toEqual({ unrecorded: [], gone: [] });
  });

  it('leaves every cell as its golden records', () => {
    if (UPDATE) return;
    const golden = readGolden(file);
    const moved: string[] = [];
    for (const [cell, now] of Object.entries(paths.swept())) {
      const was = golden[cell];
      if (was === undefined) continue;
      const fields = movedFields(was, now);
      if (fields.length > 0) moved.push(`${cell} — ${fields.join(', ')}`);
    }
    expect(listed(moved), 'a deliberate change is recorded by KEEL_UPDATE_GOLDEN=1').toEqual([]);
  });
}

function readGolden(file: URL): Readonly<Record<string, PathsCell>> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, PathsCell>;
}

/** The first {@link LISTED} of `items`, then how many more there are. */
function listed(items: readonly string[]): readonly string[] {
  if (items.length <= LISTED) return items;
  return [...items.slice(0, LISTED), `… and ${items.length - LISTED} more`];
}

/**
 * What moved between two recordings of one cell, each named as a field
 * of it: `verdict`, `tree:<entry>`, `manifest:<field>` (a service's as
 * `manifest[<service>]:<field>`), `actions`, `report`, `docs`.
 */
function movedFields(was: PathsCell, now: PathsCell): readonly string[] {
  const moved: string[] = [];
  if (was.verdict !== now.verdict) moved.push(`verdict ${was.verdict} → ${now.verdict}`);
  for (const entry of union(was.tree, now.tree)) {
    if (was.tree[entry] !== now.tree[entry]) moved.push(`tree:${entry}`);
  }
  for (const scope of union(was.manifest, now.manifest)) {
    const before = was.manifest[scope] ?? {};
    const after = now.manifest[scope] ?? {};
    const named = scope === '' ? 'manifest' : `manifest[${scope}]`;
    for (const field of union(before, after)) {
      if (before[field] !== after[field]) moved.push(`${named}:${field}`);
    }
  }
  if (was.actions !== now.actions) moved.push('actions');
  if (was.report !== now.report) moved.push('report');
  if (was.docs !== now.docs) moved.push(`docs ${was.docs} → ${now.docs}`);
  return moved;
}

function union(a: object, b: object): readonly string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}
