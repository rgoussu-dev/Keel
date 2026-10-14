/**
 * The composition grid: every cell of keel's composition surface,
 * dispatched through the real mediator, and the ratchet that holds
 * epic Q's invariants over them (`docs/roadmap.md` → "The measure:
 * the composition grid"), epic R's I10 ("The measure", under R),
 * epic S's I11 and I12 ("The measure", under S), and epic T's I13
 * ("The measure", under T).
 *
 * **Scenario.** Cells are derived, never listed: stacks and verticals
 * from `keel.catalog`, the extras menu from `keel.dials`, the
 * brownfield cards from `keel.project-status`, and the extras chains
 * worth trying from the registry's own declarations ({@link chainOf}).
 * A preset or a vertical registered tomorrow is swept by the next run
 * without an edit here, and a plugin's pieces are swept by building a
 * {@link Grid} over the plugin's registry. The fixed lists are the
 * seeded-user-file axis before `keel add` ({@link SEEDED_BEFORE_ADD}),
 * because what a user keeps in a project is not something a registry
 * can know — before `keel new` it is whatever the scaffold would write
 * ({@link seededBeforeNew}) — the identity samples I9
 * answers with ({@link answerBodies}), because a free-form answer's
 * shape is not something a question declares, and the runners a
 * product's run hint may use ({@link RUNNERS}), because what Gradle or
 * Cargo needs in a directory is not something keel declares.
 *
 * **Factory.** {@link installMediator} over the real templates and
 * filesystem, with a {@link FakeProcessRunner} and a deferred-action
 * runner that runs nothing: a scaffold is every staged file, with no
 * `git init`, no `gradle wrapper` and no network. What a real run
 * queued is kept, per directory, for an axis to compare
 * ({@link Grid.queued}).
 *
 * **Port.** `Mediator.dispatch`, and nothing else. The oracle is
 * the engine's own answer — a preview, or an install — never a
 * re-derivation over tags. I13 alone reads the files a scaffold wrote
 * rather than a verdict ({@link holdProductRuns}). A test that re-derived the gate from
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
 * the axes' suites in parallel workers and each rewrites its own files
 * under `KEEL_UPDATE_GOLDEN=1` — a shared file would be a race.
 */

import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import fs from 'fs-extra';
import { parse as parseYaml } from 'yaml';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Action, ResultOf } from '../../src/domain/kernel/action.js';
import type { Mediator } from '../../src/domain/kernel/mediator.js';
import type { Adapter, DeferredAction, Vertical } from '../../src/domain/contract/composition.js';
import {
  installCommandFor,
  type InstallReport,
  type InstallRun,
  type InstallTarget,
  type NewProjectTarget,
  type PresetAnswers,
  type RepoLayout,
} from '../../src/domain/contract/commands.js';
import type { Registry } from '../../src/domain/contract/ports/registry.js';
import type { Tree, TreeChange } from '../../src/domain/contract/ports/tree.js';
import { SETTINGS_TARGET } from '../../src/domain/contract/hook.js';
import { RefusalError, type Refusal } from '../../src/domain/contract/refusal.js';
import {
  dialsQuery,
  previewQuery,
  type AvailableVerticalDescriptor,
  type DialOptions,
  type InstallPreview,
  type PendingQuestion,
  type ProjectStatus,
} from '../../src/domain/contract/queries.js';
import { matchesPattern } from '../../src/domain/core/predicate.js';
import { shippedRegistry } from '../../src/domain/core/registry.js';
import { FakeProcessRunner } from '../../src/infrastructure/process/fake.js';
import { fsTreeFactory } from '../../src/infrastructure/tree/fs-tree.js';
import { expectOk, installMediator } from './factory.js';

