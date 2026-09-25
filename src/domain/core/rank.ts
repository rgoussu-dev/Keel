/**
 * Rank-anchored insertion: where an entry keel adds to a file that more
 * than one adapter writes goes (`docs/roadmap.md` → R.1).
 *
 * Every writer of such a file used to append, so a scaffold's order was
 * the order its adapters ran in, and an entry arriving in a later run —
 * a `keel add`, or a `--reapply` restoring it — landed after everything
 * installed since. One rule, for every kind of file:
 *
 * - an entry goes immediately before the first existing entry whose
 *   rank is strictly higher than its own;
 * - when there is no such entry, it is appended exactly as before;
 * - equal ranks keep their arrival order;
 * - an existing entry's rank is read from its content, never from a
 *   marker keel would have to write.
 *
 * The ranks reproduce the order one run of keel's presets already
 * writes, so no scaffold of theirs moves a byte
 * (`tests/domain/core/shared-files.golden.test.ts` holds that on every
 * single-service preset); only a later arrival lands elsewhere, and a
 * plugin preset's README takes keel's order. A caller keeps its own marker guard in front of the rule,
 * so each patch stays its own fixed point. The rule works on LF text
 * and restores the file's line endings, as `util.ts`'s `eolAware` does.
 */

import type { Tag } from '../contract/tags.js';
import { eolAware } from './util.js';

/**
 * The rule, over the ranks of the entries a file already has, in file
 * order — `undefined` where a line is no ranked entry: the index an
 * entry of `rank` goes immediately before, the first strictly higher,
 * or -1 when none is and the entry is appended. An equal rank is passed
 * over, so equal ranks keep their arrival order.
 */
export function rankedIndex(ranks: readonly (number | undefined)[], rank: number): number {
  return ranks.findIndex((other) => other !== undefined && other > rank);
}

/**
 * The rank of the README section keel writes under the `### ` heading
 * `heading`, or `undefined` for a heading keel does not write. The
 * entrypoints come first, in the order `ENTRYPOINTS` lists them, then
 * what runs beside them, then persistence, then the toolchain.
 *
 * `Monitoring stack` and `Observability` share a rank, so the family's
 * own order between them stands. `Dev container` is the one rank the
 * tags decide: on a project carrying `arch.server-http` every preset
 * lists `dev-env` before `dev-container`, so it follows the dev
 * environment and the monitoring sections; anywhere else a dev
 * environment is an extra, installed after the dev container, so it
 * precedes them.
 */
export function readmeSectionRank(heading: string, tags: readonly Tag[]): number | undefined {
  switch (heading) {
    case 'cli':
      return 10;
    case 'rest':
    case 'http':
      return 20;
    case 'Dev environment':
      return 30;
    case 'Monitoring stack':
    case 'Observability':
      return 35;
    case 'Dev container':
      return tags.includes('arch.server-http') ? 40 : 25;
    case 'Database':
    case 'Persistence':
      return 50;
    case 'Toolchain':
      return 60;
    default:
      return undefined;
  }
}

/**
 * Adds `section` to a README at its rank ({@link readmeSectionRank}).
 * `section` is LF-authored and opens with its `\n### <heading>\n`
 * marker, the one its caller's guard looks for, and is added after one
 * blank line, as an append always added it.
 *
 * Only the `### ` headings after the file's last `## ` line rank, and
 * none inside a fenced block or an HTML comment: keel's own sections
 * follow its README's last `## ` section, so a heading of the user's
 * above that — in a README `keel new` adopted, one named `### Toolchain`
 * among them — never anchors one of keel's, and a README with no `## `
 * line, or one whose last `## ` section is the user's own below keel's,
 * ranks nothing. A section the user commented out anchors nothing
 * either. With nothing ranked above it, the section is appended.
 */
export function placeReadmeSection(
  existing: string,
  section: string,
  tags: readonly Tag[],
): string {
  return eolAware((text) => {
    const rank = readmeSectionRank(headingOf(section), tags);
    const lines = text.split('\n');
    const at = rank === undefined ? -1 : rankedIndex(sectionRanks(lines, tags), rank);
    if (at === -1) return `${text.trimEnd()}\n${section}`;
    const before = lines.slice(0, at).join('\n');
    const after = lines.slice(at).join('\n');
    return `${before.trimEnd()}\n${section.trimEnd()}\n\n${after}`;
  })(existing);
}

function headingOf(section: string): string {
  const [first = ''] = section.replace(/^\n+/, '').split('\n');
  return first.startsWith('### ') ? first.slice(4).trimEnd() : '';
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const COMMENT = /^ {0,3}<!--/;

/**
 * Each line's rank as a README section's heading: a `### ` line after
 * the last `## ` line, outside every fenced block and HTML comment.
 */
function sectionRanks(lines: readonly string[], tags: readonly Tag[]): (number | undefined)[] {
  let fence: string | undefined;
  let comment = false;
  let scope = lines.length;
  const headings = lines.map((line, index) => {
    const opener = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (opener !== undefined && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = undefined;
      }
      return undefined;
    }
    if (comment || COMMENT.test(line)) {
      comment = !line.includes('-->');
      return undefined;
    }
    if (opener !== undefined) {
      fence = opener;
      return undefined;
    }
    if (line.startsWith('## ')) scope = index;
    return line.startsWith('### ') ? line.slice(4).trimEnd() : undefined;
  });
  return headings.map((heading, index) =>
    heading === undefined || index < scope ? undefined : readmeSectionRank(heading, tags),
  );
}
