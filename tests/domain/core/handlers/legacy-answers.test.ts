/**
 * A project an earlier keel wrote keeps rendering as it was rendered.
 *
 * Identity answers carry across presets without anything persisted
 * changing: `Question.shared` is a marker on the question, the answers
 * stay keyed by the adapter that asked, and the readers downstream of
 * a bootstrap find the one this project ran by its tags. Two
 * manifests hold that to account.
 *
 *   - One recorded by the keel before this change
 *     (`support/fixtures/manifests/legacy-answers.json`): every
 *     vertical reapplies onto what it wrote, byte for byte.
 *   - One an older keel seeded with another family's bootstrap answers,
 *     as it did with every answer supplied to `keel new`: the readers
 *     that took the first bootstrap in a list with answers split the
 *     package; they now read this project's own.
 *
 * **Scenario.** A scaffold, its manifest's answers replaced by the
 * older one's. **Factory.** `installMediator` over the real templates,
 * deferred actions discarded. **Port.** `Mediator.dispatch`, and the
 * files on disk.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  installCommandFor,
  newProjectCommand,
  type NewProjectTarget,
  type PresetAnswers,
} from '../../../../src/domain/contract/commands.js';
import type { ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { shippedRegistry } from '../../../../src/domain/core/registry.js';
import { expectOk, installMediator } from '../../../support/factory.js';

interface LegacyFixture {
  readonly target: NewProjectTarget;
  readonly supplied: PresetAnswers;
  readonly answers: PresetAnswers;
}

const LEGACY = fs.readJsonSync(
  new URL('../../../support/fixtures/manifests/legacy-answers.json', import.meta.url),
) as LegacyFixture;

const MANIFEST = path.join('.claude', '.keel-manifest.json');

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

const mediator = () => installMediator({ runDeferred: discardDeferred() });

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-legacy-answers-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Every file under `dir` but the manifest, relative to it, with a digest of its bytes. */
const digests = async (dir: string, under = ''): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const entry of await fs.readdir(path.join(dir, under), { withFileTypes: true })) {
    const relative = path.join(under, entry.name);
    if (entry.isDirectory()) Object.assign(out, await digests(dir, relative));
    else if (relative !== MANIFEST) {
      out[relative] = createHash('sha256')
        .update(await fs.readFile(path.join(dir, relative)))
        .digest('hex');
    }
  }
  return out;
};

/** A modulith scaffold of `stack`, its identity answered under `bootstrap`. */
const scaffold = async (stack: string, bootstrap: string): Promise<void> => {
  expectOk(
    await mediator().dispatch(
      newProjectCommand({
        cwd,
        stack,
        moduleLayout: 'modulith',
        answers: { [bootstrap]: { basePackage: 'org.own', projectName: 'own-app' } },
        interactive: false,
        dryRun: false,
      }),
    ),
  );
};

/** Answers for `bootstrap` this project never gave it, as an older keel seeded every one supplied. */
const FOREIGN = (bootstrap: string): PresetAnswers => ({
  [bootstrap]: { basePackage: 'org.foreign', projectName: 'foreign-app' },
});

/** Rewrites the manifest's answers as `answers` gives them. */
const recordAnswers = async (answers: (current: ManifestV2['answers']) => PresetAnswers) => {
  const file = path.join(cwd, MANIFEST);
  const manifest = (await fs.readJson(file)) as ManifestV2;
  await fs.writeJson(file, { ...manifest, answers: answers(manifest.answers) }, { spaces: 2 });
};

describe('a manifest recorded before identity answers were marked shared', () => {
  it('reapplies every vertical onto what it wrote, byte for byte', async () => {
    expectOk(
      await mediator().dispatch(
        installCommandFor(LEGACY.target, {
          cwd,
          answers: LEGACY.supplied,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    await recordAnswers(() => LEGACY.answers);
    const before = await digests(cwd);

    const manifest = (await fs.readJson(path.join(cwd, MANIFEST))) as ManifestV2;
    const reapplied: string[] = [];
    for (const { id } of manifest.verticals) {
      if (shippedRegistry.vertical(id) === null) continue;
      expectOk(
        await mediator().dispatch(
          addVerticalCommand({
            cwd,
            verticals: [id],
            reapply: true,
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      reapplied.push(id);
    }

    expect(reapplied).toEqual(expect.arrayContaining(['walking-skeleton', 'ci', 'distribution']));
    expect(await digests(cwd)).toEqual(before);
    // Nothing about the answers moved: the same keys, the same values.
    expect(((await fs.readJson(path.join(cwd, MANIFEST))) as ManifestV2).answers).toEqual(
      LEGACY.answers,
    );
  });
});

describe('a manifest an older keel seeded with another family’s answers', () => {
  beforeEach(async () => {
    await scaffold('spring-rest', 'walking-skeleton/spring-rest-bootstrap');
    await recordAnswers((current) => ({
      ...FOREIGN('walking-skeleton/quarkus-rest-bootstrap'),
      ...current,
    }));
  });

  it('re-renders its own package, not the first bootstrap’s with answers', async () => {
    const report = expectOk(
      await mediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['walking-skeleton'],
          reapply: true,
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(report.changes.filter((change) => change.path.includes('org/foreign'))).toEqual([]);
  });

  it('names its deploy descriptors after its own project', async () => {
    expectOk(
      await mediator().dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['distribution'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const compose = await fs.readFile(path.join(cwd, 'deploy', 'compose.yaml'), 'utf8');
    expect(compose).toContain('own-app');
    expect(compose).not.toContain('foreign-app');
  });
});

describe('a manifest an older keel seeded with a bootstrap this project never ran', () => {
  it('adds a bounded context under its own package', async () => {
    // A Spring CLI project, with answers under the Spring REST
    // bootstrap too — the first of the two a context adapter used to
    // look under.
    await scaffold('spring-cli', 'walking-skeleton/spring-cli-bootstrap');
    await recordAnswers((current) => ({
      ...FOREIGN('walking-skeleton/spring-rest-bootstrap'),
      ...current,
    }));
    const report = expectOk(
      await mediator().dispatch(
        addModuleCommand({ cwd, module: 'billing', answers: {}, interactive: false, dryRun: true }),
      ),
    );
    const paths = report.changes.map((change) => change.path);
    expect(paths.some((p) => p.includes('org/own/billing'))).toBe(true);
    expect(paths.filter((p) => p.includes('org/foreign'))).toEqual([]);
  });
});
