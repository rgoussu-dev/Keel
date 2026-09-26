/**
 * The harness-generation gate of `keel add` (#137). Every manifest keel
 * creates is stamped with the generation of the harness it writes; a
 * project stamped with an older one — or none, having been scaffolded
 * before the marker existed — is refused with the story of how to bring
 * it forward, and nothing on disk moves. `keel add agent-harness` is the
 * way forward, and restamps the marker — but at a product root, whose
 * services have the harness, it installs nothing, and is refused; there
 * no `keel add` brings the root's own harness forward, and the refusal
 * says so, naming the keel to pin for what the root runs itself.
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
  docsSyncCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  ManifestV2Schema,
  emptyManifestV2,
  projectScopeRoot,
} from '../../../../src/domain/contract/manifest.js';
import { docsCheckQuery, projectStatusQuery } from '../../../../src/domain/contract/queries.js';
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

const scaffold = async (
  stack: string,
  extra: { moduleLayout?: string; layout?: 'monorepo' | 'polyrepo' } = {},
) =>
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
      verticals: [vertical],
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

  it('refuses keel add agent-harness at a product root, and names the pin where it is the way forward', async () => {
    // There it installs nothing and so stamps nothing: an Ok would say
    // the way forward worked, and leave every other add refused. The
    // root's harness is the product glue's, which no `keel add` names:
    // the refusal names no command that would be refused in turn.
    await scaffold('fullstack', { layout: 'monorepo' });
    const forward =
      "A product root's harness is the product's own, and no 'keel add' brings it forward — the agent harness is its services', each brought forward in its own directory";
    for (const marker of [undefined, HARNESS_GENERATION - 1]) {
      await stampMarker(marker);
      const before = await snapshot();
      // What its services have, the harness among it: theirs, and a
      // pinned keel would run nothing for it here either.
      for (const vertical of ['agent-harness', 'code-style']) {
        const error = expectErr(await add(vertical));
        expect(error.code).toBe(HARNESS_GENERATION_CODE);
        expect(error.message).toContain(
          `this product root was scaffolded by an older keel (keel@0.4.0-alpha)`,
        );
        expect(error.message).toContain(`'keel add ${vertical}' refuses rather than half-patch it`);
        expect(error.message).toContain(
          `${forward} — and its services have what 'keel add ${vertical}' names already, so there is nothing to run here.`,
        );
        expect(error.message).not.toContain('pin ');
      }
      // What the root takes itself: the keel that scaffolded it runs it
      // — an add, a re-render of what the root has, and `keel docs`.
      const own = expectErr(await add('dev-env'));
      expect(own.code).toBe(HARNESS_GENERATION_CODE);
      expect(own.message).toContain(
        `${forward} — so pin keel@0.4.0-alpha, the keel that scaffolded it, to run 'keel add dev-env' here.`,
      );
      expect(own.message).not.toContain('to re-render the harness and stamp the marker');
      const rerender = expectErr(await add('vcs', { reapply: true, dryRun: true }));
      expect(rerender.message).toMatch(
        /so pin keel@0\.4\.0-alpha, the keel that scaffolded it, to run 'keel add vcs --reapply' here\.$/,
      );
      for (const [line, docs] of [
        ['keel docs sync', await mediator().dispatch(docsSyncCommand({ cwd, dryRun: true }))],
        ['keel docs check', await mediator().dispatch(docsCheckQuery({ cwd }))],
      ] as const) {
        const error = expectErr(docs);
        expect(error.code).toBe(HARNESS_GENERATION_CODE);
        expect(error.message).toContain(
          `${forward} — so pin keel@0.4.0-alpha, the keel that scaffolded it, to run '${line}' here.`,
        );
        expect(error.message).not.toContain('nothing to run here');
      }
      // What the root has already, not re-rendered, runs nothing there
      // either: no pin, and who has it — the root, or it and its services.
      const vcs = expectErr(await add('vcs', { dryRun: true }));
      expect(vcs.message).toMatch(
        /— and this root has what 'keel add vcs' names already, so there is nothing to run here\.$/,
      );
      // A run names no pin only where all it names is there already and
      // it re-renders nothing of the root's: beside dev-env, or
      // refreshing the root's own vcs, the pinned keel would run
      // something here.
      const several = (verticals: readonly string[], refresh: readonly string[] = []) =>
        mediator().dispatch(
          addVerticalCommand({
            cwd,
            verticals: [...verticals],
            ...(refresh.length > 0 ? { refresh: [...refresh] } : {}),
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        );
      const mixed = expectErr(await several(['dev-env', 'code-style']));
      expect(mixed.message).toContain(
        `${forward} — so pin keel@0.4.0-alpha, the keel that scaffolded it, to run 'keel add dev-env code-style' here.`,
      );
      expect(mixed.message).not.toContain('nothing to run here');
      const theirs = expectErr(await several(['code-style', 'agent-harness']));
      expect(theirs.message).toMatch(
        /— and its services have what 'keel add code-style agent-harness' names already, so there is nothing to run here\.$/,
      );
      const both = expectErr(await several(['code-style', 'vcs']));
      expect(both.message).toMatch(
        /— and this root and its services have what 'keel add code-style vcs' names already, so there is nothing to run here\.$/,
      );
      const refreshing = expectErr(await several(['code-style'], ['vcs']));
      expect(refreshing.message).toMatch(
        /so pin keel@0\.4\.0-alpha, the keel that scaffolded it, to run 'keel add code-style --refresh vcs' here\.$/,
      );
      // What is not for the root is refused as in any generation,
      // pointing into its services, which the marker does not stop.
      const service = expectErr(await add('persistence'));
      expect(service.code).toBe('keel.wrong-scope');
      expect(service.message).toBe(
        'Persistence belongs to a service, not to the product root — it goes in backend/',
      );
      // And a bounded context, which no product root takes: refused as
      // there, as the status greys the control out, and no pin named.
      const context = expectErr(
        await mediator().dispatch(
          addModuleCommand({
            cwd,
            module: 'billing',
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        ),
      );
      expect(context.code).toBe('keel.invalid-module');
      const status = expectOk(await mediator().dispatch(projectStatusQuery({ cwd })));
      expect(status.moduleRefusal).toEqual({
        code: context.code,
        message: context.message.replace("'keel add module billing'", "'keel add module <name>'"),
      });
      expect(await snapshot()).toEqual(before);
      expect((await readManifest()).harnessGeneration).toBe(marker);
    }
    // Each service is a project of its own, stamped as scaffolded: the
    // root's marker stops nothing there.
    expectOk(
      await mediator().dispatch(
        addVerticalCommand({
          cwd: path.join(cwd, 'backend'),
          verticals: ['persistence'],
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
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
    // A manifest listing services is a product root's: no harness of
    // its own to adopt, the pin alone; a newer marker there still asks
    // for a newer keel.
    const root = {
      ...unmarked,
      services: [{ path: 'backend', stack: 'go-http' }],
    };
    expect(harnessGenerationRefusal(root, 'keel docs sync')?.message).toMatch(
      /no 'keel add' brings it forward — .* — so pin keel@0\.6\.0, the keel that scaffolded it, to run 'keel docs sync' here\.$/,
    );
    expect(harnessGenerationRefusal(root, 'keel add code-style', 'services')?.message).toMatch(
      /its services have what 'keel add code-style' names already, so there is nothing to run here\.$/,
    );
    expect(
      harnessGenerationRefusal(
        { ...root, harnessGeneration: HARNESS_GENERATION + 1 },
        'keel add ci',
      )?.message,
    ).toContain('upgrade keel');
  });

  it('names no pin for a command the keel that scaffolded the project does not have', () => {
    const { harnessGeneration: _dropped, ...unmarked } = emptyManifestV2(
      '2026-09-13T00:00:00Z',
      '0.5.0-alpha',
    );
    const root = { ...unmarked, services: [{ path: 'backend', stack: 'go-http' }] };
    const [project, product] = [unmarked, root].map(
      (manifest) =>
        harnessGenerationRefusal(manifest, 'keel add entrypoint http', undefined, false)?.message,
    );
    expect(project).toMatch(/, then re-run 'keel add entrypoint http'\.$/);
    expect(product).toMatch(
      /the agent harness is its services', each brought forward in its own directory\.$/,
    );
    for (const message of [project, product]) expect(message).not.toMatch(/\bpin\b/);
  });
});
