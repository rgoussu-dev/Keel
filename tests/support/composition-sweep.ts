/**
 * The weekly composition sweep: the report-only lane beside mutation
 * testing that the composition grid's default-dials reading leaves out
 * (`docs/roadmap.md` → Q3.4, "The measure").
 *
 * The grid ratchets what keel's composition surface answers on each
 * preset's opening dials — each extra alone, and the whole menu — fast
 * enough for `verify`. This lane asks the same engine the questions
 * too large for a gate, on **every dial setting** `keel.dials` offers
 * ({@link everyDialSetting}):
 *
 *   - `extras` — every set of offered extras (the full powerset),
 *     named backwards and, for up to three, in every order —
 *     previewed and installed as a dry run;
 *   - `arrival` — every ordered pair of offered extras, and each extra
 *     on its own, arriving in one run and in two, installed for real;
 *   - `choices` — every choice of every question the whole menu, no
 *     extra, or any one extra with what it needs asks, previewed and
 *     installed as a dry run.
 *
 * **Scenario.** Cells are derived from the replies, never listed:
 * presets from `keel.catalog`, settings from {@link walkDials} (the walk
 * `application/web/dials.test.ts` makes over `POST /api/dials`),
 * extras from each setting's menu, closures through the page's own
 * `toggleExtra`, questions from each preview. The fixed lists are the
 * grid's identity samples and {@link FREE_FORM_SAMPLES}: what a
 * free-form answer looks like is not something a question declares.
 *
 * **Factory.** The grid's {@link Grid}: the real mediator over the real
 * templates and filesystem, a fake process runner and no deferred
 * action. Nothing is kept per dispatch — a run is well over a hundred
 * thousand of them — only what differs, as a {@link Finding}.
 *
 * **Port.** `Mediator.dispatch`. The oracle is the engine's own answer,
 * compared with itself: a preview with its dry-run install, one naming
 * order with another, one run with two.
 *
 * **Report-only.** No golden and no known file: a red run is the
 * report. Each preset is a test of its own that collects every finding
 * before it fails, each naming the setting, the set or the answer as
 * the command line that reproduces it, and the two change lists — the
 * paths only one has, and the paths whose bytes differ. The suites
 * self-skip unless `KEEL_RUN_SWEEP=1`; `KEEL_SWEEP_STACKS` narrows a
 * run to the presets it lists.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { commandFor, commandText } from '../../assets/web/src/command.js';
import { toggleExtra } from '../../assets/web/src/target.js';
import type { InstallTarget, NewProjectTarget } from '../../src/domain/contract/commands.js';
import { encodeSelection } from '../../src/domain/contract/composition.js';
import { MANIFEST_FILENAME } from '../../src/domain/contract/manifest.js';
import {
  dialsQuery,
  type DialOptions,
  type PendingQuestion,
  type StackDescriptor,
} from '../../src/domain/contract/queries.js';
import {
  identitySamples,
  layoutsOf,
  OK,
  THROWN,
  type Grid,
  type Outcome,
} from './composition-grid.js';
import { offeredAsExtra, settledRun, walkDials } from './dial-walk.js';

/** Whether this run sweeps at all: `KEEL_RUN_SWEEP=1`, and nowhere else. */
export const SWEEP_OPTED_IN = process.env['KEEL_RUN_SWEEP'] === '1';

/**
 * The presets `KEEL_SWEEP_STACKS` narrows a run to — comma-separated
 * stack ids — or null when it is unset and every preset is swept.
 */
export const STACK_FILTER: readonly string[] | null = (() => {
  const listed = process.env['KEEL_SWEEP_STACKS'];
  if (listed === undefined || listed.trim() === '') return null;
  return listed
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
})();

/**
 * One preset's budget. The heaviest presets of the heaviest suite — a
 * product's `extras`, four of them interleaved in the one worker that
 * runs the file — took some 47 minutes each, about eleven alone: the
 * figure grows with how many heavy presets that file runs at once, not
 * with the runner's cores. This is nearly twice that and half the
 * workflow's own limit, so a preset that hangs fails by name.
 */
