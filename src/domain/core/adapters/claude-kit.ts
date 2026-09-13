/**
 * Shared machinery of the walking-skeleton's Claude-kit adapters —
 * the "Claude Code workflow kit" half of keel's identity. One family
 * adapter per stack family (`jvm-claude-kit`, `go-claude-kit`,
 * `rust-claude-kit`, `ts-claude-kit`, `wc-claude-kit`) contributes
 * three things on top of the universal binding spec `claude-core`
 * emits:
 *
 *   - a **stack section** in the scaffolded `AGENTS.md`, under
 *     sentinel markers: the build/test/run commands, the dispatch
 *     stance of this project's language, and a **layout map** — the
 *     path grammar of exactly the shape that was scaffolded (family ×
 *     layout × entrypoints), so an agent orients by map before it
 *     searches. This is the stack-specific addendum the binding
 *     spec's universality deliberately leaves out, and the other four
 *     families' stances never ship. The patch replaces its own
 *     sentinel-delimited section and never touches the user's edits
 *     around it, so re-scaffolds and `--reapply` stay idempotent;
 *   - the **pre-commit format hook** keel itself uses
 *     (`.claude/hooks/pre-commit-format.sh`), adapted to the
 *     family's own format/verify commands, wired via
 *     `.claude/settings.json`. Also a seeded upsert, not a whole
 *     file: the `code-style` vertical owns the hook's format step
 *     once it wires a formatter in, so a reapply re-renders the
 *     hook around the step it finds rather than resetting it. And
 *     `.claude/settings.json` is the project's: keel merges its one
 *     `PreToolUse` entry into whatever the file holds and leaves the
 *     rest — permissions, env, other hooks — as it found it;
 *   - a **run skill** (`.claude/skills/run/SKILL.md`, staged through
 *     the `SkillSpec` seam) so "launch the app and check it" works
 *     out of the box for an agent working inside the scaffolded
 *     project.
 *
 * The rules carried over from the `ci` family: adapters are per
 * stack **family**, with the build system (and every other dial)
 * read from the manifest tag set — never minted as adapters per
 * `pkg.*` tag.
 */

import { eolAware } from '../util.js';
import { CLAUDE_CORE_ID } from './claude-core.js';
import type { Adapter, Contribution, Ctx, SkillSpec, Tag } from '../../contract/composition.js';

/** The walking-skeleton dimension the family adapters cover. */
export const CLAUDE_KIT_DIMENSION = 'agentic-kit';

/** Promoted by every claude-kit adapter. */
export const CLAUDE_KIT_TAG: Tag = 'agentic.claude-kit';

/** Opens the stack section's sentinel-delimited region in `AGENTS.md`. */
export const RUNBOOK_BEGIN = '<!-- keel:stack-runbook:begin -->';

/** Closes the stack section's sentinel-delimited region in `AGENTS.md`. */
export const RUNBOOK_END = '<!-- keel:stack-runbook:end -->';

const AGENTS_TARGET = 'AGENTS.md';
const SETTINGS_TARGET = '.claude/settings.json';
const HOOK_TARGET = '.claude/hooks/pre-commit-format.sh';

/**
 * The one skill every family kit ships: launch the scaffolded app
 * and check it end to end. Declared on the `walking-skeleton`
 * vertical's `skills`, staged through the {@link SkillSpec} seam.
 */
export const RUN_SKILL_NAME = 'run';

/** What a family adapter contributes on top of the shared shape. */
export interface ClaudeKitFamily {
  /** Markdown body of the stack section, without the sentinels. */
  readonly runbook: string;
  /** The family's run skill — `name` is {@link RUN_SKILL_NAME}. */
  readonly runSkill: SkillSpec;
  /**
   * Auto-fix command the pre-commit hook runs before verifying —
   * `gofmt -w .`, `cargo fmt`. Absent where the scaffold ships no
   * formatter; the hook then verifies only.
   */
  readonly formatCommand?: string;
  /**
   * The fast gate the pre-commit hook runs so every commit lands
   * green (binding spec §6) — the same commands the family's `ci`
   * pipeline would run.
   */
  readonly verifyCommand: string;
}

