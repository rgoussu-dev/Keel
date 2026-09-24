/**
 * Question/answer resolution.
 *
 * Each `Question` an adapter declares is resolved through three
 * sources, in order:
 *   1. Sticky memory (`memory: 'sticky'` only): the answers the
 *      manifest recorded, overlaid by the ones supplied for this run
 *      (`--set`, an install body) — `install.ts` composes it per
 *      adapter, holding each supplied value to its choices with
 *      {@link checkSuppliedAnswer} on the way in.
 *   2. The `default` field, when running non-interactively (`--yes`).
 *   3. The user, prompted via the supplied `Prompt`.
 *
 * The result of resolving an adapter's full question list is split
 * into:
 *   - `answers` — every question's resolved value (used by
 *     `Ctx.answer`).
 *   - `updates` — the subset that should be persisted back to the
 *     manifest (sticky questions whose value was newly asked).
 *
 * Repeat questions are never persisted; sticky questions are always
 * persisted on first ask but not re-persisted on subsequent runs
 * (since they're already in the manifest).
 *
 * A question is put to a scope as {@link offeredIn} shapes it: only
 * the choices whose predicate matches that scope's tags. The prompt
 * (and so the preview, which records what a prompt was asked) sees
 * that list, and every check on a value holds it to that list, so a
 * choice is either offered and taken or neither.
 */

import { DomainError } from '../kernel/result.js';
import { decodeSelection, type Adapter, type Question, type Tag } from '../contract/composition.js';
import type { AnswerMode, Asker, Prompt } from '../contract/ports/prompt.js';
import { matches } from './predicate.js';

/**
 * The code a supplied answer outside its question's choices is
 * refused with — the value came from whoever is running keel (a
 * terminal reply, a form's field), so it is theirs to correct.
 */
export const INVALID_ANSWER_CODE = 'keel.invalid-answer';

/** Result of resolving a single question. */
export interface AnswerResolution {
  readonly value: string;
  /** True when the value should be merged back into the manifest. */
  readonly persist: boolean;
}

/**
 * Resolves a single question against stored answers, mode, and (when
 * interactive) the prompt port.
 *
 * @param stored - sticky answers previously recorded for this adapter
 *                 (`manifest.answers[adapterId]`). Pass `{}` if none.
 * @param asker - who declared the question, forwarded to the prompt
 *                so an answer can be attributed back to its home.
 */
export async function resolveAnswer(
  question: Question,
  stored: Readonly<Record<string, string>>,
  mode: AnswerMode,
  prompt: Prompt,
  asker: Asker,
): Promise<AnswerResolution> {
  if (question.memory === 'sticky') {
    const memo = stored[question.id];
    if (memo !== undefined) return { value: memo, persist: false };
  }
  if (mode === 'non-interactive') {
    validateChoice(question, question.default);
    return { value: question.default, persist: question.memory === 'sticky' };
  }
  const value = await prompt.ask(question, asker);
  validateChoice(question, value, asker);
  return { value, persist: question.memory === 'sticky' };
}

/**
 * Resolves every question of an adapter in declaration order, each as
 * {@link offeredIn} puts it to the scope whose tags are `tags`.
 * Harness replay reuses recorded values even for repeat questions;
 * questions absent from the snapshot still resolve through their defaults.
 *
 * @param tags - the tags of the scope the adapter runs in, as its
 *               predicate was matched against them.
 */
