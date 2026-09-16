/**
 * The consumer for **this repository's own harness**.
 *
 * keel emits a ≤ 120-line root `AGENTS.md` whose `keel:map` region is a
 * projection over the per-directory documents, and a one-line
 * `CLAUDE.md` pointer beside each of them. Shipping that model from a
 * repository that violates it is a credibility problem, so keel
 * dogfoods it by hand — `keel` cannot scaffold itself, but the shape
 * transfers — and this suite is the `keel docs check` that hand
 * application does not get for free.
 *
 * The hazard is the one `ci-workflow.test.ts` and `version-pins.test.ts`
 * guard elsewhere: an index nobody checks rots silently. A document can
 * appear with no map row (invisible from the root, which is exactly
 * what the map exists to prevent for agents that never auto-load nested
 * files), a row can point at a document that is gone, a row's
 * description can drift from the document's own purpose line into two
 * spellings of one directory, a pointer can go missing so Claude Code
 * stops lazy-loading the document, or the root can creep back past its
 * budget one paragraph at a time.
 *
 * Structure only, never prose. Nothing here reads what a document
 * says beyond its declared purpose line.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The budget the emitted root is held to (`docs/verticals/agent-harness.md`),
 * and therefore the one keel's own root is held to.
 */
const ROOT_BUDGET_LINES = 120;

/** The one line a `CLAUDE.md` pointer may hold. */
const POINTER = '@AGENTS.md';

/**
 * Directories whose `AGENTS.md` is **content keel emits**, not a note
 * for keel's own contributors: the binding spec every scaffold
 * receives, the product-root document a composite install seeds, and
 * the fixture trees the suites build over. A document here is
 * governed by the emitted harness's own golden tests.
 */
const NOT_A_CONTRIBUTOR_NOTE = (directory: string): boolean =>
  directory === 'assets/project' ||
  directory.startsWith('assets/composition/') ||
  directory.startsWith('tests/support/fixtures') ||
  directory.startsWith('tests/plugins');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp']);

/** Every directory in the repo carrying a contributor `AGENTS.md`, project-relative. */
function documentedDirectories(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(path.join(repoRoot, dir === '' ? '.' : dir))) {
      if (SKIP_DIRS.has(entry)) continue;
      const rel = dir === '' ? entry : `${dir}/${entry}`;
      const abs = path.join(repoRoot, rel);
      if (fs.statSync(abs).isDirectory()) walk(rel);
      else if (entry === 'AGENTS.md' && dir !== '' && !NOT_A_CONTRIBUTOR_NOTE(dir)) found.push(dir);
    }
  };
  walk('');
  return found.sort();
}

const ROW_RE = /^- \[(.+?)\]\((.+?)\) — (.*)$/;
const PURPOSE_RE = /^<!-- keel:purpose: (.+) -->$/m;

interface Row {
  readonly title: string;
  readonly href: string;
  readonly description: string;
}

/** The rows of one sentinel-delimited region, in the order it holds them. */
function regionRows(text: string, region: string): readonly Row[] {
  const begin = text.indexOf(`<!-- keel:${region}:begin -->`);
  const end = text.indexOf(`<!-- keel:${region}:end -->`);
  expect(begin, `${region} region present`).toBeGreaterThanOrEqual(0);
  expect(end, `${region} region closed`).toBeGreaterThan(begin);
  const rows: Row[] = [];
  for (const line of text.slice(begin, end).split('\n')) {
    const hit = ROW_RE.exec(line.trim());
    if (hit !== null) rows.push({ title: hit[1]!, href: hit[2]!, description: hit[3]! });
  }
  return rows;
}

/** The purpose line a document declares — the row's description, verbatim. */
function purposeOf(directory: string): string {
  const text = fs.readFileSync(path.join(repoRoot, directory, 'AGENTS.md'), 'utf8');
  const hit = PURPOSE_RE.exec(text);
  expect(hit, `${directory}/AGENTS.md declares a keel:purpose line`).not.toBeNull();
  return hit![1]!;
}