export const PRESET_TIMEOUT = 90 * 60_000;

/**
 * The most offered extras a setting's full powerset is swept over: 2¹²
 * sets. A single preset offers six at most; a polyrepo product offers
 * twelve, six in each service, and is swept whole. A setting that
 * passes the bound is swept over every set of up to three, the whole
 * menu less each one, and the whole menu instead, said with a warning
 * in the log rather than capped in silence.
 */
export const POWERSET_BOUND = 12;

/**
 * A value for each free-form question that is not about the project's
 * identity (the grid's identity samples answer those): something other
 * than its default, as a user would type it. A free-form question with
 * no entry fails the sweep, naming itself.
 */
const FREE_FORM_SAMPLES: Readonly<Record<string, string>> = {
  remote: 'https://example.org/sweep/app.git',
  defaultBranch: 'trunk',
};

/**
 * The catalog's presets a run sweeps: all of them, or those
 * {@link STACK_FILTER} names, in catalog order.
 */
export function sweptStacks(stacks: readonly StackDescriptor[]): readonly StackDescriptor[] {
  if (STACK_FILTER === null) return stacks;
  return stacks.filter((stack) => STACK_FILTER?.includes(stack.id));
}

/**
 * The ids {@link STACK_FILTER} names that the catalog has no preset
 * for — a typo that would otherwise sweep nothing and pass.
 */
export function unknownStacks(stacks: readonly StackDescriptor[]): readonly string[] {
  return (STACK_FILTER ?? []).filter((id) => !stacks.some((stack) => stack.id === id));
}

/**
 * Every dial setting `keel.dials` offers `stack`, each as the reply
 * that settled it: the {@link walkDials} walk from the blank target —
 * from one per repository layout on a product, the layouts its preview
 * asks about ({@link layoutsOf}) — and each setting reached with the
 * agent harness left out, where the reply lets it be. A setting
 * `keel.dials` does not answer Ok is a finding on `preset`, once, and
 * the walk goes on without it. The product's blank preview is the one
 * read that ends the preset if it is not Ok: the composite grid holds
 * it in `verify`.
 *
 * @param read how a target's dials are asked for: `keel.dials`, through
 *   {@link Grid.twin} so a throw is an answer too. A test of the walk
 *   hands in one that refuses a setting.
 */
export async function everyDialSetting(
  grid: Grid,
  stack: StackDescriptor,
  preset: PresetSweep,
  read: (target: NewProjectTarget) => Promise<Outcome<DialOptions>> = (target) =>
    grid.twin(dialsQuery({ target })),
): Promise<readonly DialOptions[]> {
  const unread = new Set<string>();
  const dials = async (target: NewProjectTarget): Promise<DialOptions | null> => {
    const reply = await read(target);
    if (reply.verdict === OK && reply.value !== null) return reply.value;
    const at = commandOf(target);
    if (!unread.has(at)) {
      unread.add(at);
      preset.find({ at, what: `a setting its dials offer, and keel.dials ${answered(reply)}` });
    }
    return null;
  };
  const layouts = stack.services.length === 0 ? [] : await layoutsOf(grid, stack.id);
  const seeds: NewProjectTarget[] =
    layouts.length === 0
      ? [{ kind: 'new-project', stack: stack.id }]
      : layouts.map((layout) => ({ kind: 'new-project', stack: stack.id, layout }));
  const walked = await walkDials(dials, seeds);
  const settings = new Map(walked.map((reply) => [JSON.stringify(reply.target), reply]));
  for (const reply of walked) {
    if (!reply.agentHarness) continue;
    const off = await dials({ ...(reply.target as NewProjectTarget), agentHarness: false });
    if (off === null) continue;
    const key = JSON.stringify(off.target);
    if (!settings.has(key)) settings.set(key, off);
  }
  return [...settings.values()];
}

