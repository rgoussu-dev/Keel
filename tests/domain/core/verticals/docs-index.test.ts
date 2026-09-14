/**
 * The navigation index over what the five families actually emit.
 *
 * The unit tests in `../docs-index.test.ts` hold the grammar; this
 * holds the three claims a scaffold makes about it, and they are
 * claims a pure test cannot make:
 *
 *   - every nested document is reachable from the root — one map row
 *     per emitted `AGENTS.md`;
 *   - every skills-index row's description is **byte-identical** to
 *     the `description:` its own `SKILL.md` frontmatter carries, the
 *     sweep the version-pins registry does for pins. Two spellings of
 *     one trigger is exactly the drift the index exists to prevent;
 *   - a modulith carries a row per bounded context the manifest
 *     records, and a flat layout carries none.
 *
 * One cell per family × layout: the projection is family-agnostic, so
 * a cell per build system would buy nothing but wall clock.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { docsCheckQuery } from '../../../../src/domain/contract/queries.js';
import {
  parseRows,
  MAP_REGION,
  SKILLS_INDEX_REGION,
} from '../../../../src/domain/core/docs-index.js';
import { locateRegion, type Region } from '../../../../src/domain/contract/region.js';
import { expectOk, installMediator } from '../../../support/factory.js';

/** One cell per family × layout — the two axes the index's content turns on. */
const CELLS = [
  { stack: 'quarkus-rest', layout: 'basic' },
  { stack: 'quarkus-rest', layout: 'modulith' },
  { stack: 'go-http', layout: 'basic' },
  { stack: 'go-http', layout: 'modulith' },
  { stack: 'rust-http', layout: 'basic' },
  { stack: 'rust-http', layout: 'modulith' },
  { stack: 'ts-http', layout: 'basic' },
  { stack: 'ts-http', layout: 'modulith' },
  { stack: 'web-components', layout: 'basic' },
  { stack: 'web-components', layout: 'modulith' },
] as const;

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.remove(directory)));
});

/** The rows of one region of a document. */
function rowsOf(text: string, region: Region): ReturnType<typeof parseRows> {
  const span = locateRegion(text, region, 'AGENTS.md');
  if (span === null) return [];
  return parseRows(text.slice(span.begin + region.begin.length, span.end - region.end.length));
}

/** The `description:` line of a rendered `SKILL.md`, as its frontmatter carries it. */
function frontmatterDescription(skill: string): string {
  return /^description: (.*)$/m.exec(skill)?.[1] ?? '';
}

describe('the projected navigation index', () => {
  it.each(CELLS)('indexes what $stack ($layout) emits', async ({ stack, layout }) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-docs-index-'));
    directories.push(directory);
    const cwd = path.join(directory, 'demo');
    await fs.ensureDir(cwd);
    const mediator = installMediator({ runDeferred: async () => {} });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack,
          moduleLayout: layout,
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const root = await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    const map = rowsOf(root, MAP_REGION);
    const skills = rowsOf(root, SKILLS_INDEX_REGION);

    // Every nested document has a row, and every row points at
    // something the scaffold really wrote.
    const docs = report.changes
      .map((change) => change.path)
      .filter((p) => p.endsWith('/AGENTS.md'));
    expect(docs.length, `${stack} (${layout}): nested docs emitted`).toBeGreaterThan(0);
    for (const doc of docs) expect(map.map((row) => row.href)).toContain(doc);
    for (const row of map) {
      expect(await fs.pathExists(path.join(cwd, row.href)), `${row.href} exists`).toBe(true);
    }

    // Each skill's row description is the skill's own, verbatim.
    expect(skills.length).toBeGreaterThan(0);
    for (const row of skills) {
      const skill = await fs.readFile(path.join(cwd, row.href), 'utf8');
      expect(row.description, `${row.href}: row vs frontmatter`).toBe(
        frontmatterDescription(skill),
      );
    }

    // The bounded contexts are index rows on a modulith and there are
    // none to index on a flat layout.
    const contexts = map.filter((row) => row.description.startsWith('bounded context'));
    expect(contexts.map((row) => row.title)).toEqual(
      layout === 'modulith' ? [expect.stringContaining('greeting')] : [],
    );

    // And the whole thing agrees with a recomputation from scratch.
    const check = expectOk(await mediator.dispatch(docsCheckQuery({ cwd })));
    expect(check.drift, `${stack} (${layout}): drift straight after keel new`).toEqual([]);
    expect(check.unindexed).toEqual([]);
  });
});
