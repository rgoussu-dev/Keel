/**
 * The `ci` vertical — answers "what does every push have to pass?"
 *
 * One dimension, `pipeline`, covered per stack family by predicate:
 * a GitHub Actions workflow at `.github/workflows/ci.yml` that
 * builds and tests on push. The binding spec's "done means green
 * gates" finally has scaffold backing — a project leaves `keel new`
 * (or gains via `keel add ci`) a pipeline that runs the same commands
 * its README documents, and nothing more.
 *
 * House rule, everywhere: the workflow trusts the project's own
 * build. It provisions a toolchain, invokes the wrapper or package
 * manager the scaffold shipped, and never duplicates build
 * configuration — the pipeline is a description of the gate, not a
 * second build system.
 *
 * Triggers on `push` alone, deliberately: the emitted binding spec
 * (§6) mandates trunk-based development with no PRs, so a
 * `pull_request` trigger would document a workflow the spec forbids.
 */

import { goGithubActionsAdapter } from '../adapters/go-github-actions.js';
import { jvmGithubActionsAdapter } from '../adapters/jvm-github-actions.js';
import { rustGithubActionsAdapter } from '../adapters/rust-github-actions.js';
import { tsGithubActionsAdapter } from '../adapters/ts-github-actions.js';
import type { Vertical } from '../../contract/composition.js';

export const ciVertical: Vertical = {
  id: 'ci',
  description: 'The pipeline every push has to pass: build and test on GitHub Actions.',
  dimensions: ['pipeline'],
  adapters: [
    jvmGithubActionsAdapter,
    goGithubActionsAdapter,
    rustGithubActionsAdapter,
    tsGithubActionsAdapter,
  ],
};
