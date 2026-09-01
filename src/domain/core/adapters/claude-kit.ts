/**
 * Shared machinery of the walking-skeleton's Claude-kit adapters —
 * the "Claude Code workflow kit" half of keel's identity. One family
 * adapter per stack family (`jvm-claude-kit`, `go-claude-kit`,
 * `rust-claude-kit`, `ts-claude-kit`, `wc-claude-kit`) contributes
 * three things on top of the universal binding spec `claude-core`
 * emits:
 *
 *   - a **stack runbook** appended to the scaffolded `AGENTS.md`
 *     under sentinel markers — build/test/run commands and layout
 *     notes, the stack-specific addendum the binding spec's
 *     universality deliberately leaves out. The patch replaces its
 *     own sentinel-delimited section and never touches the user's
 *     edits around it, so re-scaffolds and a future `--reapply`
 *     stay idempotent;
 *   - the **pre-commit format hook** keel itself uses
 *     (`.claude/hooks/pre-commit-format.sh`), adapted to the
 *     family's own format/verify commands, wired via
 *     `.claude/settings.json`;
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

/** Opens the runbook's sentinel-delimited section in `AGENTS.md`. */
export const RUNBOOK_BEGIN = '<!-- keel:stack-runbook:begin -->';

/** Closes the runbook's sentinel-delimited section in `AGENTS.md`. */
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
  /** Markdown body of the runbook section, without the sentinels. */
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
 * Upserts the runbook section into `AGENTS.md` content: replaces the
 * sentinel-delimited section when both markers are present, appends
 * it after the existing content when neither is. One marker without
 * the other means the pair was hand-edited apart — that throws with
 * the fix rather than guessing where the user's prose ends.
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
  /** e.g. `Quarkus REST on Gradle`. */
  readonly title: string;
  readonly commands: readonly RunbookCommand[];
  /** Layout and family notes, one bullet each. */
  readonly notes: readonly string[];
}

/**
 * Renders the runbook body from a spec — one shape for all five
 * families, so their sections cannot drift apart.
 */
export function renderRunbook(spec: RunbookSpec): string {
  const rows = spec.commands.map((c) => `| ${c.label} | \`${c.command}\` |`).join('\n');
  const notes = spec.notes.map((n) => `- ${n}`).join('\n');
  return [
    `## Stack runbook — ${spec.title}`,
    '',
    'Maintained by keel between the sentinel markers; it replaces this',
    'whole section on re-apply, so keep your own notes outside it.',
    '',
    '| Task | Command |',
    '| ---- | ------- |',
    rows,
    ...(notes.length > 0 ? ['', notes] : []),
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

/**
 * `.claude/settings.json` wiring the pre-commit hook. Identical for
 * every family — the family variance lives inside the hook script.
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
 * Builds the `.claude/` shape for one family — settings, the
 * pre-commit hook, the run skill — and stages the runbook patch
 * against the `AGENTS.md` that `claude-core` emitted earlier in the
 * chain (`after` orders the two).
 */
export function claudeKitContribution(family: ClaudeKitFamily): Contribution {
  return {
    files: [
      { path: SETTINGS_TARGET, content: SETTINGS_CONTENT },
      { path: HOOK_TARGET, content: renderPreCommitHook(family), mode: 0o755 },
    ],
    skills: [family.runSkill],
    patches: [
      {
        target: AGENTS_TARGET,
        apply: eolAware((existing) => upsertRunbook(existing, family.runbook)),
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
