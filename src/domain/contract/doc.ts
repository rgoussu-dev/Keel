/**
 * The **per-directory doc contract** — how a composition adapter puts
 * the context an agent needs *where it binds*: a short `AGENTS.md`
 * inside the directory it is about, with a one-line `CLAUDE.md`
 * pointer beside it.
 *
 * A {@link DocSection} is content-carrying and composable. Several
 * contributors may write one directory's doc — the family kit seeds
 * `domain/` with this project's layout and stance, `persistence`
 * later adds its Testcontainers note to the tests doc — so each owns
 * one **region** of it, landed through the owned-region seam against
 * the same {@link docSeed}: whichever contributor runs first creates
 * the file, the others compose onto it, and none may touch another's
 * section. The engine stages each section as a region patch, writes
 * the pointer, and projects one row per doc into the root
 * `keel:map` slot, so an agent that never auto-loads nested files
 * still reaches every one of them from the root.
 *
 * Why two files: nested `AGENTS.md` is what most agents read (Copilot,
 * Cursor, Amp, Devin); Claude Code lazy-loads only a nested
 * `CLAUDE.md`, and resolves its `@AGENTS.md` import relative to the
 * importing file — so the pointer pulls its sibling in exactly when
 * files in that directory are touched.
 *
 * **Noise cancellation.** A section carries what an agent cannot
 * derive from the tree — the real commands, the wiring file's path,
 * the silent failure the layer is known for — or it is not emitted.
 */

import { z } from 'zod';
import { markdownRegion, type Region } from './region.js';

/** The doc file every agent reads in a directory. */
export const DOC_FILENAME = 'AGENTS.md';

/** The Claude Code loading shim beside it. */
export const DOC_POINTER_FILENAME = 'CLAUDE.md';

/** The pointer's whole content: an import of its sibling. */
export const DOC_POINTER = '@AGENTS.md\n';

/** One contributor's section of one directory's doc. */
export interface DocSection {
  /**
   * The directory the doc lives in, relative to the project root —
   * forward slashes, no `.`/`..` segments, never the root itself
   * (the root document is `claude-core`'s).
   */
  readonly directory: string;
  /**
   * The section's identity within the doc — its region,
   * `<!-- keel:<section>:begin -->`. Lowercase letters, digits and
   * dashes. One contributor of a run owns each section of each doc.
   */
  readonly section: string;
  /**
   * What the section tells an agent about the directory, in one line
   * — the row the root `keel:map` projects for the doc.
   */
  readonly description: string;
  /** The section's Markdown, without its markers. */
  readonly body: string;
  /**
   * What keel-known structure lives directly beneath the directory,
   * for the engine's index to project rows for. `modules` marks the
   * directory the project's bounded contexts sit in — the one fact
   * about a modulith layout the engine cannot derive, and a
   * declaration rather than five hand-written path prefixes in the
   * projection. Absent for a directory holding nothing keel names.
   */
  readonly indexes?: 'modules' | undefined;
}

const SECTION_RE = /^[a-z][a-z0-9-]*$/;

/** A project-relative directory: forward slashes, no empty, `.` or `..` segments, not the root. */
const DirectorySchema = z
  .string()
  .min(1)
  .refine((d) => !d.startsWith('/') && !d.includes('\\'), {
    message: 'must be a relative, forward-slash path',
  })
  .refine((d) => d.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..'), {
    message: 'must not contain empty, "." or ".." segments, nor be the project root',
  });

/** Schema governing a contributed {@link DocSection}. */
export const DocSectionSchema = z.object({
  directory: DirectorySchema,
  section: z
    .string()
    .regex(SECTION_RE, 'lowercase letters, digits and dashes, starting with a letter'),
  description: z
    .string()
    .min(1)
    .refine((d) => !/[\r\n]/.test(d), { message: 'must be a single line' }),
  body: z.string().min(1),
  indexes: z.literal('modules').optional(),
});

/** The doc's path: `<directory>/AGENTS.md`. */
export function docTarget(directory: string): string {
  return `${directory}/${DOC_FILENAME}`;
}

/** The pointer's path: `<directory>/CLAUDE.md`. */
export function docPointerTarget(directory: string): string {
  return `${directory}/${DOC_POINTER_FILENAME}`;
}

/** The region a section owns in its doc. */
export function docRegion(section: string): Region {
  return markdownRegion(section);
}

/**
 * The content a directory's doc starts from — a function of the
 * directory alone, so every contributor supplies the same seed and
 * the sections compose in any order. Plugins seeding a doc of their
 * own use it too.
 */
export function docSeed(directory: string): string {
  return `# \`${directory}/\`\n\nNotes for agents working in this directory. keel maintains the marked sections; notes outside them are the project's.\n`;
}
