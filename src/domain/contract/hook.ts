/**
 * The **hook contract** — how a composition adapter ships a Claude
 * Code hook with the files it contributes.
 *
 * A {@link HookSpec} is **content-carrying**, like a `SkillSpec`: the
 * script itself, the event it runs on and the reminders it may inject
 * into an agent's context. The applier stages the script to
 * `.claude/hooks/<name>.sh` as an **adapter-owned whole file** — one
 * adapter owns each hook name, a second claim is refused naming both,
 * `--reapply` rewrites it pristine — and wires it into
 * `.claude/settings.json` itself, one entry per hook, merged into
 * whatever the project's file holds. An adapter never spells the
 * settings entry, which is what keeps every contributor's wiring
 * identical and each hook separately removable.
 *
 * Two constraints are the seam's, not a convention:
 *
 * - **A hook is a shell script and assumes no runtime.** A scaffolded
 *   Go, Rust or JVM project cannot count on Node, jq or Python on the
 *   machine, so the script runs under `sh` or `bash` and invokes none
 *   of them. The schema refuses one that does.
 * - **Reminders are a budget.** Every line a hook can feed back into
 *   the agent's context competes with the task; a project realizes at
 *   most {@link HOOK_REMINDER_BUDGET} across all of its hooks, and
 *   keel's own hooks leave {@link PLUGIN_REMINDER_SLOTS} of those for
 *   plugins. The engine refuses a run over the budget.
 *
 * A script may carry **slots**: sentinel regions another contributor
 * owns inside it (the format step `code-style` wires into the
 * pre-commit hook). A reapply re-renders the script around what each
 * slot holds on disk rather than over it.
 */

import { z } from 'zod';
import { assertRegion, locateRegion, type Region } from './region.js';

/** Where staged hooks live, under the project scope root. */
export const HOOKS_ROOT = '.claude/hooks';

/** The Claude Code settings file the engine wires every realized hook into. */
export const SETTINGS_TARGET = '.claude/settings.json';

/** The most reminders all of a project's realized hooks may inject, together. */
export const HOOK_REMINDER_BUDGET = 5;

/** The part of {@link HOOK_REMINDER_BUDGET} keel's own hooks never spend — kept for plugins. */
export const PLUGIN_REMINDER_SLOTS = 2;

/**
 * The `env` key of `.claude/settings.json` naming hooks the project
 * turned off, comma-separated — `"KEEL_DISABLED_HOOKS":
 * "pre-commit-format"`. The engine leaves a named hook unwired, and
 * removes keel's entry for it, on every later apply.
 */
export const DISABLED_HOOKS_ENV = 'KEEL_DISABLED_HOOKS';

/** The Claude Code hook events a contribution may attach to. */
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'Notification',
] as const;

/** One of {@link HOOK_EVENTS}. */
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** The staged path of a hook's script: `.claude/hooks/<name>.sh`. */
export function hookTarget(name: string): string {
  return `${HOOKS_ROOT}/${name}.sh`;
}

/** One hook an adapter contributes. Staged and wired by the applier. */
export interface HookSpec {
  /**
   * The hook's name — its script under `.claude/hooks/`, and what
   * {@link DISABLED_HOOKS_ENV} lists to turn it off. Lowercase
   * letters, digits and dashes, starting with a letter.
   * Adapter-owned, and declared on the owning vertical's
   * `Vertical.hooks`.
   */
  readonly name: string;
  /** The Claude Code event the hook runs on. */
  readonly event: HookEvent;
  /** The tool matcher of the settings entry — `Bash` — for the tool events. */
  readonly matcher?: string | undefined;
  /**
   * The whole script. Its first line is a `sh` or `bash` shebang,
   * and it invokes no Node, jq or Python.
   */
  readonly script: string;
  /**
   * Every message the hook may feed back into the agent's context —
   * a blocking gate's stderr, a session-start notice — one entry
   * each. Empty for a hook that only ever passes silently. Counted
   * against {@link HOOK_REMINDER_BUDGET}.
   */
  readonly reminders: readonly string[];
  /**
   * Regions of {@link script} another contributor owns: present in
   * the script, and kept as disk has them when a reapply re-renders
   * it.
   */
  readonly slots?: readonly Region[] | undefined;
}