/** The invariants the grid holds, by the ids `docs/roadmap.md` gives them. */
export const INVARIANTS = {
  I1: 'no cell throws; every refusal is an Err with a code',
  I2: 'every extra keel.dials offers, posted with its prerequisites, previews Ok',
  I3: 'every extras set the CLI accepts is reachable from the menu',
  I4: 'a keel.project-status card agrees with its add: ready ⇔ Ok, needs ⇔ Ok with its closure, a refusal ⇔ the same code, sentence and data, provided ⇔ Ok staging nothing with its note; and at a monorepo product root, what keel.dials shows as coming with the product ⇔ an add that stages and runs nothing',
  I5: 'keel new --with v and keel add v on the same stack reach the same outcome, code and sentence',
  I6: 'no refusal names a lang. / framework. / runtime. / pkg. / layout. / arch. tag',
  I7: 'in every composite service, under both layouts, every vertical is Ok or a coded, scope-aware refusal: never a file in the way, and keel.wrong-scope where the polyrepo twin is Ok',
  I8: 'any permutation of an accepted extras set stages byte-identical changes',
  I9: 'the same body previews and installs (dry run) alike: the same bytes, or the same refusal — the one the preview reports an unread answer with',
  I10: 'keel new X, and on a modulith keel new X with a keel add module history, then keel add entrypoint e leaves the tree, manifest and queued actions (less the repository setup) that keel new of the twin, given the same history, leaves on the same dials — or is refused as growth reads it',
  I11: 'a project re-rendered whole — one keel add --reapply naming every recorded vertical keel add can name, as a dry run — comes back Ok, resolves an adapter of every vertical it names, and stages nothing; and each of those re-rendered alone, by keel add v --reapply or by --refresh v beside an add, comes back Ok and resolves an adapter of it — by --reapply, staging nothing',
  I12: 'arriving later equals one run: keel new X then keel add y (with the refresh its preview proposes) leaves every file of keel new X --with y, its manifest byte for byte; and keel new X --no-agent-harness, with or without --with y, then keel add agent-harness leaves those of keel new X, with or without --with y',
  I13: "a monorepo product runs as its root says: every service the root's compose.yaml builds finds its Dockerfile under its context, every file it mounts from the root is there, and each development command the root README.md gives names what its service holds — a Gradle project, a Maven module, a Go package, an npm script, a Cargo manifest, a single Cargo binary",
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
 * no tag; I4 with Q1.10, when a monorepo service came to read what its
 * product gives it and what its repository root keeps from it — and
 * I7 landed hard, with the same step; I9 landed hard with Q2.1, when
 * the preview came to read the answers it is sent as the install does;
 * I10 landed hard with R.2b, with the command it holds to its twins;
 * I11 landed hard with S.1b, on the projects whose recorded composition
 * was a fixed point already, and S.7, which made a re-render keep what
 * later verticals wrote, widened it hard: each vertical re-rendered
 * alone, growth's twins, and the whole menus where the dev environment
 * is an extra.
 * I12 landed hard with S.8, when every caller came to record what it
 * adds where one run records it. I13 landed hard with T.3a, green on
 * every product keel shipped then, so a product registered before its
 * glue can build and run it fails the grid rather than joining a known
 * file.
 */
export const HARD: readonly Invariant[] = [
  'I1',
  'I2',
  'I3',
  'I4',
  'I6',
  'I7',
  'I8',
  'I9',
  'I10',
  'I11',
  'I12',
  'I13',
];

/**
 * The codes a refusal about a file in the way carries — the one kind
 * of refusal a composite service must never meet (I7): the product
 * root writing into a service is the product's to declare, not the
 * user's to trip over.
 */
export const FILE_REFUSALS: readonly string[] = ['keel.path-conflict', 'keel.path-missing'];

/** The verdict of a cell that came back Ok. */
export const OK = 'ok';

/**
 * The files a user may keep in a directory before `keel new` that the
 * scaffold would write, seeded one at a time into an otherwise empty
 * one: every file the empty-directory scaffold stages at the
 * directory's root, and the harness's `.claude/settings.json`. Read
 * off that scaffold's own changes, so a file a preset starts writing
 * — whole, or through a patch that would merge into the user's — is
 * swept without an edit here. The two `keel new` adopts
 * (`ADOPTED_FILES`, `README.md` and `.gitignore`) come back Ok; the golden records every
 * other as `keel.path-conflict`.
 */
export function seededBeforeNew(changes: readonly TreeChange[]): readonly string[] {
  return changes
    .map((change) => change.path)
    .filter((file) => !file.includes('/') || file === SETTINGS_TARGET)
    .sort();
}

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
  /** A refusal's structured half, where it has one (`RefusalError.refusal`). */
  readonly refusal?: Refusal;
}

/**
 * The prefix of a {@link Outcome.verdict} that fell off the `Err`
 * rail — an I1 violation wherever it appears.
 */
