/**
 * Where an answer supplied up front may land — and which ones land
 * nowhere.
 *
 * `--set adapterId:questionId=value` and an install body's `answers`
 * name the adapter an answer is for. The install loop hands each
 * adapter only the answers keyed to it, or to a sibling it borrows
 * from (`Adapter.sharesAnswersWith`), for a question nothing recorded
 * answers yet, and says which ones it read (`./install.ts`). An answer
 * keyed to anything else reaches nothing. Before that it did worse than
 * nothing: it was seeded into the manifest of every scope the run
 * wrote, where an adapter scanning a fixed list of bootstrap ids found
 * a Quarkus package on a Spring project and split the package, and
 * `keel add` wrote it over an installed vertical's recorded answer
 * without re-rendering a file.
 *
 * So a run refuses, before anything is committed, every answer its
 * plan does not read ({@link unusedAnswers}):
 *
 *   - keyed to an adapter of a vertical being re-rendered that the
 *     manifest records answers for — {@link REAPPLY_FROZEN_ANSWERS_CODE};
 *   - keyed to an adapter of a vertical the project already has —
 *     {@link FROZEN_ANSWER_CODE}, since reconfiguring is not supported;
 *   - keyed to any other adapter outside the plan —
 *     {@link UNKNOWN_ANSWER_CODE}, naming the plan's adapters that do
 *     take answers;
 *   - naming a question its adapter does not ask — the same code,
 *     naming the questions it does;
 *   - once the run is known, one a reader of its key did not read, with
 *     a value other than the one it took: the question is shared and
 *     another key answering it was read first
 *     ({@link UNKNOWN_ANSWER_CODE}), or the project records its answer
 *     already ({@link FROZEN_ANSWER_CODE}). The same value sent under
 *     each key a shared question may be read under agrees with itself,
 *     and passes.
 *
 * `keel.preview` reports the same list (`InstallPreview.unusedAnswers`)
 * through the same function, over the plan its run resolved
 * (`InstallReport.resolvedAdapters`) and what its prompt read, so what
 * a preview calls unused is exactly what an install of that body
 * refuses.
 *
 * A value outside the choices its question offers the project is
 * refused where it reaches its adapter (`checkSuppliedAnswer` in
 * `./answers.ts`), which is before that adapter contributes anything.
 */

import { DomainError } from '../kernel/result.js';
import type { PresetAnswers, ResolvedAdapter } from '../contract/commands.js';
import type { Adapter, Vertical } from '../contract/composition.js';
import type { ManifestV2 } from '../contract/manifest.js';
import type { UnusedAnswer } from '../contract/queries.js';
import type { Registry } from '../contract/ports/registry.js';
import { answerKeys, answerUnder, type AnswerRead, type AnswersByKey } from './answers.js';
import {
  frozenAnswerSentence,
  reapplyFrozenSentence,
  recordedAnswerSentence,
  settledAnswerSentence,
  shadowedAnswerSentence,
  unknownAnswerSentence,
  unknownQuestionSentence,
} from './refusals.js';
import { installedVertical } from './registry.js';

/** The code an answer no adapter of the run's plan reads is refused with. */
export const UNKNOWN_ANSWER_CODE = 'keel.unknown-answer';

/** The code an answer for an installed vertical's adapter is refused with. */
export const FROZEN_ANSWER_CODE = 'keel.frozen-answer';

/**
 * The code an answer for an adapter of a vertical being re-rendered is
 * refused with, when the manifest records its answers: a re-render
 * reads those.
 */
export const REAPPLY_FROZEN_ANSWERS_CODE = 'keel.reapply-frozen-answers';

/** What a project already has, as the answer checks read it. */
export interface AnswerHistory {
  /** Which installed vertical owns an adapter id, if any. */
  owner(adapterId: string): Vertical | null;
  /** The answers the project's manifest records, by adapter id. */
  readonly recorded: AnswersByKey;
}

/** A greenfield run's {@link AnswerHistory}: nothing is installed or recorded yet. */
export const NOTHING_INSTALLED: AnswerHistory = { owner: () => null, recorded: {} };

