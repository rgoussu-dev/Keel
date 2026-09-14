/**
 * The per-directory doc assertion every family's e2e cell shares
 * (#135): the nested `AGENTS.md` a scaffold ships for a layer exists,
 * names the real ports and types it is about, sits under a one-line
 * `CLAUDE.md` pointer, and is reachable from the root map — read off
 * the scaffold the suite has just built, the way an agent meets it.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { expect } from 'vitest';

/** Asserts the doc of `directory` in the project at `cwd`, naming every one of `names`. */
export async function expectLayerDoc(
  cwd: string,
  directory: string,
  names: readonly string[],
): Promise<void> {
  const doc = await fs.readFile(path.join(cwd, directory, 'AGENTS.md'), 'utf8');
  expect(doc, `${directory}/AGENTS.md carries the family kit's section`).toContain(
    '<!-- keel:layer:begin -->',
  );
  for (const name of names) {
    expect(doc, `${directory}/AGENTS.md names ${name}`).toContain(name);
  }
  expect(await fs.readFile(path.join(cwd, directory, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
  expect(await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8')).toContain(
    `](${directory}/AGENTS.md)`,
  );
}