/**
 * One extra a setting offers: a vertical, and the service of a product
 * it is for — null on a single preset, and where a product's extras are
 * named without their services ({@link bareSpelling}).
 */
export interface Extra {
  readonly service: string | null;
  readonly id: string;
}

/**
 * The extras a setting offers, in menu order: a single preset's menu,
 * or each service's of a product. An id a product's own menu offers
 * without a service is the one service's that takes it, spelled the
 * other way ({@link bareAliases}): one extra, not two, which the
 * `extras` suite names both ways.
 */
export function offeredExtras(dials: DialOptions): readonly Extra[] {
  if (dials.services.length === 0) {
    return dials.verticals
      .filter(offeredAsExtra)
      .map((vertical) => ({ service: null, id: vertical.id }));
  }
  return dials.services.flatMap((service) =>
    service.verticals
      .filter(offeredAsExtra)
      .map((vertical) => ({ service: service.path, id: vertical.id })),
  );
}

/**
 * On a product, each id its own menu offers without a service that
 * exactly one service's menu offers, and that service: `keel new
 * --with persistence` on `fullstack` is `--with backend:persistence`
 * (D7), and the sweep holds the two spellings to one tree.
 */
export function bareAliases(dials: DialOptions): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  if (dials.services.length === 0) return aliases;
  for (const vertical of dials.verticals.filter(offeredAsExtra)) {
    const takers = dials.services.filter((service) =>
      service.verticals.some((option) => option.id === vertical.id && offeredAsExtra(option)),
    );
    const [taker] = takers;
    if (takers.length === 1 && taker !== undefined) aliases.set(vertical.id, taker.path);
  }
  return aliases;
}

/**
 * `extras` ticked on `dials`' setting as the page ticks them — the
 * page's run settled on the reply, then `target.js`'s own
 * `toggleExtra`, each box bringing what it needs —
 * as the list of extras the target then names, in the order it names
 * them.
 */
export function ticked(dials: DialOptions, extras: readonly Extra[]): readonly Extra[] {
  let run = settledRun(dials);
  for (const extra of extras) run = toggleExtra(run, extra.id, true, extra.service);
  return namedBy(run.target as unknown as NewProjectTarget);
}

/** The extras `target` names, its own first and then each service's, in order. */
function namedBy(target: NewProjectTarget): readonly Extra[] {
  return [
    ...(target.extraVerticals ?? []).map((id) => ({ service: null, id })),
    ...Object.entries(target.services ?? {}).flatMap(([service, extras]) =>
      extras.extraVerticals.map((id) => ({ service, id })),
    ),
  ];
}

/**
 * `setting`'s target naming `extras`, in the order given: an id with no
 * service in `extraVerticals`, each other in its service's list. A
 * product's target names no `extraVerticals` of its own unless one is
 * named, as `keel.dials` settles it.
 */
export function naming(setting: NewProjectTarget, extras: readonly Extra[]): NewProjectTarget {
  const { extraVerticals: pinned, services: _services, ...rest } = setting;
  const own = extras.filter((extra) => extra.service === null).map((extra) => extra.id);
  const services: Record<string, { extraVerticals: string[] }> = {};
  for (const extra of extras) {
    if (extra.service !== null)
      (services[extra.service] ??= { extraVerticals: [] }).extraVerticals.push(extra.id);
  }
  return {
    ...rest,
    ...(pinned !== undefined || own.length > 0 ? { extraVerticals: own } : {}),
    ...(Object.keys(services).length > 0 ? { services } : {}),
  };
}

/**
 * `extras` spelled as `keel new --with` takes them on a product without
 * a service — `persistence` for `backend:persistence`
 * ({@link bareAliases}) — or null unless every one of them can be:
 * the two spellings mixed are refused (`keel.invalid-extra-verticals`),
 * and none is no second spelling at all.
 */
export function bareSpelling(
  dials: DialOptions,
  extras: readonly Extra[],
): readonly Extra[] | null {
  const aliases = bareAliases(dials);
  const aliased = (extra: Extra): boolean =>
    extra.service !== null && aliases.get(extra.id) === extra.service;
  if (extras.length === 0 || !extras.every(aliased)) return null;
  return extras.map((extra) => ({ service: null, id: extra.id }));
}

