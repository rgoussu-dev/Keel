/**
 * The harness assertions every family's e2e cell shares, read off the
 * scaffold the suite has just built, the way an agent meets it.
 *
 * Two of them: the per-directory doc (#135) — a nested `AGENTS.md`
 * naming the real ports and types, a one-line `CLAUDE.md` pointer
 * beside it, a row in the root map — and the layout lifecycle skill
 * (#139), which is one of a pair and never both.
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

/**
 * Asserts the layout lifecycle skill of a scaffold: `add-module` on a
 * modulith, `promote-to-modulith` on a flat project, and **the other
 * one absent**. The absence is the half worth an e2e: a pair that
 * both shipped would read as two contradictory procedures, and only a
 * real scaffold can show which one the layout produced.
 */
export async function expectLifecycleSkill(
  cwd: string,
  layout: 'basic' | 'modulith',
): Promise<void> {
  const [present, absent] =
    layout === 'modulith'
      ? (['add-module', 'promote-to-modulith'] as const)
      : (['promote-to-modulith', 'add-module'] as const);
  const skill = path.join(cwd, '.claude', 'skills', present, 'SKILL.md');
  expect(await fs.pathExists(skill), `${present} skill on a ${layout} scaffold`).toBe(true);
  expect(
    await fs.pathExists(path.join(cwd, '.claude', 'skills', absent, 'SKILL.md')),
    `${absent} skill absent on a ${layout} scaffold`,
  ).toBe(false);
  // The description the frontmatter carries is the row the root
  // skills index carries — one trigger, spelled once.
  const description = /^description: (.*)$/m.exec(await fs.readFile(skill, 'utf8'))?.[1] ?? '';
  expect(description).not.toBe('');
  expect(await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8')).toContain(
    `](.claude/skills/${present}/SKILL.md) — ${description}`,
  );
}

/**
 * Asserts a vertical's own skill: present once the vertical is
 * layered, and — before it is — absent. `keel` ships a procedure only
 * for something its files make real, and the negative is what holds
 * that rule to more than an intention.
 */
export async function expectVerticalSkill(
  cwd: string,
  name: string,
  present: boolean,
): Promise<void> {
  expect(
    await fs.pathExists(path.join(cwd, '.claude', 'skills', name, 'SKILL.md')),
    `${name} skill ${present ? 'present' : 'absent'}`,
  ).toBe(present);
}
