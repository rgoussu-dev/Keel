/**
 * `walking-skeleton/claude-core` adapter — emits the universal
 * binding spec as `AGENTS.md` at the project root (the open
 * agent-instructions convention) plus the zero-maintenance loading
 * shims that make every major agent read that one file:
 *
 *   - `CLAUDE.md`, a one-line `@AGENTS.md` import — Claude Code is
 *     the one major tool not reading `AGENTS.md` natively;
 *   - `.gemini/settings.json`, naming `AGENTS.md` first in Gemini
 *     CLI's `context.fileName` list (its default is `GEMINI.md`);
 *   - `.aider.conf.yml`, listing `AGENTS.md` under `read:` so aider
 *     loads it read-only on every start.
 *
 * `AGENTS.md` is the single content file; the shims carry no rules
 * of their own and never need editing when the spec changes. Every
 * keel-scaffolded project ships the four.
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
 * landed in consumer projects. It ships the stack-section sentinel
 * pair empty, right under its preamble; the family claude-kit
 * adapters (`claude-kit.ts`) fill it with the stack's commands,
 * dispatch stance and layout map, ordered `after` this adapter.
 */

import type { Adapter } from '../../contract/composition.js';

export const CLAUDE_CORE_ID = 'walking-skeleton/claude-core';

const SPEC_TARGET = 'AGENTS.md';
const POINTER_TARGET = 'CLAUDE.md';
const POINTER_CONTENT = '@AGENTS.md\n';

/** Gemini CLI project settings: read `AGENTS.md` as a context file. */
export const GEMINI_SETTINGS_TARGET = '.gemini/settings.json';
const GEMINI_SETTINGS_CONTENT = `{
  "context": {
    "fileName": ["AGENTS.md", "GEMINI.md"]
  }
}
`;

/** aider project config: load `AGENTS.md` read-only on start. */
export const AIDER_CONF_TARGET = '.aider.conf.yml';
const AIDER_CONF_CONTENT = `# Loads the project's agent instructions read-only on every start.
read: [AGENTS.md]
`;

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
        { path: GEMINI_SETTINGS_TARGET, content: GEMINI_SETTINGS_CONTENT },
        { path: AIDER_CONF_TARGET, content: AIDER_CONF_CONTENT },
      ],
    };
  },
};
