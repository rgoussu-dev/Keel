/**
 * The Prompt port — how the domain asks the user a question when a
 * composition adapter declares a choice point. The answers engine
 * never imports a terminal library; the interactive adapter lives in
 * `infrastructure/prompt`, and the shipped fake scripts replies.
 */

import type { Question } from '../composition.js';

/** Operating mode for prompt resolution. */
export type AnswerMode = 'interactive' | 'non-interactive';

/** Asks the user a single question and resolves to the raw answer. */
export interface Prompt {
  ask(question: Question): Promise<string>;
}
