/**
 * The navigation index as a computation: which rows the declarations
 * produce, what a merge keeps, and every way `keel docs check` calls
 * a project and its index out of step.
 *
 * Pure over data and a fake Tree — no scaffold, no registry. The
 * sweep over what the real families emit is
 * `verticals/docs-index.test.ts`; this is the grammar underneath it.
 */

import { describe, expect, it } from 'vitest';
import {
  CHILDREN_REGION,
  MAP_REGION,
  SKILLS_INDEX_REGION,
  computeDocsIndex,
  docsIndexDrift,
  mergeRows,
  parseRows,
  renderIndexBody,
  renderRow,
  type DocsIndexInput,
  type IndexRow,
} from '../../../src/domain/core/docs-index.js';
import { upsertRegion } from '../../../src/domain/contract/region.js';
import { FakeTree } from '../../../src/infrastructure/tree/fake.js';

const scenario: DocsIndexInput = {
  docs: [
    { directory: 'modules', description: 'the bounded contexts', indexes: 'modules' },
    { directory: 'modules/greeting/docs', description: 'the greeting context’s notes' },
    { directory: 'platform', description: 'what no context owns' },
  ],
  skills: [{ name: 'run', description: 'Launch the app and probe it.' }],
  modules: [
    { name: 'greeting', seam: true },
    { name: 'guestbook', seam: false },
  ],
};

/** A tree carrying the documents the scenario's rows point at, with empty slots. */
function seededTree(root = rootDoc()): FakeTree {
  const tree = new FakeTree();
  tree.write('AGENTS.md', root);
  for (const doc of scenario.docs) tree.write(`${doc.directory}/AGENTS.md`, '# doc\n');
  for (const module of scenario.modules) {
    tree.write(`modules/${module.name}/main.go`, 'package main\n');
  }
  tree.write('.claude/skills/run/SKILL.md', '---\nname: run\n---\n');
  return tree;
}

function rootDoc(): string {
  return [
    '# Spec',
    '',
    MAP_REGION.begin,
    MAP_REGION.end,
    '',
    SKILLS_INDEX_REGION.begin,
    SKILLS_INDEX_REGION.end,
    '',
  ].join('\n');
}

/** Writes each computed region into a tree, the way the engine's projection does. */
function project(tree: FakeTree, input: DocsIndexInput = scenario): void {
  for (const region of computeDocsIndex(input)) {
    const current = tree.read(region.target)?.toString('utf8') ?? '';
    tree.write(
      region.target,
      upsertRegion(current, region.region, renderIndexBody(region.heading, region.rows), {
        padding: 'blank',
        whenAbsent: 'keep',
      }),
    );
  }
}

describe('computeDocsIndex', () => {
  it('maps the documents at the top of their chain, and the bounded contexts', () => {
    const map = computeDocsIndex(scenario).find((r) => r.region === MAP_REGION)!;
    expect(map.rows.map((row) => row.href)).toEqual([
      'modules/AGENTS.md',
      'modules/greeting/',
      'modules/guestbook/',
      'platform/AGENTS.md',
    ]);
    // `modules/greeting/docs` sits under `modules/`, so it is that
    // document's child rather than a second root row.
    expect(map.rows.map((row) => row.href)).not.toContain('modules/greeting/docs/AGENTS.md');
  });

  it('puts a nested document in its nearest documented ancestor’s child index', () => {
    const children = computeDocsIndex(scenario).filter((r) => r.region === CHILDREN_REGION);
    expect(children).toHaveLength(1);
    expect(children[0]!.target).toBe('modules/AGENTS.md');
    expect(children[0]!.rows.map((row) => row.href)).toEqual(['modules/greeting/docs/AGENTS.md']);
  });

  it('emits no child index for a document with nothing beneath it', () => {
    const flat = computeDocsIndex({ ...scenario, docs: [scenario.docs[2]!] });
    expect(flat.filter((r) => r.region === CHILDREN_REGION)).toEqual([]);
  });

  it('says which contexts publish a seam and which are pure consumers', () => {
    const map = computeDocsIndex(scenario).find((r) => r.region === MAP_REGION)!;
    expect(map.rows.find((row) => row.href === 'modules/greeting/')!.description).toContain(
      'user-side/service',
    );
    expect(map.rows.find((row) => row.href === 'modules/guestbook/')!.description).toContain(
      'pure consumer',
    );
  });

  it('lists no contexts when no document declares where they live', () => {
    const undeclared = computeDocsIndex({
      ...scenario,
      docs: [{ directory: 'modules', description: 'the bounded contexts' }],
    });
    const map = undeclared.find((r) => r.region === MAP_REGION)!;
    expect(map.rows.map((row) => row.href)).toEqual(['modules/AGENTS.md']);
  });

  it('carries each skill’s description into its row verbatim', () => {
    const skills = computeDocsIndex(scenario).find((r) => r.region === SKILLS_INDEX_REGION)!;
    expect(skills.rows).toEqual([
      {
        title: '`/run`',
        href: '.claude/skills/run/SKILL.md',
        description: 'Launch the app and probe it.',
      },
    ]);
  });

  it('names a directory by the first section that describes it', () => {
    const composed = computeDocsIndex({
      ...scenario,
      docs: [
        { directory: 'platform', description: 'the family kit’s row' },
        { directory: 'platform', description: 'a later section’s row' },
      ],
    });
    const map = composed.find((r) => r.region === MAP_REGION)!;
    expect(map.rows.find((row) => row.href === 'platform/AGENTS.md')!.description).toBe(
      'the family kit’s row',
    );
  });
});

