/**
 * Runs the deferred side effects emitted by adapter contributions.
 *
 * Actions are kept separate from the apply phase so that:
 *   - the apply phase stays pure (Tree mutations only) and can be
 *     dry-run by simply not committing;
 *   - dry-run handling for side effects is uniform — the runner
 *     prints the action's description and skips its `run`, instead
 *     of every adapter re-implementing the dryRun gate inline (as
 *     the legacy `git-init` schematic had to).
 *
 * Actions are executed sequentially in the order they were emitted.
 * If one throws, subsequent actions are not run; the error propagates
 * with the action's id attached for diagnostics.
 */

import type { DeferredAction } from '../domain/contract/composition.js';
import type { Logger } from '../domain/contract/ports/logger.js';
import type { ProcessRunner } from '../domain/contract/ports/process-runner.js';

/** Inputs for `runActions`. */
export interface RunActionsInputs {
  readonly actions: readonly DeferredAction[];
  readonly cwd: string;
  readonly logger: Logger;
  readonly processes: ProcessRunner;
  readonly dryRun: boolean;
}

/**
 * Thrown when an action fails. The original error is attached as
 * `cause` per the Error spec; `actionId` makes it easy for callers to
 * pinpoint which adapter step blew up.
 */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly actionId: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ActionError';
  }
}

export async function runActions(inputs: RunActionsInputs): Promise<void> {
  for (const action of inputs.actions) {
    if (inputs.dryRun) {
      inputs.logger.info(`would: ${action.description}`);
      continue;
    }
    try {
      await action.run({ cwd: inputs.cwd, logger: inputs.logger, processes: inputs.processes });
    } catch (err) {
      throw new ActionError(`action '${action.id}' failed: ${describe(err)}`, action.id, {
        cause: err,
      });
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
