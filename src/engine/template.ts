import path from 'node:path';
import fs from 'fs-extra';
import { render } from 'ejs';
import type { Tree } from './types.js';

/**
 * Renders every file in a template directory (recursively) through EJS and
 * writes the result into the tree. File names may themselves contain EJS
 * placeholders like `__name__.java`, which are substituted from `vars`.
 *
 * Template files ending in `.ejs` are rendered and written without the
 * `.ejs` extension; other files are copied verbatim.
 */
export async function renderTemplate(
  tree: Tree,
  templateRoot: string,
  targetRoot: string,
  vars: Record<string, unknown>,
): Promise<void> {
  const files = await walk(templateRoot);
  for (const absFile of files) {
    const rel = path.relative(templateRoot, absFile);
    const renamed = substitutePathTokens(rel, vars);
    const isEjs = renamed.endsWith('.ejs');
    const outRel = isEjs ? renamed.slice(0, -'.ejs'.length) : renamed;
    const outPath = path.posix.join(
      targetRoot.replace(/\\/g, '/'),
      outRel.split(path.sep).join('/'),
    );
    const content = await fs.readFile(absFile, 'utf8');
    const rendered = isEjs ? render(content, vars, { async: false }) : content;
    tree.write(outPath, rendered);
  }
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(current, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) out.push(abs);
    }
  }
  return out;
}

/**
 * Replaces `__token__` placeholders in a path with values from `vars`. Any
 * placeholder without a matching variable is left untouched so the user
 * sees the mismatch in the planned changes.
 */
function substitutePathTokens(p: string, vars: Record<string, unknown>): string {
  return p.replace(/__([a-zA-Z_][a-zA-Z0-9_]*)__/g, (whole, key: string) => {
    const v = vars[key];
    return v == null ? whole : String(v);
  });
}
