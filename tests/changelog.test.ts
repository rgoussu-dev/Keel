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
 *
 * The rules themselves live in `tests/support/changelog-shape.ts`,
 * because `vcs/changelog` (#143) emits this same convention outward
 * and "the emitted shape matches keel's own" is a fact only if one
 * definition decides both.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { changelogShapeViolations } from './support/changelog-shape.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
const releasesDir = path.join(repoRoot, 'docs', 'releases');

/** Everything between `CHANGELOG.` and `.md` is the version. */
const filenameVersion = /^CHANGELOG\.(.+)\.md$/;

const releaseFiles = fs
  .readdirSync(releasesDir)
  .filter((entry) => filenameVersion.test(entry))
  .sort();

describe('the split changelog', () => {
  const tree = {
    root,
    releases: releaseFiles.map((name) => ({
      name,
      text: fs.readFileSync(path.join(releasesDir, name), 'utf8'),
    })),
  };

  it('conforms to the shape the `vcs/changelog` adapter emits', () => {
    // One definition decides both sides — see tests/support/changelog-shape.ts.
    // keel has releases and a repository URL, so it is held to both
    // of the options a fresh scaffold is not.
    expect(
      changelogShapeViolations(tree, { minimumReleases: 6, requireUnreleasedLink: true }),
    ).toEqual([]);
  });

  it('keeps every released section out of the root', () => {
    expect(root).not.toMatch(/^## \[\d/m);
  });
});
