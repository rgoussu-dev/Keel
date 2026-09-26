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
import {
  growNote,
  refusalHint,
  type HintedCommand,
} from '../../../src/application/cli/contract/hint.js';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import { addModuleCommand, newProjectCommand } from '../../../src/domain/contract/commands.js';
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

/** The nearest stack comes with it: its preset installs it of its own. */
const observabilityOnCli: Refusal = {
  kind: 'unavailable',
  vertical: 'observability',
  missing: { entrypoint: ['arch.server-http'] },
  carriedBy: ['quarkus-cli-rest'],
  comesWith: ['quarkus-cli-rest'],
};

/** The same, on a project that can grow the entrypoint it lacks. */
const persistenceGrowing: Refusal = {
  ...persistenceOnCli,
  carriedBy: ['go-cli-http'],
  grow: { entrypoint: 'http', comes: false },
};

/** A gateway on a CLI project lacks the entrypoint and a linked project. */
const gatewayOnCli: Refusal = {
  kind: 'unavailable',
  vertical: 'gateway',
  missing: { entrypoint: ['arch.server-http'], peer: ['peer.ui.spa'] },
  carriedBy: [],
};

/** Refused in a product's front end, whose backend could take it. */
const persistenceInFrontend: Refusal = {
  kind: 'unavailable',
  vertical: 'persistence',
  missing: { identity: ['runtime.node'] },
  carriedBy: [],
  elsewhere: [{ path: 'backend', stack: 'quarkus-rest', readiness: 'ready' }],
};