/**
 * The {@link AnswerHistory} of a project on disk: its recorded answers,
 * and its installed verticals, found in the registry — or, for one no
 * brownfield flow offers (a product root's glue), among the stacks'
 * own.
 */
export function historyOf(registry: Registry, manifest: ManifestV2): AnswerHistory {
  const installed = manifest.verticals.flatMap(({ id }) => installedVertical(registry, id) ?? []);
  return {
    owner: (adapterId) =>
      installed.find((vertical) => vertical.adapters.some((adapter) => adapter.id === adapterId)) ??
      null,
    recorded: manifest.answers,
  };
}

/**
 * `adapters` as a run's report carries them: each once, in the order
 * it first ran, told by the ids an answer to it may be keyed to and
 * the questions it asks.
 */
export function resolvedAdapters(adapters: readonly Adapter[]): readonly ResolvedAdapter[] {
  const seen = new Set<string>();
  const resolved: ResolvedAdapter[] = [];
  for (const adapter of adapters) {
    if (seen.has(adapter.id)) continue;
    seen.add(adapter.id);
    resolved.push({
      id: adapter.id,
      questions: (adapter.questions ?? []).map((question) => question.id),
      ...(adapter.sharesAnswersWith === undefined
        ? {}
        : { sharesAnswersWith: adapter.sharesAnswersWith }),
    });
  }
  return resolved;
}

/**
 * Every supplied answer `plan` does not read, each with the refusal it
 * earns — those for an adapter of a vertical being re-rendered first,
 * then the rest in the order supplied, key by key and question by
 * question. Empty when every one lands.
 *
 * An adapter reads the answers keyed to its own id and to each
 * {@link Adapter.sharesAnswersWith} sibling, for the questions it
 * declares. A key the plan resolves itself is never frozen unless its
 * vertical is being re-rendered and the manifest records its answers.
 * A key it only borrows is, when an installed vertical owns it: that
 * answer is the installed vertical's, already recorded and rendered,
 * and taking a different value for it would leave the plan disagreeing
 * with what that vertical wrote.
 *
 * Without `reads` the reading is the one available before a run: an
 * answer some adapter of the plan would read, for a question it asks,
 * passes. With them — what the run, or a preview's prompt, did read —
 * it is exact: an answer none of its readers took is refused too,
 * because another key answering the same shared question was read
 * first, or because the project records that answer already — unless
 * what they took is this very value.
 *
 * @param plan - every adapter the run resolves, across all its scopes.
 * @param history - the project's installed verticals and recorded
 *   answers; {@link NOTHING_INSTALLED} for a new project.
 * @param reads - the supplied answers the run read; absent before it
 *   has run.
 */
export function unusedAnswers(
  supplied: PresetAnswers,
  plan: readonly ResolvedAdapter[],
  history: AnswerHistory,
  reads?: readonly AnswerRead[],
): readonly UnusedAnswer[] {
  const first: UnusedAnswer[] = [];
  const rest: UnusedAnswer[] = [];
  for (const [key, byQuestion] of Object.entries(supplied)) {
    for (const question of Object.keys(byQuestion)) {
      const refusal = refusalOf(supplied, key, question, plan, history, reads);
      if (refusal === null) continue;
      const unused = { adapter: key, question, ...refusal };
      (refusal.code === REAPPLY_FROZEN_ANSWERS_CODE ? first : rest).push(unused);
    }
  }
  return [...first, ...rest];
}

/**
 * The refusal of the first answer {@link unusedAnswers} finds unread —
 * the one an install gives — or null when every one lands.
 */
export function strayAnswerRefusal(
  supplied: PresetAnswers,
  plan: readonly ResolvedAdapter[],
  history: AnswerHistory,
  reads?: readonly AnswerRead[],
): DomainError | null {
  const [unused] = unusedAnswers(supplied, plan, history, reads);
  return unused === undefined ? null : new DomainError(unused.message, unused.code);
}