export async function resolveAdapterAnswers(
  adapter: Adapter,
  storedForAdapter: Readonly<Record<string, string>>,
  mode: AnswerMode,
  prompt: Prompt,
  tags: readonly Tag[],
  replayRecorded = false,
): Promise<{
  answers: Record<string, string>;
  updates: Record<string, string>;
}> {
  const answers: Record<string, string> = {};
  const updates: Record<string, string> = {};
  const seen = new Set<string>();
  for (const q of adapter.questions ?? []) {
    if (seen.has(q.id)) {
      throw new Error(`adapter '${adapter.id}' declares duplicate question id '${q.id}'`);
    }
    seen.add(q.id);
    const recorded = replayRecorded ? storedForAdapter[q.id] : undefined;
    const r =
      recorded === undefined
        ? await resolveAnswer(offeredIn(q, tags), storedForAdapter, mode, prompt, {
            kind: 'adapter',
            id: adapter.id,
          })
        : { value: recorded, persist: false };
    answers[q.id] = r.value;
    if (r.persist) updates[q.id] = r.value;
  }
  return { answers, updates };
}

/**
 * Holds an answer supplied up front — a `--set`, an install body's
 * `answers` — to the choices its question offers the scope whose tags
 * are `tags`, refusing one outside them with {@link INVALID_ANSWER_CODE}
 * under the key it was supplied as. A choice the question declares but
 * does not offer there is outside them, exactly as it is at the prompt.
 *
 * The install loop calls it where a supplied value first reaches the
 * adapter that reads it, before that adapter contributes anything;
 * recorded memory never comes through here, for the reason
 * {@link validateChoice} gives.
 */
export function checkSuppliedAnswer(
  question: Question,
  value: string,
  suppliedAs: string,
  tags: readonly Tag[],
): void {
  validateChoice(offeredIn(question, tags), value, { kind: 'adapter', id: suppliedAs });
}

/**
 * The question as it is put to the scope whose tags are `tags`: only
 * the choices whose `QuestionChoice.predicate` matches them, in
 * declaration order. The one place that list is computed — the prompt
 * offers it, the preview reports it, and a value is held to it.
 *
 * Returns `question` itself when every choice is offered, so a
 * question without predicates reaches the prompt exactly as declared.
 */
export function offeredIn(question: Question, tags: readonly Tag[]): Question {
  if (question.choices === undefined) return question;
  const tagSet = new Set(tags);
  const offered = question.choices.filter(
    (choice) => choice.predicate === undefined || matches(choice.predicate, tagSet),
  );
  return offered.length === question.choices.length ? question : { ...question, choices: offered };
}

/**
 * Holds a value to its question's choices. Who is to blame for a value
 * outside them decides how it fails: one the prompt handed back was
 * supplied — typed at a terminal, or posted by a form through the
 * preview's prompt — and is refused with {@link INVALID_ANSWER_CODE},
 * where the kernel's rule puts an expected failure; a default outside
 * its own choices is the declaring adapter's bug and keeps throwing,
 * even when a prompt handed it back unchanged. `askedBy` is present
 * exactly when the value was supplied, and names the key it was
 * supplied under for the refusal's `adapterId:questionId`.
 *
 * A `multi-select` answer is a set, so each value it names is held to
 * the choices rather than the joined string — `'a,b'` is a legal
 * selection of two, and `''` the legal "none".
 *
 * A sticky answer already in memory is not checked at all: that path
 * also replays answers older manifests recorded, and holding them to
 * today's choices would break `--reapply` the day a choice is renamed.
 */
function validateChoice(question: Question, value: string, askedBy?: Asker): void {
  if (!question.choices) return;
  const allowed = question.choices.map((c) => c.value);
  const picked = question.kind === 'multi-select' ? decodeSelection(value) : [value];
  const outside = picked.filter((v) => !allowed.includes(v));
  if (outside.length === 0) return;
  if (askedBy === undefined || value === question.default) {
    throw new Error(
      `invalid value '${value}' for question '${question.id}'; choices: ${allowed.join(', ')}`,
    );
  }
  const named = outside.map((v) => `'${v}'`).join(', ');
  throw new DomainError(
    `${named} ${outside.length === 1 ? 'is not a choice' : 'are not choices'} for ${askedBy.id}:${question.id}; choices: ${allowed.join(', ')}`,
    INVALID_ANSWER_CODE,
  );
}
