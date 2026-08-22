/**
 * Canonical fakes for the Prompt port: a scripted prompt answering
 * from a fixed map, and a rejecting prompt for flows where being
 * asked at all is the failure.
 */

import type { Question } from '../../domain/contract/composition.js';
import type { Prompt } from '../../domain/contract/ports/prompt.js';

/**
 * Prompt fake answering each question id from a fixed map. A question
 * id maps to either a single answer (returned every time that id is
 * asked — the common case) or a sequence of answers, consumed in
 * order as the id is asked repeatedly and held on its last entry once
 * exhausted. The sequence form is what scripts the `keel new` review
 * loop's back-and-forth: the same `keel.review` id is asked once per
 * pass, with a different choice each time.
 */
export class FakePrompt implements Prompt {
  /** Question ids asked, in order. */
  readonly asked: string[] = [];

  private readonly queues = new Map<string, string[]>();

  constructor(answers: Readonly<Record<string, string | readonly string[]>> = {}) {
    for (const [id, value] of Object.entries(answers)) {
      this.queues.set(id, Array.isArray(value) ? [...value] : [value as string]);
    }
  }

  ask(question: Question): Promise<string> {
    this.asked.push(question.id);
    const queue = this.queues.get(question.id);
    if (!queue || queue.length === 0) {
      return Promise.reject(
        new Error(`FakePrompt: no scripted answer for question '${question.id}'`),
      );
    }
    const value = queue.length > 1 ? (queue.shift() as string) : (queue[0] as string);
    return Promise.resolve(value);
  }
}

/** Prompt that fails the test if any question reaches the user. */
export const rejectingPrompt: Prompt = {
  ask(question: Question): Promise<string> {
    return Promise.reject(new Error(`prompt should not have been called (got '${question.id}')`));
  },
};
