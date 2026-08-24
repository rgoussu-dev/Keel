/**
 * The Claude Code reference driver: flag mapping (config isolation,
 * autonomy, budgets — and never `--bare`), transcript discovery for
 * attended runs, and harvesting from fixture transcripts of both
 * modes. No live agent anywhere.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  claudeCodeDriver,
  findSessionTranscript,
  harvestSessionTranscript,
  harvestStreamJson,
  projectSlug,
  scriptedArgs,
} from '../../evals/drivers/claude-code.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

const CASE = {
  id: 'navigation/sample',
  prompt: 'which file?',
  budgets: { timeout_seconds: 60, max_turns: 30 },
};

describe('scripted flag mapping', () => {
  it('runs headless stream-json with project-only settings and bypassed permissions', () => {
    const args = scriptedArgs(CASE);
    expect(args.slice(0, 2)).toEqual(['-p', 'which file?']);
    expect(args).toContain('stream-json');
    expect(args.join(' ')).toContain('--setting-sources project');
    expect(args.join(' ')).toContain('--permission-mode bypassPermissions');
    expect(args.join(' ')).toContain('--max-turns 30');
  });

  it('never passes --bare — it would drop the project layer under measurement', () => {
    expect(scriptedArgs(CASE)).not.toContain('--bare');
  });

  it('omits --max-turns when the case sets no turn budget', () => {
    expect(scriptedArgs({ ...CASE, budgets: { timeout_seconds: 60 } })).not.toContain(
      '--max-turns',
    );
  });
});

describe('capability manifests', () => {
  it('declares both modes, cost in scripted only', () => {
    expect(claudeCodeDriver.modes).toEqual(['scripted', 'attended']);
    expect(claudeCodeDriver.capabilities('scripted').cost).toBe(true);
    expect(claudeCodeDriver.capabilities('attended').cost).toBe(false);
  });
});

describe('harvesting the scripted stream', () => {
  it('extracts tokens, cost, turns and the tool-call census from stream-json', async () => {
    const stdout = await fs.readFile(path.join(FIXTURES, 'claude-stream.jsonl'), 'utf8');
    const metrics = harvestStreamJson(stdout);
    expect(metrics).toEqual({
      tokensIn: 1200,
      tokensOut: 800,
      cacheRead: 45000,
      cacheWrite: 900,
      costUsd: 0.1234,
      turns: 5,
      toolCalls: { Bash: 2, Read: 1 },
      bashSearches: 1,
    });
  });
});

describe('harvesting an attended session transcript', () => {
  it('sums usage over assistant entries; cost stays null (notional on subscription)', async () => {
    const jsonl = await fs.readFile(path.join(FIXTURES, 'claude-session.jsonl'), 'utf8');
    const metrics = harvestSessionTranscript(jsonl);
    expect(metrics).toEqual({
      tokensIn: 3250,
      tokensOut: 520,
      cacheRead: 62500,
      cacheWrite: 500,
      costUsd: null,
      turns: 3,
      toolCalls: { Bash: 1, Write: 1 },
      bashSearches: 1,
    });
  });

  it('the null fields match the attended capability manifest', async () => {
    const jsonl = await fs.readFile(path.join(FIXTURES, 'claude-session.jsonl'), 'utf8');
    const metrics = harvestSessionTranscript(jsonl);
    const capabilities = claudeCodeDriver.capabilities('attended');
    expect(metrics.costUsd === null).toBe(!capabilities.cost);
    expect(metrics.tokensIn !== null).toBe(capabilities.tokens);
    expect(metrics.turns !== null).toBe(capabilities.turns);
  });
});

describe('transcript discovery', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-claude-home-'));
  });

  afterEach(async () => {
    await fs.remove(home);
  });

  it('slugs the workspace path the way Claude Code does', () => {
    expect(projectSlug('/tmp/keel-eval/ws_1')).toBe('-tmp-keel-eval-ws-1');
  });

  it('picks the newest session started inside the run window', async () => {
    const projects = path.join(home, 'projects', projectSlug('/tmp/ws'));
    await fs.mkdirp(projects);
    const stale = path.join(projects, 'old.jsonl');
    const fresh = path.join(projects, 'new.jsonl');
    await fs.writeFile(stale, '{}\n');
    await fs.writeFile(fresh, '{}\n');
    const cutoff = Date.now() - 60_000;
    await fs.utimes(stale, new Date(cutoff - 120_000), new Date(cutoff - 120_000));
    expect(findSessionTranscript('/tmp/ws', cutoff, home)).toBe(fresh);
  });

  it('returns null when no session was left on disk', () => {
    expect(findSessionTranscript('/tmp/ws', Date.now(), home)).toBeNull();
  });
});