/** An extra as `--with` names it: `persistence`, or `backend:persistence` for a service's. */
export function spelled(extra: Extra): string {
  return extra.service === null ? extra.id : `${extra.service}:${extra.id}`;
}

/** A set of extras as one key, whatever order it is named in. */
export function setKey(extras: readonly Extra[]): string {
  return extras.map(spelled).sort().join(',');
}

/**
 * The sets of `items` to sweep: every subset, the empty one included —
 * or, past {@link POWERSET_BOUND}, every subset of up to three, the
 * whole less each one, and the whole (`capped`), which the caller says
 * out loud.
 */
export function subsetsOf<T>(items: readonly T[]): {
  readonly sets: readonly (readonly T[])[];
  readonly capped: boolean;
} {
  if (items.length <= POWERSET_BOUND) {
    const sets: T[][] = [];
    for (let mask = 0; mask < 2 ** items.length; mask++) {
      sets.push(items.filter((_, index) => (mask & (2 ** index)) !== 0));
    }
    return { sets, capped: false };
  }
  const small: T[][] = [];
  const grow = (from: number, set: readonly T[]): void => {
    small.push([...set]);
    if (set.length === 3) return;
    items.slice(from).forEach((item, index) => grow(from + index + 1, [...set, item]));
  };
  grow(0, []);
  const large = items.map((_, index) => items.filter((__, other) => other !== index));
  return { sets: [...small, ...large, [...items]], capped: true };
}

/**
 * The answers to sweep for one question: each choice it offers — for a
 * `multi-select`, none, each one alone, and all — or, for a free-form
 * question, one sample: the grid's for an identity question, and
 * {@link FREE_FORM_SAMPLES}' for any other.
 */
export function answersFor(question: PendingQuestion): readonly string[] {
  const choices = (question.choices ?? []).map((choice) => choice.value);
  if (choices.length > 0) {
    if (question.kind !== 'multi-select') return choices;
    return [...new Set(['', ...choices, encodeSelection(choices)])];
  }
  if (question.shared !== undefined) return [identitySamples(question)[0]];
  const sample = FREE_FORM_SAMPLES[question.id];
  if (sample === undefined) {
    throw new Error(
      `free-form question '${question.id}' has no sample in the sweep's FREE_FORM_SAMPLES — add one`,
    );
  }
  return [sample];
}

/**
 * An install body as the command line that runs it — the page's own
 * rendering (`command.js`), so a finding reads as something to paste.
 */
export function commandOf(
  target: InstallTarget,
  answers: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): string {
  return commandText(commandFor({ cwd: '.', target, answers }));
}

function threw(outcome: Outcome<unknown>): boolean {
  return outcome.verdict.startsWith(THROWN);
}

/**
 * What a dispatch did, as the end of a finding's sentence: `is Ok`,
 * `refuses as <code>: <sentence>`, or `throws <Error>: <message>`.
 */
export function answered(outcome: Outcome<unknown>): string {
  if (outcome.verdict === OK) return 'is Ok';
  if (threw(outcome)) {
    return `throws ${outcome.verdict.slice(THROWN.length)}: ${outcome.message ?? ''}`;
  }
  return `refuses as ${outcome.verdict}: ${outcome.message ?? ''}`;
}

/** The most paths a finding lists in one group before it counts the rest. */
const LISTED = 12;

function listed(paths: readonly string[]): string {
  const shown = paths.slice(0, LISTED).join(', ');
  return paths.length > LISTED ? `${shown} … and ${paths.length - LISTED} more` : shown;
}

/**
 * What two change lists, or two trees, differ in: how many paths each
 * holds, and which paths differ — those only one holds, and those both
 * hold with another kind or other bytes, each group a line.
 */
