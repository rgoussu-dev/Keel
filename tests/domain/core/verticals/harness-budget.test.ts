/**
 * The context-budget guard of the emitted harness (#134): what an
 * AGENTS.md-reading agent is handed — every file the evals' context
 * audit counts (`AGENTS.md`, `CLAUDE.md`, the skill bodies under
 * `.claude/skills/`) plus the loading shims `claude-core` emits
 * beside them (`.gemini/settings.json`, `.aider.conf.yml`) — stays
 * under a fixed budget for every non-composite stack, on every layout
 * it offers. keel's native guard-test idiom: cheaper than waiting for
 * the evals to notice bloat, and it runs in `verify`.
 *
 * Three things are held per stack: the root line count the redesign
 * committed to (≤ 120 lines, stack section included), the byte budget
 * over that whole set (well under Codex's 32 KiB combined-doc
 * default, leaving room for a nested chain) — the selection is the
 * audit's own, so a skill body or a shim growing rules cannot slip
 * past a hand-kept list — and the cross-family negative: only this
 * project's dispatch stance ships, never the other four.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import {
  AIDER_CONF_TARGET,
  GEMINI_SETTINGS_TARGET,
} from '../../../../src/domain/core/adapters/claude-core.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import { auditContext } from '../../../../evals/lib/context-audit.mjs';

/** The redesign's root ceiling, stack section and slots included. */
const MAX_ROOT_LINES = 120;

/** Context bytes: the audit's set + the shims. Codex's default cap is 32 KiB for the whole chain. */
const MAX_EAGER_BYTES = 8 * 1024;

/** What the audit counts in a fresh scaffold, and the shims it does not (no rules of their own). */
const AUDITED = ['.claude/skills/run/SKILL.md', 'AGENTS.md', 'CLAUDE.md'];
const SHIMS = [GEMINI_SETTINGS_TARGET, AIDER_CONF_TARGET] as const;

interface Audit {
  readonly files: readonly { readonly path: string }[];
  readonly totalBytes: number;
}

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

async function emit(
  tags: readonly string[],
): Promise<{ agents: string; audit: Audit; shims: Readonly<Record<string, string>> }> {
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
  await tree.commit();
  return {
    agents: tree.read('AGENTS.md')?.toString() ?? '',
    audit: auditContext(cwd) as Audit,
    shims: Object.fromEntries(SHIMS.map((shim) => [shim, tree.read(shim)?.toString() ?? ''])),
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
      const { agents, audit, shims } = await emit(cell.tags);
      expect(audit.files.map((f) => f.path)).toEqual(AUDITED);
      for (const shim of SHIMS) expect(shims[shim], `${cell.id}: ${shim} emitted`).not.toBe('');

      const lines = agents.split('\n').length;
      expect(lines, `${cell.id}: ${lines} lines`).toBeLessThanOrEqual(MAX_ROOT_LINES);
      const bytes = Object.values(shims).reduce(
        (n, s) => n + Buffer.byteLength(s),
        audit.totalBytes,
      );
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
