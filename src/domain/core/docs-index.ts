/**
 * The **navigation index** — the rows keel projects into the agent
 * documents of a project it knows, and the drift between those rows
 * and what the project actually holds.
 *
 * Truth lives in what keel already owns, never in a walk of the file
 * tree: the manifest (which bounded contexts exist) plus the resolved
 * registry (which directories a contributor documents, which skills
 * it stages). This module turns that into rows; `apply.ts` writes
 * them into the engine-owned regions, and `keel docs sync|check`
 * (`handlers/docs-sync.ts`, `handlers/docs-check.ts`) drives the same
 * computation from a full replay.
 *
 * Three regions carry the index, all engine-owned:
 *
 *   - `keel:map` in the root `AGENTS.md` — one row per documented
 *     directory at the top of its chain, plus one row per bounded
 *     context, so an agent that never auto-loads a nested document
 *     still reaches every one of them from the root;
 *   - `keel:skills-index` in the root `AGENTS.md` — one row per
 *     staged skill, its description **verbatim** as the skill's own
 *     frontmatter carries it, so the two can never drift into two
 *     different triggers;
 *   - `keel:children` in a nested `AGENTS.md` — the documents
 *     immediately beneath it. Emitted only where there are any: an
 *     empty index is noise, and every family's documents are
 *     top-of-chain today.
 *
 * **Scope is deliberate.** Indexed is what has architectural identity
 * and a name keel or an architectural action creates: directories
 * with a document, bounded contexts, skills. The long tail — function
 * bodies, call sites, literals — is not indexed and never will be:
 * it has no stable identity, it churns every commit, and a shipped
 * index of it would lie within days. Grep is the right tool there.
 */

import { docTarget, type DocSection } from '../contract/doc.js';
import { skillTarget } from '../contract/skill.js';
import { markdownRegion, locateRegion, type Region } from '../contract/region.js';
import type { InstalledModule } from '../contract/manifest.js';
import type { Tree } from '../contract/ports/tree.js';

/** The root document every index region but `keel:children` lives in. */
export const ROOT_DOC = 'AGENTS.md';

/** The root slot holding the directory + bounded-context rows. */
export const MAP_REGION: Region = markdownRegion('map');

/** The root slot holding one row per staged skill. */
export const SKILLS_INDEX_REGION: Region = markdownRegion('skills-index');

/** The nested-document slot holding the documents immediately beneath it. */
export const CHILDREN_REGION: Region = markdownRegion('children');

/** The line that opens the map. */
export const MAP_HEADING =
  '**Map** — every directory with notes of its own; read the one for the directory you work in.';

/** The line that opens the skills index. */
export const SKILLS_HEADING =
  '**Skills** — procedures this project ships; each activates on its own description.';

/** The line that opens a nested document's child index. */
export const CHILDREN_HEADING = '**Inside** — the directories below with notes of their own.';

/**
 * One row of an index. `href` is the row's identity: it is what the
 * row points at, so it is what a merge keys on, what the sort orders
 * by, and what a drift check resolves against the project.
 */
export interface IndexRow {
  /** Link text — a path in backticks, or a skill's `/name`. */
  readonly title: string;
  /** Project-relative target: a file, or a directory with a trailing slash. */
  readonly href: string;
  /** The row's one line, after the em dash. */
  readonly description: string;
  /**
   * Set on a row several contributors may describe — a directory's,
   * where the first section to name it is the row and a later one
   * only adds a section to the document. A run that realized only
   * that later section must not overwrite what the first wrote, so a
   * merge keeps the row it finds. Rows with a single source (a
   * skill's, a bounded context's) carry no flag and are always
   * recomputed.
   */
  readonly composed?: boolean;
}

/** One directory the index knows, as a contributor declared it. */
export interface IndexedDoc {
  /** Project-relative, forward slashes, never the root. */
  readonly directory: string;
  /** The row's description — the section's own, first one wins. */
  readonly description: string;
  /** Set when the project's bounded contexts live directly beneath it. */
  readonly indexes?: DocSection['indexes'];
}

/** One skill the index knows, with the description its frontmatter carries. */
export interface IndexedSkill {
  readonly name: string;
  readonly description: string;
}

/** Everything the projection reads. Pure data — no port, no tree walk. */
export interface DocsIndexInput {
  readonly docs: readonly IndexedDoc[];
  readonly skills: readonly IndexedSkill[];
  readonly modules: readonly Pick<InstalledModule, 'name' | 'seam'>[];
}

/** One region of one document, and the rows the projection computed for it. */
export interface DocsIndexRegion {
  /** Project-relative path of the document carrying the region. */
  readonly target: string;
  readonly region: Region;
  readonly rows: readonly IndexRow[];
  /** The line the body opens with, above the rows. */
  readonly heading: string;
  /**
   * What to do with a document that carries no such pair. The root
   * slots are `keep`: the binding spec ships them, so their absence
   * is a document the projection must not rewrite — it is reported as
   * drift instead. A child index is `append`, because the document is
   * one keel seeded itself and the pair only ever appears where there
   * is something to list.
   */
  readonly whenAbsent: 'keep' | 'append';
}

