/**
 * Canonical fakes for the Prompt port: a scripted prompt answering
 * from a fixed map, and a rejecting prompt for flows where being
 * asked at all is the failure.
 */

import type { Question } from '../../domain/contract/composition.js';
import type { Asker, Prompt } from '../../domain/contract/ports/prompt.js';

/** Prompt fake answering each question id from a fixed map. */
export class FakePrompt implements Prompt {
  /** Question ids asked, in order. */
  readonly asked: string[] = [];
  /** Askers of each question, in the same order as {@link asked}. */
  readonly askers: Asker[] = [];

  constructor(private readonly answers: Readonly<Record<string, string>> = {}) {}

  ask(question: Question, asker: Asker): Promise<string> {
    this.asked.push(question.id);
    this.askers.push(asker);
    const value = this.answers[question.id];
    if (value === undefined) {
      return Promise.reject(
        new Error(`FakePrompt: no scripted answer for question '${question.id}'`),
      );
    }
    return Promise.resolve(value);
  }
}

/** Prompt that fails the test if any question reaches the user. */
export const rejectingPrompt: Prompt = {
  ask(question: Question, asker: Asker): Promise<string> {
    return Promise.reject(
      new Error(`prompt should not have been called (got '${question.id}' from ${asker.id})`),
    );
  },
};
