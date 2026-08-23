/**
 * The `vcs` vertical — version control bootstrap. Today it covers a
 * single dimension (`vcs`) with one adapter that ensures the project
 * directory is a git repository and (optionally) wires up a remote.
 */

import { gitInitAdapter } from '../adapters/git-init.js';
import type { Vertical } from '../../contract/composition.js';

export const vcsVertical: Vertical = {
  id: 'vcs',
  title: 'Version control',
  description:
    'A git repository from the first commit: the ignore rules your stack needs, an initial branch you name, and an origin remote when you have one.',
  dimensions: ['vcs'],
  adapters: [gitInitAdapter],
};
