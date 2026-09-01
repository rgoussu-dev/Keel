/**
 * The **skill contract** — how a composition adapter ships a Claude
 * Code skill with the files it contributes.
 *
 * A {@link SkillSpec} is **content-carrying**: it holds the skill's
 * body as a string (a literal, or something read through
 * `ctx.templates`), never a path for the engine to resolve later. The
 * applier renders each spec with {@link renderSkill} and stages it to
 * `.claude/skills/<name>/SKILL.md` as an **adapter-owned whole file**:
 * one adapter owns each skill name, a second claim on the same name
 * across the resolved set is a hard refusal naming both origins, and
 * `--reapply` rewrites the file pristine. Each staged file gets a
 * provenance record in the manifest's `entries`, keyed by the owning
 * adapter's id.
 *
 * The zod schema exists because a spec can arrive from a plugin's
 * `contribute()`, where TypeScript checked nothing: the applier
 * parses every spec before staging and refuses a malformed one
 * naming the adapter that contributed it.
 */

import { z } from 'zod';

/** Where staged skills live, under the project scope root. */
export const SKILLS_ROOT = '.claude/skills';

/** The per-skill entry file Claude Code discovers. */
export const SKILL_FILENAME = 'SKILL.md';

/** The staged path of a skill's entry file: `.claude/skills/<name>/SKILL.md`. */
export function skillTarget(name: string): string {
  return `${SKILLS_ROOT}/${name}/${SKILL_FILENAME}`;
}

/** The staged path of a supporting file, inside the skill's own directory. */
export function skillSupportingTarget(name: string, filePath: string): string {
  return `${SKILLS_ROOT}/${name}/${filePath}`;
}

/**
 * A file staged beside `SKILL.md`, inside the skill's own directory —
 * a reference document, a script the skill's steps invoke. `path` is
 * relative to the skill directory.
 */
export interface SkillSupportingFile {
  readonly path: string;
  readonly content: string;
}

/**
 * One skill an adapter contributes. Serialized by {@link renderSkill}
 * and staged by the applier — an adapter never spells the frontmatter
 * or the `.claude/skills/` path itself, which is what keeps the
 * emitted skills of every contributor from drifting apart.
 */
export interface SkillSpec {
  /**
   * The skill's name — its directory under `.claude/skills/`, and the
   * `/name` a user types. Lowercase letters, digits and dashes,
   * starting with a letter. Adapter-owned: exactly one adapter of the
   * resolved set may contribute each name, and the name must appear
   * in the owning vertical's {@link Vertical.skills} declaration.
   */
  readonly name: string;
  /**
   * The trigger line — what the skill does and when to use it, in at
   * most two sentences. **Description matching is what activates a
   * skill**, so write it as the trigger; it is also what a skills
   * index would project as the skill's one-line row.
   */
  readonly description: string;
  /**
   * Whether the skill is meant to be invoked by the user (as
   * `/name`) rather than picked up by the model from its
   * description. Omit for the default posture; when set, it is
   * spelled into the frontmatter as `user-invocable`.
   */
  readonly userInvocable?: boolean | undefined;
  /** Markdown body of the skill — the process, after the frontmatter. */
  readonly body: string;
  /** Files staged beside `SKILL.md`, inside the skill's directory. */
  readonly supporting?: readonly SkillSupportingFile[] | undefined;
}

const SKILL_NAME_RE = /^[a-z][a-z0-9-]*$/;

/**
 * A supporting path stays inside the skill's own directory: relative,
 * forward slashes, no `..`, and not the entry file the spec itself
 * renders.
 */
const SupportingPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.includes('\\'), {
    message: 'must be a relative, forward-slash path',
  })
  .refine((p) => p.split('/').every((seg) => seg !== '..' && seg !== '' && seg !== '.'), {
    message: 'must not contain empty, "." or ".." segments',
  })
  .refine((p) => p !== SKILL_FILENAME, {
    message: `must not be ${SKILL_FILENAME} — the spec's own body renders it`,
  });

/** Schema for a {@link SkillSupportingFile}. */
export const SkillSupportingFileSchema = z.object({
  path: SupportingPathSchema,
  content: z.string(),
});

/** Schema governing a contributed {@link SkillSpec}. */
export const SkillSpecSchema = z.object({
  name: z
    .string()
    .regex(SKILL_NAME_RE, 'lowercase letters, digits and dashes, starting with a letter'),
  description: z.string().min(1),
  userInvocable: z.boolean().optional(),
  body: z.string().min(1),
  supporting: z
    .array(SkillSupportingFileSchema)
    .optional()
    .refine(
      (files) => files === undefined || new Set(files.map((f) => f.path)).size === files.length,
      {
        message: 'supporting paths must be unique',
      },
    ),
});

/**
 * Serializes a spec into the `SKILL.md` the applier stages — one
 * serializer for every contributor, so the emitted skills of five
 * stack families (and any plugin's) cannot drift apart, the way
 * `renderRunbook` holds the runbook sections together.
 *
 * The frontmatter carries `name` and `description` (and
 * `user-invocable` only when the spec sets it) — **never `paths:`**:
 * upstream Claude Code discovery mismatches path-scoped skills, so
 * the description is the whole trigger.
 */
export function renderSkill(spec: SkillSpec): string {
  return [
    '---',
    `name: ${spec.name}`,
    `description: ${spec.description}`,
    ...(spec.userInvocable === undefined ? [] : [`user-invocable: ${String(spec.userInvocable)}`]),
    '---',
    '',
    spec.body.trim(),
    '',
  ].join('\n');
}
