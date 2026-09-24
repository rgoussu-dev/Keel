/**
 * The composition grid: every cell of keel's composition surface,
 * dispatched through the real mediator, and the ratchet that holds
 * epic Q's invariants over them (`docs/roadmap.md` → "The measure:
 * the composition grid").
 *
 * **Scenario.** Cells are derived, never listed: stacks and verticals
 * from `keel.catalog`, the extras menu from `keel.dials`, the
 * brownfield cards from `keel.project-status`, and the extras chains
 * worth trying from the registry's own declarations ({@link chainOf}).
 * A preset or a vertical registered tomorrow is swept by the next run
 * without an edit here, and a plugin's pieces are swept by building a
 * {@link Grid} over the plugin's registry. The one fixed list is the
 * seeded-user-file axis ({@link SEEDED_BEFORE_NEW},
 * {@link SEEDED_BEFORE_ADD}), because what a user keeps in a directory
 * is not something a registry can know.
 *
 * **Factory.** {@link installMediator} over the real templates and
 * filesystem, with a {@link FakeProcessRunner} and a deferred-action
 * runner that runs nothing: a scaffold is every staged file, with no
 * `git init`, no `gradle wrapper` and no network.
 *
 * **Port.** `Mediator.dispatch`, and nothing else. The oracle is
 * always the engine's own answer — a preview, or an install — never a
 * re-derivation over tags. A test that re-derived the gate from
 * `assemblyRefusal` is how an offered extra that throws got past the
 * test claiming the menu and the gate agree.
 *
 * **The ratchet.** Each axis keeps two files beside its suite:
 *
 *   - `<axis>.golden.json` — every cell's verdict: `ok`, the
 *     refusal's code, or `thrown:<Error>` for anything that fell off
 *     the `Err` rail. Any change shows as a diff in review;
 *     `KEEL_UPDATE_GOLDEN=1` rewrites it for a deliberate one.
 *   - `<axis>.known.json` — invariant → cell → the finding id the
 *     violation is tracked under. Asserted by exact equality in both
 *     directions: a new violation fails, and so does a fixed one still
 *     listed. `KEEL_UPDATE_GOLDEN=1` rewrites it as known ∩ actual, so
 *     it can only shrink; a key is only ever added by hand, and review
 *     rejects that. A {@link HARD} invariant has no entry at all.
 *
 * One file per axis rather than one for the grid, because vitest runs
 * the three suites in parallel workers and each rewrites its own files
 * under `KEEL_UPDATE_GOLDEN=1` — a shared file would be a race.
 */

import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Action, ResultOf } from '../../src/domain/kernel/action.js';
import type { Mediator } from '../../src/domain/kernel/mediator.js';
import type { Vertical } from '../../src/domain/contract/composition.js';
import type { NewProjectTarget } from '../../src/domain/contract/commands.js';
import type { Registry } from '../../src/domain/contract/ports/registry.js';
import type { Tree } from '../../src/domain/contract/ports/tree.js';
import {
  dialsQuery,
  previewQuery,
  type AvailableVerticalDescriptor,
  type DialOptions,
  type InstallPreview,
  type ProjectStatus,
} from '../../src/domain/contract/queries.js';
import { matchesPattern } from '../../src/domain/core/predicate.js';
import { shippedRegistry } from '../../src/domain/core/registry.js';
import { FakeProcessRunner } from '../../src/infrastructure/process/fake.js';
import { fsTreeFactory } from '../../src/infrastructure/tree/fs-tree.js';
import { expectOk, installMediator } from './factory.js';

/**
 * The invariants the grid holds, by the ids `docs/roadmap.md` gives
 * them. I7 and I9 land with the steps that make them true.
 */
export const INVARIANTS = {
  I1: 'no cell throws; every refusal is an Err with a code',
  I2: 'every extra keel.dials offers, posted with its prerequisites, previews Ok',
  I3: 'every extras set the CLI accepts is reachable from the menu',
  I4: 'a keel.project-status card agrees with its add: ready ⇔ Ok, needs ⇔ Ok with its closure, a refusal ⇔ the same code and sentence',
  I5: 'keel new --with v and keel add v on the same stack reach the same outcome, code and sentence',
  I6: 'no refusal names a lang. / framework. / runtime. / pkg. / layout. / arch. tag',
  I8: 'any permutation of an accepted extras set stages byte-identical changes',
} as const;

