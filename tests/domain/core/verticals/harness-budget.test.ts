/**
 * The context-budget guard of the emitted harness (#134): what an
 * AGENTS.md-reading agent loads at session start — the root
 * `AGENTS.md` and its `CLAUDE.md` pointer — stays under a fixed
 * budget for every non-composite stack, on every layout it offers.
 * keel's native guard-test idiom: cheaper than waiting for the evals
 * to notice bloat, and it runs in `verify`.
 *
 * Three things are held per stack: the root line count the redesign
 * committed to (≤ 120 lines, stack section included), the eager byte
 * budget (well under Codex's 32 KiB combined-doc default, leaving
 * room for a nested chain), and the cross-family negative — only this
 * project's dispatch stance ships, never the other four.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

/** The redesign's root ceiling, stack section and slots included. */
const MAX_ROOT_LINES = 120;

/** Eager context bytes: root doc + pointer. Codex's default cap is 32 KiB for the whole chain. */
const MAX_EAGER_BYTES = 8 * 1024;

/**
 * One phrase per family that appears in its stance and in no other
 * family's — the negative is asserted family by family, so a stance
 * leaking across the seam fails naming the family it came from.
 */
const STANCE_MARKERS: Readonly<Record<string, { tag: string; marker: string }>> = {
  jvm: { tag: 'runtime.jvm', marker: '`@DomainHandler`' },
  go: { tag: 'lang.go', marker: 'No mediator object' },
  rust: { tag: 'lang.rust', marker: 'exhaustive `match`' },
  ts: { tag: 'runtime.node', marker: 'erasableSyntaxOnly' },
  wc: { tag: 'framework.web-components', marker: 'typed context keys' },
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

async function emit(tags: readonly string[]): Promise<{ agents: string; pointer: string }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-harness-budget-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  await installVertical({
    vertical: walkingSkeletonVertical,
    manifest: { ...emptyManifestV2('2026-09-13T00:00:00Z', '0.5.0-alpha'), tags: [...tags] },
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-09-13T00:00:00Z',
  });
  return {
    agents: tree.read('AGENTS.md')?.toString() ?? '',
    pointer: tree.read('CLAUDE.md')?.toString() ?? '',
  };
}

const cells = Object.values(STACKS)
  .filter((stack) => !stack.services)
  .flatMap((stack) =>
    (stack.moduleLayouts ?? [{ tag: null }]).map((layout) => ({
      id: `${stack.id} (${layout.tag ?? 'default'})`,
      tags: [
        ...stack.tags,
        ...(stack.buildSystems?.[0] ? [stack.buildSystems[0].tag] : []),
        ...(layout.tag ? [layout.tag] : []),
      ],
    })),
  );

describe('emitted harness context budget', () => {
  for (const cell of cells) {
    it(`${cell.id}: root ≤ ${MAX_ROOT_LINES} lines, eager bytes ≤ ${MAX_EAGER_BYTES}, one stance`, async () => {
      const { agents, pointer } = await emit(cell.tags);
      expect(pointer).toBe('@AGENTS.md\n');

      const lines = agents.split('\n').length;
      expect(lines, `${cell.id}: ${lines} lines`).toBeLessThanOrEqual(MAX_ROOT_LINES);
      const bytes = Buffer.byteLength(agents) + Buffer.byteLength(pointer);
      expect(bytes, `${cell.id}: ${bytes} bytes`).toBeLessThanOrEqual(MAX_EAGER_BYTES);

      // The stack section filled its slot: a layout map and a stance.
      expect(agents).toContain('**Dispatch.**');
      expect(agents).toContain('**Layout**');

      const own = Object.values(STANCE_MARKERS).filter((m) => cell.tags.includes(m.tag));
      expect(own, `${cell.id}: exactly one family`).toHaveLength(1);
      for (const [family, { marker }] of Object.entries(STANCE_MARKERS)) {
        if (marker === own[0]!.marker) {
          expect(agents, `${cell.id}: own ${family} stance`).toContain(marker);
        } else {
          expect(agents, `${cell.id}: ${family} stance leaked`).not.toContain(marker);
        }
      }
    });
  }
});
