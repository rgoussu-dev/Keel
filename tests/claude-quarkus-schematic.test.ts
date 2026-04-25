import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { claudeCoreSchematic } from '../src/schematics/claude-core/factory.js';
import { claudeQuarkusSchematic } from '../src/schematics/claude-quarkus/factory.js';
import { logger } from '../src/util/log.js';

/**
 * Exercises the Quarkus profile against the real shipped templates.
 * The schematic composes on top of `claude-core`: skills land under
 * `.claude/skills/<verb>/SKILL.md`, and `.claude/CLAUDE.md` gains an
 * appended addendum guarded by a sentinel marker for idempotency.
 */
describe('claude-quarkus schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-claude-quarkus-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function makeEngine(): HomegrownEngine {
    const engine = new HomegrownEngine();
    engine.register(claudeCoreSchematic);
    engine.register(claudeQuarkusSchematic);
    return engine;
  }

  it('renders all five universal-verb skill runbooks', async () => {
    const engine = makeEngine();
    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );
    await engine.run(
      'claude-quarkus',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const skillsRoot = path.join(workDir, '.claude', 'skills');
    for (const verb of ['build', 'test', 'run', 'format', 'troubleshoot']) {
      expect(existsSync(path.join(skillsRoot, verb, 'SKILL.md'))).toBe(true);
    }
  });

  it('appends the Quarkus addendum to the existing CLAUDE.md', async () => {
    const engine = makeEngine();
    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );
    await engine.run(
      'claude-quarkus',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const claudeMd = readFileSync(path.join(workDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('Universal engineering conventions');
    expect(claudeMd).toContain('keel:claude-quarkus:addendum');
    expect(claudeMd).toContain('Stack: Java 25 + Quarkus 3.33 LTS + Gradle 9.4');
    expect(claudeMd).toContain('Quick command reference');
  });

  it('is idempotent: a second run does not duplicate the addendum', async () => {
    const engine = makeEngine();
    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );
    await engine.run(
      'claude-quarkus',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );
    await engine.run(
      'claude-quarkus',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const claudeMd = readFileSync(path.join(workDir, '.claude', 'CLAUDE.md'), 'utf8');
    const occurrences = claudeMd.split('keel:claude-quarkus:addendum').length - 1;
    expect(occurrences).toBe(1);
  });

  it('skill content references the actual stack — Quarkus + Gradle commands', async () => {
    const engine = makeEngine();
    await engine.run(
      'claude-core',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );
    await engine.run(
      'claude-quarkus',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const buildMd = readFileSync(
      path.join(workDir, '.claude', 'skills', 'build', 'SKILL.md'),
      'utf8',
    );
    expect(buildMd).toContain('./gradlew build');
    expect(buildMd).toContain('quarkus.package.type=native');

    const runMd = readFileSync(path.join(workDir, '.claude', 'skills', 'run', 'SKILL.md'), 'utf8');
    expect(runMd).toContain('./gradlew quarkusDev');
    expect(runMd).toContain('-Ddebug=5005');

    const troubleshootMd = readFileSync(
      path.join(workDir, '.claude', 'skills', 'troubleshoot', 'SKILL.md'),
      'utf8',
    );
    expect(troubleshootMd).toContain('GraalVM CE 25');
    expect(troubleshootMd).toContain('ArchUnit');
  });

  it('writes the addendum even when CLAUDE.md does not yet exist (standalone use)', async () => {
    const engine = new HomegrownEngine();
    engine.register(claudeQuarkusSchematic);

    await engine.run(
      'claude-quarkus',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const claudeMd = readFileSync(path.join(workDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('keel:claude-quarkus:addendum');
  });
});