/** One of {@link INVARIANTS}. */
export type Invariant = keyof typeof INVARIANTS;

/**
 * The invariants with no allowance: an axis's known file carries no key
 * for one, so a single violating cell fails the grid, whatever a
 * reviewer would accept. An invariant joins this list with the step
 * that brings it to zero for good — I1 with Q0.3, when a file already
 * on disk, or missing from it, became a coded refusal; I2 and I3 with
 * Q1.3, when the extras menu and both front doors moved onto the
 * planner; I8 landed hard, with the same step; I6 with Q1.7, when every
 * refusal of a vertical came to be written by one builder that prints
 * no tag.
 */
export const HARD: readonly Invariant[] = ['I1', 'I2', 'I3', 'I6', 'I8'];

/** The verdict of a cell that came back Ok. */
export const OK = 'ok';

/**
 * Files a user plausibly keeps in a directory before `keel new`,
 * seeded one at a time into an otherwise empty one.
 */
export const SEEDED_BEFORE_NEW: readonly string[] = ['README.md', '.gitignore'];

/**
 * Files a user plausibly keeps in a project before `keel add`.
 *
 * Not `README.md`: a scaffold already has one, and about twenty
 * brownfield adapters patch it, so seeding it there would measure
 * placeholder content rather than a collision.
 */
export const SEEDED_BEFORE_ADD: readonly string[] = ['Dockerfile', '.github/workflows/ci.yml'];

/** The content of every seeded file: something keel did not write. */
const USER_CONTENT = 'Written by hand, before keel ran.\n';

/**
 * Writes the user's `file` into `directory` and returns what takes it
 * out again — the file, and any directory seeding it created — so a
 * scaffold shared by many cells is back as keel left it for the next.
 */
export async function seed(directory: string, file: string): Promise<() => Promise<void>> {
  const segments = file.split('/');
  let created = path.join(directory, file);
  for (let depth = 1; depth < segments.length; depth++) {
    const ancestor = path.join(directory, ...segments.slice(0, depth));
    if (!(await fs.pathExists(ancestor))) {
      created = ancestor;
      break;
    }
  }
  await fs.outputFile(path.join(directory, file), USER_CONTENT);
  return () => fs.remove(created);
}

/** What dispatching one cell came back as. */
export interface Outcome<T> {
  /** {@link OK}, the refusal's code, or `thrown:<name>` when it threw. */
  readonly verdict: string;
  /** The Ok value; null for a refusal or a throw. */
  readonly value: T | null;
  /** The refusal's or the throw's message; null when Ok. */
  readonly message: string | null;
}

/**
 * The prefix of a {@link Outcome.verdict} that fell off the `Err`
 * rail — an I1 violation wherever it appears.
 */
const THROWN = 'thrown:';

/** An identity tag, which no command can add to a project. */
const IDENTITY_TAG = /\b(?:lang|framework|runtime|pkg|layout|arch)\.[a-z0-9*]/;

/** Finding ids from the audit behind epic Q: `ENG-1`, `TEST-M3`, … */
const FINDING_ID = /^[A-Z]+-[A-Z0-9]+$/;

/**
 * Regeneration switch, shared with the other golden suites
 * (`agent-harness.golden.test.ts`).
 */
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

/**
 * A whole axis is one `beforeAll`: hundreds of previews and a scaffold
 * per stack. Uncontended it is a few seconds; `verify` runs it beside
 * ~150 other files on four cores, so the budget is far above that and
 * far below a hang.
 */
const SWEEP_TIMEOUT = 180_000;

/** How many stacks {@link eachStack} sweeps at once. */
const STACKS_AT_ONCE = 4;

/**
 * The sweep's state: the mediator every cell goes through, the
 * verdicts, and the violations found so far.
 */
export class Grid {
  /** The port every cell is dispatched through, wired by the Factory. */
  readonly mediator: Mediator;
  private readonly outcomes = new Map<string, Outcome<unknown>>();
  private readonly found = new Map<Invariant, Set<string>>();
  private readonly scratches: string[] = [];
  /** Roots whose Trees {@link staged} is reading, and the Trees opened there. */
  private readonly watched = new Map<string, Tree[]>();

