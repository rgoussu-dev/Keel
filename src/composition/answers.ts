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

import type { Adapter, Question } from '../domain/contract/composition.js';
import type { AnswerMode, Prompt } from '../domain/contract/ports/prompt.js';

/**
 * Re-export of the Prompt port so existing importers of this module
 * keep compiling while call sites migrate to the contract import.
 */
export type { AnswerMode, Prompt };

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
 */
export async function resolveAnswer(
  question: Question,
  stored: Readonly<Record<string, string>>,
  mode: AnswerMode,
  prompt: Prompt,
): Promise<AnswerResolution> {
  if (question.memory === 'sticky') {
    const memo = stored[question.id];
    if (memo !== undefined) return { value: memo, persist: false };
  }
  if (mode === 'non-interactive') {
    validateChoice(question, question.default);
    return { value: question.default, persist: question.memory === 'sticky' };
  }
  const value = await prompt.ask(question);
  validateChoice(question, value);
  return { value, persist: question.memory === 'sticky' };
}

/** Resolves every question of an adapter in declaration order. */
export async function resolveAdapterAnswers(
  adapter: Adapter,
  storedForAdapter: Readonly<Record<string, string>>,
  mode: AnswerMode,
  prompt: Prompt,
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
    const r = await resolveAnswer(q, storedForAdapter, mode, prompt);
    answers[q.id] = r.value;
    if (r.persist) updates[q.id] = r.value;
  }
  return { answers, updates };
}

function validateChoice(question: Question, value: string): void {
  if (!question.choices) return;
  const allowed = question.choices.map((c) => c.value);
  if (!allowed.includes(value)) {
    throw new Error(
      `invalid value '${value}' for question '${question.id}'; choices: ${allowed.join(', ')}`,
    );
  }
}
