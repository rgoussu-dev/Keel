/**
 * The diff-size habit hook (#140) — the first Habit Hook through the
 * hook seam, and the one that is language-agnostic by construction:
 * pure `git`, POSIX `sh`.
 *
 * Three things are held here, and only the third needs a real shell:
 *
 *   - **the seam**: it is a `HookSpec` on the family kit's
 *     contribution, staged and wired by the engine like any other,
 *     with its one reminder inside the budget;
 *   - **the script's shape**: POSIX under `sh -n` for every family's
 *     gate command, and no substitution the shell would run — the
 *     gate goes in as a `printf` argument, because a backtick or a
 *     `$` in it would otherwise be something to execute;
 *   - **the behaviour**: silent below the threshold, once at each
 *     band above it, silent again after the commit, and silent
 *     wherever it cannot honestly answer (no git, no repository,
 *     threshold 0). A habit hook that breaks a session is worse than
 *     no habit hook.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DIFF_SIZE_HOOK_NAME,
  DIFF_SIZE_LIMIT,
  DIFF_SIZE_STAMP,
  diffSizeHookSpec,
  diffSizeReminder,
  renderDiffSizeHook,
} from '../../../../src/domain/core/adapters/claude-kit.js';
import {
  DISABLED_HOOKS_ENV,
  HOOK_REMINDER_BUDGET,
  HookSpecSchema,
  hookTarget,
} from '../../../../src/domain/contract/hook.js';
import { agentHarnessVertical } from '../../../../src/domain/core/verticals/agent-harness.js';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { expectOk, installMediator } from '../../../support/factory.js';

/** Every family's gate — the one thing the script interpolates. */
const GATES = [
  './gradlew build',
  './mvnw --batch-mode verify',
  'go build ./... && go test ./...',
  'cargo fmt --check && cargo test --workspace',
  'pnpm run --if-present lint && pnpm run typecheck && pnpm test',
];

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-diff-size-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Runs the emitted hook in `cwd`, returning its exit code and stderr. */
function runHook(
  script: string,
  env: Readonly<Record<string, string>> = {},
): {
  code: number;
  stderr: string;
} {
  const file = path.join(cwd, 'diff-size.sh');
  fs.writeFileSync(file, script);
  try {
    execFileSync('sh', [file], {
      cwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, ...env },
      stdio: 'pipe',
    });
    return { code: 0, stderr: '' };
  } catch (e) {
    const failure = e as { status: number | null; stderr: Buffer };
    return { code: failure.status ?? -1, stderr: failure.stderr.toString('utf8') };
  }
}

function git(...args: readonly string[]): void {
  execFileSync('git', [...args], {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'k', GIT_AUTHOR_EMAIL: 'k@k' },
  });
}

/** A file of `lines` lines, so a change of a known size can be made. */
async function write(name: string, lines: number): Promise<void> {
  await fs.writeFile(path.join(cwd, name), `${'x\n'.repeat(lines)}`);
}

describe('the diff-size hook through the seam', () => {
  it('is a valid spec the vertical declares, with one reminder inside the budget', () => {
    const spec = diffSizeHookSpec({ verifyCommand: 'tool verify' });
    expect(HookSpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.name).toBe(DIFF_SIZE_HOOK_NAME);
    expect(spec.event).toBe('PostToolUse');
    expect(spec.matcher).toBe('Edit|Write');
    expect(spec.reminders).toEqual([diffSizeReminder({ verifyCommand: 'tool verify' })]);
    expect(agentHarnessVertical.hooks).toContain(DIFF_SIZE_HOOK_NAME);
    expect(spec.reminders.length).toBeLessThan(HOOK_REMINDER_BUDGET);
  });

  it('is staged executable and wired into the settings of a real scaffold', async () => {
    expectOk(
      await installMediator({ runDeferred: async () => {} }).dispatch(
        newProjectCommand({ cwd, stack: 'go-cli', answers: {}, interactive: false, dryRun: false }),
      ),
    );
    const target = path.join(cwd, hookTarget(DIFF_SIZE_HOOK_NAME));
    expect(await fs.pathExists(target)).toBe(true);
    // Its own settings entry, under its own event — which is what
    // makes it separately removable when the project lists it under
    // `KEEL_DISABLED_HOOKS`, and what the script says to do.
    const settings = (await fs.readJson(path.join(cwd, '.claude', 'settings.json'))) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    expect(settings.hooks['PostToolUse']?.flatMap((e) => e.hooks.map((h) => h.command))).toEqual([
      `sh ${hookTarget(DIFF_SIZE_HOOK_NAME)}`,
    ]);
    expect(await fs.readFile(target, 'utf8')).toContain(DISABLED_HOOKS_ENV);
  });
});

