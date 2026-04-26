import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Schematic } from '../../engine/types.js';

/**
 * Renders the universal Claude scaffold — `CLAUDE.md`, `settings.json`,
 * agents, commands, conventions, and hooks — into the project's
 * `.claude/` directory. The schematic carries no methodology-only
 * skills; stack-specific runbook skills (`build`, `test`, `run`,
 * `format`, `troubleshoot`) ship through the matching
 * `claude-<stack>` schematic and compose on top of this one.
 *
 * Composable: invoked by the top-level `install` flow (always) and
 * runnable standalone via `keel generate claude-core`. Idempotent —
 * rendering twice produces the same tree.
 */
export const claudeCoreSchematic: Schematic = {
  name: 'claude-core',
  description: 'Render the universal Claude scaffold (CLAUDE.md, settings, hooks, commands).',
  parameters: [],

  async run(tree) {
    const templateRoot = path.join(paths.asset('schematics'), 'claude-core', 'templates');
    await renderTemplate(tree, templateRoot, '.claude', {});
  },
};
