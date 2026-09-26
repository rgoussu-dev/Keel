/**
 * `keel.project-status` — what a front end reads before it offers
 * anything, and what `keel add --list` prints.
 *
 * The point of the query is that every field here is the answer the
 * brownfield command's own front door would give, read before it is
 * run. So the tests scaffold real projects and hold the status to what
 * `keel add` actually does:
 *
 *   - a vertical already installed is not in `available`, and every
 *     other one is, with its readiness — `ready`, `needs` with what it
 *     needs first, or `unavailable` carrying the refusal `keel add`
 *     gives it, code and sentence alike (the composition grid holds
 *     every card of every stack to that; these pin the shape);
 *   - `canAddModule` is false in exactly the cases `add module`
 *     refuses before it looks at the name, and `moduleRefusal` is that
 *     refusal;
 *   - `harnessGeneration` reports the marker once, beside the one this
 *     keel writes;
 *   - `profile` is the project in words — the preset its tags read as,
 *     the drill-down's answers and its dials — never a tag;
 *   - an installed vertical is `reapplicable` exactly where
 *     `keel add <id> --reapply` names something it can re-render — not
 *     a product's glue, not a bounded context;
 *   - `entrypoints` says of each back entrypoint whether the project
 *     has it, and where it does not, what `keel add entrypoint` would
 *     install, or that command's refusal; a card only that entrypoint
 *     stops carries it as its action (`grow`), the same on the card and
 *     on the click, and kept once the project has grown.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addEntrypointCommand,
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
  type NewProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  projectScopeRoot,
} from '../../../../src/domain/contract/manifest.js';
import { catalogQuery, projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import { RefusalError } from '../../../../src/domain/contract/refusal.js';
import type {
  AvailableVerticalDescriptor,
  ProjectStatus,
} from '../../../../src/domain/contract/queries.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { pluginOrigin, registryOf, shippedSource } from '../../../../src/domain/core/registry.js';
import type { Mediator } from '../../../../src/domain/kernel/mediator.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;
let mediator: Mediator;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-status-'));
  mediator = installMediator({ runDeferred: discardDeferred() });
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function scaffold(options: { stack?: string; moduleLayout?: string } = {}): Promise<void> {
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: options.stack ?? 'ts-cli',
        answers: {},
        interactive: false,
        dryRun: false,
        ...(options.moduleLayout === undefined ? {} : { moduleLayout: options.moduleLayout }),
      }),
    ),
  );
}

const status = async (at: string = cwd): Promise<ProjectStatus> =>
  expectOk(await mediator.dispatch(projectStatusQuery({ cwd: at })));

const card = (reported: ProjectStatus, id: string): AvailableVerticalDescriptor | undefined =>
  reported.available.find((vertical) => vertical.id === id);

/** What `keel add <id>` answers here — as a dry run, unless told otherwise. */
const add = (id: string, dryRun = true) =>
  mediator.dispatch(
    addVerticalCommand({ cwd, verticals: [id], answers: {}, interactive: false, dryRun }),
  );

