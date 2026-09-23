/**
 * Question/answer resolution.
 *
 * Each `Question` an adapter declares is resolved through three
 * sources, in order:
 *   1. Sticky memory in the manifest (`memory: 'sticky'` only).
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
 */

import { DomainError } from '../kernel/result.js';
import type { Adapter, Question } from '../contract/composition.js';
import type { AnswerMode, Asker, Prompt } from '../contract/ports/prompt.js';

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
 * Resolves every question of an adapter in declaration order.
 * Harness replay reuses recorded values even for repeat questions;
 * questions absent from the snapshot still resolve through their defaults.
 */
export async function resolveAdapterAnswers(
  adapter: Adapter,
  storedForAdapter: Readonly<Record<string, string>>,
  mode: AnswerMode,
  prompt: Prompt,
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
        ? await resolveAnswer(q, storedForAdapter, mode, prompt, {
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
 * Holds a value to its question's choices. Who is to blame for a value
 * outside them decides how it fails: one the prompt handed back was
 * supplied — typed at a terminal, or posted by a form through the
 * preview's prompt — and is refused with {@link INVALID_ANSWER_CODE},
 * where the kernel's rule puts an expected failure; a default outside
 * its own choices is the declaring adapter's bug and keeps throwing,
 * even when a prompt handed it back unchanged. `askedBy` is present
 * exactly when a prompt handed the value back, and names the question's
 * home for the refusal's `adapterId:questionId`.
 *
 * A sticky answer already in memory is not checked at all: that path
 * also replays answers older manifests recorded, and holding them to
 * today's choices would break `--reapply` the day a choice is renamed.
 */
function validateChoice(question: Question, value: string, askedBy?: Asker): void {
  if (!question.choices) return;
  const allowed = question.choices.map((c) => c.value);
  if (allowed.includes(value)) return;
  if (askedBy === undefined || value === question.default) {
    throw new Error(
      `invalid value '${value}' for question '${question.id}'; choices: ${allowed.join(', ')}`,
    );
  }
  throw new DomainError(
    `'${value}' is not a choice for ${askedBy.id}:${question.id}; choices: ${allowed.join(', ')}`,
    INVALID_ANSWER_CODE,
  );
}