describe('the row grammar', () => {
  it('round-trips a row through render and parse', () => {
    const row: IndexRow = { title: '`domain/`', href: 'domain/AGENTS.md', description: 'ports' };
    expect(renderRow(row)).toBe('- [`domain/`](domain/AGENTS.md) — ports');
    expect(parseRows(renderRow(row))).toEqual([row]);
  });

  it('reads no row out of prose someone left between the markers', () => {
    expect(parseRows('**Map** — a heading\n\nA sentence, not a row.\n- a bare bullet')).toEqual([]);
  });

  it('renders nothing at all for an index with no rows', () => {
    expect(renderIndexBody('**Skills**', [])).toBe('');
  });
});

describe('mergeRows', () => {
  const computed: IndexRow[] = [{ title: '`a/`', href: 'a/AGENTS.md', description: 'fresh' }];

  it('replaces a row the run recomputed and keeps one it knows nothing about', () => {
    const merged = mergeRows(
      [
        { title: '`a/`', href: 'a/AGENTS.md', description: 'stale' },
        { title: '`z/`', href: 'z/AGENTS.md', description: 'another vertical’s' },
      ],
      computed,
    );
    expect(merged).toEqual([
      { title: '`a/`', href: 'a/AGENTS.md', description: 'fresh' },
      { title: '`z/`', href: 'z/AGENTS.md', description: 'another vertical’s' },
    ]);
  });

  it('keeps a composed row that is already there — the first section named it', () => {
    const later: IndexRow = {
      title: '`a/`',
      href: 'a/AGENTS.md',
      description: 'a later section’s',
      composed: true,
    };
    expect(
      mergeRows(
        [{ title: '`a/`', href: 'a/AGENTS.md', description: 'the first section’s' }],
        [later],
      ),
    ).toEqual([{ title: '`a/`', href: 'a/AGENTS.md', description: 'the first section’s' }]);
    expect(mergeRows([], [later])).toEqual([later]);
  });

  it('is its own fixed point', () => {
    expect(mergeRows(computed, computed)).toEqual(computed);
  });
});

describe('docsIndexDrift', () => {
  it('is silent on a project the projection just wrote', () => {
    const tree = seededTree();
    project(tree);
    expect(docsIndexDrift(computeDocsIndex(scenario), tree)).toEqual([]);
  });

  it('is silent a second time — the projection is its own fixed point', () => {
    const tree = seededTree();
    project(tree);
    const once = tree.read('AGENTS.md')!.toString('utf8');
    project(tree);
    expect(tree.read('AGENTS.md')!.toString('utf8')).toBe(once);
  });

  it('names a row whose description was changed by hand', () => {
    const tree = seededTree();
    project(tree);
    tree.write(
      'AGENTS.md',
      tree.read('AGENTS.md')!.toString('utf8').replace('what no context owns', 'reworded'),
    );
    expect(docsIndexDrift(computeDocsIndex(scenario), tree)).toEqual([
      expect.objectContaining({ detail: expect.stringContaining("reads 'reworded'") }),
    ]);
  });

  it('names a row pointing at a file the project no longer has', () => {
    const tree = seededTree();
    project(tree);
    tree.delete('platform/AGENTS.md');
    expect(docsIndexDrift(computeDocsIndex(scenario), tree)).toContainEqual(
      expect.objectContaining({
        detail:
          "row '`platform/`' points at 'platform/AGENTS.md', which this project does not have",
      }),
    );
  });

  it('names a region whose rows were deleted', () => {
    const tree = seededTree();
    expect(docsIndexDrift(computeDocsIndex(scenario), tree)).toContainEqual(
      expect.objectContaining({ detail: "missing row for 'platform/AGENTS.md'" }),
    );
  });

  it('names a region whose rows are right but whose body was hand-edited', () => {
    const tree = seededTree();
    project(tree);
    tree.write(
      'AGENTS.md',
      tree.read('AGENTS.md')!.toString('utf8').replace('**Map**', '**My own heading**'),
    );
    expect(docsIndexDrift(computeDocsIndex(scenario), tree)).toContainEqual(
      expect.objectContaining({ detail: expect.stringContaining('hand-edited') }),
    );
  });

  it('says nothing about a document that carries no slot', () => {
    const tree = seededTree('# Spec, from before the index existed\n');
    // The root slots have rows and nothing to hold them, and the
    // projection may not create them in a document it did not write —
    // that is drift. A missing child index is not: the next sync
    // lands the pair itself.
    expect(docsIndexDrift(computeDocsIndex(scenario), tree).map((d) => d.detail)).toEqual([
      expect.stringContaining("restore the '<!-- keel:map:begin -->'"),
      expect.stringContaining("restore the '<!-- keel:skills-index:begin -->'"),
    ]);
  });

  it('reports a document the project does not have at all', () => {
    const tree = new FakeTree();
    expect(docsIndexDrift(computeDocsIndex(scenario), tree)).toContainEqual({
      target: 'AGENTS.md',
      region: null,
      detail: "the document is missing — run 'keel docs sync' after restoring it",
    });
  });
});