describe('keel.project-status', () => {
  it('reports an empty directory as uninitialised rather than failing', async () => {
    const reported = await status();
    expect(reported.initialised).toBe(false);
    expect(reported.scopeRoot).toBe(path.join(cwd, '.claude'));
    expect(reported.available).toEqual([]);
    expect(reported.canAddModule).toBe(false);
    expect(reported.moduleRefusal?.code).toBe('keel.not-initialised');
    expect(reported).not.toHaveProperty('harnessGeneration');
  });

  it('splits the registry into installed and available', async () => {
    await scaffold();
    const reported = await status();
    expect(reported.initialised).toBe(true);
    const installed = reported.installed.map((vertical) => vertical.id);
    const available = reported.available.map((vertical) => vertical.id);
    expect(installed).toContain('walking-skeleton');
    expect(available).toContain('ci');
    // The two halves never overlap: that is what makes "offer this"
    // and "offer a reapply of this" different controls.
    expect(installed.filter((id) => available.includes(id))).toEqual([]);
    expect(reported.installed[0]?.description).not.toBe('');
  });

  it('says what the project is in words, the preset its manifest reads as among them', async () => {
    expect((await status()).profile).toEqual({ preset: null, facts: [] });
    await scaffold({ stack: 'go-http', moduleLayout: 'modulith' });
    // The manifest records tags, not a preset id; read back, they are
    // the answers `keel new` was given, and the preset they lead to.
    expect((await status()).profile).toEqual({
      preset: 'go-http',
      facts: [
        { label: 'Building', value: 'Backend or tool' },
        { label: 'Language', value: 'Go' },
        { label: 'Adapters', value: 'HTTP server' },
        { label: 'Module layout', value: 'modulith' },
      ],
    });
  });

  it('reads the preset a project was scaffolded from, whatever a vertical added since', async () => {
    // Distribution alone ships a Quarkus CLI as native binaries, and
    // folds a native-runtime tag in beside the JVM one: the project is
    // still quarkus-cli, written in Java.
    await scaffold({ stack: 'quarkus-cli' });
    const before = (await status()).profile;
    expect(before.preset).toBe('quarkus-cli');
    expectOk(await add('distribution', false));
    expect((await status()).profile).toEqual(before);
  });

  it('reads each card as keel add would: ready, needing others first, or refused in its words', async () => {
    await scaffold({ stack: 'go-http' });
    const reported = await status();

    expect(card(reported, 'ci')).toMatchObject({ readiness: 'ready', requires: [] });
    expect(card(reported, 'ci')).not.toHaveProperty('refusal');
    // Installed with what it needs, in the order they install.
    expect(card(reported, 'iac')).toMatchObject({
      readiness: 'needs',
      requires: ['containerization', 'distribution'],
    });
    expect(card(reported, 'iac')).not.toHaveProperty('refusal');
    expectOk(await add('iac'));

    // A gateway with nothing linked to wire is a card too, now: it says
    // why before the click, exactly as the click would.
    const gateway = card(reported, 'gateway');
    const refused = expectErr(await add('gateway'));
    expect(gateway?.readiness).toBe('unavailable');
    expect(gateway?.refusal).toEqual({
      code: refused.code,
      message: refused.message,
      refusal: expect.objectContaining({ kind: 'unavailable', vertical: 'gateway' }),
    });
  });

  it('carries on an unavailable card the refusal keel add gives, code and sentence', async () => {
    await scaffold();
    const reported = await status();
    const observability = card(reported, 'observability');
    const refused = expectErr(await add('observability'));
    expect(observability).toMatchObject({ readiness: 'unavailable', requires: [] });
    expect(observability?.refusal?.code).toBe(refused.code);
    expect(observability?.refusal?.message).toBe(refused.message);
    expect(observability?.refusal?.message).toBe(
      'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    );
    expect(observability?.refusal?.refusal).toMatchObject({
      kind: 'unavailable',
      missing: { entrypoint: ['arch.server-http'] },
    });
  });

  it('reports the harness generation once, beside the one this keel writes', async () => {
    await scaffold();
    expect((await status()).harnessGeneration).toEqual({
      found: HARNESS_GENERATION,
      expected: HARNESS_GENERATION,
    });

    const file = path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);
    const { harnessGeneration: _dropped, ...unmarked } = JSON.parse(
      await fs.readFile(file, 'utf8'),
    ) as Record<string, unknown>;
    await fs.writeFile(file, JSON.stringify(unmarked));
    const stale = await status();
    expect(stale.harnessGeneration).toEqual({ found: null, expected: HARNESS_GENERATION });
    // Not on every card: the gate refuses them all alike, and the one
    // field says so once — nor on the entrypoint the project lacks.
    expect(card(stale, 'ci')).toMatchObject({ readiness: 'ready' });
    expect(stale.entrypoints?.find((each) => each.word === 'http')).toEqual({
      word: 'http',
      label: 'HTTP server — a REST endpoint',
      present: false,
      installs: ['dev-env', 'observability'],
    });
    expect(expectErr(await add('ci')).code).toBe('keel.harness-generation');
  });

  it('refuses a context on the flat layout, exactly as the handler does', async () => {
    await scaffold({ moduleLayout: 'basic' });
    const reported = await status();
    expect(reported.canAddModule).toBe(false);
    const refused = expectErr(
      await mediator.dispatch(
        addModuleCommand({
          cwd,
          module: 'billing',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(refused.code).toBe('keel.incompatible');
    expect(refused).toBeInstanceOf(RefusalError);
    expect(reported.moduleRefusal).toEqual({
      code: refused.code,
      message: refused.message,
      refusal: (refused as RefusalError).refusal,
    });
  });

  it('allows a context on the modulith, and names the ones already taken', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const reported = await status();
    expect(reported.moduleLayout).toBe('modulith');
    expect(reported.canAddModule).toBe(true);
    expect(reported).not.toHaveProperty('moduleRefusal');
    expect(reported.modules).toEqual([expect.objectContaining({ name: 'greeting', seam: true })]);
  });

  it('says which installed verticals keel add --reapply can re-render', async () => {
    await scaffold({ moduleLayout: 'modulith' });
    const before = await status();
    expect(before.installed.every((vertical) => vertical.reapplicable)).toBe(true);
    expectOk(await add('ci', false));
    expect((await status()).installed.find((vertical) => vertical.id === 'ci')).toMatchObject({
      reapplicable: true,
    });

    // `keel add module` records the context as installed, and no
    // `keel add <id>` names it: a re-render of it is refused as unknown,
    // so the status says it is not one to offer.
    expectOk(
      await mediator.dispatch(
        addModuleCommand({
          cwd,
          module: 'billing',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const after = await status();
    const context = after.installed.find((vertical) => vertical.id === 'bounded-context');
    expect(context).toMatchObject({ title: 'Bounded context', reapplicable: false });
    expect(
      expectErr(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['bounded-context'],
            answers: {},
            interactive: false,
            dryRun: true,
            reapply: true,
          }),
        ),
      ).code,
    ).toBe('keel.unknown-vertical');
  });

  it('refuses a context at a composite product root', async () => {
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack-ts',
          answers: {},
          interactive: false,
          dryRun: false,
          layout: 'monorepo',
        }),
      ),
    );
    const reported = await status();
    expect(reported.services.map((service) => service.path)).toEqual(['backend', 'frontend']);
    // The root records its services, not its preset: they name it.
    expect(reported.profile.preset).toBe('fullstack-ts');
    expect(reported.canAddModule).toBe(false);
    expect(reported.moduleRefusal).toMatchObject({ code: 'keel.invalid-module' });
    expect(reported.moduleRefusal?.message).toContain(
      "run 'keel add module <name>' inside the service directory",
    );
    // The product's glue is recorded as installed, by title, and no
    // `keel add` re-renders it.
    expect(reported.installed.find((vertical) => vertical.id === 'fullstack')).toMatchObject({
      title: 'Product root',
      reapplicable: false,
    });
    // At the root, a card is the root's redirect: the capability goes in
    // a service, and the card names which.
    const persistence = card(reported, 'persistence');
    const refused = expectErr(await add('persistence'));
    expect(persistence?.readiness).toBe('unavailable');
    expect(persistence?.refusal).toMatchObject({
      code: refused.code,
      message: refused.message,
      refusal: { kind: 'elsewhere', vertical: 'persistence' },
    });
  });
});

