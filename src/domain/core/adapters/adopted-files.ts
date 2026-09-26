/**
 * The two files `keel new` adopts rather than refuses: `README.md`
 * and `.gitignore`.
 *
 * A directory is seldom empty the first time `keel new` runs in it.
 * The most common first run is a repository created on a hosting
 * service with a README, and often a `.gitignore`, then cloned and
 * scaffolded. Any other file of the user's that a run would write is
 * refused as `keel.path-conflict`, naming it. These two are adopted
 * instead: each is written as a seeded upsert (see
 * {@link import('../apply.js').applyContribution}). Its seed is the
 * file keel writes into an empty directory, and its `apply` adds
 * keel's part to what is already there, idempotently:
 *
 * - `README.md` keeps the user's content, title included, and gains
 *   keel's own README after it, less keel's title
 *   ({@link adoptReadme}). An entrypoint's section, added by its own
 *   patch at its rank (`rank.ts`), follows it as it would in a fresh
 *   project.
 * - `.gitignore` keeps the user's entries and gains each of keel's
 *   that it lacks, under keel's own comments ({@link adoptGitignore}).
 *
 * Every `apply` here is the identity on its own seed, so a project
 * scaffolded into an empty directory gets exactly the bytes it always
 * did. Every `apply` is also its own fixed point, which is what lets
 * two entrypoints of one project run the same patch one after the
 * other, and what a reapply's divergence check holds a patch to.
 *
 * Every family writes the two files through here: the Go, Rust and
 * web-components bootstraps and the product root's docs through
 * {@link adoptingRootFiles}, and the JVM and TypeScript shared roots
 * through {@link toUpsertPatches} and {@link readmeUpsert}.
 */

import type { ContributionFile } from '../../contract/files.js';
import type { ContributionPatch } from '../../contract/composition.js';
import { eolAware } from '../util.js';

/** The root files `keel new` adopts from the directory rather than refusing. */
export const ADOPTED_FILES: readonly string[] = ['README.md', '.gitignore'];

/**
 * The `README.md` adoption. An empty or blank file becomes the seed,
 * keel's whole README. Any other file keeps its content and gains
 * the seed's body (everything below the title line), after a blank
 * line, unless it has the body already. The title stays the user's,
 * since it names their repository.
 *
 * "Has the body already" means it has every one of the body's
 * section headings (its `## ` lines), each on a line of its own — the
 * distinctive-substring guard keel's README patches use, rather than
 * the body verbatim. So an edit inside keel's sections never makes a
 * second copy of them, not even under `--reapply`, and a README keel
 * wrote before under another project name counts too, since only
 * its title carries the name. A body with no headings falls back to
 * the verbatim check. The comparison runs on LF text, so a CRLF
 * README is adopted once and keeps its line endings.
 */
export function adoptReadme(seed: string): (existing: string) => string {
  const body = seed.replace(/^#[^\n]*\n+/, '');
  const headings = body.split('\n').filter((line) => line.startsWith('## '));
  const holdsBody = (text: string): boolean => {
    if (headings.length === 0) return text.includes(body.trimEnd());
    const lines = new Set(text.split('\n').map((line) => line.trimEnd()));
    return headings.every((heading) => lines.has(heading.trimEnd()));
  };
  return eolAware((existing) => {
    if (existing.trim() === '') return seed;
    if (holdsBody(existing)) return existing;
    return `${existing.trimEnd()}\n\n${body}`;
  });
}

/**
 * The `.gitignore` adoption. An empty or blank file becomes the seed.
 * Any other file keeps every line it has and gains each of the seed's
 * entries it lacks, compared line by line with surrounding whitespace
 * trimmed. Missing entries are appended in the seed's own groups
 * (runs of lines between blank lines), each with the group's comment
 * lines, and a group whose entries are all present adds nothing.
 *
 * No entry is rewritten or reinterpreted: `node_modules` in the
 * user's file and `node_modules/` in keel's are different lines, and
 * both stay. Once appended, every entry is present, so a second
 * apply returns the file unchanged.
 */
export function adoptGitignore(seed: string): (existing: string) => string {
  return eolAware((existing) => {
    if (existing.trim() === '') return seed;
    const present = new Set(existing.split('\n').map((line) => line.trim()));
    const missing = seed.split(/\n[ \t]*\n/).flatMap((group) => {
      const lines = group.split('\n').filter((line) => line.trim() !== '');
      const kept = lines.filter((line) => isComment(line) || !present.has(line.trim()));
      return kept.some((line) => !isComment(line)) ? [kept.join('\n')] : [];
    });
    if (missing.length === 0) return existing;
    return `${existing.trimEnd()}\n\n${missing.join('\n\n')}\n`;
  });
}

/**
 * The root `README.md` as a seeded upsert: {@link adoptReadme} of
 * `seed`, then `section`, the caller's own idempotent step. The JVM
 * and TypeScript entrypoints pass the adding of their `### <arch>`
 * section at its rank (`rank.ts`), and so compose onto one README from
 * one seed.
 */
export function readmeUpsert(
  seed: string,
  section: (existing: string) => string,
): ContributionPatch {
  const adopt = adoptReadme(seed);
  return { target: 'README.md', seed, apply: (existing) => section(adopt(existing)) };
}

/**
 * Converts whole-file contributions into seeded upserts. The content
 * becomes the seed, used when no adapter has written the path yet.
 * The `apply` is the adoption for the two {@link ADOPTED_FILES} at
 * the root, and the identity for anything else, since that content
 * is identical whichever entrypoint runs. This is the shared-file
 * upsert two entrypoints of one project compose through.
 */
export function toUpsertPatches(files: readonly ContributionFile[]): readonly ContributionPatch[] {
  return files.map((file) => {
    const seed = Buffer.isBuffer(file.content) ? file.content.toString('utf8') : file.content;
    return {
      target: file.path,
      seed,
      apply: adoptionOf(file.path, seed),
      ...(file.mode !== undefined ? { mode: file.mode } : {}),
    };
  });
}

/**
 * Splits a rendered tree into the files it writes whole and the
 * upserts that adopt its root `README.md` and `.gitignore`. For a
 * bootstrap that renders its whole shell from one template tree, a
 * user's file at any other path stays `keel.path-conflict`.
 */
export function adoptingRootFiles(files: readonly ContributionFile[]): {
  readonly files: readonly ContributionFile[];
  readonly patches: readonly ContributionPatch[];
} {
  const adopted = files.filter((file) => ADOPTED_FILES.includes(file.path));
  return {
    files: files.filter((file) => !ADOPTED_FILES.includes(file.path)),
    patches: toUpsertPatches(adopted),
  };
}

function adoptionOf(target: string, seed: string): (existing: string) => string {
  if (target === 'README.md') return adoptReadme(seed);
  if (target === '.gitignore') return adoptGitignore(seed);
  return (existing) => existing;
}

function isComment(line: string): boolean {
  return line.trimStart().startsWith('#');
}
