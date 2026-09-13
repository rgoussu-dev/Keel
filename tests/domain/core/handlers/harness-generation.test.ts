/**
 * The harness-generation gate of `keel add` (#137). Every manifest keel
 * creates is stamped with the generation of the harness it writes; a
 * project stamped with an older one — or none, having been scaffolded
 * before the marker existed — is refused with the story of how to bring
 * it forward, and nothing on disk moves. `keel add agent-harness` is the
 * way forward, and restamps the marker.
 *
 * One case per stack family, each over a real scaffold of its cheapest
 * stack with deferred actions faked: the marker is the same for all
 * five, but the files a half-patch would corrupt are not.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  ManifestV2Schema,
  emptyManifestV2,
  projectScopeRoot,
} from '../../../../src/domain/contract/manifest.js';
import {
  HARNESS_GENERATION_CODE,
  harnessGenerationRefusal,
} from '../../../../src/domain/core/harness-generation.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-harness-generation-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const mediator = () => installMediator({ runDeferred: () => Promise.resolve() });

const scaffold = async (stack: string, extra: { moduleLayout?: string } = {}) =>
  expectOk(
    await mediator().dispatch(
      newProjectCommand({ cwd, stack, answers: {}, interactive: false, dryRun: false, ...extra }),
    ),
  );

const manifestPath = () => path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);

const readManifest = async () =>
  ManifestV2Schema.parse(JSON.parse(await readFile(manifestPath(), 'utf8')));

/** Rewrites the stored marker as an older keel would have left it; `undefined` removes it. */
const stampMarker = async (generation: number | undefined) => {
  const { harnessGeneration: _dropped, ...rest } = await readManifest();
  await fs.writeJson(
    manifestPath(),
    generation === undefined ? rest : { ...rest, harnessGeneration: generation },
    { spaces: 2 },
  );
};

/** Every file under the project, hashed — what "touching nothing" is measured against. */
const snapshot = async (): Promise<Record<string, string>> => {
  const files: Record<string, string> = {};
  for (const entry of await readdir(cwd, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(cwd, file)] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  return files;
};

const add = (vertical: string, options: { reapply?: boolean; dryRun?: boolean } = {}) =>
  mediator().dispatch(
    addVerticalCommand({
      cwd,
      vertical,
      answers: {},
      interactive: false,
      dryRun: options.dryRun ?? false,
      ...(options.reapply ? { reapply: true } : {}),
    }),
  );

const FAMILIES = [
  ['JVM', 'quarkus-cli'],
  ['Go', 'go-cli'],
  ['Rust', 'rust-cli'],
  ['TypeScript', 'ts-cli'],
  ['web components', 'web-components'],
] as const;

describe.each(FAMILIES)('the harness-generation gate — %s (%s)', (_family, stack) => {
  it('stamps the scaffold, refuses keel add on a missing or older marker touching nothing, and lets keel add agent-harness bring it forward', async () => {
    await scaffold(stack);
    expect((await readManifest()).harnessGeneration).toBe(HARNESS_GENERATION);

    for (const marker of [undefined, HARNESS_GENERATION - 1]) {
      await stampMarker(marker);
      const before = await snapshot();
      const error = expectErr(await add('ci'));
      expect(error.code).toBe(HARNESS_GENERATION_CODE);
      expect(error.message).toContain(
        marker === undefined
          ? 'its manifest carries no harness-generation marker'
          : `its manifest is stamped harness generation ${String(marker)}`,
      );
      expect(error.message).toContain(
        "'keel add ci' refuses rather than half-patch it, and nothing was changed",
      );
      expect(error.message).toContain("run 'keel add agent-harness --reapply'");
      expect(error.message).toContain('pin keel@0.4.0-alpha');
      expect(await snapshot()).toEqual(before);
    }

    expectOk(await add('agent-harness', { reapply: true }));
    expect((await readManifest()).harnessGeneration).toBe(HARNESS_GENERATION);
    // Brought forward, the same command plans instead of refusing.
    expectOk(await add('ci', { dryRun: true }));
  });
});

describe('the harness-generation gate — the other refusals', () => {
  it('asks for a newer keel on a project stamped by one', async () => {
    await scaffold('go-cli');
    await stampMarker(HARNESS_GENERATION + 1);
    const before = await snapshot();
    const error = expectErr(await add('ci', { reapply: true }));
    expect(error.code).toBe(HARNESS_GENERATION_CODE);
    expect(error.message).toContain(
      `generation ${String(HARNESS_GENERATION + 1)}, newer than the generation ${String(HARNESS_GENERATION)} this keel writes — upgrade keel`,
    );
    expect(error.message).toContain("re-run 'keel add ci --reapply'");
    expect(await snapshot()).toEqual(before);
  });

  it('refuses keel add module too, before a context is emitted', async () => {
    await scaffold('go-cli', { moduleLayout: 'modulith' });
    await stampMarker(undefined);
    const before = await snapshot();
    const error = expectErr(
      await mediator().dispatch(
        addModuleCommand({
          cwd,
          module: 'billing',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe(HARNESS_GENERATION_CODE);
    expect(error.message).toContain("'keel add module billing' refuses");
    expect(await snapshot()).toEqual(before);
  });

  it('names plain adoption when the harness was never installed, and lets the current generation through', () => {
    const current = emptyManifestV2('2026-09-13T00:00:00Z', '0.6.0');
    expect(current.harnessGeneration).toBe(HARNESS_GENERATION);
    expect(harnessGenerationRefusal(current, 'keel add ci')).toBeNull();
    const { harnessGeneration: _dropped, ...unmarked } = current;
    const refusal = harnessGenerationRefusal(unmarked, 'keel add ci');
    expect(refusal?.message).toContain("run 'keel add agent-harness' to re-render the harness");
    expect(refusal?.message).not.toContain('--reapply');
  });
});
