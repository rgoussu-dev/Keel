/**
 * The hook contract: the schema a contributed hook is parsed through
 * (name, event, a sh/bash script that assumes no runtime, slots the
 * script carries), the staged path and settings command, and the
 * re-render that keeps what another contributor put in a slot.
 */

import { describe, expect, it } from 'vitest';
import {
  HOOK_EVENTS,
  HookSpecSchema,
  assumedRuntime,
  hookCommand,
  hookShell,
  hookTarget,
  renderHook,
  type HookSpec,
} from '../../../src/domain/contract/hook.js';
import { hashRegion } from '../../../src/domain/contract/region.js';

const step = hashRegion('step');

const spec = (over: Partial<HookSpec> = {}): HookSpec => ({
  name: 'gate',
  event: 'PreToolUse',
  matcher: 'Bash',
  script: `#!/usr/bin/env bash\nset -eu\n${step.begin}\ndefault\n${step.end}\nexit 0\n`,
  reminders: ['gate: failed.'],
  slots: [step],
  ...over,
});

const issues = (raw: unknown) => {
  const parsed = HookSpecSchema.safeParse(raw);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('HookSpecSchema', () => {
  it('accepts a sh or bash script on every Claude Code event', () => {
    expect(issues(spec())).toEqual([]);
    for (const event of HOOK_EVENTS) {
      expect(issues(spec({ event, script: '#!/bin/sh\nexit 0\n', slots: [] }))).toEqual([]);
    }
  });

  it('refuses a malformed name, an unknown event and a missing reminders list', () => {
    expect(issues(spec({ name: 'Gate_1' })).join()).toMatch(/^name: lowercase letters/);
    expect(issues({ ...spec(), event: 'OnCommit' }).join()).toMatch(/^event:/);
    const { reminders: _dropped, ...noReminders } = spec();
    expect(issues(noReminders).join()).toMatch(/^reminders:/);
  });

  it('refuses a script without a sh or bash shebang', () => {
    for (const script of ['echo hi\n', '#!/usr/bin/env node\nconsole.log(1)\n', '#!/bin/zsh\n']) {
      expect(issues(spec({ script, slots: [] })).join(), script).toMatch(/sh or bash shebang/);
    }
  });

  it('refuses a script that invokes a runtime a scaffolded project cannot count on', () => {
    for (const line of ['node x.js', 'echo "$input" | jq .tool', 'x=$(python3 -c 1)', 'npx y']) {
      const script = `#!/bin/sh\n${line}\n`;
      expect(issues(spec({ script, slots: [] })).join(), line).toMatch(/assumes no runtime/);
    }
  });

  it('holds each slot to a well-formed region the script carries', () => {
    expect(issues(spec({ slots: [hashRegion('elsewhere')] })).join()).toMatch(
      /^slots\.0: '# keel:elsewhere:begin' is not in the script/,
    );
    expect(issues(spec({ slots: [{ begin: '# x', end: '# x' }] })).join()).toMatch(
      /markers must differ/,
    );
  });
});

describe('script inspection', () => {
  it('reads the shell from the shebang, and nothing else', () => {
    expect(hookShell('#!/usr/bin/env bash\n')).toBe('bash');
    expect(hookShell('#!/bin/sh\r\nexit 0\r\n')).toBe('sh');
    expect(hookShell('# no shebang\n')).toBeNull();
  });

  it('ignores a runtime named in a comment or inside a word', () => {
    expect(assumedRuntime('#!/bin/sh\n# no jq/node guaranteed here\nls node_modules\n')).toBeNull();
    expect(assumedRuntime('#!/bin/sh\n  node server.js\n')).toBe('node');
  });

  it('stages under .claude/hooks and runs under the shebang’s shell', () => {
    expect(hookTarget('pre-commit-format')).toBe('.claude/hooks/pre-commit-format.sh');
    expect(hookCommand(spec())).toBe('bash .claude/hooks/gate.sh');
    expect(hookCommand(spec({ script: '#!/bin/sh\n' }))).toBe('sh .claude/hooks/gate.sh');
  });
});

describe('renderHook', () => {
  it('is the script itself with nothing on disk', () => {
    expect(renderHook(spec(), null)).toBe(spec().script);
  });

  it('rewrites everything its owner wrote and keeps what a slot holds on disk', () => {
    const disk = spec()
      .script.replace('default', 'fmt --all')
      .replace('set -eu', 'set -eu # hand-edited');
    const rendered = renderHook(spec(), disk);
    expect(rendered).toBe(spec().script.replace('default', 'fmt --all'));
    expect(renderHook(spec(), rendered)).toBe(rendered);
  });

  it('renders whole over a script without the slot, and throws the fix over a broken pair', () => {
    expect(renderHook(spec(), '#!/bin/sh\nold hook\n')).toBe(spec().script);
    expect(() => renderHook(spec(), `x\n${step.end}\ny\n`)).toThrow(
      /^\.claude\/hooks\/gate\.sh: the sentinels are broken/,
    );
  });

  it('keeps a CRLF checkout on one line ending', () => {
    const disk = spec().script.replace('default', 'fmt').replace(/\n/g, '\r\n');
    const rendered = renderHook(spec(), disk);
    expect(rendered).toBe(spec().script.replace('default', 'fmt').replace(/\n/g, '\r\n'));
    expect(rendered).not.toMatch(/[^\r]\n/);
  });
});
