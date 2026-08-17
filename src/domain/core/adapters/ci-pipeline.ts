/**
 * Shared vocabulary for the `ci` vertical's pipeline adapters: the
 * capability tag a pipeline contribution promotes.
 *
 * The adapters follow the pattern the `containerization` vertical
 * established: one adapter per stack family, reading the build system
 * from the manifest tag set rather than doubling every adapter per
 * `pkg.*` tag — the choice only changes the commands inside one
 * workflow file, it never changes which adapter is selected.
 */

import type { Tag } from '../../contract/composition.js';

/** The tag every ci pipeline adapter promotes. */
export const CI_PIPELINE_TAG: Tag = 'ci.github-actions';