describe('the entrypoints', () => {
  const HTTP = 'HTTP server — a REST endpoint';
  const CLI = 'CLI — a command-line entrypoint';

  const scaffoldAs = async (
    stack: string,
    extra: Partial<Omit<NewProjectCommand, 'kind' | 'intent'>> = {},
  ): Promise<void> => {
    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack, answers: {}, interactive: false, dryRun: false, ...extra }),
      ),
    );
  };

  /** What `keel add entrypoint <word>` answers in `at`, as a dry run. */
  const grow = (word: string, at: string = cwd) =>
    mediator.dispatch(
      addEntrypointCommand({
        cwd: at,
        entrypoint: word,
        answers: {},
        interactive: false,
        dryRun: true,
      }),
    );

  const growthOf = (reported: ProjectStatus, id: string) => {
    const refusal = card(reported, id)?.refusal?.refusal;
    return refusal?.kind === 'unavailable' ? refusal.grow : undefined;
  };

  it('offers the entrypoint a CLI project lacks, and names it as the way in on each card it stops', async () => {
    await scaffoldAs('go-cli');
    const reported = await status();
    // The server brings what the preset with both has and this lacks.
    expect(reported.entrypoints).toEqual([
      { word: 'cli', label: CLI, present: true },
      { word: 'http', label: HTTP, present: false, installs: ['dev-env', 'observability'] },
    ]);
    expectOk(await grow('http'));

    // It comes with the server, as the preset with both has it.
    expect(growthOf(reported, 'observability')).toEqual({ entrypoint: 'http', comes: true });
    // Its own add, once the server is there — after a link, for a gateway.
    for (const id of ['persistence', 'containerization', 'distribution', 'iac', 'gateway']) {
      expect(growthOf(reported, id)).toEqual({ entrypoint: 'http', comes: false });
    }
    // Word for word what the click gets, the action included.
    for (const id of ['observability', 'persistence', 'gateway']) {
      const refused = expectErr(await add(id));
      expect(refused).toBeInstanceOf(RefusalError);
      expect(card(reported, id)?.refusal).toEqual({
        code: refused.code,
        message: refused.message,
        refusal: (refused as RefusalError).refusal,
      });
    }
    // The sentence is the one `keel new --with` gives: no command in it.
    expect(card(reported, 'persistence')?.refusal?.message).toBe(
      'Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    );
    // What the entrypoint does not stop carries nothing.
    expect(card(reported, 'ci')).not.toHaveProperty('refusal');
  });

  it.each([
    ['as keel new leaves it', {}],
    ['without the agent harness', { agentHarness: false }],
    ['as a modulith', { moduleLayout: 'modulith' }],
  ])(
    'keeps what it promises once the project has grown, on every CLI and build system, %s',
    async (_, dials) => {
      const { stacks } = expectOk(await mediator.dispatch(catalogQuery()));
      const clis = stacks.filter(
        (stack) =>
          stack.services.length === 0 &&
          stack.tags.includes('arch.cli') &&
          !stack.tags.includes('arch.server-http'),
      );
      expect(clis.length).toBeGreaterThan(0);
      const grown = new Set<string>();
      for (const stack of clis) {
        // A preset that builds one way offers no build system to choose.
        const buildSystems =
          stack.buildSystems.length === 0 ? [undefined] : stack.buildSystems.map(({ id }) => id);
        for (const buildSystem of buildSystems) {
          const where = buildSystem === undefined ? stack.id : `${stack.id} on ${buildSystem}`;
          const at = path.join(cwd, `${stack.id}-${buildSystem ?? 'only'}`);
          await scaffoldAs(stack.id, {
            cwd: at,
            ...dials,
            ...(buildSystem === undefined ? {} : { buildSystem }),
          });
          const before = await status(at);
          const promised = before.available.flatMap((each) => {
            const refusal = each.refusal?.refusal;
            return refusal?.kind === 'unavailable' && refusal.grow !== undefined
              ? [{ id: each.id, comes: refusal.grow.comes }]
              : [];
          });
          const installs = before.entrypoints?.find((each) => each.word === 'http')?.installs;
          expect(promised, where).toContainEqual({ id: 'observability', comes: true });
          expectOk(
            await mediator.dispatch(
              addEntrypointCommand({
                cwd: at,
                entrypoint: 'http',
                answers: {},
                interactive: false,
                dryRun: false,
              }),
            ),
          );
          const after = await status(at);
          const had = new Set(before.installed.map((each) => each.id));
          const installed = after.installed.map((each) => each.id);
          // What the entrypoint said it installs is what it installed.
          expect(installed.filter((id) => !had.has(id)).sort(), where).toEqual(
            [...(installs ?? [])].sort(),
          );
          for (const { id, comes } of promised) {
            if (comes) {
              expect(installed, `${id} on ${where}`).toContain(id);
              continue;
            }
            // Its own add takes it now — after a link, where it waits on one.
            const now = card(after, id);
            const refusal = now?.refusal?.refusal;
            if (now?.readiness === 'unavailable' && refusal?.kind === 'unavailable') {
              expect(Object.keys(refusal.missing), `${id} on ${where}`).toEqual(['peer']);
              expect(refusal.missing.peer?.length, `${id} on ${where}`).toBeGreaterThan(0);
              expect(refusal, `${id} on ${where}`).not.toHaveProperty('refresh');
              expect(refusal, `${id} on ${where}`).not.toHaveProperty('because');
            } else {
              expect(['ready', 'needs'], `${id} on ${where}`).toContain(now?.readiness);
            }
          }
          grown.add(stack.id);
        }
      }
      // Every CLI preset, whether or not it offers a build system to choose.
      expect([...grown].sort()).toEqual(clis.map((stack) => stack.id).sort());
    },
  );

  it('offers the CLI an HTTP project lacks, which stops no card', async () => {
    await scaffoldAs('quarkus-rest');
    const reported = await status();
    expect(reported.entrypoints).toEqual([
      { word: 'cli', label: CLI, present: false, installs: [] },
      { word: 'http', label: HTTP, present: true },
    ]);
    expectOk(await grow('cli'));
    expect(reported.available.filter((each) => growthOf(reported, each.id) !== undefined)).toEqual(
      [],
    );
  });

  it('says why where growth is refused, and offers it on no card', async () => {
    await scaffoldAs('go-cli', { moduleLayout: 'modulith', withPeerContext: true });
    const reported = await status();
    const refused = expectErr(await grow('http'));
    expect(refused.code).toBe('keel.contexts-need-rewiring');
    expect(reported.entrypoints?.[1]).toEqual({
      word: 'http',
      label: HTTP,
      present: false,
      refusal: { code: refused.code, message: refused.message },
    });
    // Still refused for the entrypoint, in the same words, and with no
    // action a click on it would refuse.
    expect(card(reported, 'observability')?.refusal?.message).toBe(
      'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    );
    expect(reported.available.filter((each) => growthOf(reported, each.id) !== undefined)).toEqual(
      [],
    );
  });

  it('refuses both on a front end, as the command does', async () => {
    await scaffoldAs('web-components');
    const reported = await status();
    for (const [index, word] of ['cli', 'http'].entries()) {
      const refused = expectErr(await grow(word));
      expect(refused.code).toBe('keel.uncoverable-entrypoint');
      expect(reported.entrypoints?.[index]).toMatchObject({
        word,
        present: false,
        refusal: { code: refused.code, message: refused.message },
      });
    }
  });

  it('refuses both inside a monorepo product, at its root and in a service, and offers none', async () => {
    await scaffoldAs('fullstack-go', { layout: 'monorepo' });
    const backend = path.join(cwd, 'backend');
    for (const [at, cells] of [
      [cwd, 2],
      [backend, 1],
    ] as const) {
      const reported = await status(at);
      const refused = expectErr(await grow('cli', at));
      expect(refused.code).toBe('keel.wrong-scope');
      const absent = (reported.entrypoints ?? []).filter((each) => !each.present);
      expect(absent).toHaveLength(cells);
      // The one a service has is there, and neither refused nor offered.
      for (const each of (reported.entrypoints ?? []).filter((one) => one.present)) {
        expect(each).toEqual({ word: each.word, label: each.label, present: true });
      }
      for (const each of absent) {
        expect(each.refusal).toEqual({ code: refused.code, message: expect.any(String) });
      }
      expect(absent[0]?.refusal?.message).toBe(refused.message);
      expect(
        reported.available.filter((each) => growthOf(reported, each.id) !== undefined),
      ).toEqual([]);
    }
  });

  it('offers it in a polyrepo service, a repository of its own', async () => {
    await scaffoldAs('fullstack-go', { layout: 'polyrepo' });
    const backend = path.join(cwd, 'backend');
    expectOk(await grow('cli', backend));
    expect((await status(backend)).entrypoints).toEqual([
      { word: 'cli', label: CLI, present: false, installs: [] },
      { word: 'http', label: HTTP, present: true },
    ]);
  });

  it('names it on a card in a polyrepo service, and in no monorepo service, where the command is refused', async () => {
    // A plugin's vertical only a Go CLI takes: in an HTTP service, the
    // CLI alone stops it.
    const cliOnly: Vertical = {
      id: 'cli-only',
      description: 'Beside a command line',
      dimensions: ['only'],
      adapters: [
        {
          id: 'cli-only/go',
          vertical: 'cli-only',
          covers: ['only'],
          predicate: { requires: ['lang.go', 'arch.cli'] },
          contribute: () => ({}),
        },
      ],
    };
    mediator = installMediator({
      registry: registryOf([shippedSource, { origin: pluginOrigin('acme'), verticals: [cliOnly] }]),
      runDeferred: discardDeferred(),
    });
    for (const [layout, action] of [
      ['polyrepo', { entrypoint: 'cli', comes: false }],
      ['monorepo', undefined],
    ] as const) {
      const at = path.join(cwd, layout);
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd: at,
            stack: 'fullstack-go',
            layout,
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      const backend = path.join(at, 'backend');
      const reported = await status(backend);
      expect(growthOf(reported, 'cli-only')).toEqual(action);
      const refused = expectErr(
        await mediator.dispatch(
          addVerticalCommand({
            cwd: backend,
            verticals: ['cli-only'],
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        ),
      );
      expect(card(reported, 'cli-only')?.refusal).toEqual({
        code: refused.code,
        message: refused.message,
        refusal: (refused as RefusalError).refusal,
      });
    }
  });
});
