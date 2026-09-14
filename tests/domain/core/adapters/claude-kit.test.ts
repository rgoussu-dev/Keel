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
  FORMAT_STEP_BEGIN,
  FORMAT_STEP_END,
  FORMAT_STEP_REGION,
  PRE_COMMIT_HOOK_NAME,
  RUNBOOK_BEGIN,
  RUNBOOK_END,
  RUNBOOK_REGION,
  RUN_SKILL_NAME,
  claudeKitContribution,
  formatStepPatch,
  preCommitHookSpec,
  renderPreCommitHook,
  renderRunbook,
  runSkillSpec,
  type ClaudeKitFamily,
  upsertFormatStep,
  upsertRunbook,
} from '../../../../src/domain/core/adapters/claude-kit.js';
import { HookSpecSchema, renderHook } from '../../../../src/domain/contract/hook.js';

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
  runSkill: runSkillSpec({ description: 'Launch the app.', body: '# Run\n\nsteps' }),
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

  it('fills an empty sentinel pair in place — the slot the binding spec ships', () => {
    const spec = `# Spec\n\nPreamble.\n\n${RUNBOOK_BEGIN}\n${RUNBOOK_END}\n\n## Architecture\n`;
    const next = upsertRunbook(spec, 'stack body');
    expect(next).toBe(
      `# Spec\n\nPreamble.\n\n${RUNBOOK_BEGIN}\n\nstack body\n\n${RUNBOOK_END}\n\n## Architecture\n`,
    );
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

  it('parses as bash, and as POSIX sh, in every shape it renders', () => {
    // A generated hook that does not parse fails at commit time, on
    // the user's machine, with a shell error — worth catching here.
    // `sh -n` holds the body to POSIX syntax, bash-isms excluded.
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
        expect(() => execFileSync('sh', ['-n', file]), `${name} is not POSIX sh`).not.toThrow();
      }
    } finally {
      fs.removeSync(dir);
    }
  });
});

describe('formatStepPatch', () => {
  it('declares the format-step region on the hook and never lands one where the slot is missing', () => {
    const patch = formatStepPatch('toolfmt -w .');
    expect(patch.target).toBe('.claude/hooks/pre-commit-format.sh');
    expect(patch.regions).toEqual([FORMAT_STEP_REGION]);
    expect(patch.apply('#!/bin/sh\nno slot\n')).toBe('#!/bin/sh\nno slot\n');
    expect(patch.apply(renderPreCommitHook(withoutFormatter(family)))).toBe(
      renderPreCommitHook(family),
    );
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

describe('preCommitHookSpec', () => {
  it('is a well-formed hook in both shapes: PreToolUse on Bash, its format step a slot', () => {
    for (const f of [family, withoutFormatter(family)]) {
      const hook = preCommitHookSpec(f);
      expect(HookSpecSchema.safeParse(hook).success).toBe(true);
      expect(hook).toMatchObject({
        name: PRE_COMMIT_HOOK_NAME,
        event: 'PreToolUse',
        matcher: 'Bash',
        script: renderPreCommitHook(f),
        slots: [FORMAT_STEP_REGION],
      });
    }
  });

  it('declares the one reminder it can inject — the gate’s refusal, as the script spells it', () => {
    const hook = preCommitHookSpec(family);
    expect(hook.reminders).toEqual([
      "pre-commit-format: 'tool build && tool test' failed. Fix it before committing.",
    ]);
    expect(hook.script).toContain(`echo "${hook.reminders[0]}" >&2`);
  });

  it('re-renders around the format step code-style wired in, and whole over a pre-sentinel hook', () => {
    const hook = preCommitHookSpec(family);
    const wired = upsertFormatStep(renderPreCommitHook(family), 'toolfmt --all');
    const edited = wired.replace('set -euo pipefail', 'set -eu # hand-edited');
    expect(renderHook(hook, edited)).toBe(wired);
    expect(renderHook(hook, '#!/bin/sh\nold hook\n')).toBe(renderPreCommitHook(family));
    expect(() => renderHook(hook, `x\n${FORMAT_STEP_END}\ny\n`)).toThrow(/sentinels are broken/);
  });
});

describe('claudeKitContribution', () => {
  it('ships the hook and the run skill through their seams, and the stack section as a region', () => {
    const contribution = claudeKitContribution(family);
    expect(contribution.files ?? []).toEqual([]);
    // Nothing under .claude/ is a bare patch or file any more: the
    // engine owns the hook's path, mode, settings wiring and provenance.
    expect((contribution.patches ?? []).map((p) => p.target)).toEqual(['AGENTS.md']);
    expect(contribution.patches?.[0]?.regions).toEqual([RUNBOOK_REGION]);
    expect(contribution.skills).toEqual([family.runSkill]);
    expect(contribution.skills?.[0]?.name).toBe(RUN_SKILL_NAME);
    expect(contribution.hooks).toEqual([preCommitHookSpec(family)]);
    expect(contribution.tagsAdd).toEqual(['agentic.claude-kit']);
  });

  it('round-trips CRLF specs through the runbook patch', () => {
    const contribution = claudeKitContribution(family);
    const patch = contribution.patches?.find((p) => p.target === 'AGENTS.md');
    expect(patch?.target).toBe('AGENTS.md');
    const next = patch!.apply('# Spec\r\n\r\nBody.\r\n');
    expect(next).toContain(`${RUNBOOK_BEGIN}\r\n`);
    expect(next.endsWith(`${RUNBOOK_END}\r\n`)).toBe(true);
  });
});

describe('renderRunbook / runSkillSpec', () => {
  it('renders the shared stack-section shape: commands, stance, layout map, notes', () => {
    const body = renderRunbook({
      title: 'Test Stack (basic)',
      commands: [{ label: 'Build', command: 'tool build' }],
      stance: 'One seam, spelled for this family.',
      layout: ['`src/` — the code.'],
      notes: ['a note'],
    });
    expect(body).toContain('## Stack — Test Stack (basic)');
    expect(body).toContain('| Build | `tool build` |');
    expect(body).toContain('**Dispatch.** One seam, spelled for this family.');
    expect(body).toContain('**Layout**');
    expect(body).toContain('- `src/` — the code.');
    expect(body).toContain('- a note');
    // The map precedes the notes: orientation first, caveats last.
    expect(body.indexOf('- `src/`')).toBeLessThan(body.indexOf('- a note'));
  });

  it('builds the run skill spec under the fixed name', () => {
    const spec = runSkillSpec({ description: 'Launch the app.', body: '# Run\n\nsteps' });
    expect(spec).toEqual({
      name: RUN_SKILL_NAME,
      description: 'Launch the app.',
      body: '# Run\n\nsteps',
    });
  });
});
