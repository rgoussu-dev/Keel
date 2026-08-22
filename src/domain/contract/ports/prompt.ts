/**
 * The Prompt port — how the domain asks the user a question when a
 * composition adapter declares a choice point. The answers engine
 * never imports a terminal library; the interactive adapter lives in
 * `infrastructure/prompt`, and the shipped fake scripts replies.
 */

import type { Question } from '../composition.js';

/** Operating mode for prompt resolution. */
export type AnswerMode = 'interactive' | 'non-interactive';

/**
 * Who is asking — passed alongside every question so an adapter of
 * this port can attribute the answer back to where it is recorded.
 *
 * A question id is unique within its asker and nowhere else:
 * `engine` belongs to the persistence adapter that declared it, and
 * `buildSystem` belongs to no adapter at all. Without the asker a
 * recorded answer cannot be routed back — `answers[adapterId][id]`
 * for an adapter's question, a `NewProjectCommand` field for a
 * stack-level one — which is exactly what a non-terminal front end
 * (`keel ui`) has to do to pre-fill a form.
 */
export interface Asker {
  /**
   * `adapter` — a composition adapter's own choice point, recorded
   * as sticky memory under the adapter's id.
   * `stack` — a stack-level dial resolved by the install handler
   * (which stack, repository layout, build system, module layout,
   * peer context); never sticky, and recorded as a field of the
   * command rather than in `manifest.answers`.
   * `toolchain` — the provisioning context's manager dial.
   * `control` — flow control rather than part of the plan: the
   * `keel new` wizard's proceed/edit/cancel review step. Its answer
   * is not an answer to anything, and a front end that collects
   * answers must not render it as a field.
   */
  readonly kind: 'adapter' | 'stack' | 'toolchain' | 'control';
  /** The adapter id, the stack id, or the provisioning context's name. */
  readonly id: string;
}

/** Asks the user a single question and resolves to the raw answer. */
export interface Prompt {
  ask(question: Question, asker: Asker): Promise<string>;
}
