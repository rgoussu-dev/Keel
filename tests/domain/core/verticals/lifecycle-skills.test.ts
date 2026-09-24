/**
 * The lifecycle skills over what the verticals actually emit (#139):
 * a component ships a procedure only for something its own files make
 * real, so every claim here has a negative beside it.
 *
 * The e2e cells assert the same pair on a built project, one per
 * family; this sweep is the full matrix — five families × two
 * layouts, plus the two vertical-owned skills and their absence —
 * because the axis is a tag set, not a toolchain, and 10 scaffolds in
 * a second buy what 10 real builds would not.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  newProjectCommand,
  type PresetAnswers,
} from '../../../../src/domain/contract/commands.js';
import {
  ADD_MODULE_SKILL_NAME,
  PROMOTE_SKILL_NAME,
  RUN_SKILL_NAME,
} from '../../../../src/domain/core/adapters/claude-kit.js';
import { MIGRATE_SKILL_NAME } from '../../../../src/domain/core/adapters/migrations-skill.js';
import { DEPLOY_SKILL_NAME } from '../../../../src/domain/core/adapters/deploy-skill.js';
import { agentHarnessVertical } from '../../../../src/domain/core/verticals/agent-harness.js';
import { persistenceVertical } from '../../../../src/domain/core/verticals/persistence.js';
import { iacVertical } from '../../../../src/domain/core/verticals/iac.js';
import { expectOk, installMediator } from '../../../support/factory.js';

/** One cell per family × layout: the two axes the pair turns on. */
const CELLS = [
  { stack: 'quarkus-rest', layout: 'basic' },
  { stack: 'quarkus-rest', layout: 'modulith' },
  { stack: 'go-http', layout: 'basic' },
  { stack: 'go-http', layout: 'modulith' },
  { stack: 'rust-http', layout: 'basic' },
  { stack: 'rust-http', layout: 'modulith' },
  { stack: 'ts-http', layout: 'basic' },
  { stack: 'ts-http', layout: 'modulith' },
  { stack: 'web-components', layout: 'basic' },
  { stack: 'web-components', layout: 'modulith' },
] as const;

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.remove(directory)));
});

async function scaffold(stack: string, moduleLayout?: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-lifecycle-'));
  directories.push(directory);
  const cwd = path.join(directory, 'demo');
  await fs.ensureDir(cwd);
  expectOk(
    await installMediator({ runDeferred: async () => {} }).dispatch(
      newProjectCommand({
        cwd,
        stack,
        ...(moduleLayout === undefined ? {} : { moduleLayout }),
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
  return cwd;
}

const skillDir = (cwd: string, name: string): string =>
  path.join(cwd, '.claude', 'skills', name, 'SKILL.md');

const staged = (cwd: string, name: string): Promise<boolean> => fs.pathExists(skillDir(cwd, name));

/** The `description:` a rendered `SKILL.md` carries. */
async function description(cwd: string, name: string): Promise<string> {
  const skill = await fs.readFile(skillDir(cwd, name), 'utf8');
  return /^description: (.*)$/m.exec(skill)?.[1] ?? '';
}

describe('the layout lifecycle skills', () => {
  it.each(CELLS)('$stack ($layout) ships exactly one of the pair', async ({ stack, layout }) => {
    const cwd = await scaffold(stack, layout);
    const present = layout === 'modulith' ? ADD_MODULE_SKILL_NAME : PROMOTE_SKILL_NAME;
    const absent = layout === 'modulith' ? PROMOTE_SKILL_NAME : ADD_MODULE_SKILL_NAME;
    expect(await staged(cwd, present), `${present} on ${stack} (${layout})`).toBe(true);
    expect(await staged(cwd, absent), `${absent} on ${stack} (${layout})`).toBe(false);
    // The body carries this family's facts, not a generic essay: the
    // gate it names is the one the runbook names.
    const root = await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    const verify = /\| Verify \(commit gate\) \| `(.+?)` \|/.exec(root)?.[1];
    if (verify !== undefined) {
      expect(await fs.readFile(skillDir(cwd, present), 'utf8')).toContain(verify);
    }
  });

  it('declares both names on the vertical, since the layout picks which ships', () => {
    expect(agentHarnessVertical.skills).toEqual([
      RUN_SKILL_NAME,
      ADD_MODULE_SKILL_NAME,
      PROMOTE_SKILL_NAME,
    ]);
  });
});

describe('the vertical-owned lifecycle skills', () => {
  it('ships `migrate` only once persistence is layered, and names its tool', async () => {
    const cwd = await scaffold('quarkus-rest');
    expect(await staged(cwd, MIGRATE_SKILL_NAME)).toBe(false);
    expectOk(
      await installMediator({ runDeferred: async () => {} }).dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['persistence'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await staged(cwd, MIGRATE_SKILL_NAME)).toBe(true);
    const body = await fs.readFile(skillDir(cwd, MIGRATE_SKILL_NAME), 'utf8');
    // The default tool on the JVM is Flyway; the body is the tool's,
    // not a union of both.
    expect(body).toContain('Flyway');
    expect(body).not.toContain('changelog.yaml');
    expect(persistenceVertical.skills).toEqual([MIGRATE_SKILL_NAME]);
  });

  it('ships `migrate` in the Liquibase shape where that is the dial', async () => {
    const cwd = await scaffold('go-http');
    const answers: PresetAnswers = {
      'persistence/database-compose': { migrations: 'liquibase' },
    };
    expectOk(
      await installMediator({ runDeferred: async () => {} }).dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['persistence'],
          answers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const body = await fs.readFile(skillDir(cwd, MIGRATE_SKILL_NAME), 'utf8');
    expect(body).toContain('Liquibase');
    expect(body).toContain('changelog.yaml');
  });

  it('ships `deploy` only once iac is layered — distribution alone is not a target', async () => {
    const cwd = await scaffold('quarkus-rest');
    const mediator = installMediator({ runDeferred: async () => {} });
    expect(await staged(cwd, DEPLOY_SKILL_NAME)).toBe(false);
    for (const vertical of ['containerization', 'distribution']) {
      expectOk(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: [vertical],
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
    }
    expect(await staged(cwd, DEPLOY_SKILL_NAME), 'no target yet').toBe(false);
    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['iac'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await staged(cwd, DEPLOY_SKILL_NAME)).toBe(true);
    const body = await fs.readFile(skillDir(cwd, DEPLOY_SKILL_NAME), 'utf8');
    // Spelled for the cloud and flavor this project recorded.
    expect(body).toContain('iac/digitalocean/');
    expect(body).toContain('DIGITALOCEAN_TOKEN');
    expect(iacVertical.skills).toEqual([DEPLOY_SKILL_NAME]);
  });
});

describe('every emitted skill', () => {
  it('keeps its description to at most two sentences, and to the index row', async () => {
    const cwd = await scaffold('quarkus-rest', 'modulith');
    const names = await fs.readdir(path.join(cwd, '.claude', 'skills'));
    expect(names.sort()).toEqual([ADD_MODULE_SKILL_NAME, RUN_SKILL_NAME]);
    const root = await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    for (const name of names) {
      const text = await description(cwd, name);
      expect(text.split(/(?<=\.)\s+/), `${name}: at most two sentences`).toHaveLength(2);
      expect(root, `${name}: index row`).toContain(`](.claude/skills/${name}/SKILL.md) — ${text}`);
    }
  });
});