export interface Difference {
  /** How many paths each side holds: `preview: 143 files; dry-run install: 141 files`. */
  readonly sizes: string;
  /** One line per group of differing paths, each naming the side it is about. */
  readonly paths: readonly string[];
  /**
   * What kind of difference it is, where two trees were compared
   * ({@link treeDifference}): `record` — the same files, and only a
   * manifest's record of them differs; `order` — the same files but
   * for lines in another order, a manifest's record perhaps too;
   * `added` — files only the second tree holds, a manifest's record
   * perhaps too, and nothing else; `content` — anything else. Always
   * `content` between change lists.
   */
  readonly nature: 'record' | 'order' | 'added' | 'content';
}

/**
 * Two change lists, as the grid's `Grid.stages` reads them back — one
 * line per path, `<kind> <path> <digest>` — compared: null when they
 * are the same, line for line, as the grid's I8 and I9 compare them. A
 * path one list stages more than once — two Trees writing it — is a
 * group of its own.
 */
export function stagedDifference(
  left: { readonly label: string; readonly staged: readonly string[] },
  right: { readonly label: string; readonly staged: readonly string[] },
): Difference | null {
  const lines = (staged: readonly string[]): string => [...staged].sort().join('\n');
  if (lines(left.staged) === lines(right.staged)) return null;
  const byPath = (staged: readonly string[]): Map<string, string> =>
    new Map(staged.map((line) => [pathOf(line), line]));
  const repeated = (staged: readonly string[]): readonly string[] => {
    const paths = staged.map(pathOf);
    return [...new Set(paths.filter((file, index) => paths.indexOf(file) !== index))];
  };
  const a = byPath(left.staged);
  const b = byPath(right.staged);
  const differing = [...a.keys()].filter((file) => b.has(file) && b.get(file) !== a.get(file));
  return pathsDifference(
    {
      label: left.label,
      count: a.size,
      only: [...a.keys()].filter((file) => !b.has(file)),
      repeated: repeated(left.staged),
    },
    {
      label: right.label,
      count: b.size,
      only: [...b.keys()].filter((file) => !a.has(file)),
      repeated: repeated(right.staged),
    },
    differing,
    'content',
  );
}

/** The path of a staged line, `<kind> <path> <digest>`: a path may hold spaces. */
function pathOf(line: string): string {
  return line.slice(line.indexOf(' ') + 1, line.lastIndexOf(' '));
}

/** One side of a comparison: the paths it holds that the other does not, and how many it holds. */
interface Side {
  readonly label: string;
  readonly count: number;
  readonly only: readonly string[];
  /** Paths a change list stages more than once. */
  readonly repeated?: readonly string[];
}

function pathsDifference(
  left: Side,
  right: Side,
  differing: readonly string[],
  nature: Difference['nature'],
): Difference | null {
  const groups: readonly (readonly [string, readonly string[]])[] = [
    [`only in ${left.label}`, left.only],
    [`only in ${right.label}`, right.only],
    [`staged more than once in ${left.label}`, left.repeated ?? []],
    [`staged more than once in ${right.label}`, right.repeated ?? []],
    ['differing', differing],
  ];
  const paths = groups
    .filter(([, files]) => files.length > 0)
    .map(([group, files]) => `${group}: ${listed(files)}`);
  if (paths.length === 0) return null;
  return {
    sizes: `${left.label}: ${counted(left.count, 'file')}; ${right.label}: ${counted(right.count, 'file')}`,
    paths,
    nature,
  };
}

/**
 * Every file under `root`, by path from it, with its bytes — each keel
 * manifest normalised ({@link normalisedManifest}), since the moment a
 * vertical arrived, and the order it arrived in, is the one thing two
 * runs that reach one project may differ in.
 */
export async function treeOf(root: string): Promise<ReadonlyMap<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else {
        const bytes = await fs.readFile(absolute);
        files.set(
          path.relative(root, absolute),
          entry.name === MANIFEST_FILENAME ? normalisedManifest(bytes) : bytes,
        );
      }
    }
  };
  await walk(root);
  return files;
}