  /**
   * @param holds the invariants this axis measures — recording any
   *   other is a mistake in the sweep, and throws.
   * @param registry what the run may compose from; keel's own by
   *   default, a plugin's to sweep the plugin.
   */
  constructor(
    readonly holds: readonly Invariant[],
    readonly registry: Registry = shippedRegistry,
  ) {
    this.mediator = installMediator({
      registry,
      processes: new FakeProcessRunner(),
      runDeferred: async () => {},
      trees: (root) => {
        const tree = fsTreeFactory(root);
        this.watched.get(root)?.push(tree);
        return tree;
      },
    });
  }

  /**
   * Dispatches a query the sweep derives its cells from — the catalog,
   * a dial menu, a project's status. Never a cell: a scenario that
   * cannot be read is a broken test, not a verdict.
   */
  async read<A extends Action>(action: A): Promise<ResultOf<A>> {
    return expectOk(await this.mediator.dispatch(action));
  }

  /**
   * Dispatches `action` as the cell `id` and records its verdict.
   * Holds I1 and I6 over it on the way: a throw is an I1 violation,
   * and a refusal naming an identity tag an I6 one. A cell already
   * swept is answered from the record, so two readings of one cell
   * cannot disagree.
   */
  async cell<A extends Action>(id: string, action: A): Promise<Outcome<ResultOf<A>>> {
    const swept = this.outcomes.get(id) as Outcome<ResultOf<A>> | undefined;
    if (swept !== undefined) return swept;
    const outcome = await attempt(this.mediator, action);
    this.outcomes.set(id, outcome);
    if (outcome.verdict.startsWith(THROWN)) this.violate('I1', id);
    else if (outcome.message !== null && IDENTITY_TAG.test(outcome.message)) {
      this.violate('I6', id);
    }
    return outcome;
  }

  /**
   * Dispatches `action` to compare a cell against — another axis's
   * twin of it, say — and records nothing: no verdict, and no
   * invariant held over it. The axis that owns that cell holds those.
   */
  async twin<A extends Action>(action: A): Promise<Outcome<ResultOf<A>>> {
    return attempt(this.mediator, action);
  }

  /**
   * Dispatches `action` as the cell `id`, as {@link cell} does, and
   * reads back what it staged under `root`: one line per changed
   * path — its kind, the path, and a digest of its bytes — in path
   * order, or null when the cell did not come back Ok. `root` must be
   * a directory no other cell stages into while this one runs, and
   * `id` a cell not swept yet: one answered from the record stages
   * nothing to read back.
   */
  async staged<A extends Action>(
    id: string,
    action: A,
    root: string,
  ): Promise<readonly string[] | null> {
    if (this.outcomes.has(id)) {
      throw new Error(`staged: cell '${id}' was swept already, so what it staged is gone`);
    }
    const trees: Tree[] = [];
    this.watched.set(root, trees);
    try {
      const outcome = await this.cell(id, action);
      if (outcome.verdict !== OK) return null;
      return trees
        .flatMap((tree) =>
          tree.changes().map((change) => {
            const bytes = tree.read(change.path);
            const digest =
              bytes === null ? '-' : createHash('sha256').update(bytes).digest('hex').slice(0, 16);
            return `${change.kind} ${change.path} ${digest}`;
          }),
        )
        .sort();
    } finally {
      this.watched.delete(root);
    }
  }

  /** Records that `cell` breaks `invariant`. */
  violate(invariant: Invariant, cell: string): void {
    if (!this.holds.includes(invariant)) {
      throw new Error(`this axis does not hold ${invariant}, but '${cell}' was recorded under it`);
    }
    const cells = this.found.get(invariant) ?? new Set<string>();
    cells.add(cell);
    this.found.set(invariant, cells);
  }

  /** The cells found breaking `invariant`, sorted. */
  violations(invariant: Invariant): readonly string[] {
    return [...(this.found.get(invariant) ?? [])].sort();
  }

  /** Every cell's verdict, keyed by cell id in sorted order. */
  verdicts(): Record<string, string> {
    return Object.fromEntries(
      [...this.outcomes.keys()].sort().map((id) => [id, this.outcomes.get(id)?.verdict ?? '']),
    );
  }

