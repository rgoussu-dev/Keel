/**
 * The two files `keel new` adopts from a directory that already holds
 * them, `README.md` and `.gitignore`: what each `apply` makes of the
 * user's file, that it is the identity on keel's own (so an empty
 * directory gets the bytes it always did), and that it is its own
 * fixed point (so a second entrypoint, or a reapply, adds nothing).
 * What a whole `keel new` makes of them on each family is held in
 * `handlers/new-project-adoption.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  adoptGitignore,
  adoptingRootFiles,
  adoptReadme,
  readmeUpsert,
  toUpsertPatches,
} from '../../../../src/domain/core/adapters/adopted-files.js';

const KEEL_README = `# shipper

Go walking skeleton scaffolded by keel.

## Layout

One module; each \`cmd/\` main is the assembly point.

## Test

\`\`\`sh
go test ./...
\`\`\`
`;

const KEEL_GITIGNORE = `# build output
/bin/

# test artifacts
*.test
cover.out
`;

describe('adoptReadme', () => {
  const adopt = adoptReadme(KEEL_README);

  it('leaves keel’s own README as it is', () => {
    expect(adopt(KEEL_README)).toBe(KEEL_README);
  });

  it('keeps the user’s README, title included, and adds keel’s below its title', () => {
    expect(adopt('# my-repo\n\nWhat this repository is for.\n')).toBe(`# my-repo

What this repository is for.

Go walking skeleton scaffolded by keel.

## Layout

One module; each \`cmd/\` main is the assembly point.

## Test

\`\`\`sh
go test ./...
\`\`\`
`);
  });

  it('is its own fixed point', () => {
    const once = adopt('# my-repo\n');
    expect(adopt(once)).toBe(once);
  });

  it('makes no second copy of its sections once their headings are there, edited or not', () => {
    const edited = adopt('# my-repo\n').replace('One module;', 'One Go module;');
    expect(adopt(edited)).toBe(edited);
  });

  it('adds its sections to a README that has only some of their headings', () => {
    const mine = '# my-repo\n\n## Test\n\nmake test\n';
    expect(adopt(mine)).toBe(`${mine}\n${KEEL_README.replace(/^# shipper\n\n/, '')}`);
  });

  it('holds a README with no section headings to its body verbatim', () => {
    const plain = adoptReadme('# shipper\n\nJust a paragraph.\n');
    expect(plain('# mine\n')).toBe('# mine\n\nJust a paragraph.\n');
    expect(plain('# mine\n\nJust a paragraph.\n')).toBe('# mine\n\nJust a paragraph.\n');
  });

  it('writes keel’s whole README over an empty one', () => {
    expect(adopt('')).toBe(KEEL_README);
    expect(adopt('\n\n')).toBe(KEEL_README);
  });

  it('keeps a README keel wrote under another project name', () => {
    const earlier = KEEL_README.replace('# shipper', '# walking-skeleton');
    expect(adopt(earlier)).toBe(earlier);
  });

  it('keeps a CRLF README’s line endings, and adopts it once', () => {
    const once = adopt('# my-repo\r\n');
    expect(once).toBe(
      `# my-repo\r\n\r\n${KEEL_README.replace(/^# shipper\n\n/, '')}`.replace(/\r?\n/g, '\r\n'),
    );
    expect(adopt(once)).toBe(once);
  });
});

describe('adoptGitignore', () => {
  const adopt = adoptGitignore(KEEL_GITIGNORE);

  it('leaves keel’s own .gitignore as it is', () => {
    expect(adopt(KEEL_GITIGNORE)).toBe(KEEL_GITIGNORE);
  });

  it('keeps every line of the user’s and adds the entries it lacks, in keel’s groups', () => {
    expect(adopt('# mine\n.env\n*.test\n')).toBe(`# mine
.env
*.test

# build output
/bin/

# test artifacts
cover.out
`);
  });

  it('adds nothing where every entry is there already, whatever the order or comments', () => {
    const mine = 'cover.out\n  /bin/  \n*.test\n';
    expect(adopt(mine)).toBe(mine);
  });

  it('adds a group only for the entries it lacks, and never rewrites one of the user’s', () => {
    // `bin/` is not `/bin/`: keel adds its own line and leaves the user's.
    expect(adopt('bin/\n*.test\ncover.out')).toBe(
      'bin/\n*.test\ncover.out\n\n# build output\n/bin/\n',
    );
  });

  it('is its own fixed point', () => {
    const once = adopt('node_modules/\n');
    expect(adopt(once)).toBe(once);
  });

  it('writes keel’s whole .gitignore over an empty one', () => {
    expect(adopt('')).toBe(KEEL_GITIGNORE);
  });

  it('keeps a CRLF file’s line endings, and adopts it once', () => {
    const once = adopt('.env\r\n');
    expect(once).toBe(
      '.env\r\n\r\n# build output\r\n/bin/\r\n\r\n# test artifacts\r\n*.test\r\ncover.out\r\n',
    );
    expect(adopt(once)).toBe(once);
  });
});

describe('the upserts the bootstraps write the two files with', () => {
  it('splits a rendered tree into whole-file writes and the two root files as seeded upserts', () => {
    const { files, patches } = adoptingRootFiles([
      { path: 'go.mod', content: 'module x\n' },
      { path: 'README.md', content: KEEL_README },
      { path: '.gitignore', content: Buffer.from(KEEL_GITIGNORE) },
      { path: 'docs/README.md', content: '# docs\n' },
    ]);
    expect(files.map((f) => f.path)).toEqual(['go.mod', 'docs/README.md']);
    expect(patches.map((p) => [p.target, p.seed])).toEqual([
      ['README.md', KEEL_README],
      ['.gitignore', KEEL_GITIGNORE],
    ]);
    expect(patches[0]!.apply('# mine\n')).toBe(adoptReadme(KEEL_README)('# mine\n'));
    expect(patches[1]!.apply('.env\n')).toBe(adoptGitignore(KEEL_GITIGNORE)('.env\n'));
  });

  it('upserts any other shared file with the identity, keeping its mode', () => {
    const [patch] = toUpsertPatches([{ path: 'bin/run', content: '#!/bin/sh\n', mode: 0o755 }]);
    expect(patch).toMatchObject({ target: 'bin/run', seed: '#!/bin/sh\n', mode: 0o755 });
    expect(patch!.apply('mine\n')).toBe('mine\n');
  });

  it('runs an entrypoint’s own section after the adoption', () => {
    const section = (existing: string) =>
      existing.includes('\n### cli\n') ? existing : `${existing.trimEnd()}\n\n### cli\n`;
    const patch = readmeUpsert(KEEL_README, section);
    expect(patch.target).toBe('README.md');
    expect(patch.seed).toBe(KEEL_README);
    const adopted = patch.apply('# my-repo\n');
    expect(adopted).toBe(`${adoptReadme(KEEL_README)('# my-repo\n').trimEnd()}\n\n### cli\n`);
    expect(patch.apply(adopted)).toBe(adopted);
  });
});
