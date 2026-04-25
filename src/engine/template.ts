import path from 'node:path';
import fs from 'fs-extra';
import { render } from 'ejs';
import type { Tree } from './types.js';

/**
 * Renders every file in a template directory (recursively) into the tree.
 * File names may contain EJS placeholders like `__name__.java`, which are
 * substituted from `vars`.
 *
 * Behaviour per file kind:
 *   - `.ejs` → read as UTF-8, rendered through EJS, written without the
 *     `.ejs` suffix.
 *   - everything else → read as a binary `Buffer` and copied verbatim.
 *     This keeps binary template assets (e.g. `gradle-wrapper.jar`)
 *     byte-identical, and is also correct for text files.
 *
 * The executable bit of the source file is preserved on the target when
 * set, so templates like `gradlew` retain `+x` after a commit.
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
    if (isEjs) {
      const content = await fs.readFile(absFile, 'utf8');
      const rendered = render(content, vars, { async: false });
      tree.write(outPath, rendered);
    } else {
      const [content, stat] = await Promise.all([fs.readFile(absFile), fs.stat(absFile)]);
      const srcMode = stat.mode & 0o777;
      if ((srcMode & 0o111) !== 0) {
        tree.write(outPath, content, { mode: srcMode });
      } else {
        tree.write(outPath, content);
      }
    }
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
