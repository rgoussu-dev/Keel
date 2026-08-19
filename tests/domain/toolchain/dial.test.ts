/**
 * Tests for the manager dial — which providers are offered for a
 * given needs set.
 *
 * The centrepiece is the **coverage invariant**, asserted against
 * the real family profiles rather than hand-written needs lists: the
 * `toolchain` vertical is installed over each family's tag set, and
 * every choice the dial then offers must cover that profile's needs
 * whole. A provider is never offered for a needs set it covers only
 * partially — the "no half-installs" rule applied to choices.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';
import { emptyManifestV2, type ManifestV2 } from '../../../src/domain/contract/manifest.js';
import type { ToolchainNeed } from '../../../src/domain/contract/toolchain.js';
import { installVertical } from '../../../src/domain/core/install.js';
import { toolchainVertical } from '../../../src/domain/core/verticals/toolchain.js';
import {
  DIAL,
  dialQuestion,
  memberFor,
  needsOf,
  offeredChoices,
} from '../../../src/domain/toolchain/core/dial.js';
import { miseProvider } from '../../../src/domain/toolchain/core/mise.js';
import { nvmProvider } from '../../../src/domain/toolchain/core/nvm.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';

/** The family profiles, and the choice list each must be offered. */
const PROFILES = [
  {
    id: 'jvm + gradle',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.cli', 'pkg.gradle'],
    offers: ['mise', 'asdf'],
  },
  {
    id: 'jvm + maven',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.server-http', 'pkg.maven'],
    offers: ['mise', 'asdf'],
  },
  {
    id: 'go',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
    offers: ['mise', 'asdf'],
  },
  { id: 'rust', tags: ['lang.rust', 'pkg.cargo', 'arch.cli'], offers: ['mise', 'asdf'] },
  {
    id: 'typescript + npm',
    tags: ['lang.typescript', 'runtime.node', 'arch.server-http', 'pkg.npm'],
    offers: ['mise', 'asdf', 'nvm'],
  },
  {
    id: 'typescript + pnpm',
    tags: ['lang.typescript', 'runtime.browser', 'framework.web-components', 'pkg.pnpm'],
    offers: ['mise', 'asdf', 'nvm+corepack'],
  },
] as const;

const cwds: string[] = [];

afterAll(async () => {
  await Promise.all(cwds.map((cwd) => fs.remove(cwd)));
});

/** The needs the `toolchain` vertical really records for a tag set. */
async function needsFor(tags: readonly string[]): Promise<readonly ToolchainNeed[]> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dial-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  tree.write('README.md', '# demo\n');
  const manifest: ManifestV2 = {
    ...emptyManifestV2('2026-08-19T12:00:00Z', '0.0.0-test'),
    tags: [...tags],
  };
  const result = await installVertical({
    vertical: toolchainVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: '/unused',
    templates: ejsTemplateSource,
    processes: new FakeProcessRunner(),
    now: () => '2026-08-19T12:00:00Z',
    apply: 'install',
  });
  return result.manifest.toolchain?.needs ?? [];
}

describe('the manager dial, over the real family profiles', () => {
  it.each(PROFILES)('offers $offers on $id', async ({ tags, offers }) => {
    const choices = offeredChoices(await needsFor(tags));
    expect(choices.map((choice) => choice.id)).toEqual([...offers]);
  });

  it.each(PROFILES)(
    'holds the coverage invariant on $id — every offered choice covers it whole',
    async ({ tags }) => {
      const needs = await needsFor(tags);
      expect(needs.length).toBeGreaterThan(0);

      const uncovered = offeredChoices(needs).flatMap((choice) =>
        needs
          .filter((need) => !choice.covers.includes(need.tool))
          .map((need) => `${choice.id} does not cover ${need.tool}`),
      );

      expect(uncovered).toEqual([]);
    },
  );

  it.each(PROFILES)('defaults to mise on $id', async ({ tags }) => {
    const choices = offeredChoices(await needsFor(tags));
    expect(dialQuestion(choices).default).toBe('mise');
  });
});

describe('the manager dial', () => {
  const node: ToolchainNeed = { tool: 'node', version: '22' };
  const pnpm: ToolchainNeed = { tool: 'pnpm', version: '10.33.0' };
  const jdk: ToolchainNeed = { tool: 'jdk', version: '25' };

  it('offers a single only when it covers the needs whole', () => {
    expect(offeredChoices([node, pnpm]).map((c) => c.id)).not.toContain('nvm');
    expect(offeredChoices([node]).map((c) => c.id)).toContain('nvm');
  });

  it('offers a combination only when every member earns its place', () => {
    // corepack contributes nothing to a Node-only project.
    expect(offeredChoices([node]).map((c) => c.id)).not.toContain('nvm+corepack');
    expect(offeredChoices([node, pnpm]).map((c) => c.id)).toContain('nvm+corepack');
    // Neither member reaches the JVM, so their union does not either.
    expect(offeredChoices([jdk]).map((c) => c.id)).not.toContain('nvm+corepack');
  });

  it("unions its members' coverage, and nothing more", () => {
    const combination = offeredChoices([node, pnpm]).find((c) => c.id === 'nvm+corepack');
    expect([...(combination?.covers ?? [])].sort()).toEqual(['node', 'npm', 'pnpm']);
  });

  it('gives each need exactly one member, in curated order', () => {
    const combination = offeredChoices([node, pnpm]).find((c) => c.id === 'nvm+corepack');
    if (!combination) throw new Error('test setup: the combination should be offered here');
    const [nvm, corepack] = combination.members;
    if (!nvm || !corepack) throw new Error('test setup: two members expected');

    expect(nvm.id).toBe('nvm');
    expect(needsOf(combination, nvm, [node, pnpm])).toEqual([node]);
    expect(needsOf(combination, corepack, [node, pnpm])).toEqual([pnpm]);
    expect(memberFor(combination, 'pnpm')?.id).toBe('corepack');
  });

  it('offers nothing when no choice covers the needs whole', () => {
    const narrowed = { providers: [nvmProvider], combinations: [] };
    expect(offeredChoices([node, pnpm], narrowed)).toEqual([]);
  });

  it('lists singles before combinations, mise first — the default answer', () => {
    expect(DIAL.providers[0]).toBe(miseProvider);
    const ids = offeredChoices([node, pnpm]).map((choice) => choice.id);
    expect(ids[0]).toBe('mise');
    expect(ids.at(-1)).toBe('nvm+corepack');
  });

  it('refuses a combination naming a provider the dial does not carry', () => {
    expect(() =>
      offeredChoices([node], {
        providers: [nvmProvider],
        combinations: [{ id: 'nvm+ghost', label: 'ghost', members: ['nvm', 'ghost'] }],
      }),
    ).toThrow(/unknown provider 'ghost'/);
  });

  it('asks one sticky question whose choices are exactly what was offered', () => {
    const choices = offeredChoices([node, pnpm]);
    const question = dialQuestion(choices);

    expect(question.id).toBe('provider');
    expect(question.memory).toBe('sticky');
    expect(question.choices?.map((choice) => choice.value)).toEqual(
      choices.map((choice) => choice.id),
    );
  });
});
