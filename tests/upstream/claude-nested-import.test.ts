/**
 * The upstream behaviour the per-directory docs (#135) rest on, checked
 * against the real Claude Code rather than assumed: a nested
 * `CLAUDE.md` is loaded when the agent touches a file in its
 * directory, and its `@AGENTS.md` import resolves relative to the
 * importing file — so the sibling doc reaches the context exactly
 * when it binds. If a Claude Code release changes either half, this
 * goes red and the pointer shape needs revisiting.
 *
 * Opt-in (`KEEL_RUN_UPSTREAM=1`) and never a PR gate: it spends a
 * session of the operator's Claude subscription and needs `claude` on
 * the PATH, like the harness evals. The fixture is minimal and not a
 * scaffold — the claim is about Claude Code, not about keel's content.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const enabled =
  process.env['KEEL_RUN_UPSTREAM'] === '1' &&
  spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;

const CANARY = 'halyard-4417';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-upstream-nested-'));
  await fs.outputFile(path.join(cwd, 'README.md'), '# Fixture\n');
  await fs.outputFile(path.join(cwd, 'ledger', 'entries.txt'), 'three entries\n');
  await fs.outputFile(path.join(cwd, 'ledger', 'CLAUDE.md'), '@AGENTS.md\n');
  await fs.outputFile(
    path.join(cwd, 'ledger', 'AGENTS.md'),
    `# ledger/\n\nThe codeword for this directory is \`${CANARY}\`. Mention it whenever you report on a file here.\n`,
  );
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(!enabled)('Claude Code loads a nested CLAUDE.md and its sibling import', () => {
  it('surfaces the imported AGENTS.md once a file in its directory is read', () => {
    const run = spawnSync(
      'claude',
      [
        '-p',
        'Use the Read tool on ledger/entries.txt only — open no other file — then report what it contains and any codeword the notes for that directory give.',
        '--model',
        'haiku',
        '--allowedTools',
        'Read',
        '--output-format',
        'text',
      ],
      { cwd, encoding: 'utf8', timeout: 180_000 },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(CANARY);
  }, 240_000);
});
