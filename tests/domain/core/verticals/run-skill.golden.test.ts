/**
 * The `run` skill's byte-identical migration onto the SkillSpec seam.
 *
 * `run-skill.golden.json` is `.claude/skills/run/SKILL.md` exactly as
 * the five family kits emitted it **before** the seam existed —
 * captured from the last `files:`-entry rendering, one representative
 * shape per family. The install now stages the same file through
 * `Contribution.skills` + `renderSkill`, and byte equality here is
 * the proof the plumbing changed while the product did not.
 *
 * If a family legitimately rewords its run skill, update the golden
 * in the same change — this file pins the seam, not the prose.
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
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import golden from './run-skill.golden.json' with { type: 'json' };

interface Shape {
  readonly tags: readonly string[];
  readonly answers: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** One representative tag set per family — the golden's five keys. */
const SHAPES: Readonly<Record<keyof typeof golden, Shape>> = {
  jvm: {
    tags: [
      'lang.java',
      'runtime.jvm',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ],
    answers: {
      'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'demo', basePackage: 'x.y' },
    },
  },
  go: {
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
    answers: {
      'walking-skeleton/go-bootstrap': {
        projectName: 'shipper',
        modulePath: 'example.com/shipper',
      },
    },
  },
  rust: {
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.server-http', 'arch.cli'],
    answers: { 'walking-skeleton/rust-bootstrap': { projectName: 'ledger' } },
  },
  ts: {
    tags: ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http', 'pkg.pnpm'],
    answers: { 'walking-skeleton/ts-http-bootstrap': { projectName: 'api' } },
  },
  wc: {
    tags: [
      'lang.typescript',
      'runtime.browser',
      'framework.web-components',
      'arch.hexagonal',
      'arch.spa',
      'pkg.npm',
    ],
    answers: { 'walking-skeleton/wc-spa-bootstrap': { projectName: 'shop' } },
  },
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('the run skill, staged through the seam', () => {
  it.each(Object.keys(SHAPES) as (keyof typeof golden)[])(
    'emits the %s family byte-identical to the pre-seam rendering',
    async (family) => {
      const shape = SHAPES[family];
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-run-skill-'));
      cwds.push(cwd);
      const tree = new FsTree(cwd);
      await installVertical({
        vertical: walkingSkeletonVertical,
        manifest: {
          ...emptyManifestV2('2026-08-18T00:00:00Z', '0.5.0-alpha'),
          tags: [...shape.tags],
          answers: shape.answers,
        },
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-08-18T12:00:00Z',
      });
      expect(tree.read('.claude/skills/run/SKILL.md')?.toString()).toBe(golden[family]);
    },
  );
});
