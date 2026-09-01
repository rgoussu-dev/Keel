/**
 * The skill contract: the one serializer every contributor's skills
 * go through, and the schema a contributed spec must survive. The
 * serialization is pinned byte-for-byte — the `run` skill's
 * byte-identical migration off its old `files:` entry rests on this
 * exact shape.
 */

import { describe, expect, it } from 'vitest';
import {
  renderSkill,
  skillSupportingTarget,
  skillTarget,
  SkillSpecSchema,
} from '../../../src/domain/contract/skill.js';

describe('renderSkill', () => {
  it('serializes the frontmatter and body byte-exactly', () => {
    expect(
      renderSkill({ name: 'run', description: 'Launch the app.', body: '# Run\n\nsteps' }),
    ).toBe('---\nname: run\ndescription: Launch the app.\n---\n\n# Run\n\nsteps\n');
  });

  it('trims the body and ends with exactly one newline', () => {
    expect(renderSkill({ name: 'a', description: 'd', body: '\nbody\n\n' })).toBe(
      '---\nname: a\ndescription: d\n---\n\nbody\n',
    );
  });

  it('spells user-invocable only when the spec sets it', () => {
    const base = { name: 'a', description: 'd', body: 'b' };
    expect(renderSkill(base)).not.toContain('user-invocable');
    expect(renderSkill({ ...base, userInvocable: true })).toContain('\nuser-invocable: true\n');
    expect(renderSkill({ ...base, userInvocable: false })).toContain('\nuser-invocable: false\n');
  });

  it('never emits paths: frontmatter — description matching is the trigger', () => {
    // Upstream Claude Code discovery mismatches path-scoped skills;
    // the contract is that no keel-emitted skill carries the key.
    const rendered = renderSkill({
      name: 'a',
      description: 'd',
      userInvocable: true,
      body: 'b',
      supporting: [{ path: 's.md', content: 'c' }],
    });
    expect(rendered).not.toMatch(/^paths:/m);
  });
});

describe('skill targets', () => {
  it('stage under .claude/skills/<name>/', () => {
    expect(skillTarget('run')).toBe('.claude/skills/run/SKILL.md');
    expect(skillSupportingTarget('run', 'ref/table.md')).toBe('.claude/skills/run/ref/table.md');
  });
});

describe('SkillSpecSchema', () => {
  const valid = { name: 'debug-native', description: 'd', body: 'b' };

  it('accepts a well-formed spec, supporting files included', () => {
    expect(
      SkillSpecSchema.safeParse({
        ...valid,
        userInvocable: true,
        supporting: [{ path: 'ref/table.md', content: 'c' }],
      }).success,
    ).toBe(true);
  });

  it('refuses a name that cannot be a skill directory', () => {
    for (const name of ['', 'Not A Name', '9lives', 'UPPER', 'a/b', '-lead']) {
      expect(SkillSpecSchema.safeParse({ ...valid, name }).success, name).toBe(false);
    }
  });

  it('refuses an empty description or body', () => {
    expect(SkillSpecSchema.safeParse({ ...valid, description: '' }).success).toBe(false);
    expect(SkillSpecSchema.safeParse({ ...valid, body: '' }).success).toBe(false);
  });

  it('holds supporting paths inside the skill directory', () => {
    for (const p of ['/abs.md', '../out.md', 'a/../../out.md', 'a\\b.md', 'SKILL.md', 'a//b']) {
      expect(
        SkillSpecSchema.safeParse({ ...valid, supporting: [{ path: p, content: 'c' }] }).success,
        p,
      ).toBe(false);
    }
  });

  it('refuses duplicate supporting paths', () => {
    expect(
      SkillSpecSchema.safeParse({
        ...valid,
        supporting: [
          { path: 'a.md', content: '1' },
          { path: 'a.md', content: '2' },
        ],
      }).success,
    ).toBe(false);
  });
});
