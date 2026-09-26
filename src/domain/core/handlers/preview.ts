/**
 * Handler for `keel.preview` — run an install as a dry run and report
 * both what it would ask and what it would write.
 *
 * It runs the **real** install handler rather than a model of one.
 * That is the whole point: a second implementation of "which adapters
 * fire, in which order, asking what" would be a copy of the engine
 * that drifts from it, and the drift would show up as a form that
 * offers a question the install never asks (or hides one it does).
 * So the preview builds the same command the caller would commit,
 * flips `dryRun`, swaps in a prompt that answers instead of blocking,
 * and reports what the run recorded.
 *
 * Two consequences worth stating, because they are properties of the
 * engine rather than of this handler:
 *
 *   - **The run is interactive.** Not because anyone is at a
 *     terminal, but because a sticky answer folded into the manifest
 *     short-circuits its question before the prompt sees it — the
 *     question would disappear from the form the moment it was
 *     answered. Answers travel through the prompt instead, so the set
 *     stays whole. The prompt reads them by the install's own
 *     precedence, and is asked exactly where the install would read
 *     them, so the two resolve the same values. See `../preview.ts`.
 *   - **An answer the run does not read is reported, not refused.**
 *     The install refuses it (`../supplied-answers.ts`); the preview
 *     lists it with that refusal (`InstallPreview.unusedAnswers`), by
 *     the same function over the plan its run resolved and what its
 *     prompt read, and previews the body without it — so a form can
 *     drop what the install would refuse, and see what it then gets.
 *   - **A brownfield question already recorded stays unasked.** On
 *     `add-vertical`, answers the project's manifest carries win over
 *     anything the caller sends, exactly as they would on a real
 *     `keel add`. A question that does not reach the prompt is not in
 *     the report, which is the honest answer: that value is not the
 *     caller's to change here (`--reapply` freezes answers by
 *     design).
 *
 * Nothing is committed and nothing is persisted: the dry-run branch
 * of each install handler returns before `tree.commit()`, and the
 * deferred actions are described, never run. Nothing is printed
 * either — see {@link QUIET}.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { ok, type Result } from '../../kernel/result.js';
import {
  installCommandFor,
  type InstallCommand,
  type InstallReport,
} from '../../contract/commands.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { InstallPreview, PreviewQuery, UnusedAnswer } from '../../contract/queries.js';
import { recordingPrompt } from '../preview.js';
import {
  historyOf,
  NOTHING_INSTALLED,
  unusedAnswers,
  type AnswerHistory,
} from '../supplied-answers.js';
import { AddEntrypointHandler } from './add-entrypoint.js';
import { AddModuleHandler } from './add-module.js';
import { AddVerticalHandler } from './add-vertical.js';
import type { InstallDeps } from './deps.js';
import { NewProjectHandler } from './new-project.js';

/**
 * The logger a preview narrates through: none of them.
 *
 * A preview's output is the value it returns, and the run it drives
 * narrates for a terminal — the `keel new` wizard prints the whole
 * staged plan before its review step. Under `keel ui` that terminal
 * belongs to a server nobody is reading, and the page re-previews on
 * every change, so the plan would be printed hundreds of lines at a
 * time per keystroke. A query with a side effect on stderr is a query
 * with a side effect.
 */
const QUIET: Logger = {
  info: () => undefined,
  success: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

/** Executes {@link PreviewQuery}s. */
export class PreviewHandler implements Handler<PreviewQuery> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is PreviewQuery {
    return action.kind === 'keel.preview';
  }

  async handle(query: PreviewQuery): Promise<Result<InstallPreview>> {
    const recorder = recordingPrompt(query.answers);
    const deps: InstallDeps = { ...this.deps, prompt: recorder.prompt, logger: QUIET };
    const command = installCommandFor(query.target, {
      cwd: query.cwd,
      // Answers reach the run through the prompt, never the manifest
      // — see the note above on why the distinction matters.
      answers: {},
      interactive: true,
      dryRun: true,
    });

    const result = await run(command, deps);
    if (!result.ok) return result;
    // What an install of this body would refuse, read by the install's
    // own function over the plan this run resolved and the answers its
    // prompt took — never a model of the check.
    const unused = unusedAnswers(
      query.answers,
      result.value.resolvedAdapters ?? [],
      await this.history(query),
      recorder.reads,
    );
    return ok(previewOf(result.value, recorder.recorded, unused));
  }

  /**
   * The project the answers are held against: none for a new one, and
   * otherwise what the directory's manifest records — the one the
   * install reads.
   */
  private async history(query: PreviewQuery): Promise<AnswerHistory> {
    if (query.target.kind === 'new-project') return NOTHING_INSTALLED;
    const manifest = await this.deps.manifests.read(projectScopeRoot(query.cwd));
    return manifest === null ? NOTHING_INSTALLED : historyOf(this.deps.registry, manifest);
  }
}

/**
 * Dispatches to the handler for `command`, constructed over the
 * preview's own deps.
 *
 * A fresh handler per query rather than a shared one, because the
 * recording prompt is per query: handlers are stateless value objects
 * over their deps, so this costs an object and buys the guarantee
 * that two previews in flight cannot see each other's questions.
 */
function run(command: InstallCommand, deps: InstallDeps): Promise<Result<InstallReport>> {
  switch (command.kind) {
    case 'keel.new-project':
      return new NewProjectHandler(deps).handle(command);
    case 'keel.add-vertical':
      return new AddVerticalHandler(deps).handle(command);
    case 'keel.add-module':
      return new AddModuleHandler(deps).handle(command);
    case 'keel.add-entrypoint':
      return new AddEntrypointHandler(deps).handle(command);
  }
}

function previewOf(
  report: InstallReport,
  questions: InstallPreview['questions'],
  unused: readonly UnusedAnswer[],
): InstallPreview {
  return {
    subject: report.subject,
    questions,
    changes: report.changes,
    actions: report.actions,
    ...(report.skippedHarnessElements === undefined
      ? {}
      : { skippedHarnessElements: report.skippedHarnessElements }),
    ...(report.notes === undefined ? {} : { notes: report.notes }),
    ...(report.refreshProposals === undefined ? {} : { refreshProposals: report.refreshProposals }),
    ...(unused.length > 0 ? { unusedAnswers: unused } : {}),
  };
}
