/**
 * Unit tests for the claude-kit shared machinery: the sentinel
 * upsert against `AGENTS.md` (append, replace-own-section, broken
 * pair, CRLF round-trip via the contribution's patch), the pre-commit
 * hook rendering (format step present/absent, executable mode), and
 * the runbook/skill renderers the five families share.
 */

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import {
  claudeKitContribution,
  renderPreCommitHook,
  renderRunbook,
  renderRunSkill,
  upsertFormatStep,
  upsertRunbook,
  FORMAT_STEP_BEGIN,
  FORMAT_STEP_END,
  RUNBOOK_BEGIN,
  RUNBOOK_END,
  type ClaudeKitFamily,
} from '../../../../src/domain/core/adapters/claude-kit.js';

/**
 * The same family with **no** formatter — the key absent rather than
 * set to `undefined`, which is the distinction
 * `exactOptionalPropertyTypes` draws and the one `ClaudeKitFamily`
 * means by declaring `formatCommand` optional at all.
 */
const withoutFormatter = (base: ClaudeKitFamily): ClaudeKitFamily => {
  const { formatCommand: _omitted, ...rest } = base;
  return rest;
};

const family: ClaudeKitFamily = {
  runbook: '## Stack runbook — Test\n\ncontent',
  runSkill: '---\nname: run\n---\n\nbody\n',
  formatCommand: 'toolfmt -w .',
  verifyCommand: 'tool build && tool test',
};

describe('upsertRunbook', () => {
  it('appends the sentinel section to a spec without one', () => {
    const next = upsertRunbook('# Spec\n\nBody.\n', 'runbook body');
    expect(next).toBe(`# Spec\n\nBody.\n\n${RUNBOOK_BEGIN}\n\nrunbook body\n\n${RUNBOOK_END}\n`);
  });

  it('replaces its own section and nothing around it', () => {
    const first = upsertRunbook('# Spec\n\nBody.\n', 'old runbook');
    const edited = `${first}\nUser notes below the section.\n`;
    const next = upsertRunbook(edited, 'new runbook');
    expect(next).toContain('new runbook');
    expect(next).not.toContain('old runbook');
    expect(next).toContain('# Spec\n\nBody.');
    expect(next).toContain('User notes below the section.');
    expect(next.match(new RegExp(RUNBOOK_BEGIN, 'g'))).toHaveLength(1);
  });

  it('is idempotent — re-applying the same body changes nothing', () => {
    const once = upsertRunbook('# Spec\n', 'stable body');
    expect(upsertRunbook(once, 'stable body')).toBe(once);
  });

  it('throws on a broken sentinel pair instead of guessing', () => {
    expect(() => upsertRunbook(`# Spec\n${RUNBOOK_BEGIN}\norphan\n`, 'x')).toThrow(
      /sentinels are broken/,
    );
    expect(() => upsertRunbook(`# Spec\n${RUNBOOK_END}\n${RUNBOOK_BEGIN}\n`, 'x')).toThrow(
      /sentinels are broken/,
    );
  });
});

describe('renderPreCommitHook', () => {
  it('formats, re-stages, then verifies when a format command exists', () => {
    const hook = renderPreCommitHook(family);
    expect(hook.startsWith('#!/usr/bin/env bash')).toBe(true);
    expect(hook).toContain('toolfmt -w . >/dev/null');
    expect(hook.indexOf('toolfmt')).toBeLessThan(hook.indexOf('tool build && tool test'));
    expect(hook).toContain('xargs git add --');
    expect(hook).toContain('if ! (tool build && tool test) >/dev/null 2>&1; then');
    expect(hook).toContain('exit 2');
  });

  it('verifies only when the family ships no formatter', () => {
    const hook = renderPreCommitHook(withoutFormatter(family));
    expect(hook).not.toContain('git add');
    expect(hook).toContain('tool build && tool test');
  });

  it('passes non-commit commands straight through', () => {
    const hook = renderPreCommitHook(family);
    expect(hook).toContain('*"git commit"*) ;;');
    expect(hook).toContain('*) exit 0 ;;');
  });

  it('always carries the format-step sentinels, even with no formatter', () => {
    // The pair must be present in both shapes, or `code-style` has
    // nowhere to upsert a format command into later.
    for (const f of [family, withoutFormatter(family)]) {
      const hook = renderPreCommitHook(f);
      expect(hook).toContain(FORMAT_STEP_BEGIN);
      expect(hook).toContain(FORMAT_STEP_END);
      expect(hook.indexOf(FORMAT_STEP_BEGIN)).toBeLessThan(hook.indexOf(FORMAT_STEP_END));
    }
  });

  it('parses as bash in every shape it renders', () => {
    // A generated hook that does not parse fails at commit time, on
    // the user's machine, with a shell error — worth catching here.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-hook-'));
    try {
      const shapes = {
        formatting: renderPreCommitHook(family),
        verifyOnly: renderPreCommitHook(withoutFormatter(family)),
        upserted: upsertFormatStep(
          renderPreCommitHook(withoutFormatter(family)),
          './gradlew spotlessApply',
        ),
      };
      for (const [name, src] of Object.entries(shapes)) {
        const file = path.join(dir, `${name}.sh`);
        fs.writeFileSync(file, src);
        expect(() => execFileSync('bash', ['-n', file]), `${name} is not valid bash`).not.toThrow();
      }
    } finally {
      fs.removeSync(dir);
    }
  });
});