const HOOK_NAME_RE = /^[a-z][a-z0-9-]*$/;

const SHEBANGS: Readonly<Record<string, 'sh' | 'bash'>> = {
  '#!/bin/sh': 'sh',
  '#!/usr/bin/env sh': 'sh',
  '#!/bin/bash': 'bash',
  '#!/usr/bin/env bash': 'bash',
};

/** The shell a script's shebang names, or `null` when it names none keel runs hooks under. */
export function hookShell(script: string): 'sh' | 'bash' | null {
  const first = script.split(/\r?\n/, 1)[0] ?? '';
  return SHEBANGS[first.trim()] ?? null;
}

/** The runtimes a hook may not assume; matched as a command word on a non-comment line. */
const RUNTIME_RE = /(?:^|[\s;&|(`])(node|npx|jq|python3?|deno|bun)(?=\s|$)/;

/** The first runtime a script invokes outside its comments, or `null`. */
export function assumedRuntime(script: string): string | null {
  for (const line of script.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const hit = RUNTIME_RE.exec(line);
    if (hit !== null) return hit[1]!;
  }
  return null;
}

/** The command a settings entry runs for a hook: its shell over its staged path. */
export function hookCommand(spec: Pick<HookSpec, 'name' | 'script'>): string {
  return `${hookShell(spec.script) ?? 'sh'} ${hookTarget(spec.name)}`;
}

/** Schema governing a contributed {@link HookSpec}. */
export const HookSpecSchema = z
  .object({
    name: z
      .string()
      .regex(HOOK_NAME_RE, 'lowercase letters, digits and dashes, starting with a letter'),
    event: z.enum(HOOK_EVENTS),
    matcher: z.string().min(1).optional(),
    script: z
      .string()
      .min(1)
      .refine((s) => hookShell(s) !== null, {
        message: `must start with a sh or bash shebang (${Object.keys(SHEBANGS).join(', ')})`,
      })
      .refine((s) => assumedRuntime(s) === null, {
        message: 'must not invoke node, npx, jq, python, deno or bun — a hook assumes no runtime',
      }),
    reminders: z.array(z.string().min(1)),
    slots: z.array(z.object({ begin: z.string(), end: z.string() })).optional(),
  })
  .superRefine((spec, ctx) => {
    for (const [i, raw] of (spec.slots ?? []).entries()) {
      try {
        const slot = assertRegion(raw, `slot ${String(i)}`);
        if (locateRegion(spec.script, slot, 'script') === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', i],
            message: `'${slot.begin}' is not in the script — a slot is a region the script carries`,
          });
        }
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slots', i],
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  });

/**
 * The script to stage for a hook, given what disk holds at its path:
 * the spec's script, with each slot's region taken from `existing`
 * where `existing` carries it — so a reapply rewrites everything the
 * hook's owner wrote and keeps what another contributor put in its
 * slot. A slot `existing` does not carry comes back as the script
 * has it; a pair hand-edited apart throws with the fix. CRLF on disk
 * is normalized for the splice and restored after.
 */
export function renderHook(spec: HookSpec, existing: string | null): string {
  if (existing === null || (spec.slots ?? []).length === 0) return spec.script;
  if (existing.includes('\r\n')) {
    return renderHook(spec, existing.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n');
  }
  const where = hookTarget(spec.name);
  let fresh = spec.script;
  for (const slot of spec.slots ?? []) {
    const kept = locateRegion(existing, slot, where);
    const at = locateRegion(fresh, slot, where);
    if (kept === null || at === null) continue;
    fresh = `${fresh.slice(0, at.begin)}${existing.slice(kept.begin, kept.end)}${fresh.slice(at.end)}`;
  }
  return fresh;
}
