/**
 * Shared machinery of the agent-harness's Claude-kit adapters —
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
 *     family's own format/verify commands — a `HookSpec`, staged and
 *     wired into `.claude/settings.json` by the engine. Its format
 *     step is a slot: the `code-style` vertical owns it once it wires
 *     a formatter in, so a reapply re-renders the hook around the
 *     step it finds rather than resetting it;
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

import { CLAUDE_CORE_ID } from './claude-core.js';
import type {
  Adapter,
  Contribution,
  Ctx,
  DocSection,
  HookSpec,
  SkillSpec,
  Tag,
} from '../../contract/composition.js';
import { hookTarget } from '../../contract/hook.js';
import {
  hashRegion,
  markdownRegion,
  regionPatch,
  upsertRegion,
  type Region,
} from '../../contract/region.js';

/** The agent-harness dimension the family adapters cover. */
export const CLAUDE_KIT_DIMENSION = 'agentic-kit';

/** Promoted by every claude-kit adapter. */
export const CLAUDE_KIT_TAG: Tag = 'agentic.claude-kit';

/**
 * The stack section's region in `AGENTS.md` —
 * `<!-- keel:stack-runbook:begin -->` … `<!-- keel:stack-runbook:end -->`
 * — declared on the family kit's patch, so the engine holds the
 * section to its markers.
 */
export const RUNBOOK_REGION: Region = markdownRegion('stack-runbook');

/** Opens the stack section's sentinel-delimited region in `AGENTS.md`. */
export const RUNBOOK_BEGIN = RUNBOOK_REGION.begin;

/** Closes the stack section's sentinel-delimited region in `AGENTS.md`. */
export const RUNBOOK_END = RUNBOOK_REGION.end;

const AGENTS_TARGET = 'AGENTS.md';

/** The one hook every family kit ships: format, then gate, before a Claude-issued `git commit`. */
export const PRE_COMMIT_HOOK_NAME = 'pre-commit-format';

const HOOK_TARGET = hookTarget(PRE_COMMIT_HOOK_NAME);

/**
 * The one skill every family kit ships: launch the scaffolded app
 * and check it end to end. Declared on the `agent-harness`
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
  /**
   * The per-layer docs of the shape that was scaffolded — one per
   * directory that exists in it, this family's facts only. Rendered
   * by {@link layerDocSections}; absent where a family ships none.
   */
  readonly docs?: readonly LayerDoc[];
}

/** One per-layer doc a family kit emits: where it lives, its map row, and its bullets. */
export interface LayerDoc {
  /** The directory, relative to the project root — one that exists in the scaffold. */
  readonly directory: string;
  /** The one-line row the root map projects for the doc. */
  readonly description: string;
  /** What the directory is, after its path — `the contract face`. */
  readonly title: string;
  /**
   * Facts an agent cannot read off the tree: the recipe for the
   * layer's usual change naming real files, the wiring it needs, the
   * silent failure it is known for. One bullet each.
   */
  readonly bullets: readonly string[];
  /**
   * Set on the directory the project's bounded contexts sit in, so
   * the engine's index projects a row per context beneath it. The
   * family owns the layout — `modules/` here, `internal/modules/` on
   * Go — and the projection reads the declaration rather than
   * carrying five path prefixes of its own.
   */
  readonly indexes?: 'modules';
}

/** The section every family kit owns in the docs it seeds. */
export const LAYER_DOC_SECTION = 'layer';

/**
 * Renders a family's layer docs into doc sections — one shape for
 * all five families, so their docs cannot drift apart: a heading
 * naming the directory and what it is, then the bullets.
 */
export function layerDocSections(docs: readonly LayerDoc[]): DocSection[] {
  return docs.map((doc) => ({
    directory: doc.directory,
    section: LAYER_DOC_SECTION,
    description: doc.description,
    ...(doc.indexes === undefined ? {} : { indexes: doc.indexes }),
    body: [`## \`${doc.directory}/\` — ${doc.title}`, '', ...doc.bullets.map((b) => `- ${b}`)].join(
      '\n',
    ),
  }));
}