describe('upsertFormatStep', () => {
  const verifyOnly = renderPreCommitHook(withoutFormatter(family));

  it('adds a format command to a hook emitted without one', () => {
    const next = upsertFormatStep(verifyOnly, './gradlew spotlessApply');
    expect(next).toContain('./gradlew spotlessApply >/dev/null');
    expect(next).toContain('xargs git add --');
    expect(next).not.toContain('No formatter configured');
  });

  it('touches nothing outside the sentinels', () => {
    const next = upsertFormatStep(verifyOnly, './gradlew spotlessApply');
    expect(next.split(FORMAT_STEP_BEGIN)[0]).toBe(verifyOnly.split(FORMAT_STEP_BEGIN)[0]);
    expect(next.split(FORMAT_STEP_END)[1]).toBe(verifyOnly.split(FORMAT_STEP_END)[1]);
  });

  it('is idempotent', () => {
    const once = upsertFormatStep(verifyOnly, 'toolfmt -w .');
    expect(upsertFormatStep(once, 'toolfmt -w .')).toBe(once);
  });

  it('leaves a pre-sentinel hook alone rather than appending too late', () => {
    // A format step appended after the verify gate would run after
    // the thing it is meant to fix, so an old hook is left untouched.
    const legacy = '#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n';
    expect(upsertFormatStep(legacy, 'toolfmt -w .')).toBe(legacy);
  });

  it('throws with the fix when the sentinels were hand-edited apart', () => {
    expect(() => upsertFormatStep(`x\n${FORMAT_STEP_BEGIN}\ny\n`, 'toolfmt')).toThrow(
      /sentinels are broken/,
    );
  });
});

describe('claudeKitContribution', () => {
  it('emits settings, an executable hook, and the run skill', () => {
    const contribution = claudeKitContribution(family);
    const byPath = new Map((contribution.files ?? []).map((f) => [f.path, f]));
    expect([...byPath.keys()].sort()).toEqual([
      '.claude/hooks/pre-commit-format.sh',
      '.claude/settings.json',
      '.claude/skills/run/SKILL.md',
    ]);
    expect(byPath.get('.claude/hooks/pre-commit-format.sh')?.mode).toBe(0o755);
    const settings = JSON.parse(String(byPath.get('.claude/settings.json')?.content)) as {
      hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
    };
    expect(settings.hooks.PreToolUse[0]?.matcher).toBe('Bash');
    expect(settings.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(
      'bash .claude/hooks/pre-commit-format.sh',
    );
    expect(contribution.tagsAdd).toEqual(['agentic.claude-kit']);
  });

  it('round-trips CRLF specs through the runbook patch', () => {
    const contribution = claudeKitContribution(family);
    const patch = contribution.patches?.[0];
    expect(patch?.target).toBe('AGENTS.md');
    const next = patch!.apply('# Spec\r\n\r\nBody.\r\n');
    expect(next).toContain(`${RUNBOOK_BEGIN}\r\n`);
    expect(next.endsWith(`${RUNBOOK_END}\r\n`)).toBe(true);
  });
});

describe('renderRunbook / renderRunSkill', () => {
  it('renders the shared runbook shape', () => {
    const body = renderRunbook({
      title: 'Test Stack',
      commands: [{ label: 'Build', command: 'tool build' }],
      notes: ['a note'],
    });
    expect(body).toContain('## Stack runbook — Test Stack');
    expect(body).toContain('| Build | `tool build` |');
    expect(body).toContain('- a note');
  });

  it('renders the run skill with the house frontmatter', () => {
    const skill = renderRunSkill({ description: 'Launch the app.', body: '# Run\n\nsteps' });
    expect(skill.startsWith('---\nname: run\ndescription: Launch the app.\n---\n')).toBe(true);
    expect(skill).toContain('# Run');
  });
});
