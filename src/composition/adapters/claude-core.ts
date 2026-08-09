/**
 * `walking-skeleton/claude-core` adapter — emits the universal
 * binding spec (`CLAUDE.md`) into `<project>/.claude/`. This is the
 * file that tells Claude Code what conventions the project follows;
 * every keel-scaffolded project ships with it.
 *
 * Composition:
 *   - covers `agentic-baseline` of the `walking-skeleton` vertical;
 *   - predicate: empty — fires unconditionally, since every keel
 *     project wants the binding spec;
 *   - no `after` ordering: the file is independent of the build /
 *     entrypoint adapters.
 *
 * The spec lives at `assets/project/CLAUDE.md` (the only `'project'`
 * asset shipped today) so contributors edit one canonical file
 * that's both the kit's own dogfood reference and the artifact
 * landed in consumer projects. A future stack-tailored adapter can
 * patch the emitted file with an addendum (e.g. a Quarkus runbook).
 */

import type { Adapter } from '../../domain/contract/composition.js';

export const CLAUDE_CORE_ID = 'walking-skeleton/claude-core';

const TARGET_PATH = '.claude/CLAUDE.md';

export const claudeCoreAdapter: Adapter = {
  id: CLAUDE_CORE_ID,
  vertical: 'walking-skeleton',
  covers: ['agentic-baseline'],
  predicate: {},
  async contribute(ctx) {
    const content = await ctx.templates.readText('project/CLAUDE.md');
    return {
      files: [{ path: TARGET_PATH, content }],
    };
  },
};