/**
 * Upserts the stack section into `AGENTS.md` content: replaces the
 * sentinel-delimited region when both markers are present — the
 * binding spec ships the pair empty, right under its preamble, so
 * the section lands where an agent reads first — and appends it
 * after the existing content when neither is (a spec authored before
 * the slot existed). One marker without the other means the pair was
 * hand-edited apart — that throws with the fix rather than guessing
 * where the user's prose ends.
 */
export function upsertRunbook(existing: string, body: string): string {
  const section = `${RUNBOOK_BEGIN}\n\n${body.trim()}\n\n${RUNBOOK_END}\n`;
  const begin = existing.indexOf(RUNBOOK_BEGIN);
  const end = existing.indexOf(RUNBOOK_END);
  if (begin === -1 && end === -1) {
    return `${existing.trimEnd()}\n\n${section}`;
  }
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `AGENTS.md: the stack-runbook sentinels are broken — expected '${RUNBOOK_BEGIN}' followed by '${RUNBOOK_END}'. Restore the pair (or delete both) and re-run.`,
    );
  }
  const afterEnd = end + RUNBOOK_END.length;
  const tail = existing.slice(afterEnd).replace(/^\n/, '');
  return `${existing.slice(0, begin)}${section}${tail}`;
}

/** One row of the runbook's command table. */
export interface RunbookCommand {
  readonly label: string;
  readonly command: string;
}

/** Inputs to {@link renderRunbook}. */
export interface RunbookSpec {
  /** e.g. `Quarkus REST on Gradle (modulith)`. */
  readonly title: string;
  readonly commands: readonly RunbookCommand[];
  /**
   * This language's dispatch-seam stance — the mechanism behind the
   * binding spec's "commands through one dispatch seam", spelled for
   * the family that was scaffolded and for no other. One paragraph.
   */
  readonly stance: string;
  /**
   * The layout map: one bullet per kind of file, as a path grammar
   * over `<ctx>` / `<peer>` placeholders rather than a listing of
   * today's modules (which `keel add module` would date). What an
   * agent reads to orient before it searches.
   */
  readonly layout: readonly string[];
  /** Family notes that fit nowhere above, one bullet each. */
  readonly notes: readonly string[];
}

/**
 * Renders the stack section body from a spec — one shape for all
 * five families, so their sections cannot drift apart: the command
 * table, the dispatch stance, then the layout map with the notes
 * folded in as its closing bullets.
 */
export function renderRunbook(spec: RunbookSpec): string {
  const rows = spec.commands.map((c) => `| ${c.label} | \`${c.command}\` |`).join('\n');
  const bullets = [...spec.layout, ...spec.notes].map((n) => `- ${n}`).join('\n');
  return [
    `## Stack — ${spec.title}`,
    '',
    '| Task | Command |',
    '| ---- | ------- |',
    rows,
    '',
    `**Dispatch.** ${spec.stance}`,
    '',
    '**Layout** — paths from the repository root; `<ctx>` names a bounded context, `<Ctx>` its',
    'PascalCase form, `<peer>` a sibling context it consumes.',
    '',
    bullets,
  ].join('\n');
}

/**
 * Builds the family's run skill as a {@link SkillSpec}. The name is
 * fixed; the description and body are the family's launch-and-probe
 * loop. Serialization is `renderSkill`'s, at staging time — the
 * family never spells frontmatter.
 */
export function runSkillSpec(spec: { description: string; body: string }): SkillSpec {
  return { name: RUN_SKILL_NAME, ...spec };
}

/** The hook entry keel owns in `.claude/settings.json`, keyed by its command. */
const HOOK_COMMAND = `bash ${HOOK_TARGET}`;

/**
 * `.claude/settings.json` as a fresh project starts from: the
 * pre-commit hook wired, nothing else. Identical for every family —
 * the family variance lives inside the hook script.
 */
const SETTINGS_CONTENT = `{
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
`;

interface ClaudeSettings {
  hooks?: { PreToolUse?: { matcher?: string; hooks?: { type?: string; command?: string }[] }[] };
  [key: string]: unknown;
}

/**
 * Merges keel's pre-commit hook into an existing `.claude/settings.json`:
 * the one `PreToolUse` entry running the hook is added when no entry
 * runs it yet, and everything else the file holds — permissions,
 * env, the project's own hooks — stays as it is. Its own fixed
 * point, so `--reapply` refreshes nothing it does not own. A file
 * that is not JSON, whose `hooks` is not an object, or whose
 * `hooks.PreToolUse` is not a list, is refused with the fix rather
 * than rewritten into a shape Claude Code would not load.
 */
