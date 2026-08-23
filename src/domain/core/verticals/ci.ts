/**
 * The `ci` vertical — answers "what does every push have to pass?"
 *
 * One dimension, `pipeline`, covered per stack family by predicate: a
 * build-and-test pipeline on push, emitted for the CI provider the
 * user picks (GitHub Actions at `.github/workflows/ci.yml`, or GitLab
 * CI at `.gitlab-ci.yml` — one sticky question, asked once). The
 * binding spec's "done means green gates" finally has scaffold
 * backing — a project leaves `keel new` (or gains via `keel add ci`)
 * a pipeline that runs the same commands its README documents, and
 * nothing more.
 *
 * House rule, everywhere: the pipeline trusts the project's own
 * build. It provisions a toolchain, invokes the wrapper or package
 * manager the scaffold shipped, and never duplicates build
 * configuration — the pipeline is a description of the gate, not a
 * second build system.
 *
 * Triggers on `push` alone, deliberately: the emitted binding spec
 * (§6) mandates trunk-based development with no PRs, so a
 * `pull_request` trigger (or merge-request pipeline) would document a
 * workflow the spec forbids.
 */

import { goPipelineAdapter } from '../adapters/go-pipeline.js';
import { jvmPipelineAdapter } from '../adapters/jvm-pipeline.js';
import { rustPipelineAdapter } from '../adapters/rust-pipeline.js';
import { tsPipelineAdapter } from '../adapters/ts-pipeline.js';
import { CI_PROVIDER_TAGS } from '../adapters/ci-pipeline.js';
import type { Vertical } from '../../contract/composition.js';

export const ciVertical: Vertical = {
  id: 'ci',
  title: 'Continuous integration',
  description:
    'The pipeline every push has to pass: build and test on GitHub Actions or GitLab CI.',
  dimensions: ['pipeline'],
  promotes: CI_PROVIDER_TAGS,
  adapters: [jvmPipelineAdapter, goPipelineAdapter, rustPipelineAdapter, tsPipelineAdapter],
};
