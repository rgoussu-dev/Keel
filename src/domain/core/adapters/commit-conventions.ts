/**
 * `vcs/commit-conventions` adapter — Conventional Commits, enforced
 * mechanically rather than asked for politely.
 *
 * The binding spec already mandates the format. A rule stated in a
 * document is a rule an agent reads once and drifts from ten commits
 * later (Selective Hearing); a `commit-msg` hook is the same rule with
 * a gate in front of it, and it refuses the commit before the drift
 * lands.
 *
 * **POSIX `sh` and `grep`, nothing else.** A scaffolded Go, Rust or
 * JVM project cannot assume Node on the machine, so commitlint and
 * husky are out — the check is a regular expression over the subject
 * line, which is all the spec's grammar needs. The same reason the
 * `HookSpec` seam (`domain/contract/hook.ts`) bans node, jq and
 * python, applied to the git side.
 *
 * The script and the note beside it are **assets**
 * (`assets/composition/vcs/commit-conventions/templates/`) rather
 * than string literals here: they are shell and prose, they are long,
 * and `assets/` is where this repository's own formatter and its
 * version-pin sweep can see them. The renderer carries the executable
 * bit across, the way it does for `gradlew`.
 *
 * **Not a Claude Code hook.** #143 left open whether this needed the
 * `.claude/settings.json` half of the harness; it does not. Git
 * already refuses the commit and puts the reason on stderr, which is
 * exactly where an agent reads it, so a `PreToolUse` gate would spend
 * a slot of the reminder budget re-stating what the agent is about to
 * be told anyway. What the harness half would have bought is instead
 * bought by the rejection message: it names the grammar, the legal
 * types and two examples, so the retry is informed rather than a
 * guess. The hook is therefore ordinary domain content, and a project
 * that installed no harness still gets it.
 *
 * **Tracked, not hidden.** The script lands in `.githooks/`, which is
 * committed, and the deferred action points git at it with
 * `core.hooksPath`. `.git/hooks/` is per-clone and untracked; a rule
 * that only exists on the machine that ran the scaffold is not a
 * project convention. The cost is that each clone runs the same
 * one-liner once, which `.githooks/README.md` states.
 *
 * Brownfield-safe, the way `vcs/git-init` is: a repository that
 * already points `core.hooksPath` somewhere else keeps it, with a
 * warning, rather than having its own hooks silently bypassed.
 *
 * Composition:
 *   - covers `commit-conventions` of the `vcs` vertical;
 *   - predicate: empty — the format is language-neutral;
 *   - `after: ['vcs/git-init']`, because `core.hooksPath` is a
 *     repository setting and the repository has to exist first;
 *   - declinable: answer `no` to its one sticky question.
 */

import type { Adapter, DeferredAction, DeferredActionEnv } from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessRunner } from '../../contract/ports/process-runner.js';

export const COMMIT_CONVENTIONS_ID = 'vcs/commit-conventions';

/** The tracked hooks directory `core.hooksPath` is pointed at. */
export const HOOKS_DIR = '.githooks';

/** The template tree carrying the hook and the note beside it. */
const TEMPLATE_ID = 'composition/vcs/commit-conventions/templates';

/** The staged `commit-msg` hook. */
export const COMMIT_MSG_TARGET = `${HOOKS_DIR}/commit-msg`;

export const commitConventionsAdapter: Adapter = {
  id: COMMIT_CONVENTIONS_ID,
  vertical: 'vcs',
  covers: ['commit-conventions'],
  predicate: {},
  // `core.hooksPath` is a repository setting, so the repository has to
  // exist first: this adapter's deferred action must run after
  // `vcs/git-init`'s, and adapter order is what orders them.
  after: ['vcs/git-init'],
  questions: [
    {
      id: 'commitHook',
      prompt: 'enforce Conventional Commits with a commit-msg hook',
      doc: 'Emits `.githooks/commit-msg` (POSIX sh, no Node) and points `core.hooksPath` at it, so a commit whose subject is not a Conventional Commit is refused with the grammar and two examples. Answer `no` to keep the convention documentation-only.',
      default: 'yes',
      memory: 'sticky',
      choices: [
        {
          value: 'yes',
          label: 'yes — refuse a non-conforming subject',
          doc: 'The rule is mechanical.',
        },
        { value: 'no', label: 'no — leave the format to reviewers', doc: 'Nothing is emitted.' },
      ],
    },
  ],
  async contribute(ctx) {
    if (ctx.answer('commitHook').trim() !== 'yes') return {};
    // The script is an asset rather than a string literal here: it is
    // shell, it is long, and `assets/` is where the repository's own
    // formatter and the version-pin sweep can see it. The renderer
    // carries the executable bit across, the way it does for `gradlew`.
    return { files: await ctx.templates.render(TEMPLATE_ID, '', {}), actions: [hooksPathAction()] };
  },
};

function hooksPathAction(): DeferredAction {
  return {
    id: COMMIT_CONVENTIONS_ID,
    description: `git config core.hooksPath ${HOOKS_DIR}`,
    run: ({ cwd, logger, processes }: DeferredActionEnv) => {
      pointHooksPath(cwd, logger, processes);
      return Promise.resolve();
    },
  };
}

/**
 * Points git at the tracked hooks directory, unless the repository
 * already points somewhere else — in which case the project has its
 * own arrangement and silently replacing it would disable hooks
 * someone relies on.
 */
function pointHooksPath(cwd: string, logger: Logger, processes: ProcessRunner): void {
  const current = processes.run('git', ['config', '--local', 'core.hooksPath'], { cwd });
  const found = current.status === 0 ? current.stdout.trim() : '';
  if (found !== '' && found !== HOOKS_DIR) {
    logger.warn(
      `git: core.hooksPath is already '${found}' — leaving it. Run 'git config core.hooksPath ${HOOKS_DIR}' to enable the commit-msg gate, or chain it from your own hooks.`,
    );
    return;
  }
  const set = processes.run('git', ['config', 'core.hooksPath', HOOKS_DIR], { cwd });
  if (set.status !== 0) {
    logger.warn(
      `git: could not set core.hooksPath (${describe(set.stderr, set.status)}) — run 'git config core.hooksPath ${HOOKS_DIR}' once the repository exists.`,
    );
    return;
  }
  logger.success(`git: commit-msg hook enabled through core.hooksPath=${HOOKS_DIR}`);
}

function describe(stderr: string, status: number | null): string {
  const trimmed = stderr.trim();
  if (trimmed !== '') return trimmed;
  return status === null ? 'git did not run' : `exit ${String(status)}`;
}