/** Renders one row in the index's grammar: `- [Title](href) — description`. */
export function renderRow(row: IndexRow): string {
  return `- [${row.title}](${row.href}) — ${row.description}`;
}

const ROW_RE = /^- \[(.+?)\]\((.+?)\) — (.*)$/;

/**
 * The rows a region's body holds, in the order it holds them. A line
 * that is not a row — the heading, a note someone left inside the
 * markers — is not a row and does not survive a recompute; that is
 * what makes the region keel's and the prose around it the
 * project's.
 */
export function parseRows(body: string): readonly IndexRow[] {
  const rows: IndexRow[] = [];
  for (const line of body.split(/\r?\n/)) {
    const hit = ROW_RE.exec(line.trim());
    if (hit !== null) rows.push({ title: hit[1]!, href: hit[2]!, description: hit[3]! });
  }
  return rows;
}

/** A region's body: the heading, a blank line, then the rows in `href` order. */
export function renderIndexBody(heading: string, rows: readonly IndexRow[]): string {
  if (rows.length === 0) return '';
  return [heading, '', ...sortRows(rows).map(renderRow)].join('\n');
}

/** Rows in the one order every index writes and reports them in: by `href`. */
export function sortRows(rows: readonly IndexRow[]): readonly IndexRow[] {
  return [...rows].sort((a, b) => a.href.localeCompare(b.href));
}

/**
 * Rows the run knows, laid over the rows the region already holds:
 * a computed row replaces the one at its `href`, a row the run knows
 * nothing about survives. What an install does, because an install
 * realizes only its own contributors' declarations — `keel add
 * persistence` must not drop the family kit's rows. `keel docs sync`
 * replaces the set outright instead, which is what prunes a row whose
 * subject is gone.
 */
export function mergeRows(
  existing: readonly IndexRow[],
  computed: readonly IndexRow[],
): readonly IndexRow[] {
  const byHref = new Map(existing.map((row) => [row.href, row]));
  for (const row of computed) {
    if (row.composed === true && byHref.has(row.href)) continue;
    byHref.set(row.href, row);
  }
  return sortRows([...byHref.values()]);
}

/**
 * The regions the projection would write for one project, in write
 * order: the root map, the root skills index, then one child index
 * per document that has documents beneath it.
 */
export function computeDocsIndex(input: DocsIndexInput): readonly DocsIndexRegion[] {
  const docs = dedupeDocs(input.docs);
  const directories = docs.map((doc) => doc.directory);
  const regions: DocsIndexRegion[] = [
    {
      target: ROOT_DOC,
      region: MAP_REGION,
      heading: MAP_HEADING,
      whenAbsent: 'keep',
      rows: sortRows([
        ...docs.filter((doc) => nearestParent(doc.directory, directories) === null).map(docRow),
        ...moduleRows(docs, input.modules),
      ]),
    },
    {
      target: ROOT_DOC,
      region: SKILLS_INDEX_REGION,
      heading: SKILLS_HEADING,
      whenAbsent: 'keep',
      rows: sortRows(input.skills.map(skillRow)),
    },
  ];
  for (const doc of docs) {
    const children = docs.filter(
      (other) => nearestParent(other.directory, directories) === doc.directory,
    );
    if (children.length === 0) continue;
    regions.push({
      target: docTarget(doc.directory),
      region: CHILDREN_REGION,
      heading: CHILDREN_HEADING,
      whenAbsent: 'append',
      rows: sortRows(children.map(docRow)),
    });
  }
  return regions;
}

/**
 * One row per directory: several contributors may compose one
 * document, and the first section that describes the directory names
 * it — the same rule the interim projection used, so an existing map
 * does not churn when a second section arrives.
 */
function dedupeDocs(docs: readonly IndexedDoc[]): readonly IndexedDoc[] {
  const byDirectory = new Map<string, IndexedDoc>();
  for (const doc of docs) {
    const prior = byDirectory.get(doc.directory);
    if (prior === undefined) byDirectory.set(doc.directory, doc);
    else if (prior.indexes === undefined && doc.indexes !== undefined) {
      byDirectory.set(doc.directory, { ...prior, indexes: doc.indexes });
    }
  }
  return [...byDirectory.values()];
}

function docRow(doc: IndexedDoc): IndexRow {
  return {
    title: `\`${doc.directory}/\``,
    href: docTarget(doc.directory),
    description: doc.description,
    composed: true,
  };
}

function skillRow(skill: IndexedSkill): IndexRow {
  return {
    title: `\`/${skill.name}\``,
    href: skillTarget(skill.name),
    description: skill.description,
  };
}

