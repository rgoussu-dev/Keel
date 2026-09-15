/**
 * The `vcs` vertical — the working conventions of a project's version
 * control, not just its bootstrap.
 *
 * Three dimensions: the repository itself (`vcs`), the commit format
 * enforced mechanically rather than asked for (`commit-conventions`),
 * and the changelog convention keel dogfoods, emitted outward
 * (`changelog`). They are one vertical because they are one subject —
 * how this project records what changed and why — and because a
 * commit message rule and a changelog entry rule that live in
 * different verticals drift apart.
 *
 * The two conventions are individually declinable: each adapter asks
 * one sticky yes/no question, defaulting to yes, and contributes
 * nothing when the answer is no. A dimension is never left uncovered,
 * which is what lets the resolver keep its one guarantee.
 */

import { changelogAdapter } from '../adapters/changelog.js';
import { commitConventionsAdapter } from '../adapters/commit-conventions.js';
import { gitInitAdapter } from '../adapters/git-init.js';
import type { Vertical } from '../../contract/composition.js';

export const vcsVertical: Vertical = {
  id: 'vcs',
  title: 'Version control',
  description:
    'A git repository from the first commit: the ignore rules your stack needs, an initial branch you name, an origin remote when you have one — plus the conventions that keep its history readable, a Conventional Commits gate and a split changelog.',
  dimensions: ['vcs', 'commit-conventions', 'changelog'],
  adapters: [gitInitAdapter, commitConventionsAdapter, changelogAdapter],
};