/** Why `key:question` lands nowhere, as a code and a sentence; null when it lands. */
function refusalOf(
  supplied: PresetAnswers,
  key: string,
  question: string,
  plan: readonly ResolvedAdapter[],
  history: AnswerHistory,
  reads: readonly AnswerRead[] | undefined,
): { readonly code: string; readonly message: string } | null {
  const answer = `${key}:${question}`;
  const own = plan.find((adapter) => adapter.id === key);
  const owner = history.owner(key);
  if (
    owner !== null &&
    Object.keys(history.recorded[key] ?? {}).length > 0 &&
    plan.some((adapter) => owner.adapters.some((candidate) => candidate.id === adapter.id))
  ) {
    // An installed vertical runs only to be re-rendered — from the
    // answers the manifest records, whichever of its adapters match.
    return { code: REAPPLY_FROZEN_ANSWERS_CODE, message: reapplyFrozenSentence(key, owner) };
  }
  if (own === undefined && owner !== null) {
    return { code: FROZEN_ANSWER_CODE, message: frozenAnswerSentence(owner, answer) };
  }
  const readers = plan.filter((adapter) => answerKeys(adapter).includes(key));
  if (readers.length === 0) {
    return { code: UNKNOWN_ANSWER_CODE, message: unknownAnswerSentence(answer, askersOf(plan)) };
  }
  const asked = [...new Set(readers.flatMap((reader) => reader.questions))];
  if (!asked.includes(question)) {
    // Only an adapter the plan runs can be said to ask no such
    // question: a borrowed key's own adapter may well ask it, it is
    // just nobody here that does.
    return {
      code: UNKNOWN_ANSWER_CODE,
      message:
        own === undefined
          ? unknownAnswerSentence(answer, askersOf(plan))
          : unknownQuestionSentence(key, question, asked),
    };
  }
  if (reads === undefined) return null;
  if (reads.some((read) => read.key === key && read.question === question)) return null;
  return unreadRefusal(supplied, key, question, readers, history, reads);
}

/**
 * Why an answer some adapter of the plan would read, for a question it
 * asks, was read by none of them: each had the question answered
 * already — by another key sent for it, read first, or by an answer the
 * project records. Null when that answer is this one's value: sending
 * a shared question's answer under each key that may carry it — both
 * bootstraps of a project with two entrypoints, say — agrees with
 * itself, and loses nothing.
 */
function unreadRefusal(
  supplied: PresetAnswers,
  key: string,
  question: string,
  readers: readonly ResolvedAdapter[],
  history: AnswerHistory,
  reads: readonly AnswerRead[],
): { readonly code: string; readonly message: string } | null {
  const answer = `${key}:${question}`;
  const value = supplied[key]?.[question];
  const asking = readers.filter((reader) => reader.questions.includes(question));
  const instead = reads.find(
    (read) => read.question === question && asking.some((reader) => reader.id === read.adapter),
  );
  if (instead !== undefined) {
    if (supplied[instead.key]?.[question] === value) return null;
    return {
      code: UNKNOWN_ANSWER_CODE,
      message: shadowedAnswerSentence(answer, `${instead.key}:${question}`),
    };
  }
  for (const reader of asking) {
    const recorded = answerUnder(history.recorded, answerKeys(reader), question);
    if (recorded === undefined) continue;
    if (recorded.value === value) return null;
    const owner = history.owner(recorded.key);
    return {
      code: FROZEN_ANSWER_CODE,
      message:
        owner === null
          ? recordedAnswerSentence(answer, `${recorded.key}:${question}`)
          : frozenAnswerSentence(owner, answer),
    };
  }
  return { code: UNKNOWN_ANSWER_CODE, message: settledAnswerSentence(answer) };
}

/** The plan's adapters that ask anything, once each, in plan order. */
function askersOf(plan: readonly ResolvedAdapter[]): readonly string[] {
  return [
    ...new Set(plan.filter((adapter) => adapter.questions.length > 0).map((adapter) => adapter.id)),
  ];
}