  /** A fresh empty directory, removed when the suite ends. */
  async scratch(): Promise<string> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-grid-'));
    this.scratches.push(directory);
    return directory;
  }

  /** Removes every scratch directory. */
  async dispose(): Promise<void> {
    await Promise.all(this.scratches.splice(0).map((directory) => fs.remove(directory)));
  }
}

/**
 * A stack's default target as `keel.dials` settles it, the extras its
 * menu offers there, and the verticals it shows as coming with the
 * preset — the target a blank form posts, and the menu it shows.
 */
export async function settle(
  grid: Grid,
  stack: string,
  dials: Omit<NewProjectTarget, 'kind' | 'stack'> = {},
): Promise<{
  readonly target: NewProjectTarget;
  readonly offered: ReadonlySet<string>;
  readonly included: ReadonlySet<string>;
}> {
  const options: DialOptions = await grid.read(
    dialsQuery({ target: { kind: 'new-project', stack, ...dials } }),
  );
  if (options.target.kind !== 'new-project') {
    throw new Error(`keel.dials settled '${stack}' to a ${options.target.kind} target`);
  }
  return {
    target: options.target,
    offered: new Set(options.extraVerticals.map((choice) => choice.id)),
    included: new Set(
      options.verticals
        .filter((vertical) => vertical.readiness === 'included')
        .map((vertical) => vertical.id),
    ),
  };
}

/**
 * Holds a project's cards to the add each stands for (I4), in the
 * directory `status` was read from: every vertical of `verticals` is
 * either installed there or a card, and a card agrees with the preview
 * of `keel add <id>` — `outcome`, the cell already swept for it.
 *
 * - `ready` previews Ok;
 * - `needs` previews Ok, and stages exactly what naming its
 *   prerequisites with it stages ({@link Grid.twin}, which records
 *   nothing): the closure the card shows is the one the add installs;
 * - a card carrying a refusal previews as that refusal, under the same
 *   code, in the same sentence — whatever its readiness says, since a
 *   tied `needs` is refused too.
 *
 * An `unavailable` card with no refusal to show is a violation of its
 * own. Records the cell `cell` under I4 when the card, or its absence,
 * disagrees.
 */
export async function holdCard(
  grid: Grid,
  cell: string,
  status: ProjectStatus,
  vertical: string,
  cwd: string,
  outcome: Outcome<InstallPreview>,
): Promise<void> {
  const card: AvailableVerticalDescriptor | undefined = status.available.find(
    (candidate) => candidate.id === vertical,
  );
  if (card === undefined) {
    if (!status.installed.some((installed) => installed.id === vertical)) grid.violate('I4', cell);
    return;
  }
  if (!(await agrees(grid, card, cwd, outcome))) grid.violate('I4', cell);
}

async function agrees(
  grid: Grid,
  card: AvailableVerticalDescriptor,
  cwd: string,
  outcome: Outcome<InstallPreview>,
): Promise<boolean> {
  if (card.refusal !== undefined) {
    return outcome.verdict === card.refusal.code && outcome.message === card.refusal.message;
  }
  if (outcome.verdict !== OK) return false;
  switch (card.readiness) {
    case 'ready':
      return true;
    case 'needs': {
      if (card.requires.length === 0) return false;
      const closure = await grid.twin(
        previewQuery({
          cwd,
          target: { kind: 'add-vertical', verticals: [...card.requires, card.id] },
          answers: {},
        }),
      );
      return (
        closure.verdict === OK &&
        JSON.stringify(closure.value?.changes) === JSON.stringify(outcome.value?.changes)
      );
    }
    case 'unavailable':
      return false;
  }
}

/**
 * `vertical` posted after its prerequisites, in install order: every
 * vertical that promotes a tag one of its adapters requires, and
 * theirs in turn — the promotes→requires graph, read from the
 * declarations (`Vertical.promotes`, `Predicate.requires`).
 *
 * `offered` is the menu the chain is for. A prerequisite on it stands
 * in the chain; one off it stands there only when a chain reaches it
 * in turn. Anything else can only be refused — a vertical the stack
 * already installs, or one no extra promotes a tag for — so a chain
 * through it would measure nothing but that.
 */