const TABLE: readonly {
  readonly why: string;
  readonly refusal: Refusal;
  readonly command: HintedCommand;
  readonly hint: string | null;
}[] = [
  {
    // A modulith whose contexts are wired into its one entrypoint, say.
    why: 'an entrypoint a project cannot grow, on keel add, names the stack that carries both',
    refusal: persistenceOnCli,
    command: 'add',
    hint: "quarkus-cli-rest carries both this project's entrypoints and persistence",
  },
  {
    why: 'an entrypoint the project can grow, on keel add, is the command to run first',
    refusal: persistenceGrowing,
    command: 'add',
    hint: "'keel add entrypoint http', then 'keel add persistence'",
  },
  {
    why: 'an entrypoint the vertical comes with, on keel add, is all there is to run',
    refusal: { ...observabilityOnCli, grow: { entrypoint: 'http', comes: true } },
    command: 'add',
    hint: "'keel add entrypoint http' brings observability with it",
  },
  {
    // It used to get no hint: no stack comes with a linked project.
    why: 'an entrypoint and a linked project, on keel add, are both run first',
    refusal: { ...gatewayOnCli, grow: { entrypoint: 'http', comes: false } },
    command: 'add',
    hint: "'keel add entrypoint http', then 'keel link <path>' a project it can wire, then 'keel add gateway'",
  },
  {
    why: 'an entrypoint and a linked project a project cannot grow, on keel add, leave it to the sentence',
    refusal: gatewayOnCli,
    command: 'add',
    hint: null,
  },
  {
    // Only a project on disk grows; a preset is chosen instead.
    why: 'an entrypoint on keel new is another stack to scaffold, whatever the refusal carries',
    refusal: persistenceGrowing,
    command: 'new',
    hint: "drop 'persistence' from --with, or scaffold go-cli-http, which carries it: 'keel new --stack=go-cli-http --with persistence'",
  },
  {
    why: 'a rule of the vertical’s own leaves the remedy to the rule, whatever the refusal carries',
    refusal: { ...persistenceGrowing, because: 'no', rules: ['acme/no'] },
    command: 'add',
    hint: null,
  },
  {
    why: 'a missing entrypoint on keel new offers dropping it, or that stack',
    refusal: persistenceOnCli,
    command: 'new',
    hint: "drop 'persistence' from --with, or scaffold quarkus-cli-rest, which carries it: 'keel new --stack=quarkus-cli-rest --with persistence'",
  },
  {
    why: 'an entrypoint a project cannot grow, on keel add, names the stack that comes with it, as coming with it',
    refusal: observabilityOnCli,
    command: 'add',
    hint: "quarkus-cli-rest has this project's entrypoints and comes with observability",
  },
  {
    // Naming it there would only be set aside, as already there.
    why: 'a missing entrypoint on keel new scaffolds the stack that comes with it, naming nothing',
    refusal: observabilityOnCli,
    command: 'new',
    hint: "drop 'observability' from --with, or scaffold quarkus-cli-rest, which comes with it: 'keel new --stack=quarkus-cli-rest'",
  },
  {
    // The hint names the first nearest stack, and is worded by it.
    why: 'several nearest stacks are worded by the first, which carries it only as an extra',
    refusal: {
      ...observabilityOnCli,
      carriedBy: ['acme-cli-rest', 'quarkus-cli-rest'],
      comesWith: ['quarkus-cli-rest'],
    },
    command: 'new',
    hint: "drop 'observability' from --with, or scaffold acme-cli-rest, which carries it: 'keel new --stack=acme-cli-rest --with observability'",
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
    why: 'a build system alone on keel new points at the dial, not at another stack',
    refusal: {
      kind: 'unavailable',
      vertical: 'distribution',
      missing: { identity: ['pkg.gradle'] },
      carriedBy: ['quarkus-cli-rest'],
    },
    command: 'new',
    hint: "drop 'distribution' from --with, or choose the build system it needs with --build-system",
  },
  {
    why: 'a build system alone on keel add leaves it to the sentence, which names it',
    refusal: {
      kind: 'unavailable',
      vertical: 'distribution',
      missing: { identity: ['pkg.gradle'] },
      carriedBy: ['quarkus-cli-rest'],
    },
    command: 'add',
    hint: null,
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
    why: 'an installed vertical to re-render on keel add names the run that re-renders it',
    refusal: {
      kind: 'unavailable',
      vertical: 'iac',
      missing: {},
      carriedBy: [],
      refresh: { verticals: ['distribution'], prerequisites: ['containerization'] },
    },
    command: 'add',
    hint: "re-render it in the same run: 'keel add iac --refresh distribution'",
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
    why: 'a composite keel new two services could take says to name one',
    refusal: {
      kind: 'elsewhere',
      vertical: 'ci',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'needs' },
      ],
    },
    command: 'new',
    hint: "name the service it goes in: '--with backend:ci' or '--with frontend:ci'",
  },
  {
    why: 'a composite keel new no service can take says to drop it',
    refusal: {
      kind: 'elsewhere',
      vertical: 'gateway',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'included' },
        { path: 'frontend', stack: 'web-components', readiness: 'included' },
      ],
    },
    command: 'new',
    hint: "drop 'gateway' from --with",
  },
  {
    // Adding it there is an Ok that adds nothing; only a re-render of
    // it at the root is refused, and it is theirs.
    why: 'a product root whose services have it re-renders it in each',
    refusal: {
      kind: 'elsewhere',
      vertical: 'code-style',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'included' },
        { path: 'frontend', stack: 'web-components', readiness: 'included' },
      ],
    },
    command: 'add',
    hint: "'cd backend && keel add code-style --reapply' or 'cd frontend && keel add code-style --reapply'",
  },
  {
    // A service the root builds it for has nothing of it to re-render.
    why: 'a product root re-renders it only in the services that installed it',
    refusal: {
      kind: 'elsewhere',
      vertical: 'containerization',
      services: [
        { path: 'backend', stack: 'spring-rest-kotlin', readiness: 'included' },
        { path: 'frontend', stack: 'web-components', readiness: 'included', fromProduct: true },
      ],
    },
    command: 'add',
    hint: "'cd backend && keel add containerization --reapply'",
  },
  {
    why: 'a product root that builds it for every service has no re-render to name',
    refusal: {
      kind: 'elsewhere',
      vertical: 'containerization',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'included', fromProduct: true },
        { path: 'frontend', stack: 'web-components', readiness: 'included', fromProduct: true },
      ],
    },
    command: 'add',
    hint: null,
  },
  {
    why: 'a product root none of whose services has or takes it has nothing to add',
    refusal: {
      kind: 'elsewhere',
      vertical: 'observability',
      services: [{ path: 'frontend', stack: 'web-components', readiness: 'unavailable' }],
    },
    command: 'add',
    hint: null,
  },
  {
    why: 'a file in the way before keel new is the user’s to move',
    refusal: { kind: 'path-conflict', path: 'go.mod', adapterId: 'x/y' },
    command: 'new',
    hint: "move 'go.mod' aside, or start in an empty directory",
  },
  {
    why: 'a name a patched file already uses is not a file to move aside: the sentence says to rename it',
    refusal: {
      kind: 'path-conflict',
      path: 'MediatorFactory.kt',
      adapterId: 'x/y',
      taken: 'clock',
    },
    command: 'new',
    hint: null,
  },
  {
    why: 'a step keel leaves to the user is not a file to move aside: the sentence names the step',
    refusal: {
      kind: 'path-conflict',
      path: '.devcontainer/devcontainer.json',
      adapterId: 'x/y',
      manual: 'attach it to the dev environment',
    },
    command: 'new',
    hint: null,
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

  it("spells a remedy for a product's service in the pair it was named in, and offers no other stack", () => {
    const named = {
      backend: { extraVerticals: ['iac'] },
      frontend: { extraVerticals: ['persistence'] },
    };
    // Another stack to scaffold would be another product.
    expect(refusalHint(persistenceOnCli, 'new', named)).toBe(
      "drop 'frontend:persistence' from --with",
    );
    expect(
      refusalHint(
        { kind: 'needs', verticals: ['iac'], prerequisites: [['a'], ['b']] },
        'new',
        named,
      ),
    ).toBe(
      "name the one you want: '--with backend:a,backend:iac' or '--with backend:b,backend:iac'",
    );
    // `keel add` names no service: it runs in one.
    expect(refusalHint(persistenceOnCli, 'add', named)).toBe(
      "quarkus-cli-rest carries both this project's entrypoints and persistence",
    );
  });

  it("names back a product's service that can take what another cannot, and none that has it", () => {
    const named = { frontend: { extraVerticals: ['persistence'] } };
    expect(refusalHint(persistenceInFrontend, 'new', named)).toBe(
      "drop 'frontend:persistence' from --with, or name backend/: '--with backend:persistence'",
    );
    const three: Refusal = {
      ...persistenceInFrontend,
      elsewhere: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'worker', stack: 'quarkus-rest', readiness: 'needs' },
        { path: 'admin', stack: 'web-components', readiness: 'unavailable' },
      ],
    };
    expect(refusalHint(three, 'new', named)).toBe(
      "drop 'frontend:persistence' from --with, or name another service: '--with backend:persistence' or '--with worker:persistence'",
    );
    // One that has it already needs nothing named.
    const having: Refusal = {
      ...persistenceInFrontend,
      vertical: 'observability',
      elsewhere: [{ path: 'backend', stack: 'quarkus-rest', readiness: 'included' }],
    };
    expect(refusalHint(having, 'new', { frontend: { extraVerticals: ['observability'] } })).toBe(
      "drop 'frontend:observability' from --with",
    );
    // Named for the service that takes it too: dropping the refused
    // pair is all there is, spelled for the service refused.
    expect(
      refusalHint(persistenceInFrontend, 'new', {
        ...named,
        backend: { extraVerticals: ['persistence'] },
      }),
    ).toBe("drop 'frontend:persistence' from --with");
    // Without the field, the pair to drop, as before.
    const { elsewhere: _dropped, ...alone } = persistenceInFrontend;
    expect(refusalHint(alone, 'new', named)).toBe("drop 'frontend:persistence' from --with");
  });
});

