/**
 * The Codex driver — the second driver that proves the AgentDriver
 * port is real. Scripted only: flag mapping, JSONL harvest from a
 * fixture, and an honest manifest (no cost, no transcript).
 */

import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { codexDriver, harvestExecJson, scriptedArgs } from '../../evals/drivers/codex.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

const CASE = {
  id: 'navigation/sample',
  prompt: 'which file?',
  budgets: { timeout_seconds: 60, max_turns: 30 },
};

describe('scripted flag mapping', () => {
  it('runs exec --json, sandboxed to the workspace, user config ignored', () => {
    const args = scriptedArgs(CASE);
    expect(args[0]).toBe('exec');
    expect(args).toContain('--json');
    expect(args).toContain('--ignore-user-config');
    expect(args.join(' ')).toContain('--sandbox workspace-write');
    expect(args.at(-1)).toBe('which file?');
  });
});

describe('mode and manifest honesty', () => {
  it('is scripted-only and declares neither cost nor transcript', () => {
    expect(codexDriver.modes).toEqual(['scripted']);
    const capabilities = codexDriver.capabilities('scripted');
    expect(capabilities.cost).toBe(false);
    expect(capabilities.transcript).toBe(false);
    expect(capabilities.tokens).toBe(true);
  });

  it('refuses attended mode outright', async () => {
    expect(() => codexDriver.capabilities('attended')).toThrow(/scripted mode only/);
    await expect(
      codexDriver.run({ caseSpec: CASE, workspace: '/tmp/ws', mode: 'attended' }),
    ).rejects.toThrow(/scripted mode only/);
  });
});

describe('harvesting exec JSONL', () => {
  it('counts item events as the census, reads usage from turn.completed, cost stays null', async () => {
    const stdout = await fs.readFile(path.join(FIXTURES, 'codex-exec.jsonl'), 'utf8');
    const metrics = harvestExecJson(stdout);
    expect(metrics).toEqual({
      tokensIn: 900,
      tokensOut: 400,
      cacheRead: 15000,
      cacheWrite: null,
      costUsd: null,
      turns: 1,
      toolCalls: { command_execution: 2, file_change: 1 },
      bashSearches: 1,
    });
  });
});
