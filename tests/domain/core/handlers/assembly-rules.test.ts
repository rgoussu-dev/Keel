/**
 * The assembly rules over what is installed and what comes in,
 * together — in both front doors, on the brownfield card, and in the
 * install loop itself.
 *
 * A rule is declared by the piece whose capability it constrains. It
 * used to be read, on a project already on disk, only for the vertical
 * being added, against the tags the manifest recorded: a rule an
 * *installed* vertical declares, which the newcomer's tags break, went
 * unread — and so did any rule broken by a tag a vertical promotes as
 * it installs, in either phase. No shipped rule is of that kind, so the
 * Scenario is a plugin's.
 *
 * **Scenario.** A plugin preset `acme` whose own vertical, the guard,
 * declares that it will not stand over a loose build; a registered
 * `acme-loosen` whose adapter makes the build loose (it promotes
 * `acme.loose`). Each would install on its own; together they must not.
 * And a preset `acme-tight` whose own rule its own vertical, the
 * loosener, breaks as it installs: legal on the dials, caught only by
 * the install loop.
 *
 * **Factory.** `installMediator` over `registryOf` the plugin's pieces,
 * deferred actions discarded.
 *
 * **Port.** `Mediator.dispatch`: `keel new`, `keel add`,
 * `keel.project-status`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Vertical } from '../../../../src/domain/contract/composition.js';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import { pluginOrigin, registryOf } from '../../../../src/domain/core/registry.js';
import type { Mediator } from '../../../../src/domain/kernel/mediator.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

/* ---- Scenario ---------------------------------------------------- */

const guard: Vertical = {
  id: 'acme-guard',
  title: 'Guard',
  description: 'Stands watch over a tight build.',
  dimensions: ['watch'],
  conflicts: [
    {
      id: 'acme-guard/not-loose',
      when: ['acme.loose'],
      reason: 'the guard will not stand watch over a loose build',
    },
  ],
  adapters: [
    {
      id: 'acme-guard/main',
      vertical: 'acme-guard',
      covers: ['watch'],
      predicate: { requires: ['lang.acme'] },
      contribute: () => ({ files: [{ path: 'guard.txt', content: 'on watch\n' }] }),
    },
  ],
};

const loosen: Vertical = {
  id: 'acme-loosen',
  title: 'Loosen',
  description: 'Relaxes the build.',
  dimensions: ['looseness'],
  promotes: ['acme.loose'],
  adapters: [
    {
      id: 'acme-loosen/main',
      vertical: 'acme-loosen',
      covers: ['looseness'],
      predicate: { requires: ['lang.acme'] },
      contribute: () => ({
        files: [{ path: 'loose.txt', content: 'loose\n' }],
        tagsAdd: ['acme.loose'],
      }),
    },
  ],
};

/** What every refusal of the pair reads, in either phase. */
const SENTENCE =
  "Loosen cannot be installed here: the guard will not stand watch over a loose build (rule 'acme-guard/not-loose')";

/* ---- Factory ----------------------------------------------------- */

let cwd: string;
let mediator: Mediator;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-assembly-rules-'));
  mediator = installMediator({
    runDeferred: () => Promise.resolve(),
    registry: registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [guard, loosen],
        stacks: [
          { id: 'acme', description: 'A guarded build', tags: ['lang.acme'], verticals: [guard] },
          {
            id: 'acme-tight',
            description: 'A build its preset keeps tight',
            tags: ['lang.acme'],
            verticals: [loosen],
            conflicts: [
              {
                id: 'acme-tight/stays-tight',
                when: ['acme.loose'],
                reason: 'this preset keeps its build tight',
              },
            ],
          },
        ],
      },
    ]),
  });
});

afterEach(async () => {
  await fs.remove(cwd);
});

const scaffold = (extraVerticals?: readonly string[]) =>
  mediator.dispatch(
    newProjectCommand({
      cwd,
      stack: 'acme',
      answers: {},
      interactive: false,
      dryRun: extraVerticals !== undefined,
      ...(extraVerticals === undefined ? {} : { extraVerticals }),
    }),
  );

/* ---- Tests ------------------------------------------------------- */

describe('the rules of what is installed and what comes in', () => {
  it('refuse keel add of a vertical whose tags break an installed one’s rule, before a file moves', async () => {
    expectOk(await scaffold());
    const error = expectErr(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['acme-loosen'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toBe(SENTENCE);
    expect(await fs.pathExists(path.join(cwd, 'loose.txt'))).toBe(false);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.verticals.map((v) => v.id)).toEqual(['acme-guard']);
  });

  it('put the same refusal on the card, before the click', async () => {
    expectOk(await scaffold());
    const status = expectOk(await mediator.dispatch(projectStatusQuery({ cwd })));
    expect(status.available.find((v) => v.id === 'acme-loosen')).toEqual(
      expect.objectContaining({
        readiness: 'unavailable',
        refusal: {
          code: 'keel.incompatible',
          message: SENTENCE,
          refusal: expect.objectContaining({
            kind: 'unavailable',
            vertical: 'acme-loosen',
            rules: ['acme-guard/not-loose'],
          }),
        },
      }),
    );
  });

  it('refuse the pair in keel new --with too, in the same sentence', async () => {
    const error = expectErr(await scaffold(['acme-loosen']));
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toBe(SENTENCE);
  });

  it('hold a preset’s own rule over the tags its verticals fold in, before keel new writes a file', async () => {
    // Legal on the dials alone — nothing is loose until the preset's
    // own vertical makes it so — so only the install loop, holding the
    // preset's rule after each fold, can see it.
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'acme-tight',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toBe(
      "Loosen cannot be installed here: this preset keeps its build tight (rule 'acme-tight/stays-tight')",
    );
    expect(await fs.readdir(cwd)).toEqual([]);
  });
});