/** The documented directory `directory` sits under, nearest first, or `null`. */
function nearestParent(directory: string, all: readonly string[]): string | null {
  let nearest: string | null = null;
  for (const other of all) {
    if (other === directory || !directory.startsWith(`${other}/`)) continue;
    if (nearest === null || other.length > nearest.length) nearest = other;
  }
  return nearest;
}

const directories = documentedDirectories();
const root = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');

describe('the root document', () => {
  it(`stays within the ${ROOT_BUDGET_LINES}-line budget keel emits`, () => {
    expect(root.trimEnd().split('\n').length).toBeLessThanOrEqual(ROOT_BUDGET_LINES);
  });

  it('carries no per-directory depth of its own beyond the map', () => {
    // Every heading is one of the five the model allows at the root.
    const headings = [...root.matchAll(/^## (.+)$/gm)].map((hit) => hit[1]!);
    expect(headings).toEqual(['Binding spec', 'Dev commands', 'Working agreements']);
  });
});

describe('the pointer beside every document', () => {
  it.each(['', ...directories])('%s CLAUDE.md is the one-line import', (directory) => {
    const pointer = path.join(repoRoot, directory, 'CLAUDE.md');
    expect(fs.existsSync(pointer), `${directory || '.'}/CLAUDE.md exists`).toBe(true);
    expect(fs.readFileSync(pointer, 'utf8').trim()).toBe(POINTER);
  });
});

describe('the root map', () => {
  const rows = regionRows(root, 'map');

  it('holds one row per top-of-chain document, and only those', () => {
    const topOfChain = directories.filter((dir) => nearestParent(dir, directories) === null);
    expect(rows.map((row) => row.href)).toEqual(topOfChain.map((dir) => `${dir}/AGENTS.md`));
  });

  it('is sorted by href, the one order every index writes', () => {
    const hrefs = rows.map((row) => row.href);
    expect(hrefs).toEqual([...hrefs].sort((a, b) => a.localeCompare(b)));
  });

  it('titles each row with the directory it points at', () => {
    for (const row of rows) expect(row.title).toBe(`\`${path.dirname(row.href)}/\``);
  });

  it("carries each document's own purpose line, verbatim", () => {
    for (const row of rows) expect(row.description).toBe(purposeOf(path.dirname(row.href)));
  });
});

describe('a nested document', () => {
  const nested = directories.filter((dir) => nearestParent(dir, directories) !== null);

  it('is reached from its parent, not from the root', () => {
    expect(nested).toEqual(['tests/e2e']);
  });

  it.each(nested)('%s has a child row in its parent, with a resolving href', (directory) => {
    const parent = nearestParent(directory, directories)!;
    const rows = regionRows(
      fs.readFileSync(path.join(repoRoot, parent, 'AGENTS.md'), 'utf8'),
      'children',
    );
    const row = rows.find((candidate) => candidate.title === `\`${directory}/\``);
    expect(row, `${parent}/AGENTS.md indexes ${directory}/`).toBeDefined();
    expect(row!.description).toBe(purposeOf(directory));
    // Relative to the document that holds it, as markdown resolves links.
    expect(fs.existsSync(path.join(repoRoot, parent, row!.href))).toBe(true);
  });
});

describe('every link a document offers', () => {
  it.each(directories)('%s resolves relative to itself', (directory) => {
    const text = fs.readFileSync(path.join(repoRoot, directory, 'AGENTS.md'), 'utf8');
    for (const [, target] of text.matchAll(/\]\((?!https?:)([^)#]+)\)/g)) {
      expect(
        fs.existsSync(path.join(repoRoot, directory, target!)),
        `${directory}/AGENTS.md → ${target}`,
      ).toBe(true);
    }
  });

  it('resolves from the root document too', () => {
    for (const [, target] of root.matchAll(/\]\((?!https?:)([^)#]+)\)/g)) {
      expect(fs.existsSync(path.join(repoRoot, target!)), `AGENTS.md → ${target}`).toBe(true);
    }
  });
});

describe('the published tarball', () => {
  it("excludes keel's own contributor notes under assets/", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(pkg['files']).toContain('!assets/AGENTS.md');
    expect(pkg['files']).toContain('!assets/CLAUDE.md');
  });
});
