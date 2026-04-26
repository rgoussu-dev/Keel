import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { install } from '../src/installer/install.js';
import type { Env } from '../src/installer/env.js';
import type { Prompt } from '../src/installer/profile.js';
import type { PromptSchema } from '../src/engine/types.js';
import type { Manifest } from '../src/manifest/schema.js';
import * as download from '../src/schematics/gradle-wrapper/download.js';

/**
 * Stand-in for the real gradle-wrapper jar (which is itself a ZIP).
 * Four-byte ZIP local-file-header magic + padding satisfies downstream
 * size and shape checks without hitting the network.
 */
const FAKE_WRAPPER_JAR = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(20_000),
]);

interface ScriptedAnswer {
  match: (schema: PromptSchema<unknown>) => boolean;
  value: unknown;
}

/**
 * Test factory: a {@link Prompt} that returns scripted answers in
 * order. Throws on an unmatched prompt so missing branches fail loudly
 * instead of defaulting silently.
 */
function scriptedPrompt(answers: ScriptedAnswer[]): Prompt {
  let cursor = 0;
  return async <T>(schema: PromptSchema<T>): Promise<T> => {
    for (let i = cursor; i < answers.length; i++) {
      if (answers[i]!.match(schema)) {
        cursor = i + 1;
        return answers[i]!.value as T;
      }
    }
    throw new Error(`unscripted prompt: ${schema.name} (${schema.kind})`);
  };
}

/** Minimal fake env: tools and version output supplied verbatim. */
function fakeEnv(
  opts: { installed?: Record<string, string>; versions?: Record<string, string> } = {},
): Env {
  return {
    async which(cmd) {
      return opts.installed?.[cmd] ?? null;
    },
    async version(cmd) {
      return opts.versions?.[cmd] ?? null;
    },
  };
}

const javaQuarkusAnswers: ScriptedAnswer[] = [
  { match: (s) => s.name === 'language', value: 'java' },
  { match: (s) => s.name === 'framework', value: 'quarkus' },
  { match: (s) => s.name === 'native', value: false },
  { match: (s) => s.name === 'basePackage', value: 'com.example.demo' },
  { match: (s) => s.name === 'projectName', value: 'demo-svc' },
  { match: (s) => s.name === 'githubRemote', value: '' },
];

const fullDevEnv = fakeEnv({
  installed: { git: '/usr/bin/git', java: '/usr/bin/java' },
  versions: { java: 'openjdk version "25" 2025-09-16' },
});

