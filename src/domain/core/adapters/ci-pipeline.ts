/**
 * Shared vocabulary for the `ci` vertical's pipeline adapters: the
 * provider question, its validated answers, the capability tag each
 * provider promotes, and the template-tree convention.
 *
 * The adapters follow the pattern the `containerization` vertical
 * established: one adapter per stack family, reading the build system
 * from the manifest tag set rather than doubling every adapter per
 * `pkg.*` tag. The CI **provider** is a question rather than a
 * predicate for the same reason the image flavor is: nothing in the
 * manifest's tag set knows where the repository is hosted, so the
 * choice belongs to the user, sticky so it is asked exactly once.
 */

import {
  LINT_MANAGED_TAG,
  STYLE_MANAGED_TAG,
  formatterCommandsFor,
  linterCommandsFor,
} from './code-style.js';
import type { Question, Tag } from '../../contract/composition.js';

/** A CI provider keel can emit a pipeline for. */
export type CiProvider = 'github-actions' | 'gitlab-ci';

/** The tag a pipeline contribution promotes, per provider. */
const TAG_BY_PROVIDER: Readonly<Record<CiProvider, Tag>> = {
  'github-actions': 'ci.github-actions',
  'gitlab-ci': 'ci.gitlab-ci',
};

/**
 * The provider question, shared by every family adapter. Only one of
 * them fires per project (their predicates are disjoint by family),
 * so the question is asked once and remembered.
 */
export const PROVIDER_QUESTION: Question = {
  id: 'provider',
  prompt: 'CI provider?',
  doc: 'Both flavors run the same commands the scaffold documents; only the host differs.',
  default: 'github-actions',
  memory: 'sticky',
  choices: [
    {
      value: 'github-actions',
      label: 'GitHub Actions — .github/workflows/ci.yml',
      doc: 'A workflow on push; toolchains via the official setup-* actions.',
    },
    {
      value: 'gitlab-ci',
      label: 'GitLab CI — .gitlab-ci.yml',
      doc: 'A pipeline on push; toolchains via the official language images.',
    },
  ],
};

/** Validates a raw `provider` answer, failing loudly on anything else. */
export function ciProvider(raw: string, requesterId: string): CiProvider {
  if (raw === 'github-actions' || raw === 'gitlab-ci') return raw;
  throw new Error(
    `${requesterId}: unsupported provider '${raw}'; supported: github-actions, gitlab-ci`,
  );
}

/** The tag a pipeline contribution promotes for `provider`. */
export function providerTag(provider: CiProvider): Tag {
  return TAG_BY_PROVIDER[provider];
}

/**
 * Every tag a pipeline adapter may promote — one per provider,
 * the dial deciding which. This is the `ci` vertical's `promotes`
 * set.
 */
export const CI_PROVIDER_TAGS: readonly Tag[] = Object.values(TAG_BY_PROVIDER);

/**
 * The template tree for `adapter` under `provider` — each pipeline
 * adapter keeps one subtree per provider (`github/`, `gitlab/`)
 * rather than one adapter per provider.
 */
export function ciTemplateId(adapter: string, provider: CiProvider): string {
  return `composition/ci/${adapter}/${provider === 'gitlab-ci' ? 'gitlab' : 'github'}`;
}

/**
 * The format-check command a pipeline should gate on, or `undefined`
 * when the project does not have the `code-style` vertical installed.
 *
 * Gated on the `style.managed` tag rather than on the language, so a
 * project scaffolded before `code-style` existed — or one that
 * deliberately never installed it — gets a pipeline with no format
 * step at all, instead of one calling a command its build cannot
 * answer. Because the tag travels on the manifest, a `keel add ci`
 * run months later still picks the step up.
 *
 * This is the *check* half of the pair; the *format* half is wired
 * into the pre-commit hook. CI verifies, the hook fixes.
 */
export function ciFormatCheck(tags: readonly string[]): string | undefined {
  if (!tags.includes(STYLE_MANAGED_TAG)) return undefined;
  return formatterCommandsFor(tags)?.check;
}

/**
 * The lint-check command a pipeline should gate on, or `undefined`
 * when there is none to run — either the project never installed the
 * `code-style` vertical's `linter` dimension, or (the JVM family) the
 * dimension is covered but has no command of its own because the
 * check rides inside `ciFormatCheck` instead. Mirrors `ciFormatCheck`
 * exactly, including the reason for gating on the tag rather than the
 * language: a project scaffolded before this dimension existed gets
 * no lint step rather than one calling a command its build cannot
 * answer.
 */
export function ciLintCheck(tags: readonly string[]): string | undefined {
  if (!tags.includes(LINT_MANAGED_TAG)) return undefined;
  return linterCommandsFor(tags)?.check;
}
