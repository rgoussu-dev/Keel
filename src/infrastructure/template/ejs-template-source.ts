/**
 * Filesystem + EJS adapter for the TemplateSource port. Resolves
 * identifiers against an assets root (the packaged `assets/`
 * directory by default), walks template trees, and renders:
 *
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
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { render } from 'ejs';
import type { ContributionFile } from '../../domain/contract/composition.js';
import type { TemplateSource } from '../../domain/contract/ports/template-source.js';

/** The `assets/` directory shipped inside the installed package. */
export const packagedAssetsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'assets',
);

/** TemplateSource adapter rooted at a directory of assets. */
export class EjsTemplateSource implements TemplateSource {
  constructor(private readonly assetsRoot: string = packagedAssetsRoot) {}

  async render(
    templateId: string,
    targetRoot: string,
    vars: Readonly<Record<string, unknown>>,
  ): Promise<ContributionFile[]> {
    const templateRoot = path.join(this.assetsRoot, templateId);
    const out: ContributionFile[] = [];
    const files = await walk(templateRoot);
    for (const absFile of files) {
      out.push(await renderOne(absFile, templateRoot, targetRoot, vars));
    }
    return out;
  }

  readText(assetId: string): Promise<string> {
    return fs.readFile(path.join(this.assetsRoot, assetId), 'utf8');
  }
}

/** Shared default instance over the packaged assets. */
export const ejsTemplateSource = new EjsTemplateSource();

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
