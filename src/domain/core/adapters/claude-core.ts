/**
 * `walking-skeleton/claude-core` adapter — emits the universal
 * binding spec as `AGENTS.md` at the project root (the open
 * agent-instructions convention) plus a one-line `CLAUDE.md`
 * pointer importing it, so Claude Code and AGENTS.md-native tools
 * read the same source of truth. Every keel-scaffolded project
 * ships with the pair.
 *
 * Composition:
 *   - covers `agentic-baseline` of the `walking-skeleton` vertical;
 *   - predicate: empty — fires unconditionally, since every keel
 *     project wants the binding spec;
 *   - no `after` ordering: the files are independent of the build /
 *     entrypoint adapters.
 *
 * The spec lives at `assets/project/AGENTS.md` (the only `'project'`
 * asset shipped today) so contributors edit one canonical file
 * that's both the kit's own dogfood reference and the artifact
 * landed in consumer projects. The family claude-kit adapters
 * (`claude-kit.ts`) patch the emitted file with the stack's runbook
 * under sentinel markers, ordered `after` this adapter.
 */

import type { Adapter } from '../../contract/composition.js';

export const CLAUDE_CORE_ID = 'walking-skeleton/claude-core';

const SPEC_TARGET = 'AGENTS.md';
const POINTER_TARGET = 'CLAUDE.md';
const POINTER_CONTENT = '@AGENTS.md\n';

export const claudeCoreAdapter: Adapter = {
  id: CLAUDE_CORE_ID,
  vertical: 'walking-skeleton',
  covers: ['agentic-baseline'],
  predicate: {},
  async contribute(ctx) {
    const content = await ctx.templates.readText('project/AGENTS.md');
    return {
      files: [
        { path: SPEC_TARGET, content },
        { path: POINTER_TARGET, content: POINTER_CONTENT },
      ],
    };
  },
};
