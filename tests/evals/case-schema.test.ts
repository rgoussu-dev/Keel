/**
 * The case format is agent-neutral data, and the schemas are strict:
 * a key the contract does not name — a `claude_flags`, a
 * `codex_profile` — is refused at load, which is what keeps
 * agent-specifics from leaking into cases one convenience at a time.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCampaign, loadCase } from '../../evals/lib/case-schema.mjs';

const EVALS = path.join(import.meta.dirname, '..', '..', 'evals');

describe('shipped cases and campaigns', () => {
  it('loads the baseline campaign with every case resolved', () => {
    const campaign = loadCampaign(
      path.join(EVALS, 'campaigns', 'baseline.yaml'),
      path.join(EVALS, 'cases'),
    );
    expect(campaign.name).toBe('baseline');
    expect(campaign.runs).toBe(3);
    expect(campaign.resolved.map((c: { id: string }) => c.id)).toEqual([
      'navigation/quarkus-rest',
      'navigation/spring-rest-kotlin',
      'navigation/go-http',
      'navigation/rust-http',
      'navigation/ts-http',
    ]);
  });

  it('every shipped case carries a reference solve.sh', async () => {
    const campaign = loadCampaign(
      path.join(EVALS, 'campaigns', 'baseline.yaml'),
      path.join(EVALS, 'cases'),
    );
    for (const c of campaign.resolved) {
      expect(await fs.pathExists(path.join(c.dir, 'solve.sh')), `${c.id} solve.sh`).toBe(true);
    }
  });
});

describe('schema strictness', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-case-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  const write = async (yaml: string): Promise<void> => {
    await fs.writeFile(path.join(dir, 'case.yaml'), yaml);
  };

  const VALID = `
id: navigation/sample
tags: [navigation]
scaffold:
  stack: ts-http
prompt: answer the question
oracle:
  answers_file: .keel-eval/answers.txt
  answers:
    wiring: application/rest/src/shipping.ts
budgets:
  timeout_seconds: 60
`;

  it('accepts a minimal case and defaults runs to 3', async () => {
    await write(VALID);
    const c = loadCase(dir);
    expect(c.runs).toBe(3);
    expect(c.dir).toBe(dir);
  });

  it('refuses agent-specific keys, naming the file', async () => {
    await write(`${VALID}claude_flags: ["--bare"]\n`);
    expect(() => loadCase(dir)).toThrow(/case\.yaml/);
  });

  it('refuses an oracle with neither answers nor script', async () => {
    await write(
      VALID.replace(/oracle:[\s\S]*budgets:/, 'oracle:\n  clean_worktree: true\nbudgets:'),
    );
    expect(() => loadCase(dir)).toThrow(/answers.*script/);
  });

  it('refuses answers grading without an answers file', async () => {
    await write(VALID.replace('  answers_file: .keel-eval/answers.txt\n', ''));
    expect(() => loadCase(dir)).toThrow(/answers_file/);
  });

  it('refuses a USD budget — wall clock and turns only', async () => {
    await write(VALID.replace('timeout_seconds: 60', 'timeout_seconds: 60\n  max_budget_usd: 5'));
    expect(() => loadCase(dir)).toThrow(/max_budget_usd/);
  });
});