export function upsertClaudeHook(existing: string): string {
  let settings: ClaudeSettings;
  try {
    settings = JSON.parse(existing) as ClaudeSettings;
  } catch (err) {
    throw new Error(
      `${SETTINGS_TARGET}: not valid JSON (${err instanceof Error ? err.message : String(err)}). Fix the file (or delete it) and re-run.`,
    );
  }
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error(
      `${SETTINGS_TARGET}: expected a JSON object at the top level. Fix the file and re-run.`,
    );
  }
  // Absent is fine and defaults; present-but-null is a value the
  // file holds, and one that fails the check below.
  const hooks = settings.hooks === undefined ? {} : settings.hooks;
  if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) {
    throw new Error(`${SETTINGS_TARGET}: expected hooks to be an object. Fix the file and re-run.`);
  }
  const preToolUse = hooks.PreToolUse === undefined ? [] : hooks.PreToolUse;
  if (!Array.isArray(preToolUse)) {
    throw new Error(
      `${SETTINGS_TARGET}: expected hooks.PreToolUse to be a list. Fix the file and re-run.`,
    );
  }
  const wired = preToolUse.some((entry) =>
    (entry.hooks ?? []).some((h) => h.command === HOOK_COMMAND),
  );
  if (wired) return existing;
  const merged: ClaudeSettings = {
    ...settings,
    hooks: {
      ...hooks,
      PreToolUse: [
        ...preToolUse,
        { matcher: 'Bash', hooks: [{ type: 'command', command: HOOK_COMMAND }] },
      ],
    },
  };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/**
 * The pre-commit hook, keel's own
 * (`.claude/hooks/pre-commit-format.sh`) adapted to the family's
 * commands. Built here rather than rendered from a template because
 * the template renderer only round-trips the executable bit on
 * verbatim (non-`.ejs`) files, and this script needs both
 * substitution and `+x`.
 *
 * The `git commit` detection is a substring probe over the raw hook
 * payload, deliberately: unlike keel itself, a scaffolded Go, Rust
 * or JVM project cannot assume Node (or jq) on the machine, and the
 * worst a false positive costs is one extra verify run.
 */
export function renderPreCommitHook(family: ClaudeKitFamily): string {
  return `#!/usr/bin/env bash
# PreToolUse hook: before Claude runs \`git commit\`, auto-format the tree
# (where the stack has a formatter) and run the project's own fast gate,
# so every commit lands green (AGENTS.md §6).
# Anything unrelated to \`git commit\` passes straight through.
set -euo pipefail

input=$(cat)

# Substring probe over the raw payload — dependency-free on purpose
# (no jq/node guaranteed on this stack); a false positive only costs
# one extra verify run.
case "$input" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "\${CLAUDE_PROJECT_DIR:-.}"

${renderFormatStep(family.formatCommand)}

if ! (${family.verifyCommand}) >/dev/null 2>&1; then
  echo "pre-commit-format: '${family.verifyCommand}' failed. Fix it before committing." >&2
  exit 2
fi
`;
}

/** Opens the hook's keel-managed format step. */
export const FORMAT_STEP_BEGIN = '# keel:format-step:begin';

/** Closes the hook's keel-managed format step. */
export const FORMAT_STEP_END = '# keel:format-step:end';

/**
 * Renders the hook's auto-format step, sentinel-delimited.
 *
 * The sentinels exist so the `code-style` vertical can add a format
 * command to a hook that was emitted without one — a JVM or
 * TypeScript project scaffolded before its formatter was configured,
 * or a brownfield `keel add code-style`. The section is always
 * present, even when empty, so the upsert never has to guess where
 * it would have gone.
 *
 * Formatting runs before the gate and re-stages exactly the paths
 * that were already staged, so a reformat cannot silently widen the
 * commit to unrelated dirty files.
 */
export function renderFormatStep(formatCommand: string | undefined): string {
  if (formatCommand === undefined) {
    return [
      FORMAT_STEP_BEGIN,
      '# No formatter configured for this stack — `keel add code-style` wires one.',
      FORMAT_STEP_END,
    ].join('\n');
  }
  return [
    FORMAT_STEP_BEGIN,
    'staged=$(git diff --name-only --cached || true)',
    '',
    `${formatCommand} >/dev/null`,
    '',
    'if [ -n "$staged" ]; then',
    '  printf \'%s\\n\' "$staged" | xargs git add --',
    'fi',
    FORMAT_STEP_END,
  ].join('\n');
}