/**
 * Upserts the stack section into `AGENTS.md` content: replaces the
 * sentinel-delimited region when both markers are present — the
 * binding spec ships the pair empty, right under its preamble, so
 * the section lands where an agent reads first — and appends it
 * after the existing content when neither is (a spec authored before
 * the slot existed). One marker without the other means the pair was
 * hand-edited apart — that throws with the fix rather than guessing
 * where the user's prose ends. {@link upsertRegion} in the Markdown
 * shape, and the transform of the region patch the contribution
 * declares.
 */
export function upsertRunbook(existing: string, body: string): string {
  return upsertRegion(existing, RUNBOOK_REGION, body, { padding: 'blank', where: AGENTS_TARGET });
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

/**
 * The hook's format-step region — `# keel:format-step:begin/end` —
 * owned by the `code-style` vertical once it wires a formatter in,
 * and declared on its patch so the engine holds the step to its
 * markers.
 */
export const FORMAT_STEP_REGION: Region = hashRegion('format-step');

/** Opens the hook's keel-managed format step. */
export const FORMAT_STEP_BEGIN = FORMAT_STEP_REGION.begin;

/** Closes the hook's keel-managed format step. */
export const FORMAT_STEP_END = FORMAT_STEP_REGION.end;

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
  return [FORMAT_STEP_BEGIN, formatStepBody(formatCommand), FORMAT_STEP_END].join('\n');
}

/** The format step between its markers: the lines the region owns. */
export function formatStepBody(formatCommand: string | undefined): string {
  if (formatCommand === undefined) {
    return '# No formatter configured for this stack — `keel add code-style` wires one.';
  }
  return [
    'staged=$(git diff --name-only --cached || true)',
    '',
    `${formatCommand} >/dev/null`,
    '',
    'if [ -n "$staged" ]; then',
    '  printf \'%s\\n\' "$staged" | xargs git add --',
    'fi',
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
  return upsertRegion(existing, FORMAT_STEP_REGION, formatStepBody(formatCommand), {
    whenAbsent: 'keep',
    where: HOOK_TARGET,
  });
}

/**
 * The `code-style` vertical's patch on the hook: the format step as
 * an owned region, so a formatter wired in after the scaffold lands
 * inside the step and nowhere else — and the engine refuses it if
 * it did.
 */
export function formatStepPatch(formatCommand: string | undefined) {
  return regionPatch({
    target: HOOK_TARGET,
    region: FORMAT_STEP_REGION,
    body: formatStepBody(formatCommand),
    whenAbsent: 'keep',
  });
}

/**
 * The family's pre-commit hook as a {@link HookSpec}: a `PreToolUse`
 * hook on `Bash`, whose one reminder is the gate's refusal, and whose
 * format step is a slot — `code-style` owns what lies inside it once
 * it wires a formatter in, so a reapply re-renders the hook around
 * the step it finds.
 */
export function preCommitHookSpec(family: ClaudeKitFamily): HookSpec {
  return {
    name: PRE_COMMIT_HOOK_NAME,
    event: 'PreToolUse',
    matcher: 'Bash',
    script: renderPreCommitHook(family),
    reminders: [`pre-commit-format: '${family.verifyCommand}' failed. Fix it before committing.`],
    slots: [FORMAT_STEP_REGION],
  };
}

/**
 * Builds the `.claude/` shape for one family — the pre-commit hook
 * and the run skill, both through their seams — and stages the
 * stack-section patch against the `AGENTS.md` that `claude-core`
 * seeded earlier in the chain (`after` orders the two) — a region
 * patch, so the engine holds the section to its markers.
 */
export function claudeKitContribution(family: ClaudeKitFamily): Contribution {
  return {
    skills: [family.runSkill],
    hooks: [preCommitHookSpec(family)],
    ...(family.docs === undefined ? {} : { docs: layerDocSections(family.docs) }),
    patches: [
      regionPatch({
        target: AGENTS_TARGET,
        region: RUNBOOK_REGION,
        body: family.runbook,
        padding: 'blank',
      }),
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
    vertical: 'agent-harness',
    covers: [CLAUDE_KIT_DIMENSION],
    predicate: { requires },
    after: [CLAUDE_CORE_ID],
    contribute: (ctx) => claudeKitContribution(family(ctx)),
  };
}
