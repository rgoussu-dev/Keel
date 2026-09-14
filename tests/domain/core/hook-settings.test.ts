/**
 * The engine's merge of realized hooks into `.claude/settings.json`:
 * one entry per hook addressed by its command, the project's own
 * keys untouched, a disabled hook left unwired, and the seed merging
 * into exactly the bytes the family kits emitted before the seam.
 */

import { describe, expect, it } from 'vitest';
import { SETTINGS_SEED, mergeHookSettings } from '../../../src/domain/core/hook-settings.js';
import type { HookSpec } from '../../../src/domain/contract/hook.js';

const gate: HookSpec = {
  name: 'pre-commit-format',
  event: 'PreToolUse',
  matcher: 'Bash',
  script: '#!/usr/bin/env bash\nexit 0\n',
  reminders: [],
};
const GATE = 'bash .claude/hooks/pre-commit-format.sh';

const session: HookSpec = {
  name: 'toolchain-check',
  event: 'SessionStart',
  script: '#!/bin/sh\nexit 0\n',
  reminders: [],
};

type Parsed = {
  hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
  [k: string]: unknown;
};
const parse = (s: string) => JSON.parse(s) as Parsed;

describe('mergeHookSettings', () => {
  it('merges the seed into the settings the family kits shipped before the seam, byte for byte', () => {
    expect(mergeHookSettings(SETTINGS_SEED, [gate])).toBe(`{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-commit-format.sh"
          }
        ]
      }
    ]
  }
}
`);
  });

  it('adds keel’s entry to a project’s settings and keeps everything else', () => {
    const own = JSON.stringify(
      {
        permissions: { allow: ['Bash(pnpm test)'] },
        env: { FOO: 'bar' },
        hooks: {
          PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo edit' }] }],
          PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo done' }] }],
        },
      },
      null,
      2,
    );
    const merged = parse(mergeHookSettings(own, [gate]));
    expect(merged['permissions']).toEqual({ allow: ['Bash(pnpm test)'] });
    expect(merged['env']).toEqual({ FOO: 'bar' });
    expect(merged.hooks['PostToolUse']).toHaveLength(1);
    expect(merged.hooks['PreToolUse']!.map((e) => e.hooks[0]!.command)).toEqual([
      'echo edit',
      GATE,
    ]);
  });

  it('wires one entry per hook, without a matcher on an event that takes none', () => {
    const merged = parse(mergeHookSettings('{}', [gate, session]));
    expect(merged.hooks['PreToolUse']).toEqual([
      { matcher: 'Bash', hooks: [{ type: 'command', command: GATE }] },
    ]);
    expect(merged.hooks['SessionStart']).toEqual([
      { hooks: [{ type: 'command', command: 'sh .claude/hooks/toolchain-check.sh' }] },
    ]);
  });

  it('is its own fixed point, returning the file byte for byte when nothing is missing', () => {
    const seeded = mergeHookSettings('{}', [gate]);
    expect(mergeHookSettings(seeded, [gate])).toBe(seeded);
    const compact = `{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"${GATE}"}]}]}}`;
    expect(mergeHookSettings(compact, [gate])).toBe(compact);
  });

  it('leaves a hook the project disabled unwired, and removes keel’s entry for it', () => {
    const wired = parse(mergeHookSettings(SETTINGS_SEED, [gate, session]));
    const disabling = JSON.stringify({
      ...wired,
      env: { KEEL_DISABLED_HOOKS: ' pre-commit-format , other' },
    });
    const merged = parse(mergeHookSettings(disabling, [gate, session]));
    expect(merged.hooks['PreToolUse']).toBeUndefined();
    expect(merged.hooks['SessionStart']).toHaveLength(1);
    expect(merged['env']).toEqual({ KEEL_DISABLED_HOOKS: ' pre-commit-format , other' });
    // A project hook sharing the entry survives the removal; a fresh file never gains it.
    const shared = JSON.stringify({
      env: { KEEL_DISABLED_HOOKS: 'pre-commit-format' },
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: 'echo mine' },
              { type: 'command', command: GATE },
            ],
          },
        ],
      },
    });
    expect(parse(mergeHookSettings(shared, [gate])).hooks['PreToolUse']).toEqual([
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] },
    ]);
    const fresh = '{"env":{"KEEL_DISABLED_HOOKS":"pre-commit-format"}}';
    expect(mergeHookSettings(fresh, [gate])).toBe(fresh);
  });

  it('refuses a file it cannot read as settings, naming the fix', () => {
    expect(() => mergeHookSettings('{ not json', [gate])).toThrow(/not valid JSON/);
    expect(() => mergeHookSettings('[]', [gate])).toThrow(/JSON object/);
    expect(() => mergeHookSettings('{"hooks":{"PreToolUse":{}}}', [gate])).toThrow(
      /hooks\.PreToolUse to be a list/,
    );
    expect(() => mergeHookSettings('{"hooks":"owned-by-the-project"}', [gate])).toThrow(
      /to be an object/,
    );
    expect(() => mergeHookSettings('{"hooks":[]}', [gate])).toThrow(/to be an object/);
    // An explicit null is a value the file holds, not an absence to default.
    expect(() => mergeHookSettings('{"hooks":null}', [gate])).toThrow(/to be an object/);
    expect(() => mergeHookSettings('{"hooks":{"PreToolUse":null}}', [gate])).toThrow(
      /to be a list/,
    );
  });
});