/**
 * One row per bounded context, beneath the directory whose document
 * declares that it holds them. The directory is a *declaration*
 * (`DocSection.indexes`), not a per-family branch here: the family
 * kit owns the layout, and five hand-written path prefixes in the
 * engine is how the map and the tree come to disagree.
 */
function moduleRows(
  docs: readonly IndexedDoc[],
  modules: readonly Pick<InstalledModule, 'name' | 'seam'>[],
): readonly IndexRow[] {
  const root = docs.find((doc) => doc.indexes === 'modules');
  if (root === undefined) return [];
  return modules.map((module) => ({
    title: `\`${root.directory}/${module.name}/\``,
    href: `${root.directory}/${module.name}/`,
    description: module.seam
      ? 'bounded context; peers reach it only through its `user-side/service` seam'
      : 'bounded context; a pure consumer, publishing no seam of its own',
  }));
}

/**
 * The documented directory a path sits under, nearest first, or
 * `null` when none does — which is what makes a directory a root-map
 * row rather than a child row. A directory is never its own parent.
 */
function nearestParent(directory: string, all: readonly string[]): string | null {
  let nearest: string | null = null;
  for (const other of all) {
    if (other === directory || !directory.startsWith(`${other}/`)) continue;
    if (nearest === null || other.length > nearest.length) nearest = other;
  }
  return nearest;
}

/** One way the project and its index disagree. */
export interface IndexDrift {
  /** The document the drift is about. */
  readonly target: string;
  /** The region's opening marker, or `null` for drift about the document itself. */
  readonly region: string | null;
  /** What is wrong, in one line, in the imperative the fix takes. */
  readonly detail: string;
}

/**
 * Everything `keel docs check` reports: the regions that do not hold
 * what the declarations compute, and the rows pointing at something
 * the project does not have. Writes nothing, reads only the tree.
 *
 * Row-level rather than a body comparison, because "the region
 * differs" is not a diagnosis: a mutated description, a row for a
 * directory that was deleted and a hand-edited region are three
 * different fixes, and the first two are the ones a reader can act
 * on without a diff.
 */
export function docsIndexDrift(
  regions: readonly DocsIndexRegion[],
  tree: Tree,
): readonly IndexDrift[] {
  const drift: IndexDrift[] = [];
  for (const region of regions) {
    const current = tree.read(region.target);
    if (current === null) {
      drift.push({
        target: region.target,
        region: null,
        detail: `the document is missing — run 'keel docs sync' after restoring it`,
      });
      continue;
    }
    const text = current.toString('utf8');
    const span = locateRegion(text, region.region, region.target);
    if (span === null) {
      // A pair the projection would land itself is not drift: the
      // next sync writes it. Only a slot it may not create is.
      if (region.rows.length === 0 || region.whenAbsent === 'append') continue;
      drift.push({
        target: region.target,
        region: region.region.begin,
        detail: `the region is missing — restore the '${region.region.begin}' / '${region.region.end}' pair`,
      });
      continue;
    }
    const body = text.slice(
      span.begin + region.region.begin.length,
      span.end - region.region.end.length,
    );
    drift.push(...rowDrift(region, parseRows(body), body));
    for (const row of parseRows(body)) {
      if (resolves(tree, row.href)) continue;
      drift.push({
        target: region.target,
        region: region.region.begin,
        detail: `row '${row.title}' points at '${row.href}', which this project does not have`,
      });
    }
  }
  return drift;
}

/** The three ways a region's rows differ from the computed ones. */
function rowDrift(
  region: DocsIndexRegion,
  present: readonly IndexRow[],
  body: string,
): readonly IndexDrift[] {
  const drift: IndexDrift[] = [];
  const byHref = new Map(present.map((row) => [row.href, row]));
  const where = { target: region.target, region: region.region.begin };
  for (const row of region.rows) {
    const found = byHref.get(row.href);
    if (found === undefined) {
      drift.push({ ...where, detail: `missing row for '${row.href}'` });
      continue;
    }
    if (found.description !== row.description) {
      drift.push({
        ...where,
        detail: `row '${row.href}' reads '${found.description}' where the declaration says '${row.description}'`,
      });
    }
    if (found.title !== row.title) {
      drift.push({
        ...where,
        detail: `row '${row.href}' is titled '${found.title}' where the declaration says '${row.title}'`,
      });
    }
  }
  if (drift.length === 0 && body.trim() !== renderIndexBody(region.heading, region.rows).trim()) {
    drift.push({
      ...where,
      detail: 'the region was hand-edited — its content is the projection’s, not the project’s',
    });
  }
  return drift;
}

/** Whether a row's target is really there: a file, or a directory with something in it. */
function resolves(tree: Tree, href: string): boolean {
  if (!href.endsWith('/')) return tree.exists(href);
  return tree.list(href.slice(0, -1)).length > 0;
}