describe('install()', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-install-'));
    vi.spyOn(download, 'downloadWrapperJar').mockResolvedValue(FAKE_WRAPPER_JAR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('refuses brownfield directories (anything beyond .git is present)', async () => {
    writeFileSync(path.join(workDir, 'README.md'), '# pre-existing\n');

    await expect(
      install({
        cwd: workDir,
        force: false,
        dryRun: false,
        prompt: scriptedPrompt([]),
        env: fullDevEnv,
      }),
    ).rejects.toThrow(/brownfield/);
  });

  it('treats a directory containing only .git as greenfield', async () => {
    mkdirSync(path.join(workDir, '.git'), { recursive: true });

    await install({
      cwd: workDir,
      force: false,
      dryRun: true,
      prompt: scriptedPrompt(javaQuarkusAnswers),
      env: fullDevEnv,
    });

    expect(existsSync(path.join(workDir, '.claude'))).toBe(false); // dry-run
  });

  it('refuses when a manifest is already present (without --force)', async () => {
    mkdirSync(path.join(workDir, '.claude'), { recursive: true });
    writeFileSync(
      path.join(workDir, '.claude', '.keel-manifest.json'),
      JSON.stringify({
        kitVersion: '0.0.0',
        installedAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        entries: [],
      }),
    );

    await expect(
      install({
        cwd: workDir,
        force: false,
        dryRun: false,
        prompt: scriptedPrompt(javaQuarkusAnswers),
        env: fullDevEnv,
      }),
    ).rejects.toThrow(/existing manifest/);
  });

  it('aborts when env preflight is fatal (no git on PATH)', async () => {
    await expect(
      install({
        cwd: workDir,
        force: false,
        dryRun: false,
        prompt: scriptedPrompt(javaQuarkusAnswers),
        env: fakeEnv({}),
      }),
    ).rejects.toThrow(/preflight/);
  });

  it('runs claude-core + claude-quarkus + walking-skeleton end-to-end', async () => {
    await install({
      cwd: workDir,
      force: false,
      dryRun: false,
      prompt: scriptedPrompt(javaQuarkusAnswers),
      env: fullDevEnv,
    });

    // claude-core scaffold
    expect(existsSync(path.join(workDir, '.claude', 'CLAUDE.md'))).toBe(true);
    expect(existsSync(path.join(workDir, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(path.join(workDir, '.claude', 'commands', 'commit.md'))).toBe(true);

    // claude-quarkus skills + addendum
    for (const verb of ['build', 'test', 'run', 'format', 'troubleshoot']) {
      expect(existsSync(path.join(workDir, '.claude', 'skills', verb, 'SKILL.md'))).toBe(true);
    }
    expect(readFileSync(path.join(workDir, '.claude', 'CLAUDE.md'), 'utf8')).toContain(
      'keel:claude-quarkus:addendum',
    );

    // walking-skeleton output at project root
    expect(existsSync(path.join(workDir, 'settings.gradle.kts'))).toBe(true);
    expect(existsSync(path.join(workDir, 'gradle', 'libs.versions.toml'))).toBe(true);
    expect(
      existsSync(
        path.join(
          workDir,
          'application',
          'rest',
          'executable',
          'src',
          'main',
          'java',
          'com',
          'example',
          'demo',
          'application',
          'rest',
          'executable',
          'resources',
          'PingResource.java',
        ),
      ),
    ).toBe(true);
  });

  it('manifest tracks only files under .claude/ and attributes sources', async () => {
    await install({
      cwd: workDir,
      force: false,
      dryRun: false,
      prompt: scriptedPrompt(javaQuarkusAnswers),
      env: fullDevEnv,
    });

    const manifest = JSON.parse(
      readFileSync(path.join(workDir, '.claude', '.keel-manifest.json'), 'utf8'),
    ) as Manifest;

    expect(manifest.entries.length).toBeGreaterThan(0);
    for (const entry of manifest.entries) {
      // Targets are relative to .claude/ — never include the prefix or
      // any project-root path.
      expect(entry.target.startsWith('.claude/')).toBe(false);
      expect(entry.target.startsWith('..')).toBe(false);
    }

    // Targets that came from claude-core
    const coreTargets = manifest.entries.filter((e) => e.source.startsWith('claude-core/'));
    expect(coreTargets.some((e) => e.target === 'CLAUDE.md')).toBe(true);
    expect(coreTargets.some((e) => e.target === 'settings.json')).toBe(true);

    // Targets from claude-quarkus — five skill files
    const quarkusTargets = manifest.entries.filter((e) => e.source.startsWith('claude-quarkus/'));
    for (const verb of ['build', 'test', 'run', 'format', 'troubleshoot']) {
      expect(quarkusTargets.some((e) => e.target === `skills/${verb}/SKILL.md`)).toBe(true);
    }

    // No project-root files leaked into the manifest
    for (const entry of manifest.entries) {
      expect(entry.target.startsWith('settings.gradle')).toBe(false);
      expect(entry.target.startsWith('build.gradle')).toBe(false);
      expect(entry.target.startsWith('application/')).toBe(false);
      expect(entry.target.startsWith('domain/')).toBe(false);
    }
  });

  // Regression: CLAUDE.md is created by claude-core and then modified
  // by claude-quarkus (which appends the addendum). Without per-writer
  // tracking, both shipped and current hashes would be the composed
  // content's hash, which makes update mistake the file for
  // unmodified-by-the-user and silently overwrite it on the next bump.
  it('records sha256Shipped as the first-writer content for composed files', async () => {
    await install({
      cwd: workDir,
      force: false,
      dryRun: false,
      prompt: scriptedPrompt(javaQuarkusAnswers),
      env: fullDevEnv,
    });

    const manifest = JSON.parse(
      readFileSync(path.join(workDir, '.claude', '.keel-manifest.json'), 'utf8'),
    ) as Manifest;
    const claudeMdEntry = manifest.entries.find((e) => e.target === 'CLAUDE.md');
    expect(claudeMdEntry).toBeDefined();
    // Composition happened: the on-disk content is core + addendum,
    // but sha256Shipped is just core's content — proves first-writer
    // capture worked.
    expect(claudeMdEntry!.sha256Shipped).not.toBe(claudeMdEntry!.sha256Current);

    // Pure-core files (settings.json was only ever written by claude-core)
    // still have shipped == current, since no later schematic touched them.
    const settingsEntry = manifest.entries.find((e) => e.target === 'settings.json');
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry!.sha256Shipped).toBe(settingsEntry!.sha256Current);
  });

  it('honours --dry-run by leaving the workspace untouched', async () => {
    await install({
      cwd: workDir,
      force: false,
      dryRun: true,
      prompt: scriptedPrompt(javaQuarkusAnswers),
      env: fullDevEnv,
    });

    expect(existsSync(path.join(workDir, '.claude'))).toBe(false);
    expect(existsSync(path.join(workDir, 'settings.gradle.kts'))).toBe(false);
  });
});
