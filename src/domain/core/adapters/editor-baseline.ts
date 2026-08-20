/**
 * `code-style/editor-baseline` adapter — the universal half of the
 * `code-style` vertical: an `.editorconfig` every editor honours and
 * a `.gitattributes` that normalises line endings in git itself.
 *
 * Composition:
 *   - covers `editor-baseline` of the `code-style` vertical;
 *   - predicate: empty — fires for every stack, since the layout
 *     contract is the one part of code style that is genuinely
 *     language-independent;
 *   - no `after` ordering: neither file depends on any other
 *     adapter's output.
 *
 * Both files are contributed as **patches with a seed** rather than
 * plain files, so the vertical is safe to install onto a brownfield
 * project that already has either one: keel's rules land inside
 * sentinel markers after the user's, which is the half EditorConfig
 * resolution lets win, and a re-apply rewrites only that section.
 *
 * This adapter promotes {@link STYLE_MANAGED_TAG}, which is what the
 * downstream wiring keys on — the family formatter adapters, the
 * pre-commit hook's format step, and the pipelines' format check.
 */

import type { Adapter, Contribution } from '../../contract/composition.js';
import { eolAware } from '../util.js';
import {
  EDITORCONFIG_TARGET,
  GITATTRIBUTES_TARGET,
  STYLE_MANAGED_TAG,
  editorConfigSeed,
  gitAttributesSeed,
  renderEditorConfig,
  renderGitAttributes,
  upsertStyleSection,
} from './code-style.js';

export const EDITOR_BASELINE_ID = 'code-style/editor-baseline';

export const editorBaselineAdapter: Adapter = {
  id: EDITOR_BASELINE_ID,
  vertical: 'code-style',
  covers: ['editor-baseline'],
  predicate: {},
  contribute(): Contribution {
    return {
      patches: [
        {
          target: EDITORCONFIG_TARGET,
          seed: editorConfigSeed(),
          apply: eolAware((existing) => upsertStyleSection(existing, renderEditorConfig())),
        },
        {
          target: GITATTRIBUTES_TARGET,
          seed: gitAttributesSeed(),
          apply: eolAware((existing) => upsertStyleSection(existing, renderGitAttributes())),
        },
      ],
      tagsAdd: [STYLE_MANAGED_TAG],
    };
  },
};