export const THROWN = 'thrown:';

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
  /**
   * Roots whose Trees {@link staged} or {@link stages} is reading, and
   * the Trees opened there or under it — a product's services open
   * theirs one level down — each with the directory it is rooted at.
   */
  private readonly watched = new Map<string, { readonly at: string; readonly tree: Tree }[]>();
  /** What the last real run in each directory queued, in order. */
  private readonly deferred = new Map<string, readonly DeferredAction[]>();

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
      runDeferred: async ({ actions, cwd }) => {
        this.deferred.set(cwd, actions);
      },
      trees: (root) => {
        const tree = fsTreeFactory(root);
        for (const [watched, trees] of this.watched) {
          if (root === watched || root.startsWith(`${watched}${path.sep}`)) {
            trees.push({ at: path.relative(watched, root), tree });
          }
        }
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
   * path — its kind, the path from `root` (a service's under its
   * directory), and a digest of its bytes — in path order, or null
   * when the cell did not come back Ok. `root` must be
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
    return (await this.watching(root, () => this.cell(id, action))).staged;
  }

  /**
   * Dispatches `action` as {@link twin} does, recording nothing, and
   * reads back what it staged under `root` as {@link staged} does —
   * null when it did not come back Ok. For a sweep too large to keep
   * every outcome (the weekly lane, `tests/sweep/`), which compares
   * what two dispatches staged and keeps only the difference. `root`
   * must be a directory no other dispatch stages into meanwhile.
   */
  async stages<A extends Action>(
    action: A,
    root: string,
  ): Promise<{
    readonly outcome: Outcome<ResultOf<A>>;
    readonly staged: readonly string[] | null;
  }> {
    return this.watching(root, () => this.twin(action));
  }

  private async watching<T>(
    root: string,
    dispatch: () => Promise<Outcome<T>>,
  ): Promise<{ readonly outcome: Outcome<T>; readonly staged: readonly string[] | null }> {
    const trees: { readonly at: string; readonly tree: Tree }[] = [];
    this.watched.set(root, trees);
    try {
      const outcome = await dispatch();
      if (outcome.verdict !== OK) return { outcome, staged: null };
      const staged = trees
        .flatMap(({ at, tree }) =>
          tree.changes().map((change) => {
            const bytes = tree.read(change.path);
            const digest =
              bytes === null ? '-' : createHash('sha256').update(bytes).digest('hex').slice(0, 16);
            return `${change.kind} ${path.join(at, change.path)} ${digest}`;
          }),
        )
        .sort();
      return { outcome, staged };
    } finally {
      this.watched.delete(root);
    }
  }

  /**
   * The deferred actions the last real run in `cwd` queued — none of
   * which ran — in the order it queued them; empty where none has run.
   */
  queued(cwd: string): readonly DeferredAction[] {
    return this.deferred.get(cwd) ?? [];
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
 * A real run in `cwd`: non-interactive, on no answers, and not a dry
 * run — how the axes write the scaffolds their cells run in.
 */
export function runIn(cwd: string): InstallRun {
  return { cwd, answers: {}, interactive: false, dryRun: false };
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
 * The repository layouts a product's install offers: the choices of
 * the question its preview binds to the layout, asked because the
 * target leaves it unset — so a third layout joins every sweep the day
 * the install asks about it. Empty for a single-service preset, which
 * asks none.
 */
export async function layoutsOf(grid: Grid, stack: string): Promise<readonly RepoLayout[]> {
  const preview = await grid.read(
    previewQuery({
      cwd: await grid.scratch(),
      target: { kind: 'new-project', stack },
      answers: {},
    }),
  );
  const question = preview.questions.find((q) => q.binding.kind === 'layout');
  return (question?.choices ?? []).map((choice) => choice.value as RepoLayout);
}

/**
 * Holds a project's cards to the add each stands for (I4), in the
 * directory `status` was read from: every vertical of `verticals` is
 * installed there, provided — given by the product it is part of, or
 * at a monorepo product root in its services — or a card, and a card
 * agrees with the preview of `keel add <id>` — `outcome`, the cell
 * already swept for it.
 *
 * - a vertical in `provided` previews Ok, stages nothing and runs
 *   nothing, and says its note;
 * - `ready` previews Ok;
 * - `needs` previews Ok, and stages exactly what naming its
 *   prerequisites with it stages ({@link Grid.twin}, which records
 *   nothing): the closure the card shows is the one the add installs;
 * - a card carrying a refusal previews as that refusal, under the same
 *   code, in the same sentence, with the same data — the action it
 *   names, where it names one (`grow`), included — whatever its
 *   readiness says, since a tied `needs` is refused too.
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
    const given = status.provided.find((candidate) => candidate.id === vertical);
    if (given !== undefined) {
      const preview = outcome.value;
      const nothing =
        outcome.verdict === OK &&
        preview !== null &&
        preview.changes.length === 0 &&
        preview.actions.length === 0 &&
        (preview.notes ?? []).includes(given.note);
      if (!nothing) grid.violate('I4', cell);
      return;
    }
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
    return (
      outcome.verdict === card.refusal.code &&
      outcome.message === card.refusal.message &&
      isDeepStrictEqual(outcome.refusal, card.refusal.refusal)
    );
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
 * A value for each identity question (`Question.shared`) the grid
 * answers, and a second for the body that answers it twice. A free-form
 * answer's shape is not something a question declares, so this is the
 * one fixed list here besides the seeded files; a shared question with
 * no entry fails the sweep, naming itself.
 */
const IDENTITY_SAMPLES: Readonly<Record<string, readonly [string, string]>> = {
  basePackage: ['org.grid', 'org.twice'],
  projectName: ['grid-app', 'twice-app'],
  modulePath: ['example.org/grid-app', 'example.org/twice-app'],
  npmScope: ['grid', 'twice'],
};

/** A body I9 sends to a preview and to a dry-run install alike. */
export interface AnswerBody {
  /** Names the pair of cells: `default`, `answered`, `borrowed`, `twice`. */
  readonly name: string;
  readonly answers: PresetAnswers;
}

/**
 * The bodies I9 holds a preset to, derived from the questions its
 * preview asked with no answers, and the adapters' own declarations:
 *
 * - `default` — no answers at all;
 * - `answered` — every adapter's question the preview asked, answered
 *   away from its default (another choice it offers, or an identity
 *   sample), under the id the preview bound it to;
 * - `borrowed` — the same, each answer whose adapter borrows from a
 *   sibling (`Adapter.sharesAnswersWith`) keyed to its first sibling
 *   instead: the body a form carries from one preset to the next, and
 *   where preview and install used to part — a Quarkus REST bootstrap's
 *   package previewed as the default on `quarkus-cli-rest`, and was
 *   installed as given;
 * - `twice` — both at once, the sibling's copy carrying a second value:
 *   one question given two answers, which the install refuses as the
 *   preview reports it.
 *
 * The last two only where some answer has a sibling to go under. A
 * question with nothing to answer it with but its default is left out.
 */
export function answerBodies(
  registry: Registry,
  questions: readonly PendingQuestion[],
): readonly AnswerBody[] {
  const adapters = adaptersById(registry);
  const answered: Record<string, Record<string, string>> = {};
  const borrowed: Record<string, Record<string, string>> = {};
  const again: Record<string, Record<string, string>> = {};
  let shares = false;
  for (const question of questions) {
    const binding = question.binding;
    if (binding.kind !== 'answer') continue;
    const adapter = adapters.get(binding.adapter);
    if (adapter === undefined) continue;
    const values = sampleOf(question);
    if (values === null) continue;
    const [value, second] = values;
    (answered[binding.adapter] ??= {})[binding.question] = value;
    const sibling = adapter.sharesAnswersWith?.[0];
    const key = sibling ?? binding.adapter;
    if (sibling !== undefined) {
      shares = true;
      (again[sibling] ??= {})[binding.question] = second;
    }
    (borrowed[key] ??= {})[binding.question] = value;
  }
  const bodies: AnswerBody[] = [
    { name: 'default', answers: {} },
    { name: 'answered', answers: answered },
  ];
  if (!shares) return bodies;
  const twice: Record<string, Record<string, string>> = structuredClone(answered);
  for (const [key, byQuestion] of Object.entries(again)) {
    twice[key] = { ...(twice[key] ?? {}), ...byQuestion };
  }
  return [...bodies, { name: 'borrowed', answers: borrowed }, { name: 'twice', answers: twice }];
}

/**
 * Two values for `question` other than its default — its choices, or
 * an identity sample — or null when it has nothing else to be.
 */
function sampleOf(question: PendingQuestion): readonly [string, string] | null {
  if (question.choices !== undefined) {
    const values = question.choices.map((choice) => choice.value);
    const first = values.find((value) => value !== question.default);
    if (first === undefined) return null;
    return [first, values.find((value) => value !== first) ?? first];
  }
  if (question.shared === undefined) return null;
  return identitySamples(question);
}

/**
 * The two values {@link IDENTITY_SAMPLES} keeps for an identity
 * question (`Question.shared`), for any sweep that answers one — the
 * grid's I9 bodies, and the weekly lane's every choice of every
 * question. A shared question with no entry fails the sweep, naming
 * itself.
 */
export function identitySamples(question: PendingQuestion): readonly [string, string] {
  const sample = IDENTITY_SAMPLES[question.id];
  if (sample === undefined) {
    throw new Error(
      `identity question '${question.id}' has no sample in the grid's IDENTITY_SAMPLES — add one`,
    );
  }
  return sample;
}

/** Every adapter a run could resolve, by id: the registered verticals' and the stacks' own. */
function adaptersById(registry: Registry): ReadonlyMap<string, Adapter> {
  const verticals = [
    ...registry.verticals(),
    ...registry.stacks().flatMap((stack) => stack.verticals),
  ];
  return new Map(
    verticals.flatMap((vertical) => vertical.adapters).map((adapter) => [adapter.id, adapter]),
  );
}

/**
 * The two cells {@link holdParity} sweeps one body as: its preview, and
 * a dry-run install of it. Named apart where the preview's id belongs
 * to a family another reader keys on — brownfield's and composite's
 * `add:` cards, which the docs' compatibility matrix reads by that
 * prefix — so the install's id stays out of that family.
 */
export interface ParityCells {
  /** The preview's cell id, under which an I9 disagreement is recorded. */
  readonly preview: string;
  /** The dry-run install's cell id. */
  readonly install: string;
}

/** What {@link holdParity} held: the install's outcome, and what it staged. */
export interface ParityHeld {
  readonly install: Outcome<InstallReport>;
  /** What the install staged, as {@link Grid.staged} reads it back; null where it was not Ok. */
  readonly staged: readonly string[] | null;
}

/**
 * Holds one body to I9, as the cells `cell` (its preview) and
 * `cell!install` (a dry-run install of it, non-interactive as `keel ui`
 * installs) — or the two {@link ParityCells} name: each stages into a
 * directory of its own — or both into `cwd`, the project a target that
 * adds to one runs in, which neither writes — and they agree when
 *
 * - the preview refuses, and the install refuses under the same code in
 *   the same sentence;
 * - the preview reports an answer the run does not read, and the
 *   install refuses in the first one's code and sentence
 *   (`InstallPreview.unusedAnswers`);
 * - or neither does, and both stage the same bytes, file for file.
 *
 * A disagreement is recorded under the preview's cell. Neither cell may
 * have been swept yet ({@link Grid.staged}), so a preview another
 * invariant reads too is swept here first, and read from the record
 * after. Resolves to the install's outcome and what it staged, for a
 * caller that holds what it ran to more than parity.
 */
export async function holdParity(
  grid: Grid,
  cell: string | ParityCells,
  target: InstallTarget,
  answers: PresetAnswers,
  cwd?: string,
): Promise<ParityHeld> {
  const cells = typeof cell === 'string' ? { preview: cell, install: `${cell}!install` } : cell;
  const previewAt = cwd ?? (await grid.scratch());
  const installAt = cwd ?? (await grid.scratch());
  const previewing = previewQuery({ cwd: previewAt, target, answers });
  const installing = installCommandFor(target, {
    cwd: installAt,
    answers,
    interactive: false,
    dryRun: true,
  });
  const previewed = await grid.staged(cells.preview, previewing, previewAt);
  const installed = await grid.staged(cells.install, installing, installAt);
  // Answered from the record: both cells are swept already.
  const preview = await grid.cell(cells.preview, previewing);
  const install = await grid.cell(cells.install, installing);
  const unused = preview.value?.unusedAnswers?.[0];
  const agree =
    preview.verdict !== OK
      ? install.verdict === preview.verdict && install.message === preview.message
      : unused !== undefined
        ? install.verdict === unused.code && install.message === unused.message
        : install.verdict === OK && JSON.stringify(installed) === JSON.stringify(previewed);
  if (!agree) grid.violate('I9', cells.preview);
  return { install, staged: installed };
}

/**
 * What `keel add` can name of what the project `status` reads records,
 * in recorded order: each recorded vertical `catalog` lists
 * (`keel.catalog`'s verticals). What that leaves out is derived, never
 * listed — today `bounded-context`, the row `keel add module` records,
 * and a product root's glue, `fullstack`.
 */
export function nameableOf(status: ProjectStatus, catalog: readonly string[]): readonly string[] {
  return status.installed.map((vertical) => vertical.id).filter((id) => catalog.includes(id));
}

/**
 * Holds the project in `cwd` to I11 as the cell `cell`: its whole
 * re-render — one `keel add --reapply` naming `verticals`, every
 * recorded vertical `keel add` can name ({@link nameableOf}), as a dry
 * run — comes back Ok, resolves an adapter of every vertical it names
 * (its report's `resolvedAdapters`, so a re-render that skips one
 * cannot pass for one that changed nothing), and stages nothing, read
 * back byte for byte through the Trees it opened ({@link Grid.staged}),
 * not off its report.
 */
export async function holdFixedPoint(
  grid: Grid,
  cell: string,
  verticals: readonly string[],
  cwd: string,
): Promise<void> {
  const whole = installCommandFor(
    { kind: 'add-vertical', verticals, reapply: true },
    { cwd, answers: {}, interactive: false, dryRun: true },
  );
  const staged = await grid.staged(cell, whole, cwd);
  // Answered from the record: the cell is swept already.
  const report = (await grid.cell(cell, whole)).value;
  const reached = reachesAll(grid.registry, report, verticals);
  if (staged === null || staged.length > 0 || !reached) grid.violate('I11', cell);
}

/**
 * Whether a run's `report` — null where it was refused — resolved an
 * adapter of each of `verticals`: what tells a re-render that skips one
 * from one that changes nothing, since both stage nothing.
 */
function reachesAll(
  registry: Registry,
  report: InstallReport | null,
  verticals: readonly string[],
): boolean {
  const adapters = adaptersById(registry);
  const reached = new Set(
    (report?.resolvedAdapters ?? []).map((resolved) => adapters.get(resolved.id)?.vertical),
  );
  return report !== null && verticals.every((vertical) => reached.has(vertical));
}

/**
 * Holds every re-render of the project in `cwd`, which `status` reads,
 * to I9 and I11, as cells under `scope`:
 *
 * - `reapply:<scope>+<v>` — `keel add v --reapply`, for each recorded
 *   vertical `keel add` can name ({@link nameableOf} over `catalog`),
 *   previewed as it installs ({@link holdParity}), and its install Ok
 *   with an adapter of `v` among its `resolvedAdapters` and staging
 *   nothing (I11, under the pair's key) — since parity alone holds as
 *   well for a body, or an engine, that re-renders nothing, and a
 *   re-render within the recorded composition (roadmap S.7) keeps what
 *   every other vertical wrote into the files it rewrites;
 * - `refresh:<scope>+<card>~<v>` — the add of the project's first
 *   `ready` card, in the order `keel.project-status` lists them, with
 *   `--refresh v`, for each of those verticals, the same, but for what
 *   it stages, which is the card's; none where no card is ready, or
 *   where `refresh` is false;
 * - `fixed:<scope>` — all of them at once, re-rendering each and
 *   staging nothing ({@link holdFixedPoint}).
 *
 * Every dispatch runs in `cwd` itself, and none writes.
 */
export async function holdRerenders(
  grid: Grid,
  scope: string,
  status: ProjectStatus,
  catalog: readonly string[],
  cwd: string,
  refresh = true,
): Promise<void> {
  const recorded = nameableOf(status, catalog);
  const rerenders = async (
    cell: string,
    target: InstallTarget,
    vertical: string,
    stagesNothing: boolean,
  ) => {
    const { install, staged } = await holdParity(grid, cell, target, {}, cwd);
    const stages = stagesNothing && staged?.length !== 0;
    if (stages || !reachesAll(grid.registry, install.value, [vertical])) {
      grid.violate('I11', cell);
    }
  };
  for (const vertical of recorded) {
    const target: InstallTarget = { kind: 'add-vertical', verticals: [vertical], reapply: true };
    await rerenders(`reapply:${scope}+${vertical}`, target, vertical, true);
  }
  const card = status.available.find((candidate) => candidate.readiness === 'ready');
  if (card !== undefined && refresh) {
    for (const vertical of recorded) {
      const target: InstallTarget = {
        kind: 'add-vertical',
        verticals: [card.id],
        refresh: [vertical],
      };
      await rerenders(`refresh:${scope}+${card.id}~${vertical}`, target, vertical, false);
    }
  }
  await holdFixedPoint(grid, `fixed:${scope}`, recorded, cwd);
}

/**
 * Holds the product root in `root`, scaffolded, to I13 as the cell
 * `cell`: a monorepo product runs as its root says.
 *
 * - Every service its `compose.yaml` builds — `build: <context>`, or
 *   `{ context, dockerfile }` — finds that `Dockerfile` (so named where
 *   unnamed) under its context, a relative one. A service with no body
 *   fails.
 * - Every file a service mounts from the root, a volume whose source,
 *   short-form or long, starts `./`, is there.
 * - Its `README.md` has a `cd <service> && <command>` line, and one
 *   for each context the compose file builds.
 * - Every such line names a directory of the product, relative (not
 *   `/…` or `~…`), inside the root and not the root itself, and each
 *   step of the command, split on `&&` with any leading `VAR=value`
 *   dropped, names what its runner needs there ({@link RUNNERS}). A
 *   `./target/debug/…` step needs a debug `cargo build` step before it
 *   (no `--release`, `-r`, or `--profile` but `dev`). A runner the
 *   table does not know fails the line. So does an HTML entity
 *   anywhere in it, since what a reader pastes into a shell is then
 *   not what the glue meant, and any of {@link OPERATOR}'s characters,
 *   since a run line in a README is plain.
 *
 * A root with no `compose.yaml`, a polyrepo product's, builds nothing
 * and holds trivially. It records no verdict, so no golden moves. What
 * it sees that no verdict does: a `compose.yaml` that builds a
 * directory the glue wrote no image for composes, previews and installs
 * Ok, and only `docker compose up --build` fails on it.
 *
 * @returns whether the root has a `compose.yaml` to hold, so a caller
 *   can tell a monorepo root held from one that held trivially.
 */
export async function holdProductRuns(grid: Grid, cell: string, root: string): Promise<boolean> {
  const composeFile = path.join(root, 'compose.yaml');
  if (!(await fs.pathExists(composeFile))) return false;
  const compose = (parseYaml(await fs.readFile(composeFile, 'utf8')) ?? {}) as Compose;
  const held: boolean[] = [];
  const contexts: string[] = [];
  for (const service of Object.values(compose.services ?? {})) {
    if (service === null) {
      held.push(false);
      continue;
    }
    if (service.build !== undefined) {
      held.push(await builds(root, service.build));
      contexts.push(insideOf(root, contextOf(service.build)));
    }
    for (const volume of service.volumes ?? []) held.push(await mounts(root, volume));
  }
  const readme = path.join(root, 'README.md');
  const lines = (await fs.pathExists(readme))
    ? (await fs.readFile(readme, 'utf8')).split('\n')
    : [];
  const runLines = lines.flatMap((line) => RUN_LINE.exec(line)?.[1] ?? []);
  held.push(runLines.length > 0);
  const served = new Set(runLines.map((run) => insideOf(root, wordsOf(run)[1] ?? '')));
  for (const context of contexts) held.push(served.has(context));
  for (const run of runLines) held.push(await runsAt(root, run));
  if (held.includes(false)) grid.violate('I13', cell);
  return true;
}

/** A root `compose.yaml`, as far as {@link holdProductRuns} reads one. */
interface Compose {
  readonly services?: Readonly<
    Record<
      string,
      {
        readonly build?: ComposeBuild;
        readonly volumes?: readonly (string | { readonly source?: string })[];
      } | null
    >
  >;
}

/** A compose service's `build`, in its short form or its long one. */
type ComposeBuild = string | { readonly context?: string; readonly dockerfile?: string };

/** A README line that changes into a directory and runs something there, less its comment. */
const RUN_LINE = /^\s*(cd\s.*?)(?:\s+#.*)?$/;

/** A named or numeric character reference, as `<%=` escapes `&` into one. */
const ENTITY = /&(?:[a-z][a-z0-9]*|#\d+|#x[\da-f]+);/i;

/** Every {@link ENTITY} in a line. */
const ENTITIES = new RegExp(ENTITY.source, 'gi');

/**
 * What a plain run line never holds: a control operator other than
 * `&&` (`;`, `|`, `||`, a lone `&`), whose steps would go unread; a
 * substitution (a backtick, `$(`); a redirection (`<`, `>`); a quote;
 * or a backslash.
 */
const OPERATOR = /[;|`<>'"\\]|\$\(|(?<!&)&(?!&)/;

/** A shell variable assignment, as a run hint prefixes its runner with one. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function contextOf(build: ComposeBuild): string {
  return (typeof build === 'string' ? build : build.context) ?? '.';
}

async function builds(root: string, build: ComposeBuild): Promise<boolean> {
  if (!isRelative(contextOf(build))) return false;
  const dockerfile = (typeof build === 'string' ? undefined : build.dockerfile) ?? 'Dockerfile';
  return fs.pathExists(path.join(root, contextOf(build), dockerfile));
}

function isRelative(dir: string): boolean {
  return !path.isAbsolute(dir) && !dir.startsWith('~');
}

function insideOf(root: string, dir: string): string {
  return path.relative(root, path.join(root, dir));
}

async function mounts(
  root: string,
  volume: string | { readonly source?: string },
): Promise<boolean> {
  const source = typeof volume === 'string' ? volume.split(':')[0] : volume.source;
  // A named volume, or a path that is not the product's: nothing of the root's to find.
  if (source === undefined || !source.startsWith('./')) return true;
  return fs.pathExists(path.join(root, source));
}

/**
 * Whether the run line `line` (`cd <dir> && <step> && …`) changes into a
 * directory of the product at `root` and runs, in it, only steps whose
 * runner finds what it needs there.
 */
async function runsAt(root: string, line: string): Promise<boolean> {
  if (ENTITY.test(line)) return false;
  // Read less its entities, so an entity fails the line on the clause above alone.
  if (OPERATOR.test(line.replace(ENTITIES, ''))) return false;
  const [into = [], ...steps] = line.split('&&').map(wordsOf);
  const [verb, dir, ...rest] = into;
  if (verb !== 'cd' || dir === undefined || rest.length > 0 || steps.length === 0) return false;
  if (!isRelative(dir)) return false;
  const service = path.join(root, dir);
  const inside = insideOf(root, dir);
  if (inside === '' || inside.startsWith('..') || !(await isDirectory(service))) return false;
  let built = false;
  for (const [runner = '', ...args] of steps) {
    if (DEBUG_BINARY.test(runner) && !built) return false;
    if (!(await runs(service, runner, args))) return false;
    built ||= runner === 'cargo' && isDebugBuild(args);
  }
  return true;
}

/** Whether `cargo <args>` builds into `target/debug`: a build on the `dev` profile. */
function isDebugBuild(args: readonly string[]): boolean {
  if (args[0] !== 'build' || args.includes('--release') || args.includes('-r')) return false;
  const at = args.indexOf('--profile');
  const named = args.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
  const profile = at < 0 ? named : args[at + 1];
  return profile === undefined || profile === 'dev';
}

/** A step's words, its leading `VAR=value` assignments dropped. */
function wordsOf(step: string): readonly string[] {
  const words = step.trim().split(/\s+/).filter(Boolean);
  const first = words.findIndex((word) => !ASSIGNMENT.test(word));
  return first < 0 ? [] : words.slice(first);
}

/**
 * What each runner a product's run hint uses needs in the service it
 * runs in, by the step's first word. A runner this does not list — a
 * pointer to a README, say — runs nothing, so a family whose hint uses
 * a new one teaches it here, or I13 fails its product.
 */
const RUNNERS: ReadonlyMap<string, (dir: string, args: readonly string[]) => Promise<boolean>> =
  new Map([
    ['./gradlew', gradleRuns],
    ['./mvnw', mavenRuns],
    ['go', goRuns],
    ['npm', scriptRuns],
    ['pnpm', scriptRuns],
    ['cargo', cargoRuns],
  ]);

/** The path of a binary `cargo build` leaves, by its name or, globbed, the end of it. */
const DEBUG_BINARY = /^\.\/target\/debug\/(\*?)([^*/]+)$/;

async function runs(dir: string, runner: string, args: readonly string[]): Promise<boolean> {
  const binary = DEBUG_BINARY.exec(runner);
  if (binary !== null) return builtBinary(dir, binary[1] === '*', binary[2] ?? '');
  return (await RUNNERS.get(runner)?.(dir, args)) ?? false;
}

/** `./gradlew <task>…`: each task's project (`:a:b:task` → `a/b`) has a build file. */
async function gradleRuns(dir: string, args: readonly string[]): Promise<boolean> {
  const tasks = args.filter((arg) => !arg.startsWith('-'));
  for (const task of tasks) {
    const project = path.join(dir, ...task.split(':').slice(0, -1));
    const kotlin = await fs.pathExists(path.join(project, 'build.gradle.kts'));
    if (!kotlin && !(await fs.pathExists(path.join(project, 'build.gradle')))) return false;
  }
  return tasks.length > 0;
}

/** `./mvnw … -pl <module>[,…] <goal>`: each module it names, or the project, has a POM. */
async function mavenRuns(dir: string, args: readonly string[]): Promise<boolean> {
  const at = args.indexOf('-pl');
  const modules = at < 0 ? ['.'] : (args[at + 1] ?? '').split(',');
  for (const name of modules) {
    if (name === '' || !(await fs.pathExists(path.join(dir, name, 'pom.xml')))) return false;
  }
  return true;
}

/** `go run <package>`: the package, a directory holding Go source. */
async function goRuns(dir: string, args: readonly string[]): Promise<boolean> {
  const [verb, pkg] = args;
  if (verb !== 'run' || pkg === undefined) return false;
  const files = await fs.readdir(path.join(dir, pkg)).catch((): string[] => []);
  return files.some((file) => file.endsWith('.go'));
}

/** `npm run <script>`, or pnpm's: the service's `package.json` has the script. */
async function scriptRuns(dir: string, args: readonly string[]): Promise<boolean> {
  const [verb, script] = args;
  const manifest = path.join(dir, 'package.json');
  if (verb !== 'run' || script === undefined || !(await fs.pathExists(manifest))) return false;
  const { scripts = {} } = (await fs.readJson(manifest)) as {
    readonly scripts?: Readonly<Record<string, string>>;
  };
  return Object.hasOwn(scripts, script);
}

/**
 * `cargo build`: a Cargo manifest. `cargo run`: one declaring a single
 * binary, since with two it cannot tell which to run.
 */
async function cargoRuns(dir: string, args: readonly string[]): Promise<boolean> {
  const binaries = await cargoBinaries(dir);
  if (binaries === null) return false;
  return args[0] === 'build' || (args[0] === 'run' && binaries.length === 1);
}

/** `./target/debug/<name>`, or `*<end>`: exactly one binary the manifest declares, so named. */
async function builtBinary(dir: string, glob: boolean, name: string): Promise<boolean> {
  const binaries = (await cargoBinaries(dir)) ?? [];
  const named = binaries.filter((binary) => (glob ? binary.endsWith(name) : binary === name));
  return named.length === 1;
}

/**
 * The binaries the Cargo manifest in `dir` declares — each `[[bin]]`'s
 * name, or the package's where it declares none — or null where there
 * is no manifest. Read line by line: keel's manifests name each on a
 * line of its own. It reads declared targets only: it discovers no
 * `src/main.rs` or `src/bin/*.rs`, and a `[lib]`-only package still
 * counts its own name as a binary.
 */
async function cargoBinaries(dir: string): Promise<readonly string[] | null> {
  const manifest = path.join(dir, 'Cargo.toml');
  if (!(await fs.pathExists(manifest))) return null;
  const bins: string[] = [];
  let pkg: string | undefined;
  let table = '';
  for (const line of (await fs.readFile(manifest, 'utf8')).split('\n')) {
    const header = /^\s*(\[\[?[^\]"]+\]\]?)\s*(?:#.*)?$/.exec(line)?.[1];
    if (header !== undefined) table = header;
    const name = /^\s*name\s*=\s*"([^"]*)"/.exec(line)?.[1];
    if (name !== undefined && table === '[[bin]]') bins.push(name);
    if (name !== undefined && table === '[package]') pkg = name;
  }
  return bins.length > 0 ? bins : pkg === undefined ? [] : [pkg];
}

async function isDirectory(dir: string): Promise<boolean> {
  return (await fs.stat(dir).catch(() => null))?.isDirectory() === true;
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
    if (result.ok) return { verdict: OK, value: result.value, message: null };
    const { code, message } = result.error;
    return result.error instanceof RefusalError
      ? { verdict: code, value: null, message, refusal: result.error.refusal }
      : { verdict: code, value: null, message };
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
