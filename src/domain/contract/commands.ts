/**
 * The system's public surface: the concrete commands naming each
 * operation keel supports, and the report DTO their handlers return.
 * Primary adapters construct these via the factory functions and
 * dispatch them through the Mediator; they never call handlers
 * directly.
 */

import type { Command } from '../kernel/action.js';
import type { TreeChange } from './ports/tree.js';

/** Result DTO of an install-shaped command (`new` / `add`). */
export interface InstallReport {
  /** What was installed: the stack id for `new`, the vertical id for `add`. */
  readonly subject: string;
  /** Every file the install staged, in deterministic path order. */
  readonly changes: readonly TreeChange[];
  /** Human-readable descriptions of the deferred actions, in run order. */
  readonly actions: readonly string[];
  /** False under dry-run: nothing was written and no action ran. */
  readonly committed: boolean;
}

/** Sticky answers supplied up front: adapterId → questionId → value. */
export type PresetAnswers = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Bootstrap a greenfield project from a stack preset. */
export interface NewProjectCommand extends Command<InstallReport> {
  readonly kind: 'keel.new-project';
  readonly cwd: string;
  /** Stack preset id, e.g. `quarkus-cli`. */
  readonly stack: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
}

/** Layer an additional vertical onto an initialised project. */
export interface AddVerticalCommand extends Command<InstallReport> {
  readonly kind: 'keel.add-vertical';
  readonly cwd: string;
  /** Vertical id, e.g. `distribution`. */
  readonly vertical: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
}

/** Constructs a {@link NewProjectCommand}. */
export function newProjectCommand(
  input: Omit<NewProjectCommand, 'kind' | 'intent'>,
): NewProjectCommand {
  return { kind: 'keel.new-project', intent: 'command', ...input };
}

/** Constructs an {@link AddVerticalCommand}. */
export function addVerticalCommand(
  input: Omit<AddVerticalCommand, 'kind' | 'intent'>,
): AddVerticalCommand {
  return { kind: 'keel.add-vertical', intent: 'command', ...input };
}
