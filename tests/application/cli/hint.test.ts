/**
 * The remedy a command line prints under a refusal: built from the
 * refusal's fields, spelled for the command that met it. The engine's
 * sentence is the same in both phases; what to type next is not —
 * `--with` is `keel new`'s, `cd <service> && keel add` is `keel add`'s,
 * and moving a file aside is sound advice only before `keel new`.
 *
 * A table over `refusalHint`, then the two front doors end to end over
 * the real engine: the sentence the domain wrote, and the hint under
 * it.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { refusalHint, type HintedCommand } from '../../../src/application/cli/contract/hint.js';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import { newProjectCommand } from '../../../src/domain/contract/commands.js';
import type { Refusal } from '../../../src/domain/contract/refusal.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { expectOk, installMediator } from '../../support/factory.js';

const persistenceOnCli: Refusal = {
  kind: 'unavailable',
  vertical: 'persistence',
  missing: { entrypoint: ['arch.server-http'] },
  carriedBy: ['quarkus-cli-rest'],
};

const TABLE: readonly {
  readonly why: string;
  readonly refusal: Refusal;
  readonly command: HintedCommand;
  readonly hint: string | null;
}[] = [
  {
    why: 'a missing entrypoint on keel add names the stack that carries both',
    refusal: persistenceOnCli,
    command: 'add',
    hint: "quarkus-cli-rest carries both this project's entrypoints and persistence; a project's entrypoints are fixed at 'keel new'",
  },
  {
    why: 'a missing entrypoint on keel new offers dropping it, or that stack',
    refusal: persistenceOnCli,
    command: 'new',
    hint: "drop 'persistence' from --with, or scaffold quarkus-cli-rest, which carries it: 'keel new --stack=quarkus-cli-rest --with persistence'",
  },
  {
    why: 'an identity gap on keel add leaves it to the sentence, which names the stacks',
    refusal: { ...persistenceOnCli, missing: { identity: ['framework.quarkus'] } },
    command: 'add',
    hint: null,
  },
  {
    why: 'a gap no stack closes on keel new offers only dropping it',
    refusal: { ...persistenceOnCli, missing: { identity: ['lang.go'] }, carriedBy: [] },
    command: 'new',
    hint: "drop 'persistence' from --with",
  },
  {
    why: 'a missing linked project on keel add says to link one first',
    refusal: {
      kind: 'unavailable',
      vertical: 'gateway',
      missing: { peer: ['peer.ui.spa'] },
      carriedBy: [],
    },
    command: 'add',
    hint: "link a project it can wire first — 'keel link <path>' — then add it",
  },
  {
    why: 'a missing linked project on keel new says when linking becomes possible',
    refusal: {
      kind: 'unavailable',
      vertical: 'gateway',
      missing: { peer: ['peer.ui.spa'] },
      carriedBy: [],
    },
    command: 'new',
    hint: "drop 'gateway' from --with; scaffold this project, 'keel link <path>' the one it should reach, then 'keel add gateway'",
  },
  {
    why: 'a rule of the vertical’s own leaves the remedy to the rule, but for --with',
    refusal: { ...persistenceOnCli, because: 'no', rules: ['acme/no'] },
    command: 'add',
    hint: null,
  },
  {
    why: 'a tie names each full line to run',
    refusal: {
      kind: 'needs',
      verticals: ['iac'],
      prerequisites: [
        ['containerization', 'distribution'],
        ['acme-image', 'distribution'],
      ],
    },
    command: 'add',
    hint: "name the one you want: 'keel add containerization distribution iac' or 'keel add acme-image distribution iac'",
  },
  {
    why: 'a tie on keel new names each --with',
    refusal: { kind: 'needs', verticals: ['iac'], prerequisites: [['a'], ['b']] },
    command: 'new',
    hint: "name the one you want: '--with a,iac' or '--with b,iac'",
  },
  {
    why: 'a product root on keel add says where to cd',
    refusal: {
      kind: 'elsewhere',
      vertical: 'persistence',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'unavailable' },
      ],
    },
    command: 'add',
    hint: "'cd backend && keel add persistence'",
  },
  {
    why: 'a composite keel new says to add it in the service afterwards',
    refusal: {
      kind: 'elsewhere',
      vertical: 'ci',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'needs' },
      ],
    },
    command: 'new',
    hint: "scaffold the product, then 'keel add ci' inside backend/ or frontend/",
  },
  {
    why: 'a product root whose services have it already has nothing to add',
    refusal: {
      kind: 'elsewhere',
      vertical: 'vcs',
      services: [{ path: 'backend', stack: 'quarkus-rest', readiness: 'included' }],
    },
    command: 'add',
    hint: null,
  },
  {
    why: 'a file in the way before keel new is the user’s to move',
    refusal: { kind: 'path-conflict', path: 'README.md', adapterId: 'x/y' },
    command: 'new',
    hint: "move 'README.md' aside, or start in an empty directory",
  },
  {
    why: 'a file in the way under keel add may be keel’s own, so no advice',
    refusal: { kind: 'path-conflict', path: 'Dockerfile', adapterId: 'x/y' },
    command: 'add',
    hint: null,
  },
  {
    why: 'verticals that cannot go together on keel new: drop one from --with',
    refusal: { kind: 'incompatible', verticals: ['a', 'b'] },
    command: 'new',
    hint: 'drop one of them from --with',
  },
];

describe('refusalHint', () => {
  it.each(TABLE)('$why', ({ refusal, command, hint }) => {
    expect(refusalHint(refusal, command)).toBe(hint);
  });
});

describe('a refusal at the command line', () => {
  const program = (cwd: string) => {
    const mediator = installMediator({
      logger: new FakeLogger(),
      processes: new FakeProcessRunner(),
      runDeferred: async () => {},
    });
    return {
      mediator,
      run: (args: readonly string[]) =>
        buildProgram({
          mediator,
          logger: new FakeLogger(),
          version: 'test',
          availableStacks: [],
          availableVerticals: [],
          cwd: () => cwd,
          serveUi: () => {
            throw new Error('unexpected UI start');
          },
        }).parseAsync([...args], { from: 'user' }),
    };
  };

  it('prints the one sentence, then the remedy each front door has', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-hint-'));
    try {
      const { mediator, run } = program(cwd);
      const sentence =
        'Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint';
      await expect(
        run(['new', '--stack', 'go-cli', '--with', 'persistence', '--yes', '--dry-run']),
      ).rejects.toThrow(
        `${sentence}\n  hint: drop 'persistence' from --with, or scaffold go-cli-http, which carries it: 'keel new --stack=go-cli-http --with persistence'`,
      );
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'go-cli',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      await expect(run(['add', 'persistence', '--yes', '--dry-run'])).rejects.toThrow(
        `${sentence}\n  hint: go-cli-http carries both this project's entrypoints and persistence; a project's entrypoints are fixed at 'keel new'`,
      );
    } finally {
      await fs.remove(cwd);
    }
  });
});
