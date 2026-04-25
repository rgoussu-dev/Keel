import path from 'node:path';
import fs from 'fs-extra';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Schematic, Tree } from '../../engine/types.js';

const ADDENDUM_MARKER = '<!-- keel:claude-quarkus:addendum -->';

/**
 * Layers Quarkus-tailored runbook skills (`build`, `test`, `run`,
 * `format`, `troubleshoot`) onto the universal Claude scaffold rendered
 * by `claude-core`, and appends a stack-specific addendum to
 * `.claude/CLAUDE.md` describing the project layout, default endpoints,
 * and quick command reference for Quarkus 3.33 + Gradle 9.4 + Java 25.
 *
 * The addendum is idempotent: a sentinel HTML comment marker keeps a
 * second invocation from producing a duplicate section.
 *
 * Composable: invoked by the top-level install flow when the user
 * picks the `java-quarkus` stack, and runnable standalone via
 * `keel generate claude-quarkus` to retrofit an existing project.
 */
export const claudeQuarkusSchematic: Schematic = {
  name: 'claude-quarkus',
  description: 'Layer Quarkus runbook skills + CLAUDE.md addendum on top of claude-core.',
  parameters: [],

  async run(tree) {
    const templateRoot = path.join(paths.asset('schematics'), 'claude-quarkus', 'templates');
    await renderTemplate(tree, templateRoot, '.claude', {});
    await appendAddendum(tree);
  },
};

async function appendAddendum(tree: Tree): Promise<void> {
  const claudeMdPath = '.claude/CLAUDE.md';
  const existing = tree.read(claudeMdPath);
  const addendumPath = path.join(
    paths.asset('schematics'),
    'claude-quarkus',
    'addendum',
    'CLAUDE.md.append',
  );
  const addendum = await fs.readFile(addendumPath, 'utf8');

  if (existing) {
    const text = existing.toString('utf8');
    if (text.includes(ADDENDUM_MARKER)) return;
    const merged = `${text.replace(/\s+$/, '')}\n\n${addendum.replace(/^\s+/, '')}`;
    tree.write(claudeMdPath, merged);
    return;
  }
  tree.write(claudeMdPath, addendum);
}
