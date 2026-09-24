/**
 * Answers supplied up front — `--set`, an install body's `answers` —
 * reach only the adapters they are keyed to, through both front doors.
 *
 * `keel new` used to seed every answer into the manifest of every scope
 * it wrote, so a Quarkus bootstrap's package supplied to a Spring
 * project was found by the readers that scan a fixed list of bootstrap
 * ids, and split the package; `keel add` merged any key into the
 * manifest, rewriting an installed vertical's recorded answer without
 * re-rendering a file. Each case here is one of those, now a refusal
 * before anything is written — or, where the answer does belong, the
 * proof that it lands only where it was read.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  newProjectCommand,
  type PresetAnswers,
} from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-answers-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Deferred actions shell out to git and gradle; what is asserted here is the plan and the manifest. */
const mediator = () => installMediator({ runDeferred: () => Promise.resolve() });

const scaffold = (
  stack: string,
  answers: PresetAnswers,
  more: { readonly dryRun?: boolean; readonly extraVerticals?: readonly string[] } = {},
) =>
  mediator().dispatch(
    newProjectCommand({
      cwd,
      stack,
      answers,
      interactive: false,
      dryRun: more.dryRun ?? false,
      ...(more.extraVerticals === undefined ? {} : { extraVerticals: more.extraVerticals }),
    }),
  );

const add = (vertical: string, answers: PresetAnswers, dryRun = false) =>
  mediator().dispatch(addVerticalCommand({ cwd, vertical, answers, interactive: false, dryRun }));

const recordedAnswers = async (dir = cwd) =>
  (await fsManifestStore.read(projectScopeRoot(dir)))?.answers ?? {};

/** Every file under `dir`, relative to it. */
const filesUnder = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(full)).map((f) => `${entry.name}/${f}`));
    else out.push(entry.name);
  }
  return out;
};

describe('keel new — a supplied answer reaches only the adapters it is keyed to', () => {
  const quarkusIdentity: PresetAnswers = {
    'walking-skeleton/quarkus-rest-bootstrap': { basePackage: 'org.acme', projectName: 'demo' },
  };

  it.each([false, true])(
    'refuses another family’s bootstrap answer, naming the adapters that do ask (dry run: %s)',
    async (dryRun) => {
      const error = expectErr(await scaffold('spring-rest', quarkusIdentity, { dryRun }));
      expect(error.code).toBe('keel.unknown-answer');
      expect(error.message).toMatch(
        /^no adapter in this plan reads an answer for walking-skeleton\/quarkus-rest-bootstrap:basePackage; the adapters that take answers here: .*walking-skeleton\/spring-rest-bootstrap/,
      );
      // Refused before the commit either way: a preview must not
      // approve what the install then refuses.
      expect(await fs.readdir(cwd)).toEqual([]);
    },
  );

  it('takes a sibling bootstrap’s answer, and every package follows it', async () => {
    // quarkus-cli's bootstrap is the one quarkus-rest's borrows from,
    // so the answer is read — by the adapter that resolved, which is
    // the only id it is recorded under.
    expectOk(
      await scaffold('quarkus-rest', {
        'walking-skeleton/quarkus-cli-bootstrap': { basePackage: 'org.acme' },
      }),
    );
    const files = await filesUnder(cwd);
    expect(files.filter((f) => f.includes('org/acme')).length).toBeGreaterThan(0);
    expect(files.filter((f) => f.includes('com/example'))).toEqual([]);
    const answers = await recordedAnswers();
    expect(answers['walking-skeleton/quarkus-rest-bootstrap']).toMatchObject({
      basePackage: 'org.acme',
    });
    expect(answers).not.toHaveProperty(['walking-skeleton/quarkus-cli-bootstrap']);
  });

  it('records a product’s answer only in the scope whose adapter took it', async () => {
    expectOk(await scaffold('fullstack', quarkusIdentity));
    expect(
      (await recordedAnswers(path.join(cwd, 'backend')))['walking-skeleton/quarkus-rest-bootstrap'],
    ).toEqual({ basePackage: 'org.acme', projectName: 'demo' });
    // Before, every scope's manifest carried every supplied answer.
    expect(await recordedAnswers(path.join(cwd, 'frontend'))).not.toHaveProperty([
      'walking-skeleton/quarkus-rest-bootstrap',
    ]);
    expect(await recordedAnswers(cwd)).not.toHaveProperty([
      'walking-skeleton/quarkus-rest-bootstrap',
    ]);
  });

  it('holds a supplied value to its question’s choices before a file is written', async () => {
    const error = expectErr(
      await scaffold(
        'quarkus-rest',
        { 'persistence/database-compose': { engine: 'oracle' } },
        { extraVerticals: ['persistence'] },
      ),
    );
    // A plain throw from the engine lookup until now — a 500 in `keel ui`.
    expect(error.code).toBe('keel.invalid-answer');
    expect(error.message).toBe(
      "'oracle' is not a choice for persistence/database-compose:engine; choices: postgres, mariadb",
    );
    expect(await fs.readdir(cwd)).toEqual([]);
  });
});