export function chainOf(
  registry: Registry,
  vertical: string,
  offered: ReadonlySet<string>,
): readonly string[] {
  const order: string[] = [];
  const reachable = (id: string, trail: ReadonlySet<string>): boolean => {
    let reached = false;
    for (const promoter of promotersOf(registry, id)) {
      if (trail.has(promoter)) continue;
      if (!reachable(promoter, new Set([...trail, promoter]))) continue;
      if (!order.includes(promoter)) order.push(promoter);
      reached = true;
    }
    return offered.has(id) || reached;
  };
  reachable(vertical, new Set([vertical]));
  return [...order, vertical];
}

/**
 * The extras sets worth trying to find out whether the CLI accepts
 * `vertical` at all: its {@link chainOf}, then that chain behind each
 * other offered extra that promotes a tag, in menu order.
 *
 * The second half is for a prerequisite the declarations do not show
 * — a tag read inside `contribute()` rather than declared in a
 * predicate, as distribution's container image was until Q1.3 — which
 * is still a *tag* read, so only an extra that promotes one can meet
 * it. A chain of one gets no such try, and that is a trade, not a
 * proof: by the declarations nothing an extra promotes is required by
 * it, but an undeclared read of that kind would go unseen there.
 * Trying every promoting extra ahead of every such vertical would
 * roughly double the axis (~600 previews) to guard a case the
 * declarations say cannot happen.
 *
 * A candidate generator, not an oracle. Over-reading the graph costs
 * a preview; the preview alone decides what counts as accepted.
 */
export function candidateSets(
  registry: Registry,
  vertical: string,
  offered: ReadonlySet<string>,
): readonly (readonly string[])[] {
  const chain = chainOf(registry, vertical, offered);
  if (chain.length === 1) return [chain];
  const ahead = [...offered].filter(
    (id) => !chain.includes(id) && (registry.vertical(id)?.promotes ?? []).length > 0,
  );
  return [chain, ...ahead.map((id) => [id, ...chain])];
}

/**
 * The extras sets whose order could matter, for I8: for each offered
 * vertical that reads another offered one (`Vertical.reads`), its
 * {@link chainOf} with the chains of what it reads — the two kinds of
 * edge an install order has to respect, a tag one promotes and
 * another requires, and a vertical another's `contribute()` looks at.
 * Each set once, in the order first found; none shorter than two.
 */
export function orderSensitiveSets(
  registry: Registry,
  offered: ReadonlySet<string>,
): readonly (readonly string[])[] {
  const sets: string[][] = [];
  for (const id of offered) {
    const read = (registry.vertical(id)?.reads ?? []).filter((other) => offered.has(other));
    if (read.length === 0) continue;
    const set = [...new Set([...read, id].flatMap((each) => chainOf(registry, each, offered)))];
    const key = [...set].sort().join(',');
    if (set.length >= 2 && !sets.some((other) => [...other].sort().join(',') === key)) {
      sets.push(set);
    }
  }
  return sets;
}

/** Every ordering of `items`, `items` itself first. */
export function permutations<T>(items: readonly T[]): readonly (readonly T[])[] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

/** The verticals promoting a tag some adapter of `id` requires. */
function promotersOf(registry: Registry, id: string): readonly string[] {
  const requires = registry.vertical(id)?.adapters.flatMap((a) => a.predicate.requires ?? []);
  return registry
    .verticals()
    .filter((other) => other.id !== id && promotesAny(other, requires ?? []))
    .map((other) => other.id);
}

function promotesAny(vertical: Vertical, patterns: readonly string[]): boolean {
  const promoted = new Set(vertical.promotes ?? []);
  return patterns.some((pattern) => matchesPattern(pattern, promoted));
}

/**
 * Runs `each` over `items` a few at a time.
 *
 * The cells of one stack depend on each other — a scaffold, then its
 * previews, then the same previews over a seeded file — so they run in
 * order; different stacks share nothing, so they overlap. The engine
 * is built for that (a preview's prompt is per query, and `keel ui`
 * serves concurrent previews), and it hides the template reads each
 * preview waits on. Verdicts are keyed by cell, so the order they
 * arrive in is not part of the result.
 */
export async function eachStack<T>(
  items: readonly T[],
  each: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await each(item);
  };
  await Promise.all(Array.from({ length: STACKS_AT_ONCE }, worker));
}

async function attempt<A extends Action>(
  mediator: Mediator,
  action: A,
): Promise<Outcome<ResultOf<A>>> {
  try {
    const result = await mediator.dispatch(action);
    return result.ok
      ? { verdict: OK, value: result.value, message: null }
      : { verdict: result.error.code, value: null, message: result.error.message };
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    return { verdict: `${THROWN}${error.name}`, value: null, message: error.message };
  }
}