describe('growNote', () => {
  it('says what an entrypoint makes of a vertical it lets in, as its hint does', () => {
    expect(growNote({ ...observabilityOnCli, grow: { entrypoint: 'http', comes: true } })).toBe(
      ', which comes with it',
    );
    expect(growNote(persistenceGrowing)).toBe('');
    expect(growNote({ ...gatewayOnCli, grow: { entrypoint: 'http', comes: false } })).toBe(
      ", once 'keel link <path>' links a project it can wire",
    );
    // No action, nothing to say: the sentence is the listing's.
    expect(growNote(persistenceOnCli)).toBe('');
    expect(growNote(gatewayOnCli)).toBe('');
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
      // One sentence in both phases; the project on disk can grow the
      // entrypoint it lacks, which is the remedy only it has.
      await expect(run(['add', 'persistence', '--yes', '--dry-run'])).rejects.toThrow(
        `${sentence}\n  hint: 'keel add entrypoint http', then 'keel add persistence'`,
      );
      await expect(run(['add', 'observability', '--yes', '--dry-run'])).rejects.toThrow(
        "Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint\n  hint: 'keel add entrypoint http' brings observability with it",
      );
      await expect(run(['add', 'gateway', '--yes', '--dry-run'])).rejects.toThrow(
        "Service gateway needs an entrypoint this project does not have: HTTP server — a REST endpoint\n  hint: 'keel add entrypoint http', then 'keel link <path>' a project it can wire, then 'keel add gateway'",
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it('names the stack that carries both where the project cannot grow the entrypoint', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-hint-'));
    try {
      const { mediator, run } = program(cwd);
      // The peer context is wired into the CLI alone, and keel does not
      // yet wire a JVM context into a new entrypoint: growth refuses, so
      // the refusal carries no action and the hint offers none.
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'quarkus-cli',
            answers: {},
            interactive: false,
            dryRun: false,
            moduleLayout: 'modulith',
            withPeerContext: true,
          }),
        ),
      );
      await expect(run(['add', 'persistence', '--yes', '--dry-run'])).rejects.toThrow(
        "Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint\n  hint: quarkus-cli-rest carries both this project's entrypoints and persistence",
      );
      await expect(run(['add', 'gateway', '--yes', '--dry-run'])).rejects.toThrow(
        /^Service gateway needs an entrypoint this project does not have: HTTP server — a REST endpoint$/,
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it('carries the action on a Go modulith whose contexts growing wires into the new entrypoint', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-hint-'));
    try {
      const { mediator, run } = program(cwd);
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'go-cli',
            answers: {},
            interactive: false,
            dryRun: false,
            moduleLayout: 'modulith',
            withPeerContext: true,
          }),
        ),
      );
      expectOk(
        await mediator.dispatch(
          addModuleCommand({
            cwd,
            module: 'orders',
            consumes: 'greeting',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      await expect(run(['add', 'persistence', '--yes', '--dry-run'])).rejects.toThrow(
        "Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint\n  hint: 'keel add entrypoint http', then 'keel add persistence'",
      );
      await expect(run(['add', 'observability', '--yes', '--dry-run'])).rejects.toThrow(
        "Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint\n  hint: 'keel add entrypoint http' brings observability with it",
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it('scaffolds the stack that comes with it, naming nothing more', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-hint-'));
    try {
      const { run } = program(cwd);
      await expect(
        run(['new', '--stack', 'quarkus-cli', '--with', 'observability', '--yes', '--dry-run']),
      ).rejects.toThrow(
        "Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint\n  hint: drop 'observability' from --with, or scaffold quarkus-cli-rest, which comes with it: 'keel new --stack=quarkus-cli-rest'",
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it("names the service back in a product's --with pair, not a stack to scaffold instead", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-cli-hint-'));
    try {
      const { run } = program(cwd);
      for (const layout of ['monorepo', 'polyrepo']) {
        await expect(
          run([
            'new',
            '--stack',
            'fullstack',
            '--layout',
            layout,
            '--with',
            'frontend:persistence',
            '--yes',
            '--dry-run',
          ]),
        ).rejects.toThrow(
          "Persistence has no adapter for this project's stack; backend/ can take it\n  hint: drop 'frontend:persistence' from --with, or name backend/: '--with backend:persistence'",
        );
      }
      await expect(
        run([
          'new',
          '--stack',
          'fullstack',
          '--with',
          'frontend:observability',
          '--yes',
          '--dry-run',
        ]),
      ).rejects.toThrow(
        "Observability has no adapter for this project's stack; backend/ has it already\n  hint: drop 'frontend:observability' from --with",
      );
      await expect(
        run(['new', '--stack', 'fullstack', '--with', 'backend:ci', '--yes', '--dry-run']),
      ).rejects.toThrow(/\n {2}hint: drop 'backend:ci' from --with$/);
    } finally {
      await fs.remove(cwd);
    }
  });
});
