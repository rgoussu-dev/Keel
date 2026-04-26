import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { claudeCoreSchematic } from '../src/schematics/claude-core/factory.js';
import { logger } from '../src/util/log.js';

/**
 * Renders the real shipped templates against a temp project root. The
 * intent is integration coverage: that the schematic wires the engine
 * to the templates correctly and the universal scaffold lands under
 * `.claude/`. Content-shape assertions stay coarse so editorial tweaks
 * to CLAUDE.md and friends don't churn the test.
 */
describe('claude-core schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-claude-core-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('renders CLAUDE.md, settings.json, commands, hooks, agents, and conventions into .claude/', async () => {
    const engine = new HomegrownEngine();
    engine.register(claudeCoreSchematic);

    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const claudeRoot = path.join(workDir, '.claude');
    expect(existsSync(path.join(claudeRoot, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(path.join(claudeRoot, 'settings.json'))).toBe(true);
    expect(existsSync(path.join(claudeRoot, 'commands', 'commit.md'))).toBe(true);
    expect(existsSync(path.join(claudeRoot, 'hooks', 'pre-commit-verify.sh'))).toBe(true);
    expect(existsSync(path.join(claudeRoot, 'agents', 'pr-reviewer.md'))).toBe(true);
    expect(existsSync(path.join(claudeRoot, 'conventions', 'languages.json'))).toBe(true);
  });

  it('does not ship any methodology-only skill', async () => {
    const engine = new HomegrownEngine();
    engine.register(claudeCoreSchematic);

    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    expect(existsSync(path.join(workDir, '.claude', 'skills'))).toBe(false);
  });

  it('CLAUDE.md no longer carries dangling skill pointers', async () => {
    const engine = new HomegrownEngine();
    engine.register(claudeCoreSchematic);

    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const claudeMd = readFileSync(path.join(workDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(claudeMd).not.toMatch(/\*\*Skill:\*\*/);
    expect(claudeMd).not.toMatch(/walking-skeleton-guide/);
    expect(claudeMd).not.toMatch(/hexagonal-review/);
    expect(claudeMd).not.toMatch(/mediator-pattern/);
    expect(claudeMd).not.toMatch(/test-scenario-pattern/);
    expect(claudeMd).not.toMatch(/iac-opentofu/);
    expect(claudeMd).not.toMatch(/trunk-based-xp/);
    expect(claudeMd).not.toMatch(/public-api-docs/);
  });

  it('honours dry-run by leaving the working directory untouched', async () => {
    const engine = new HomegrownEngine();
    engine.register(claudeCoreSchematic);

    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      { dryRun: true },
    );

    expect(existsSync(path.join(workDir, '.claude'))).toBe(false);
  });
});