/**
 * Upserts the format step into an already-emitted hook script.
 *
 * Mirrors {@link upsertRunbook}: replaces the sentinel-delimited
 * section when the pair is present, and refuses to guess when only
 * one marker survives. Unlike the runbook it never appends — a hook
 * without the pair predates the sentinels, and blindly appending a
 * format step after the verify gate would run it too late to matter.
 */
export function upsertFormatStep(existing: string, formatCommand: string | undefined): string {
  const begin = existing.indexOf(FORMAT_STEP_BEGIN);
  const end = existing.indexOf(FORMAT_STEP_END);
  if (begin === -1 && end === -1) return existing;
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `.claude/hooks/pre-commit-format.sh: the format-step sentinels are broken — expected '${FORMAT_STEP_BEGIN}' followed by '${FORMAT_STEP_END}'. Restore the pair (or delete both) and re-run.`,
    );
  }
  const tail = existing.slice(end + FORMAT_STEP_END.length);
  return `${existing.slice(0, begin)}${renderFormatStep(formatCommand)}${tail}`;
}

/**
 * Re-renders the hook for the family around the format step the
 * existing hook carries: everything outside the step's sentinels is
 * keel's and comes back pristine, the step itself is whatever the
 * file holds — the family's default, or the formatter `code-style`
 * wired in since. A hook without the pair predates the sentinels and
 * is re-rendered whole. Its own fixed point, so `--reapply` refreshes
 * it rather than refusing it. Hand-edited-apart sentinels throw with
 * the fix, as {@link upsertFormatStep} does.
 */
export function refreshPreCommitHook(existing: string, family: ClaudeKitFamily): string {
  const fresh = renderPreCommitHook(family);
  const begin = existing.indexOf(FORMAT_STEP_BEGIN);
  const end = existing.indexOf(FORMAT_STEP_END);
  if (begin === -1 && end === -1) return fresh;
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `${HOOK_TARGET}: the format-step sentinels are broken — expected '${FORMAT_STEP_BEGIN}' followed by '${FORMAT_STEP_END}'. Restore the pair (or delete both) and re-run.`,
    );
  }
  const step = existing.slice(begin, end + FORMAT_STEP_END.length);
  const freshBegin = fresh.indexOf(FORMAT_STEP_BEGIN);
  const freshEnd = fresh.indexOf(FORMAT_STEP_END) + FORMAT_STEP_END.length;
  return `${fresh.slice(0, freshBegin)}${step}${fresh.slice(freshEnd)}`;
}

/**
 * Builds the `.claude/` shape for one family — settings, the
 * pre-commit hook, the run skill — and stages the stack-section
 * patch against the `AGENTS.md` that `claude-core` seeded earlier
 * in the chain (`after` orders the two). The hook and the settings
 * are seeded upserts too: the hook executable and refreshed around
 * its format step, the settings merged around keel's one entry.
 */
export function claudeKitContribution(family: ClaudeKitFamily): Contribution {
  return {
    skills: [family.runSkill],
    patches: [
      {
        target: SETTINGS_TARGET,
        seed: SETTINGS_CONTENT,
        apply: eolAware(upsertClaudeHook),
      },
      {
        target: AGENTS_TARGET,
        apply: eolAware((existing) => upsertRunbook(existing, family.runbook)),
      },
      {
        target: HOOK_TARGET,
        seed: renderPreCommitHook(family),
        mode: 0o755,
        apply: eolAware((existing) => refreshPreCommitHook(existing, family)),
      },
    ],
    tagsAdd: [CLAUDE_KIT_TAG],
  };
}

/** Declares one family adapter over the shared machinery. */
export function claudeKitAdapter(
  id: string,
  requires: readonly Tag[],
  family: (ctx: Ctx) => ClaudeKitFamily,
): Adapter {
  return {
    id,
    vertical: 'walking-skeleton',
    covers: [CLAUDE_KIT_DIMENSION],
    predicate: { requires },
    after: [CLAUDE_CORE_ID],
    contribute: (ctx) => claudeKitContribution(family(ctx)),
  };
}
