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
import { agentHarnessVertical } from '../../../../src/domain/core/verticals/agent-harness.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import { auditContext } from '../../../../evals/lib/context-audit.mjs';

/** The redesign's root ceiling, stack section and slots included. */
const MAX_ROOT_LINES = 120;

/**
 * Context bytes: the audit's set + the shims. Codex's default cap is
 * 32 KiB for the whole chain, so the ceiling here is a bloat tripwire
 * rather than a hard limit. Raised from 8 KiB with #138: the root now
 * carries the projected skills index as well as the map, which is the
 * navigation the redesign is for and roughly 250 bytes of it.
 */
const MAX_EAGER_BYTES = 9 * 1024;

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

/** A nested doc's ceiling: non-derivable facts only, well under a screen. */
const MAX_NESTED_LINES = 30;

/** Codex's default cap on the instruction chain it loads: the root plus every doc on the path to cwd. */
const CODEX_CHAIN_BYTES = 32 * 1024;

async function emit(tags: readonly string[]): Promise<{
  agents: string;
  audit: Audit;
  eagerBytes: number;
  shims: Readonly<Record<string, string>>;
  nested: Readonly<Record<string, string>>;
}> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-harness-budget-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  let manifest: ManifestV2 = {
    ...emptyManifestV2('2026-09-13T00:00:00Z', '0.5.0-alpha'),
    tags: [...tags],
  };
  for (const vertical of [walkingSkeletonVertical, agentHarnessVertical]) {
    const result = await installVertical({
      vertical,
      manifest,
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-09-13T00:00:00Z',
    });
    manifest = result.manifest;
  }
  await tree.commit();
  const audit = auditContext(cwd) as Audit;
  return {
    agents: tree.read('AGENTS.md')?.toString() ?? '',
    audit,
    eagerBytes: AUDITED.reduce((n, p) => n + (tree.read(p)?.length ?? 0), 0),
    shims: Object.fromEntries(SHIMS.map((shim) => [shim, tree.read(shim)?.toString() ?? ''])),
    nested: Object.fromEntries(
      audit.files
        .map((f) => f.path)
        .filter((p) => !AUDITED.includes(p))
        .map((p) => [p, tree.read(p)?.toString() ?? '']),
    ),
  };
}

// Every build system a stack offers, not its first: Maven and pnpm
// change the command table, so they are cells of their own.
const cells = Object.values(STACKS)
  .filter((stack) => !stack.services)
  .flatMap((stack) =>
    (stack.buildSystems ?? [{ tag: null }]).flatMap((build) =>
      (stack.moduleLayouts ?? [{ tag: null }]).map((layout) => ({
        id: `${stack.id} (${build.tag ?? 'default'}, ${layout.tag ?? 'default'})`,
        tags: [
          ...stack.tags,
          ...(build.tag ? [build.tag] : []),
          ...(layout.tag ? [layout.tag] : []),
        ],
      })),
    ),
  );

describe('emitted harness context budget', () => {
  for (const cell of cells) {
    it(`${cell.id}: root ≤ ${MAX_ROOT_LINES} lines, eager bytes ≤ ${MAX_EAGER_BYTES}, nested docs ≤ ${MAX_NESTED_LINES} lines within the Codex chain, one stance`, async () => {
      const { agents, audit, eagerBytes, shims, nested } = await emit(cell.tags);
      const paths = audit.files.map((f) => f.path);
      for (const eager of AUDITED) expect(paths, `${cell.id}: ${eager} audited`).toContain(eager);
      for (const shim of SHIMS) expect(shims[shim], `${cell.id}: ${shim} emitted`).not.toBe('');

      const lines = agents.split('\n').length;
      expect(lines, `${cell.id}: ${lines} lines`).toBeLessThanOrEqual(MAX_ROOT_LINES);
      // What every session carries from the start: the root set and the
      // shims. Nested docs load only where an agent works.
      const bytes = Object.values(shims).reduce((n, s) => n + Buffer.byteLength(s), eagerBytes);
      expect(bytes, `${cell.id}: ${bytes} bytes`).toBeLessThanOrEqual(MAX_EAGER_BYTES);

      // Every nested doc: under its ceiling, a pointer beside it, a row
      // in the root map, and — with every doc above it — inside the
      // chain Codex loads.
      const docs = Object.keys(nested).filter((p) => p.endsWith('/AGENTS.md'));
      expect(docs.length, `${cell.id}: nested docs emitted`).toBeGreaterThan(0);
      for (const doc of docs) {
        const dir = doc.slice(0, -'/AGENTS.md'.length);
        const docLines = nested[doc]!.trimEnd().split('\n').length;
        expect(docLines, `${cell.id}: ${doc} is ${docLines} lines`).toBeLessThanOrEqual(
          MAX_NESTED_LINES,
        );
        expect(nested[`${dir}/CLAUDE.md`], `${cell.id}: pointer beside ${doc}`).toBe(
          '@AGENTS.md\n',
        );
        expect(agents, `${cell.id}: map row for ${doc}`).toContain(`](${doc})`);
        const chain = docs
          .filter((other) => doc.startsWith(other.slice(0, -'AGENTS.md'.length)))
          .reduce((n, other) => n + Buffer.byteLength(nested[other]!), Buffer.byteLength(agents));
        expect(chain, `${cell.id}: chain to ${doc} is ${chain} bytes`).toBeLessThanOrEqual(
          CODEX_CHAIN_BYTES,
        );
      }
      for (const doc of docs) {
        const own = Object.values(STANCE_MARKERS).find((m) => cell.tags.includes(m.tag))!;
        for (const [family, { marker }] of Object.entries(STANCE_MARKERS)) {
          if (marker === own.marker) continue;
          expect(nested[doc], `${cell.id}: ${family} stance leaked into ${doc}`).not.toContain(
            marker,
          );
        }
      }

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