describe('the emitted script', () => {
  it.each(GATES)('is POSIX sh for the gate %s, and runs none of it', (gate) => {
    const script = renderDiffSizeHook({ verifyCommand: gate });
    const file = path.join(cwd, 'probe.sh');
    fs.writeFileSync(file, script);
    expect(() => execFileSync('sh', ['-n', file])).not.toThrow();
    // The gate reaches the shell as a single-quoted `printf`
    // argument, so nothing in it is a command to run.
    expect(script).toContain(`'${gate}'`);
    const message = script.slice(script.indexOf("printf 'diff-size"));
    expect(message).not.toContain('`');
    expect(message).not.toContain('$(');
  });

  it('assumes no runtime beyond git — the seam refuses one that does', () => {
    expect(
      HookSpecSchema.safeParse(diffSizeHookSpec({ verifyCommand: 'go test ./...' })).success,
    ).toBe(true);
  });
});

describe('what the hook says, and when', () => {
  const script = () => renderDiffSizeHook({ verifyCommand: 'go test ./...' });

  it('says nothing where it cannot honestly answer', async () => {
    // No repository at all.
    expect(runHook(script()).code).toBe(0);
    git('init', '-q', '-b', 'main');
    await write('big.txt', DIFF_SIZE_LIMIT * 2);
    // A threshold of 0 keeps it staged and silent.
    expect(runHook(script(), { KEEL_DIFF_SIZE_LIMIT: '0' }).code).toBe(0);
    // …as does a threshold that is not a number at all.
    expect(runHook(script(), { KEEL_DIFF_SIZE_LIMIT: 'lots' }).code).toBe(0);
  });

  it('speaks once per band, and goes quiet again after the commit', async () => {
    git('init', '-q', '-b', 'main');
    await write('small.txt', 10);
    expect(runHook(script()).code, 'below the threshold').toBe(0);

    await write('big.txt', DIFF_SIZE_LIMIT + 10);
    const first = runHook(script());
    expect(first.code, 'over the threshold').toBe(2);
    expect(first.stderr).toContain('diff-size: the uncommitted change has passed 400 lines');
    expect(first.stderr, 'names the gate to run before committing').toContain('go test ./...');

    expect(runHook(script()).code, 'same band — a second nudge would be noise').toBe(0);

    await write('bigger.txt', DIFF_SIZE_LIMIT);
    expect(runHook(script()).code, 'the next band').toBe(2);

    git('add', '-A');
    git('-c', 'user.email=k@k', '-c', 'user.name=k', 'commit', '-qm', 'the whole thing');
    expect(runHook(script()).code, 'nothing uncommitted left').toBe(0);
  });

  it('counts a change to a tracked file, not only new ones', async () => {
    git('init', '-q', '-b', 'main');
    await write('tracked.txt', 10);
    git('add', '-A');
    git('-c', 'user.email=k@k', '-c', 'user.name=k', 'commit', '-qm', 'base');
    expect(runHook(script()).code).toBe(0);
    await write('tracked.txt', DIFF_SIZE_LIMIT + 10);
    expect(runHook(script()).code).toBe(2);
  });

  it('keeps its own state out of the tree it is measuring', async () => {
    git('init', '-q', '-b', 'main');
    await write('big.txt', DIFF_SIZE_LIMIT + 10);
    runHook(script());
    expect(await fs.pathExists(path.join(cwd, '.git', DIFF_SIZE_STAMP))).toBe(true);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd }).toString('utf8')).not.toContain(
      DIFF_SIZE_STAMP,
    );
  });
});
