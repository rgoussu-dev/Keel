/**
 * The rule that makes a campaign a measurement of *this harness*
 * rather than of the operator's machine: a driven session loads no
 * user-level configuration — no home-dir settings, no personal
 * skills, no MCP servers of the operator's own.
 *
 * Swept over the driver registry rather than asserted driver by
 * driver, because the failure this guards against arrives with the
 * *next* driver: one added to the CLI without an isolation flag
 * measures the operator's home directory and reports it as a harness
 * finding, and nothing about the numbers would look wrong.
 *
 * The billing half of the same posture is here too: a stray
 * `ANTHROPIC_API_KEY` in the operator's shell outranks the CLI's
 * subscription auth and silently turns a campaign metered, so the rig
 * strips it unless the operator opts in.
 */

import { describe, expect, it } from 'vitest';
import { DRIVERS } from '../../evals/drivers/index.mjs';
import { agentEnv } from '../../evals/lib/env.mjs';
import { scriptedArgs as claudeArgs } from '../../evals/drivers/claude-code.mjs';
import { scriptedArgs as codexArgs } from '../../evals/drivers/codex.mjs';

interface Driver {
  readonly id: string;
  readonly modes: readonly string[];
  readonly isolation?: string;
}

const drivers = Object.entries(DRIVERS as Record<string, Driver>);

/** How each shipped driver builds its scripted argv — the argv the sweep reads. */
const SCRIPTED: Readonly<Record<string, (spec: unknown) => readonly string[]>> = {
  'claude-code': claudeArgs as (spec: unknown) => readonly string[],
  codex: codexArgs as (spec: unknown) => readonly string[],
};

const caseSpec = {
  id: 'task/probe',
  prompt: 'do the thing',
  budgets: { timeout_seconds: 60, max_turns: 5 },
};

describe('every driver in the registry', () => {
  it('is registered under its own id', () => {
    for (const [id, driver] of drivers) expect(driver.id).toBe(id);
  });

  it.each(drivers)('%s declares how it keeps the operator’s config out', (_id, driver) => {
    expect(driver.isolation, `${driver.id} declares no isolation`).toBeTruthy();
  });

  it.each(drivers)('%s really passes what it declared', (_id, driver) => {
    const args = SCRIPTED[driver.id]?.(caseSpec);
    expect(args, `${driver.id} has no scripted argv builder in this sweep`).toBeDefined();
    expect(args!.join(' '), `${driver.id}: ${driver.isolation ?? ''}`).toContain(driver.isolation);
  });

  it.each(drivers)('%s never drops the project layer it is there to measure', (_id, driver) => {
    // Claude Code's `--bare` and Codex's sandbox-everything switches
    // would take the emitted harness with them: the operator's layer
    // is what must go, not the project's.
    expect(SCRIPTED[driver.id]?.(caseSpec)).not.toContain('--bare');
  });
});

describe('the agent environment', () => {
  it('strips API-billing credentials so a subscription campaign stays one', () => {
    const env: Record<string, string | undefined> = agentEnv({
      ANTHROPIC_API_KEY: 'k',
      ANTHROPIC_AUTH_TOKEN: 't',
      PATH: '/bin',
    });
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
    expect(env['PATH']).toBe('/bin');
  });

  it('keeps them only on the explicit opt-in — what CI uses, where there is no subscription', () => {
    const env: Record<string, string | undefined> = agentEnv({
      ANTHROPIC_API_KEY: 'k',
      KEEL_EVALS_API_BILLING: '1',
    });
    expect(env['ANTHROPIC_API_KEY']).toBe('k');
  });
});
