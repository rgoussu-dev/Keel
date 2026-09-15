/**
 * The **split-changelog shape**, as one checker both consumers run.
 *
 * keel keeps released sections one file per release under
 * `docs/releases/`, with `[Unreleased]` plus a newest-first index in
 * the root `CHANGELOG.md` (#131); the `vcs/changelog` adapter emits
 * that same convention outward (#143). "The emitted shape matches
 * keel's own" is only a fact if one definition decides both, so the
 * rules live here and `tests/changelog.test.ts` and the adapter's own
 * suite each hand it a tree.
 *
 * Structure only, never content: what the categories are named, what
 * a release says it changed and which historical `###` headings a
 * migrated section carries are none of this function's business.
 *
 * Two things a fresh scaffold legitimately cannot have, and which the
 * options therefore make optional rather than the rules ignore:
 * **releases** (it has had none) and **compare links** (the
 * repository URL is not known at scaffold time — the emitted
 * `scripts/cut-changelog.sh` reads it from the git remote at cut
 * time). Everything else is identical on both sides.
 */

/** One release file, as the checker reads it. */
export interface ReleaseFile {
  /** Basename under `docs/releases/`, e.g. `CHANGELOG.1.2.0.md`. */
  readonly name: string;
  readonly text: string;
}

/** A changelog tree to check: the root file plus the release files beside it. */
export interface ChangelogTree {
  readonly root: string;
  readonly releases: readonly ReleaseFile[];
}

/** What a given consumer additionally requires. */
export interface ChangelogShapeOptions {
  /**
   * The floor on release files — the anti-vacuity guard. A renamed
   * directory must fail loudly rather than turn every per-file rule
   * green over an empty set. Zero for a fresh scaffold, which has had
   * no releases.
   */
  readonly minimumReleases?: number;
  /**
   * Whether the root must carry the `[Unreleased]` compare link. A
   * project with no repository URL and no tag has nothing to compare
   * against, and a made-up link is worse than none.
   */
  readonly requireUnreleasedLink?: boolean;
}

/** Everything between `CHANGELOG.` and `.md` is the version. */
const FILENAME_VERSION = /^CHANGELOG\.(.+)\.md$/;

const INDEX_ROW =
  /^- \[([^\]]+)\]\(docs\/releases\/(CHANGELOG\.[^)]+\.md)\) — (\d{4}-\d{2}-\d{2})/gm;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One row of the root's `## Releases` index. */
interface IndexRow {
  readonly version: string;
  readonly file: string;
  readonly date: string;
}

function indexRows(root: string): readonly IndexRow[] {
  return [...root.matchAll(INDEX_ROW)].map((match) => ({
    version: match[1] ?? '',
    file: match[2] ?? '',
    date: match[3] ?? '',
  }));
}

/**
 * Every way this tree breaks the shape, as one list of messages.
 * Empty means conforming — so a caller asserts
 * `expect(changelogShapeViolations(tree)).toEqual([])` and reads the
 * failure directly.
 */
export function changelogShapeViolations(
  tree: ChangelogTree,
  options: ChangelogShapeOptions = {},
): readonly string[] {
  const { minimumReleases = 0, requireUnreleasedLink = false } = options;
  const violations: string[] = [];
  const say = (message: string): number => violations.push(message);

  const headings = [...tree.root.matchAll(/^## .*$/gm)].map((match) => match[0]);
  if (headings.join('\n') !== '## [Unreleased]\n## Releases') {
    say(`the root holds ${JSON.stringify(headings)}, not exactly [Unreleased] then Releases`);
  }

  const refs = [...tree.root.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)];
  const unreleased = refs.find((match) => match[1] === 'Unreleased');
  if (requireUnreleasedLink && unreleased === undefined) {
    say('the root carries no [Unreleased] link ref');
  }
  for (const ref of refs) {
    if (ref[1] !== 'Unreleased') say(`the root carries a stray link ref '${ref[1] ?? ''}'`);
  }
  if (
    unreleased !== undefined &&
    !/^https:\/\/\S+\/compare\/v\S+\.\.\.HEAD$/.test(unreleased[2] ?? '')
  ) {
    say(`the [Unreleased] ref '${unreleased[2] ?? ''}' is not a compare against the latest tag`);
  }

  const rows = indexRows(tree.root);
  const dates = rows.map((row) => row.date);
  if (dates.join() !== [...dates].sort().reverse().join()) {
    say('the index is not newest first');
  }
  for (const row of rows) {
    if (row.file !== `CHANGELOG.${row.version}.md`) {
      say(`index row '${row.version}' names '${row.file}'`);
    }
  }

  const files = tree.releases.map((release) => release.name).sort();
  if (files.length < minimumReleases) {
    say(
      `docs/releases/ holds ${String(files.length)} files, fewer than the floor of ${String(minimumReleases)}`,
    );
  }
  const indexed = rows.map((row) => row.file).sort();
  if (indexed.join('\n') !== files.join('\n')) {
    say(
      `the index and docs/releases/ are not a bijection: ${indexed.join(', ')} vs ${files.join(', ')}`,
    );
  }

  for (const release of tree.releases) {
    const version = FILENAME_VERSION.exec(release.name)?.[1] ?? '';
    const first = release.text.split('\n', 1)[0] ?? '';
    // U+2014 em dash, per the release-heading convention.
    if (!new RegExp(`^## \\[${escapeRegExp(version)}\\] — \\d{4}-\\d{2}-\\d{2}$`).test(first)) {
      say(`${release.name} opens with '${first}'`);
    }
    if (
      requireUnreleasedLink &&
      !new RegExp(`^\\[${escapeRegExp(version)}\\]: https://\\S+$`, 'm').test(release.text)
    ) {
      say(`${release.name} carries no link ref of its own`);
    }
  }

  return violations;
}
