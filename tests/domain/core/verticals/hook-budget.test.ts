/**
 * The reminder-budget guard of the hook seam (#136): every line a hook
 * can feed back into an agent's context competes with the task, so a
 * project realizes at most `HOOK_REMINDER_BUDGET` across all of its
 * hooks — and keel's own hooks never spend the `PLUGIN_REMINDER_SLOTS`
 * kept for plugins. The engine refuses a run over the whole budget;
 * this test holds keel's share, over the resolved contribution set of
 * every non-composite stack, on every build system and layout it
 * offers.
 *
 * The contributors are derived, not listed: every shipped vertical
 * that declares `hooks` is installed onto each cell, so a vertical
 * gaining a hook is measured here the day it lands.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { newOwnership, type HarnessContribution } from '../../../../src/domain/core/apply.js';
import { SHIPPED_VERTICALS } from '../../../../src/domain/core/verticals/index.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import {
  HOOK_REMINDER_BUDGET,
  PLUGIN_REMINDER_SLOTS,
} from '../../../../src/domain/contract/hook.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

/** What keel's own hooks may spend of a project's budget. */
const KEEL_REMINDERS = HOOK_REMINDER_BUDGET - PLUGIN_REMINDER_SLOTS;

const HOOK_CONTRIBUTORS = SHIPPED_VERTICALS.filter((v) => (v.hooks ?? []).length > 0);

const cwds: string[] = [];

afterEach(async () => {
  await Promise.all(cwds.splice(0).map((c) => fs.remove(c)));
});

/** The harness declarations one cell resolves, collected and never realized. */
async function resolvedHarness(tags: readonly string[]): Promise<HarnessContribution[]> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-hook-budget-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  const owners = newOwnership();
  const harness: HarnessContribution[] = [];
  let manifest: ManifestV2 = {
    ...emptyManifestV2('2026-09-13T00:00:00Z', '0.5.0-alpha'),
    tags: [...tags],
  };
  for (const vertical of [walkingSkeletonVertical, ...HOOK_CONTRIBUTORS]) {
    const result = await installVertical({
      vertical,
      manifest,
      tree,
      owners,
      harness,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
      now: () => '2026-09-13T00:00:00Z',
    });
    manifest = result.manifest;
  }
  return harness;
}

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

describe('hook reminder budget', () => {
  it('keeps plugin slots inside the project budget', () => {
    expect(HOOK_REMINDER_BUDGET).toBe(5);
    expect(KEEL_REMINDERS).toBeGreaterThan(0);
    expect(HOOK_CONTRIBUTORS.map((v) => v.id)).toContain('agent-harness');
  });

  for (const cell of cells) {
    it(`${cell.id}: keel's hooks inject ≤ ${KEEL_REMINDERS} reminders`, async () => {
      const hooks = (await resolvedHarness(cell.tags)).flatMap((c) => c.hooks);
      expect(hooks.map((h) => h.name)).toContain('pre-commit-format');
      const reminders = hooks.reduce((n, hook) => n + hook.reminders.length, 0);
      expect(
        reminders,
        hooks.map((h) => `${h.name}: ${h.reminders.length}`).join(', '),
      ).toBeLessThanOrEqual(KEEL_REMINDERS);
    });
  }
});