/**
 * A manifest with what records *when* and *in what order* taken out:
 * every `installedAt` and `updatedAt` set to one value, every object's
 * keys sorted (an answer is recorded under its adapter as it arrives),
 * and the lists that grow in arrival order — verticals, file entries,
 * contexts, services, peers — sorted. What is left is what the project
 * is.
 */
function normalisedManifest(bytes: Buffer): Buffer {
  const stamp = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stamp);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, field]) => [
          key,
          key === 'installedAt' || key === 'updatedAt' ? '(normalised)' : stamp(field),
        ]),
    );
  };
  const manifest = stamp(JSON.parse(bytes.toString('utf8'))) as Record<string, unknown>;
  const by =
    (...keys: string[]) =>
    (a: unknown, b: unknown): number => {
      const text = (item: unknown): string =>
        keys.map((key) => String((item as Record<string, unknown>)[key] ?? '')).join('\0');
      return text(a).localeCompare(text(b));
    };
  const sorted: Record<string, (a: unknown, b: unknown) => number> = {
    verticals: by('id'),
    entries: by('target', 'source'),
    modules: by('name'),
    services: by('path'),
    peers: by('ref'),
  };
  for (const [key, order] of Object.entries(sorted)) {
    const list = manifest[key];
    if (Array.isArray(list)) manifest[key] = [...list].sort(order);
  }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Two trees on disk compared file for file: null when they hold the
 * same files with the same bytes, or what differs — the files only one
 * holds, and those both hold that differ, each differing manifest
 * naming the fields it differs in and each other file saying when it
 * holds the same lines in another order. Which way they differ is its
 * {@link Difference.nature}: the second tree holding files the first
 * does not, and nothing else but a record, is `added`.
 */
export function treeDifference(
  left: { readonly label: string; readonly tree: ReadonlyMap<string, Buffer> },
  right: { readonly label: string; readonly tree: ReadonlyMap<string, Buffer> },
): Difference | null {
  const kinds = new Set<Difference['nature']>();
  const differing = [...left.tree.keys()]
    .filter((file) => {
      const other = right.tree.get(file);
      return other !== undefined && !other.equals(left.tree.get(file) ?? Buffer.alloc(0));
    })
    .sort()
    .map((file) => {
      const a = left.tree.get(file)?.toString('utf8') ?? '';
      const b = right.tree.get(file)?.toString('utf8') ?? '';
      if (path.basename(file) === MANIFEST_FILENAME) {
        kinds.add('record');
        const [x, y] = [JSON.parse(a), JSON.parse(b)] as Record<string, unknown>[];
        const fields = [...new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])].filter(
          (key) => JSON.stringify(x?.[key]) !== JSON.stringify(y?.[key]),
        );
        return `${file} (${fields.join(', ')})`;
      }
      const lines = (text: string): string => text.split('\n').sort().join('\n');
      if (lines(a) !== lines(b)) {
        kinds.add('content');
        return file;
      }
      kinds.add('order');
      return `${file} (the same lines, in another order)`;
    });
  const only = (from: ReadonlyMap<string, Buffer>, other: ReadonlyMap<string, Buffer>) =>
    [...from.keys()].filter((file) => !other.has(file)).sort();
  const onlyLeft = only(left.tree, right.tree);
  const onlyRight = only(right.tree, left.tree);
  const nature =
    kinds.has('content') || onlyLeft.length > 0 || (onlyRight.length > 0 && kinds.has('order'))
      ? 'content'
      : onlyRight.length > 0
        ? 'added'
        : kinds.has('order')
          ? 'order'
          : 'record';
  return pathsDifference(
    { label: left.label, count: left.tree.size, only: onlyLeft },
    { label: right.label, count: right.tree.size, only: onlyRight },
    differing,
    nature,
  );
}

