/**
 * The evals rig's grown-fixture builder: turns the `scaffold` block of
 * an eval case (`evals/cases/<name>/case.yaml`) into a real project
 * tree, in process, through the same mediator every suite here uses.
 *
 * Two consumers, one tree:
 *   - the verify-time suites (`tests/evals/`) build fixtures with this
 *     to prove every probe's expected answer actually exists in the
 *     tree the case would grow — no agent, no toolchain, deferred
 *     actions all no-oped;
 *   - the live runner (`evals/run.mjs`, gated on `KEEL_RUN_EVALS=1`)
 *     replays the same scaffold block through the packaged CLI
 *     (`keel new` / `keel add`), which dispatches the same commands to
 *     the same engine — so the two trees cannot drift apart, only the
 *     live one additionally runs the deferred actions (`git init`,
 *     installs) an agent-facing workspace needs.
 *
 * The `answers` map in a case is passed verbatim here and rendered as
 * `--set adapterId:questionId=value` flags by the runner; a case that
 * omits an answer gets the adapter's own default in both paths.
 */

import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../src/domain/contract/commands.js';
import { expectOk, installMediator } from './factory.js';

/** The agent-neutral `scaffold` block of an eval case, camel-cased. */
export interface EvalScaffoldSpec {
  /** Stack preset id (`keel new --stack`). */
  readonly stack: string;
  /** Build system for stacks that offer a choice. */
  readonly buildSystem?: string;
  /** Module layout; `modulith` for every grown fixture. */
  readonly moduleLayout?: string;
  /** Sticky answers, keyed `adapterId → questionId → value`. */
  readonly answers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Growth steps applied after the scaffold, **in order** — order is
   * load-bearing: on `ts-http` the persistence vertical must land
   * before the added contexts rewrite `main.ts`, or its wiring
   * anchors are gone and the adapter refuses.
   */
  readonly grow?: readonly EvalGrowStep[];
}

/** One growth step: `keel add module <name>` or `keel add <vertical>`. */
export type EvalGrowStep =
  | { readonly module: string; readonly consumes?: string | undefined }
  | { readonly vertical: string };

/**
 * Maps the snake_case `scaffold` block of a loaded case.yaml onto
 * {@link EvalScaffoldSpec}, so the verify suites build exactly what
 * the case declares — not a hand-kept copy of it.
 */
export function scaffoldSpecOf(scaffold: {
  readonly stack: string;
  readonly build_system?: string | undefined;
  readonly module_layout?: string | undefined;
  readonly answers?: EvalScaffoldSpec['answers'] | undefined;
  readonly grow?: EvalScaffoldSpec['grow'] | undefined;
}): EvalScaffoldSpec {
  return {
    stack: scaffold.stack,
    ...(scaffold.build_system !== undefined ? { buildSystem: scaffold.build_system } : {}),
    ...(scaffold.module_layout !== undefined ? { moduleLayout: scaffold.module_layout } : {}),
    ...(scaffold.answers !== undefined ? { answers: scaffold.answers } : {}),
    ...(scaffold.grow !== undefined ? { grow: scaffold.grow } : {}),
  };
}

/**
 * Builds the fixture into `cwd` with every deferred action no-oped:
 * the tree is complete and judgeable, but nothing shells out — no
 * `git init`, no installs, no wrappers — so it runs in `verify`.
 */
export async function buildGrownFixture(spec: EvalScaffoldSpec, cwd: string): Promise<void> {
  const mediator = installMediator({
    keelVersion: '0.0.0-evals',
    runDeferred: () => Promise.resolve(),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: spec.stack,
        answers: {
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
          ...spec.answers,
        },
        interactive: false,
        dryRun: false,
        ...(spec.buildSystem !== undefined ? { buildSystem: spec.buildSystem } : {}),
        ...(spec.moduleLayout !== undefined ? { moduleLayout: spec.moduleLayout } : {}),
      }),
    ),
  );
  for (const step of spec.grow ?? []) {
    expectOk(
      await mediator.dispatch(
        'module' in step
          ? addModuleCommand({
              cwd,
              module: step.module,
              ...(step.consumes === undefined ? {} : { consumes: step.consumes }),
              answers: {},
              interactive: false,
              dryRun: false,
            })
          : addVerticalCommand({
              cwd,
              vertical: step.vertical,
              answers: {},
              interactive: false,
              dryRun: false,
            }),
      ),
    );
  }
}
