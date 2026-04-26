/**
 * Template rendering for adapters.
 *
 * Walks a directory of template files and emits a list of
 * `ContributionFile`s ready to be returned from an adapter's
 * `contribute()`. Same semantics as the legacy `engine/template.ts`
 * helper, but produces immutable contributions instead of mutating a
 * Tree directly — that lets the applier do conflict detection
 * uniformly.
 *
 * Behaviour per file kind:
 *   - `*.ejs` — rendered through EJS with `vars`, written without the
 *     `.ejs` suffix.
 *   - everything else — read as a binary `Buffer` and copied
 *     verbatim. This keeps binary template assets (e.g.
 *     `gradle-wrapper.jar`) byte-identical and is also correct for
 *     text files.
 *
 * Path-token substitution: filenames containing `__name__`-style
 * tokens get them replaced from `vars`. Tokens without a matching
 * variable are left as-is so the user sees the mismatch in the plan.
 *
 * Executable bit on the source file is preserved on the target — so
 * templates like `gradlew` retain `+x` after a commit.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { render } from 'ejs';
import type { ContributionFile } from './types.js';

/**
 * Renders every file under `templateRoot` as a contribution rooted
 * at `targetRoot`. Returns the contributions; nothing is written.
 */
export async function renderTemplateFiles(
  templateRoot: string,
  targetRoot: string,
  vars: Readonly<Record<string, unknown>>,
): Promise<ContributionFile[]> {
  const out: ContributionFile[] = [];
  const files = await walk(templateRoot);
  for (const absFile of files) {
    out.push(await renderOne(absFile, templateRoot, targetRoot, vars));
  }
  return out;
}

async function renderOne(
  absFile: string,
  templateRoot: string,
  targetRoot: string,
  vars: Readonly<Record<string, unknown>>,
): Promise<ContributionFile> {
  const rel = path.relative(templateRoot, absFile);
  const renamed = substitutePathTokens(rel, vars);
  const isEjs = renamed.endsWith('.ejs');
  const outRel = isEjs ? renamed.slice(0, -'.ejs'.length) : renamed;
  const outPath = path.posix.join(targetRoot.replace(/\\/g, '/'), outRel.split(path.sep).join('/'));
  if (isEjs) {
    const content = await fs.readFile(absFile, 'utf8');
    const rendered = render(content, vars, { async: false });
    return { path: outPath, content: rendered };
  }
  const [content, stat] = await Promise.all([fs.readFile(absFile), fs.stat(absFile)]);
  const srcMode = stat.mode & 0o777;
  if ((srcMode & 0o111) !== 0) return { path: outPath, content, mode: srcMode };
  return { path: outPath, content };
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(current, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) out.push(abs);
    }
  }
  return out.sort();
}

function substitutePathTokens(p: string, vars: Readonly<Record<string, unknown>>): string {
  return p.replace(/__([a-zA-Z_][a-zA-Z0-9_]*)__/g, (whole, key: string) => {
    const v = vars[key];
    return v == null ? whole : String(v);
  });
}