/** A fresh empty directory under the OS's temp directory, for the caller to remove. */
export function scratchDirectory(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'keel-sweep-'));
}

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** One thing the sweep found: where, what, and the two change lists that differ. */
export interface Finding {
  /** The dial setting, the set or the answer, as the command line that reproduces it. */
  readonly at: string;
  /**
   * What does not hold, in a sentence naming no setting, so one finding
   * on two settings reads alike.
   */
  readonly what: string;
  /** The two change lists, where two were compared ({@link stagedDifference}, {@link treeDifference}). */
  readonly difference?: Difference;
}

/**
 * One preset's sweep in one suite: what it dispatched, counted, and
 * what it found, collected — every finding, not the first — for the
 * test to fail with once the preset is done.
 */
export class PresetSweep {
  /** Everything found, in the order found. */
  readonly findings: Finding[] = [];
  private readonly counts = new Map<string, number>();
  private readonly started = Date.now();

  /**
   * @param lane the suite: `extras`, `arrival` or `choices`.
   * @param stack the preset swept.
   */
  constructor(
    readonly lane: string,
    readonly stack: string,
  ) {}

  /** Counts `by` more of `what` — a setting, a set, a preview, an install. */
  count(what: string, by = 1): void {
    this.counts.set(what, (this.counts.get(what) ?? 0) + by);
  }

  /** Records a finding. */
  find(finding: Finding): void {
    this.findings.push(finding);
  }

  /** One line for the log: what was dispatched, what was found, and how long it took. */
  summary(): string {
    const counts = [...this.counts].map(([what, count]) => `${count} ${what}`).join(', ');
    const seconds = ((Date.now() - this.started) / 1000).toFixed(1);
    return (
      `[sweep:${this.lane}] ${this.stack}: ${counts}; ` +
      `${counted(this.findings.length, 'finding')} in ${counted(this.grouped().length, 'kind')}; ${seconds} s`
    );
  }

  /**
   * Every finding, for the failing assertion — grouped by what it says
   * and the paths it names, since one fact about two verticals shows on
   * every dial setting that offers both: each group once, then every
   * command line that reproduces it, with the sizes of what it compared.
   */
  report(): string {
    return [
      `${counted(this.findings.length, 'finding')} on ${this.stack} (${this.lane}), ` +
        `in ${counted(this.grouped().length, 'kind')}:`,
      ...this.grouped().map((group) => {
        const [first] = group;
        return [
          `- ${first?.what ?? ''}`,
          ...(first?.difference?.paths ?? []).map((line) => `    ${line}`),
          `  at ${group.length === 1 ? 'one reading' : `${group.length} readings`}:`,
          ...group.map(
            (finding) =>
              `    ${finding.at}${finding.difference === undefined ? '' : ` (${finding.difference.sizes})`}`,
          ),
        ].join('\n');
      }),
    ].join('\n\n');
  }

  private grouped(): readonly (readonly Finding[])[] {
    const groups = new Map<string, Finding[]>();
    for (const finding of this.findings) {
      const key = [finding.what, ...(finding.difference?.paths ?? [])].join('\n');
      const group = groups.get(key) ?? [];
      group.push(finding);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  /** What it took, for the lane's totals. */
  tally(): ReadonlyMap<string, number> {
    return new Map([...this.counts, ['findings', this.findings.length]]);
  }
}

/** A suite's totals over every preset it swept, printed once at the end. */
export class LaneTotals {
  private readonly totals = new Map<string, number>();
  private readonly started = Date.now();

  /** @param lane the suite: `extras`, `arrival` or `choices`. */
  constructor(readonly lane: string) {}

  /** Adds a preset's counts. */
  add(preset: PresetSweep): void {
    for (const [what, count] of preset.tally()) {
      this.totals.set(what, (this.totals.get(what) ?? 0) + count);
    }
  }

  /** One line: every count, and the wall time since the suite began. */
  summary(): string {
    const counts = [...this.totals].map(([what, count]) => `${count} ${what}`).join(', ');
    const minutes = ((Date.now() - this.started) / 60_000).toFixed(1);
    return `[sweep:${this.lane}] total: ${counts}; ${minutes} min`;
  }
}
