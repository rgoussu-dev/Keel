/**
 * The `vcs` vertical — version control bootstrap. Today it covers a
 * single dimension (`vcs`) with one adapter that ensures the project
 * directory is a git repository and (optionally) wires up a remote.
 */

import { gitInitAdapter } from '../adapters/git-init.js';
import type { Vertical } from '../../contract/composition.js';

export const vcsVertical: Vertical = {
  id: 'vcs',
  description: 'Version control bootstrap.',
  dimensions: ['vcs'],
  adapters: [gitInitAdapter],
};