/** One axis of the grid, as {@link sweepGrid} runs it. */
export interface GridAxis {
  /** Names the axis's files: `<name>.golden.json`, `<name>.known.json`. */
  readonly name: string;
  /** The suite's `import.meta.url`; the files live beside it. */
  readonly here: string;
  /** The invariants this axis measures, each asserted by a test of its own. */
  readonly holds: readonly Invariant[];
  /** Dispatches the axis's cells into the grid. */
  readonly sweep: (grid: Grid) => Promise<void>;
}

/** Invariant → cell → finding id, as `<axis>.known.json` stores it. */
type Known = Partial<Record<Invariant, Record<string, string>>>;

/**
 * Registers an axis as a suite: one sweep in `beforeAll`, a test for
 * the golden, one per invariant held, and the regeneration under
 * `KEEL_UPDATE_GOLDEN=1`.
 */
export function sweepGrid(axis: GridAxis): void {
  const goldenFile = new URL(`./${axis.name}.golden.json`, axis.here);
  const knownFile = new URL(`./${axis.name}.known.json`, axis.here);
  const golden = readJson<Record<string, string>>(goldenFile);
  const known = readJson<Known>(knownFile);
  const grid = new Grid(axis.holds);
  let swept = false;

  beforeAll(async () => {
    await axis.sweep(grid);
    swept = true;
  }, SWEEP_TIMEOUT);

  afterAll(async () => {
    await grid.dispose();
    if (!UPDATE || !swept) return;
    await writeJson(goldenFile, grid.verdicts());
    await writeJson(knownFile, shrunk(known, grid));
  });

  it('gives every cell the verdict its golden records', () => {
    if (UPDATE) return;
    expect(grid.verdicts()).toEqual(golden);
  });

  it('tracks exactly the invariants it holds and allows, each under a finding id', () => {
    const allowed = axis.holds.filter((invariant) => !HARD.includes(invariant));
    expect(Object.keys(known).sort()).toEqual(allowed.sort());
    for (const cells of Object.values(known)) {
      for (const finding of Object.values(cells)) expect(finding).toMatch(FINDING_ID);
    }
  });

  it.each(
    axis.holds.map(
      (invariant) =>
        [
          invariant,
          INVARIANTS[invariant],
          HARD.includes(invariant)
            ? 'hard: broken nowhere'
            : 'broken only where the known file lists it',
        ] as const,
    ),
  )('%s: %s (%s)', (invariant) => {
    const listed = HARD.includes(invariant) ? [] : Object.keys(known[invariant] ?? {});
    const found = grid.violations(invariant);
    const added = found.filter((cell) => !listed.includes(cell));
    const fixed = listed.filter((cell) => !found.includes(cell)).sort();
    expect(added, `new ${invariant} violations — ${axis.name}.known.json only shrinks`).toEqual([]);
    if (UPDATE) return;
    expect(
      fixed,
      `no longer violating ${invariant} — KEEL_UPDATE_GOLDEN=1 drops them from ${axis.name}.known.json`,
    ).toEqual([]);
  });
}

/**
 * `known` ∩ what this run found: the regenerated known file, which
 * drops a {@link HARD} invariant's key along with its cells.
 */
function shrunk(known: Known, grid: Grid): Known {
  return Object.fromEntries(
    Object.entries(known)
      .filter(([invariant]) => !HARD.includes(invariant as Invariant))
      .map(([invariant, cells]) => {
        const found = new Set(grid.violations(invariant as Invariant));
        return [
          invariant,
          Object.fromEntries(
            Object.keys(cells)
              .filter((cell) => found.has(cell))
              .sort()
              .map((cell) => [cell, cells[cell]]),
          ),
        ];
      }),
  );
}

/**
 * The verdicts another axis's golden records — for an invariant that
 * spans two axes (I5), read where the other suite already pins them
 * to what its sweep found, rather than swept twice.
 */
export function goldenOf(name: string, here: string): Readonly<Record<string, string>> {
  return readJson(new URL(`./${name}.golden.json`, here));
}

function readJson<T>(file: URL): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

async function writeJson(file: URL, value: unknown): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