describe('keel add — a supplied answer reaches only the vertical being added', () => {
  beforeEach(async () => {
    expectOk(await scaffold('quarkus-cli', {}));
  });

  const manifestBytes = () => fs.readFile(path.join(projectScopeRoot(cwd), '.keel-manifest.json'));

  it('refuses an answer for an installed vertical as frozen, and leaves the manifest as it was', async () => {
    const before = await manifestBytes();
    const error = expectErr(await add('ci', { 'vcs/git-init': { defaultBranch: 'trunk' } }));
    expect(error.code).toBe('keel.frozen-answer');
    expect(error.message).toBe(
      'Version control is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for vcs/git-init:defaultBranch)',
    );
    expect((await manifestBytes()).equals(before)).toBe(true);
    expect(await fs.pathExists(path.join(cwd, '.github'))).toBe(false);
  });

  it('refuses one no adapter of the vertical reads, naming the ones that do', async () => {
    const error = expectErr(
      await add('ci', { 'persistence/database-compose': { engine: 'mariadb' } }),
    );
    expect(error.code).toBe('keel.unknown-answer');
    expect(error.message).toBe(
      'no adapter in this plan reads an answer for persistence/database-compose:engine; the adapters that take answers here: ci/jvm-pipeline',
    );
  });

  it('refuses a question its adapter does not ask', async () => {
    const error = expectErr(await add('ci', { 'ci/jvm-pipeline': { provder: 'gitlab-ci' } }));
    expect(error.code).toBe('keel.unknown-answer');
    expect(error.message).toBe("ci/jvm-pipeline asks no question 'provder'; it asks: provider");
  });

  it('holds a supplied value to its question’s choices, and writes nothing', async () => {
    const error = expectErr(await add('ci', { 'ci/jvm-pipeline': { provider: 'bitbucket' } }));
    expect(error.code).toBe('keel.invalid-answer');
    expect(error.message).toBe(
      "'bitbucket' is not a choice for ci/jvm-pipeline:provider; choices: github-actions, gitlab-ci",
    );
    expect(await fs.pathExists(path.join(cwd, '.github'))).toBe(false);
  });

  it('takes a sibling’s answer, and records it only under the adapter that read it', async () => {
    // The CI provider is one question two verticals' adapters share;
    // distribution is not installed, so its key is borrowable.
    expectOk(await add('ci', { 'distribution/jvm-container': { provider: 'gitlab-ci' } }));
    const answers = await recordedAnswers();
    expect(answers['ci/jvm-pipeline']).toEqual({ provider: 'gitlab-ci' });
    expect(answers).not.toHaveProperty(['distribution/jvm-container']);
    expect(await fs.pathExists(path.join(cwd, '.gitlab-ci.yml'))).toBe(true);
  });
});
