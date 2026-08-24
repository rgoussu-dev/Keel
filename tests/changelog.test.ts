/**
 * The consumer for the split changelog.
 *
 * The root `CHANGELOG.md` deliberately deviates from Keep a Changelog
 * 1.1.0: released sections live one file per release under
 * `docs/releases/`, and the root keeps `[Unreleased]` plus a
 * newest-first `## Releases` index. The hazard is the one
 * `ci-workflow.test.ts` and `version-pins.test.ts` guard one level up:
 * an index nobody checks rots silently. A release file can appear with
 * no index row (invisible from the front page), an index row can point
 * at a file that does not exist (a dead link where the notes should
 * be), or a released section can creep back into the root — and
 * nothing goes red.
 *
 * So the shape gets a test, and it runs in `verify` — offline, no
 * upstream queries. It checks structure only, never content: the
 * released sections moved verbatim, historical `###` names included,
 * so nothing here validates category names against Keep a Changelog's
 * six.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
const releasesDir = path.join(repoRoot, 'docs', 'releases');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Everything between `CHANGELOG.` and `.md` is the version. */
const filenameVersion = /^CHANGELOG\.(.+)\.md$/;

const releaseFiles = fs
  .readdirSync(releasesDir)
  .filter((entry) => filenameVersion.test(entry))
  .sort();

interface IndexRow {
  version: string;
  file: string;
  date: string;
}

const indexRows = (): IndexRow[] =>
  [
    ...root.matchAll(
      /^- \[([^\]]+)\]\(docs\/releases\/(CHANGELOG\.[^)]+\.md)\) — (\d{4}-\d{2}-\d{2})/gm,
    ),
  ].map((match) => ({ version: match[1] ?? '', file: match[2] ?? '', date: match[3] ?? '' }));

describe('the root CHANGELOG.md', () => {
  it('holds exactly [Unreleased] and the Releases index', () => {
    const headings = [...root.matchAll(/^## .*$/gm)].map((match) => match[0]);

    expect(headings).toEqual(['## [Unreleased]', '## Releases']);
  });

  it('carries a single link ref: [Unreleased], compared against the latest tag', () => {
    const refs = [...root.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)];

    expect(refs.map((match) => match[1])).toEqual(['Unreleased']);
    expect(refs[0]?.[2]).toMatch(/^https:\/\/github\.com\/.+\/compare\/v.+\.\.\.HEAD$/);
  });

  it('indexes the releases newest first', () => {
    const dates = indexRows().map((row) => row.date);

    expect(dates.length).toBeGreaterThan(0);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe('docs/releases/', () => {
  // The anti-vacuity floor: a renamed directory must fail loudly here
  // rather than turn every per-file assertion below green over an
  // empty set. Six is the migrated history — the floor only rises.
  it('holds at least the six migrated releases', () => {
    expect(releaseFiles.length).toBeGreaterThanOrEqual(6);
  });

  it('is a bijection with the index rows', () => {
    const indexed = indexRows()
      .map((row) => row.file)
      .sort();

    expect(indexed).toEqual(releaseFiles);
  });

  it('names each index row by the version its file carries', () => {
    for (const row of indexRows()) {
      expect(row.file, `index row ${row.version}`).toBe(`CHANGELOG.${row.version}.md`);
    }
  });

  it('opens every file with the version heading matching its filename', () => {
    for (const file of releaseFiles) {
      const version = filenameVersion.exec(file)?.[1] ?? '';
      const firstLine = fs.readFileSync(path.join(releasesDir, file), 'utf8').split('\n', 1)[0];

      // U+2014 em dash, per the release-heading convention.
      expect(firstLine, file).toMatch(
        new RegExp(`^## \\[${escapeRegExp(version)}\\] — \\d{4}-\\d{2}-\\d{2}$`),
      );
    }
  });

  it('gives every file its own link ref', () => {
    for (const file of releaseFiles) {
      const version = filenameVersion.exec(file)?.[1] ?? '';
      const content = fs.readFileSync(path.join(releasesDir, file), 'utf8');

      expect(content, file).toMatch(
        new RegExp(`^\\[${escapeRegExp(version)}\\]: https://\\S+$`, 'm'),
      );
    }
  });
});
