/**
 * `vcs/changelog` adapter — the split-changelog convention keel
 * dogfoods (#131), emitted outward.
 *
 * A root `CHANGELOG.md` holding `[Unreleased]` and a newest-first
 * `## Releases` index; `docs/releases/`, where each released section
 * lands as its own file with its own compare link; and
 * `scripts/cut-changelog.sh`, which moves one into the other. The
 * shape is the split Kubernetes and Node.js use, and the reason is
 * theirs: a single-file changelog that a long-lived project appends
 * to stops being read long before it stops being written.
 *
 * **One source of truth for the shape.** The emitted template and
 * keel's own `CHANGELOG.md` are checked against the same structural
 * rules (`tests/support/changelog-shape.ts`), which is what keeps
 * "matches keel's own" a fact rather than a claim. What differs is
 * only what a fresh project cannot have: no releases yet, and no
 * compare links, because the repository URL is not known at scaffold
 * time.
 *
 * **The cut rides POSIX `sh`, not keel and not Node.** keel's own cut
 * is `scripts/cut-changelog.mjs`, which is fine for a Node
 * repository; a scaffolded Go, Rust or JVM project has no Node, and
 * cutting a release is the one moment you least want a missing
 * runtime. `npx @rgoussu.dev/keel` would have the same problem and
 * add a network round trip to a release. So the scaffold carries its
 * own `sh` + `awk` implementation of the same rules, and the
 * repository URL for the compare links comes from
 * `git remote get-url origin` at cut time rather than from an answer
 * — the remote is where the tags actually are, and an absent remote
 * yields no links rather than wrong ones.
 *
 * Composition:
 *   - covers `changelog` of the `vcs` vertical;
 *   - predicate: empty — the convention is language-neutral;
 *   - declinable: answer `no` to its one sticky question.
 */

import type { Adapter } from '../../contract/composition.js';

export const CHANGELOG_ID = 'vcs/changelog';

const TEMPLATE_ID = 'composition/vcs/changelog/templates';

/** The root file the convention lives in. */
export const CHANGELOG_TARGET = 'CHANGELOG.md';

/** Where a cut release lands. */
export const RELEASES_DIR = 'docs/releases';

/** The cut, as the scaffold carries it. */
export const CUT_SCRIPT_TARGET = 'scripts/cut-changelog.sh';

export const changelogAdapter: Adapter = {
  id: CHANGELOG_ID,
  vertical: 'vcs',
  covers: ['changelog'],
  predicate: {},
  questions: [
    {
      id: 'changelog',
      prompt: 'keep a CHANGELOG, split one file per release',
      doc: 'Emits `CHANGELOG.md` with `[Unreleased]` and a release index, `docs/releases/` for the cut sections, and `scripts/cut-changelog.sh` (POSIX sh, no Node) to move one into the other. Answer `no` if this project records its releases somewhere else.',
      default: 'yes',
      memory: 'sticky',
      choices: [
        {
          value: 'yes',
          label: 'yes — CHANGELOG.md + docs/releases/ + the cut script',
          doc: 'The convention keel itself follows.',
        },
        { value: 'no', label: 'no — no changelog', doc: 'Nothing is emitted.' },
      ],
    },
  ],
  async contribute(ctx) {
    if (ctx.answer('changelog').trim() !== 'yes') return {};
    return { files: await ctx.templates.render(TEMPLATE_ID, '', {}) };
  },
};
