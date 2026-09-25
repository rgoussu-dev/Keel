/**
 * A composite product's scopes, each answering for itself: the root
 * points into its services, or says which of them have what it is
 * asked for already, a monorepo service says what it has from the
 * product and what only a repository root may carry, and `keel new`
 * refuses a directory the product does not list, at any depth, or one
 * inside a service.
 *
 * **Scenario.** Real products scaffolded into a temporary directory —
 * `fullstack` under both repository layouts, and a plugin's product
 * whose backend the product glue has no image for — then asked from
 * the root, from a service, and from a directory beside them. And
 * `keel new` asked for a service's own extras (`--with
 * backend:persistence`), held to scaffolding then adding them there,
 * a preset whose monorepo backend installs the image its root
 * already builds — two scopes, one file — and a plugin's extra that
 * refuses the service's file it patches.
 *
 * **Factory.** `installMediator` over the real templates and
 * filesystem, deferred actions recorded rather than run — and, where
 * the root must not be written again, the manifest's writes too.
 *
 * **Port.** `Mediator.dispatch`: `keel.project-status` for what a
 * card reads, and the add or new command — dry run unless it says so
 * — for what the click does; `keel.dials` for a product's service
 * menus; and `keel add module`, `keel link` and both `keel toolchain`
 * commands where no project is. Every card is held to its add, code
 * and sentence, as the composition grid holds every cell (I4, I7);
 * these pin the sentences a user reads.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  linkPeerCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import { MANIFEST_FILENAME, projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { ManifestStore } from '../../../../src/domain/contract/ports/manifest-store.js';
import type { Registry } from '../../../../src/domain/contract/ports/registry.js';
import {
  dialsQuery,
  previewQuery,
  projectStatusQuery,
  type AvailableVerticalDescriptor,
  type ProjectStatus,
} from '../../../../src/domain/contract/queries.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';
import { PathConflictError, RefusalError } from '../../../../src/domain/contract/refusal.js';
import type { Stack } from '../../../../src/domain/contract/stack.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import type { InstallDeps } from '../../../../src/domain/core/handlers/deps.js';
import {
  registryOf,
  shippedRegistry,
  shippedSource,
} from '../../../../src/domain/core/registry.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import {
  toolchainCheckQuery,
  toolchainInstallCommand,
} from '../../../../src/domain/toolchain/contract/commands.js';
import type { Action } from '../../../../src/domain/kernel/action.js';
import type { Mediator } from '../../../../src/domain/kernel/mediator.js';
import { FakeClock } from '../../../../src/infrastructure/commons/fake-clock.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakePrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

/* ---- Scenario ---------------------------------------------------- */

let cwd: string;
let ran: string[];

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-scope-'));
  ran = [];
});

afterEach(async () => {
  await fs.remove(cwd);
});

const at = (...segments: string[]) => path.join(cwd, ...segments);

/**
 * A plugin's product: keel's own fullstack glue over a backend preset
 * the glue has no image for, and — for the greenfield half of
 * placement — a pipeline among the backend's own extras. Beside it,
 * `acme-trio`: two such backends and the frontend, so a vertical two
 * services could take meets one the root builds it for.
 */
function pluginProduct(): Registry {
  const fullstack = STACKS['fullstack'] as Stack;
  const ci = shippedRegistry.vertical('ci');
  const gateway = shippedRegistry.vertical('gateway');
  if (ci === null || gateway === null) throw new Error('the shipped registry lost a vertical');
  return registryOf([
    shippedSource,
    {
      origin: "plugin 'acme'",
      stacks: [
        {
          ...fullstack,
          id: 'acme-product',
          description: 'A Kotlin Spring backend behind the web-components frontend.',
          services: [
            { path: 'backend', stack: 'spring-rest-kotlin', extraVerticals: [gateway, ci] },
            { path: 'frontend', stack: 'web-components', extraVerticals: [gateway] },
          ],
        },
        {
          ...fullstack,
          id: 'acme-trio',
          description: 'Two Kotlin Spring services behind the web-components frontend.',
          services: [
            { path: 'backend', stack: 'spring-rest-kotlin' },
            { path: 'worker', stack: 'spring-rest-kotlin' },
            { path: 'frontend', stack: 'web-components' },
          ],
        },
      ],
    },
  ]);
}

/* ---- Factory ----------------------------------------------------- */

function mediatorOver(
  registry: Registry = shippedRegistry,
  overrides: Partial<InstallDeps> = {},
): Mediator {
  return installMediator({
    registry,
    runDeferred: (inputs: RunActionsInputs): Promise<void> => {
      for (const action of inputs.actions) ran.push(`${inputs.cwd}: ${action.id}`);
      return Promise.resolve();
    },
    ...overrides,
  });
}

async function scaffold(
  mediator: Mediator,
  stack: string,
  layout: 'monorepo' | 'polyrepo',
): Promise<readonly string[]> {
  const report = expectOk(
    await mediator.dispatch(
      newProjectCommand({ cwd, stack, layout, answers: {}, interactive: false, dryRun: false }),
    ),
  );
  return report.notes ?? [];
}

const status = async (mediator: Mediator, dir: string): Promise<ProjectStatus> =>
  expectOk(await mediator.dispatch(projectStatusQuery({ cwd: dir })));

const card = (reported: ProjectStatus, id: string): AvailableVerticalDescriptor => {
  const found = reported.available.find((vertical) => vertical.id === id);
  if (found === undefined) throw new Error(`no card for '${id}'`);
  return found;
};

const add = (mediator: Mediator, dir: string, verticals: readonly string[], dryRun = true) =>
  mediator.dispatch(
    addVerticalCommand({
      cwd: dir,
      verticals: [...verticals],
      answers: {},
      interactive: false,
      dryRun,
    }),
  );

/** The card's refusal, held to what the add itself answers. */
async function refusedAlike(
  mediator: Mediator,
  dir: string,
  reported: ProjectStatus,
  id: string,
): Promise<RefusalError> {
  const error = expectErr(await add(mediator, dir, [id]));
  expect(card(reported, id).refusal).toEqual({
    code: error.code,
    message: error.message,
    refusal: (error as RefusalError).refusal,
  });
  return error as RefusalError;
}

/* ---- Tests ------------------------------------------------------- */

describe('a monorepo product root', () => {
  it('sends what it cannot carry into the service that can, read from each', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const root = await status(mediator, cwd);

    const persistence = await refusedAlike(mediator, cwd, root, 'persistence');
    expect(persistence.code).toBe('keel.wrong-scope');
    expect(persistence.message).toBe(
      'Persistence belongs to a service, not to the product root — it goes in backend/',
    );
    expect(persistence.refusal).toEqual({
      kind: 'elsewhere',
      vertical: 'persistence',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'unavailable' },
      ],
    });

    // Two services could each take a toolchain: which is the user's.
    const toolchain = await refusedAlike(mediator, cwd, root, 'toolchain');
    expect(toolchain.message).toBe(
      'Toolchain belongs to a service, not to the product root — it goes in backend/ or frontend/',
    );
  });

  it('has what every service that could take it has, and adding one adds nothing', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const root = await status(mediator, cwd);

    // What the services have — the image the root builds for each, the
    // harness and gateway each installed, what frontend/ cannot take
    // and backend/ has — is there already, where `keel new --with` on
    // the product sets it aside: a note naming them, not a card.
    expect(root.provided.map(({ id, note }) => [id, note])).toEqual([
      ['agent-harness', 'Agent harness is already there: backend/ and frontend/ have it'],
      ['code-style', 'Code style is already there: backend/ and frontend/ have it'],
      ['containerization', 'Container image is already there: backend/ and frontend/ have it'],
      ['dev-container', 'Dev container is already there: backend/ and frontend/ have it'],
      ['gateway', 'Service gateway is already there: backend/ and frontend/ have it'],
      ['observability', 'Observability is already there: backend/ has it'],
      ['walking-skeleton', 'Walking skeleton is already there: backend/ and frontend/ have it'],
    ]);
    const ids = root.provided.map((vertical) => vertical.id);
    expect(root.available.filter((vertical) => ids.includes(vertical.id))).toEqual([]);

    // The store the root's manifest is persisted through, recording
    // every write it is asked for: one written again reads the same,
    // so only the store can tell it was.
    const written: string[] = [];
    const manifests: ManifestStore = {
      read: (root) => fsManifestStore.read(root),
      write: (root, manifest) => {
        written.push(root);
        return fsManifestStore.write(root, manifest);
      },
    };
    const again = mediatorOver(shippedRegistry, {
      clock: new FakeClock('2026-05-01T00:00:00Z'),
      manifests,
    });
    const before = await fsManifestStore.read(projectScopeRoot(cwd));
    const files = await fs.readdir(cwd);
    const actions = ran.length;
    for (const { id, note } of root.provided) {
      const previewed = expectOk(
        await again.dispatch(
          previewQuery({
            cwd,
            target: { kind: 'add-vertical', verticals: [id] },
            answers: {},
          }),
        ),
      );
      const dry = expectOk(await add(again, cwd, [id]));
      const report = expectOk(await add(again, cwd, [id], false));
      for (const run of [previewed, dry, report]) {
        expect(run.changes).toEqual([]);
        expect(run.actions).toEqual([]);
        expect(run.notes).toEqual([note]);
      }
    }
    // Nothing written, nothing recorded, nothing run.
    expect(written).toEqual([]);
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toEqual(before);
    expect(await fs.readdir(cwd)).toEqual(files);
    expect(ran).toHaveLength(actions);
  });

  it('sets aside what its services have beside what it installs, and a refusal still wins', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');

    const report = expectOk(await add(mediator, cwd, ['code-style', 'dev-env']));
    expect(report.notes).toEqual(['Code style is already there: backend/ and frontend/ have it']);
    const alone = expectOk(await add(mediator, cwd, ['dev-env']));
    expect(report.changes).toEqual(alone.changes);
    expect(report.changes).not.toEqual([]);

    const refused = expectErr(await add(mediator, cwd, ['code-style', 'persistence']));
    expect(refused.code).toBe('keel.wrong-scope');
    expect(refused.message).toBe(
      'Persistence belongs to a service, not to the product root — it goes in backend/',
    );
  });

  it('refuses a re-render of what its services have, saying where each has it from', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const again = (flag: 'reapply' | 'refresh', id: string, dir = cwd) =>
      mediator.dispatch(
        addVerticalCommand({
          cwd: dir,
          verticals: flag === 'reapply' ? [id] : ['dev-env'],
          ...(flag === 'reapply' ? { reapply: true } : { refresh: [id] }),
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      );
    const reapplied = expectErr(await again('reapply', 'code-style')) as RefusalError;
    expect(reapplied.code).toBe('keel.wrong-scope');
    expect(reapplied.message).toBe(
      'Code style belongs to a service, not to the product root — backend/ and frontend/ have it already, and it is re-rendered there',
    );
    expect(reapplied.refusal).toMatchObject({
      kind: 'elsewhere',
      vertical: 'code-style',
      services: [{ readiness: 'included' }, { readiness: 'included' }],
    });
    const refreshed = expectErr(await again('refresh', 'code-style'));
    expect([refreshed.code, refreshed.message]).toEqual([reapplied.code, reapplied.message]);
    // Where it is re-rendered, it is: in each service.
    for (const service of ['backend', 'frontend']) {
      expectOk(await again('reapply', 'code-style', at(service)));
    }

    // The image the root builds for each service is no service's to
    // re-render, and no install of the root's: said as the root's, and
    // each service's own re-render names nowhere else to go.
    const image = expectErr(await again('reapply', 'containerization')) as RefusalError;
    expect(image.code).toBe('keel.wrong-scope');
    expect(image.message).toBe(
      'Container image is not installed at the product root, which builds it for backend/ and frontend/: nothing to re-render here',
    );
    expect(image.refusal).toMatchObject({
      kind: 'elsewhere',
      services: [
        { path: 'backend', readiness: 'included', fromProduct: true },
        { path: 'frontend', readiness: 'included', fromProduct: true },
      ],
    });
    for (const service of ['backend', 'frontend']) {
      expect(expectErr(await again('reapply', 'containerization', at(service))).message).toBe(
        'Container image is not installed in this service — the product root builds it for this service: nothing to reapply here',
      );
    }

    // What the root cannot carry is refused as its add is, whichever
    // re-render names it — never advice to install it here.
    const persistence = expectErr(await add(mediator, cwd, ['persistence']));
    for (const flag of ['reapply', 'refresh'] as const) {
      const error = expectErr(await again(flag, 'persistence'));
      expect([error.code, error.message]).toEqual([persistence.code, persistence.message]);
    }
  });

  it('says why no service can take what needs a repository root, and the way forward', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const root = await status(mediator, cwd);
    const iac = await refusedAlike(mediator, cwd, root, 'iac');
    expect(iac.code).toBe('keel.wrong-scope');
    expect(iac.message).toBe(
      'Infrastructure as code belongs to a service, not to the product root — none of its services can carry it, since it needs Distribution, which cannot go in a monorepo service: its release workflows are read only at the repository root, which in a monorepo is the product root — per-service releases need the polyrepo layout',
    );
    expect(iac.refusal).toMatchObject({
      kind: 'elsewhere',
      services: [
        { path: 'backend', readiness: 'unavailable', repositoryOnly: ['distribution'] },
        { path: 'frontend', readiness: 'unavailable' },
      ],
    });
  });

  it('sends a pipeline nowhere: its place is this root, which no adapter serves yet', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const root = await status(mediator, cwd);
    const ci = await refusedAlike(mediator, cwd, root, 'ci');
    expect(ci.code).toBe('keel.uncoverable-vertical');
    expect(ci.message).toBe(
      "Continuous integration cannot be installed here: keel installs it at no monorepo product's root yet, and it cannot go in one of the product's services: its pipeline is read only at the repository root, which in a monorepo is the product root — per-service pipelines need the polyrepo layout",
    );
  });

  it('reports each service with the directory to open it at', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    expect((await status(mediator, cwd)).services).toEqual([
      {
        path: 'backend',
        stack: 'quarkus-rest',
        buildSystem: 'gradle',
        directory: at('backend'),
        label: 'quarkus-rest · Gradle',
      },
      {
        path: 'frontend',
        stack: 'web-components',
        buildSystem: 'npm',
        directory: at('frontend'),
        label: 'web-components · npm',
      },
    ]);
  });
});

describe('a monorepo service', () => {
  it('has from its product what the root keeps and builds, and adding one adds nothing', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const backend = await status(mediator, at('backend'));
    expect(backend.provided.map(({ id, note }) => [id, note])).toEqual([
      [
        'containerization',
        'Container image is already there: the product root builds it for this service',
      ],
      [
        'vcs',
        'Version control is already there: the product root has it, for the one repository its services share',
      ],
    ]);
    expect(backend.available.map((vertical) => vertical.id)).not.toContain('vcs');

    const before = await fsManifestStore.read(projectScopeRoot(at('backend')));
    const actions = ran.length;
    for (const { id, note } of backend.provided) {
      const report = expectOk(await add(mediator, at('backend'), [id], false));
      expect(report.changes).toEqual([]);
      expect(report.actions).toEqual([]);
      expect(report.notes).toEqual([note]);
    }
    // No second repository inside the first, and nothing recorded.
    expect(await fs.pathExists(at('backend', '.githooks'))).toBe(false);
    expect(await fsManifestStore.read(projectScopeRoot(at('backend')))).toEqual(before);
    expect(ran).toHaveLength(actions);
  });

  it('refuses what only a repository root reads, and what needs it, as the wrong scope', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const backend = await status(mediator, at('backend'));

    const ci = await refusedAlike(mediator, at('backend'), backend, 'ci');
    expect(ci.code).toBe('keel.wrong-scope');
    expect(ci.message).toBe(
      'Continuous integration cannot go in a monorepo service: its pipeline is read only at the repository root, which in a monorepo is the product root — per-service pipelines need the polyrepo layout',
    );
    const distribution = await refusedAlike(mediator, at('backend'), backend, 'distribution');
    expect(distribution.message).toBe(
      'Distribution cannot go in a monorepo service: its release workflows are read only at the repository root, which in a monorepo is the product root — per-service releases need the polyrepo layout',
    );

    const iac = await refusedAlike(mediator, at('backend'), backend, 'iac');
    expect(iac.code).toBe('keel.wrong-scope');
    expect(iac.message).toBe(
      'Infrastructure as code needs Distribution, which cannot go in a monorepo service: its release workflows are read only at the repository root, which in a monorepo is the product root — per-service releases need the polyrepo layout',
    );
    expect(iac.refusal).toEqual({
      kind: 'unavailable',
      vertical: 'iac',
      missing: {},
      carriedBy: [],
      repositoryOnly: ['distribution'],
    });

    // What a service does carry still installs there.
    expect(card(backend, 'persistence').readiness).toBe('ready');
  });

  it('refuses what it cannot carry naming the service that can, or has it, card and add alike', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const frontend = await status(mediator, at('frontend'));
    // Read from the root's list of services, each from its own
    // manifest: the card carries the refusal the add gives.
    const persistence = await refusedAlike(mediator, at('frontend'), frontend, 'persistence');
    expect(persistence.code).toBe('keel.uncoverable-vertical');
    expect(persistence.message).toBe(
      "Persistence has no adapter for this project's stack; backend/ can take it",
    );
    expect(persistence.refusal).toMatchObject({
      elsewhere: [{ path: 'backend', stack: 'quarkus-rest', readiness: 'ready' }],
    });
    const observability = await refusedAlike(mediator, at('frontend'), frontend, 'observability');
    expect(observability.message).toBe(
      "Observability has no adapter for this project's stack; backend/ has it already",
    );

    // Once the backend has it, that is what the front end says.
    expectOk(await add(mediator, at('backend'), ['persistence'], false));
    const after = await status(mediator, at('frontend'));
    const had = await refusedAlike(mediator, at('frontend'), after, 'persistence');
    expect(had.message).toBe(
      "Persistence has no adapter for this project's stack; backend/ has it already",
    );
  });

  it('answers a re-render of what it does not install with where it is, not with an install', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const again = (id: string, flag: 'reapply' | 'refresh') =>
      mediator.dispatch(
        addVerticalCommand({
          cwd: at('backend'),
          verticals: flag === 'reapply' ? [id] : ['persistence'],
          ...(flag === 'reapply' ? { reapply: true } : { refresh: [id] }),
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      );
    // What the product gives it is the product root's to re-render:
    // `keel add vcs` here would be a note that adds nothing.
    const vcs = expectErr(await again('vcs', 'reapply'));
    expect(vcs.code).toBe('keel.vertical-not-installed');
    expect(vcs.message).toBe(
      'Version control is not installed in this service — the product root has it, for the one repository its services share, and it is re-rendered there: nothing to reapply here',
    );
    expect(expectErr(await again('containerization', 'refresh')).message).toBe(
      'Container image is not installed in this service — the product root builds it for this service: nothing to refresh here',
    );
    // And what only a repository root reads is refused as adding it is.
    const ci = expectErr(await again('ci', 'reapply'));
    const added = expectErr(await add(mediator, at('backend'), ['ci']));
    expect([ci.code, ci.message]).toEqual([added.code, added.message]);
    expect(ci.code).toBe('keel.wrong-scope');
  });
});

describe('a polyrepo service', () => {
  it('is a repository of its own: its image, release and infrastructure are one plan', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'polyrepo');
    const backend = await status(mediator, at('backend'));
    expect(backend.provided).toEqual([]);
    expect(card(backend, 'iac')).toMatchObject({
      readiness: 'needs',
      requires: ['containerization', 'distribution'],
    });

    const report = expectOk(
      await add(mediator, at('backend'), ['containerization', 'distribution', 'iac'], false),
    );
    const paths = report.changes.map((change) => change.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'Dockerfile',
        '.github/workflows/release-image.yml',
        'deploy/compose.yaml',
        'iac/digitalocean/main.tf',
      ]),
    );
    expect(await fs.pathExists(at('backend', '.github', 'workflows', 'release-image.yml'))).toBe(
      true,
    );
  });

  it('refuses what it cannot carry as a project of its own: no root lists another service', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'polyrepo');
    const frontend = await status(mediator, at('frontend'));
    const persistence = await refusedAlike(mediator, at('frontend'), frontend, 'persistence');
    expect(persistence.message).toBe("Persistence has no adapter for this project's stack");
    expect(persistence.refusal).not.toHaveProperty('elsewhere');
  });
});

describe('keel new inside a product', () => {
  it('refuses a directory the product lists no service in, before anything is asked', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const prompt = new FakePrompt({});
    const error = expectErr(
      await installMediator({ prompt }).dispatch(
        newProjectCommand({ cwd: at('worker'), answers: {}, interactive: true, dryRun: false }),
      ),
    );
    expect(error.code).toBe('keel.inside-product');
    expect(error.message).toBe(
      'this directory is inside the product at ../, which lists no service here; adding a service to a product is not supported yet',
    );
    expect(prompt.asked).toEqual([]);
    expect(await fs.pathExists(at('worker'))).toBe(false);
  });

  it('refuses it named, too, and leaves alone a directory no product holds', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'polyrepo');
    // A polyrepo product has no root to be inside of.
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: at('worker'),
          stack: 'go-http',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    await fs.remove(cwd);
    await fs.ensureDir(cwd);
    await scaffold(mediator, 'fullstack', 'monorepo');
    expect(
      expectErr(
        await mediator.dispatch(
          newProjectCommand({
            cwd: at('worker'),
            stack: 'go-http',
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        ),
      ).code,
    ).toBe('keel.inside-product');
  });

  it('refuses a directory at any depth: in the product, or in one of its services', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const refused = async (...segments: string[]) =>
      expectErr(
        await mediator.dispatch(
          newProjectCommand({
            cwd: at(...segments),
            stack: 'go-http',
            answers: {},
            interactive: false,
            dryRun: true,
          }),
        ),
      );
    // Deeper than any service the product lists: still the product's.
    const deep = await refused('docs', 'notes');
    expect(deep.code).toBe('keel.inside-product');
    expect(deep.message).toBe(
      'this directory is inside the product at ../../, which lists no service here; adding a service to a product is not supported yet',
    );
    expect((await refused('docs', 'notes', 'drafts')).message).toContain(
      'inside the product at ../../../,',
    );
    // Inside a service, the nearest project is the service.
    const inService = await refused('backend', 'tools');
    expect(inService.code).toBe('keel.inside-project');
    expect(inService.message).toBe(
      'this directory is inside the keel project at ../; scaffolding a project inside another is not supported — scaffold it elsewhere and move it here',
    );
  });

  it('refuses a project moved into a directory it does not list as already initialised', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-elsewhere-'));
    try {
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd: elsewhere,
            stack: 'go-cli',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      await fs.move(elsewhere, at('worker'));
      const prompt = new FakePrompt({});
      const error = expectErr(
        await installMediator({ prompt }).dispatch(
          newProjectCommand({ cwd: at('worker'), answers: {}, interactive: true, dryRun: true }),
        ),
      );
      expect(error.code).toBe('keel.already-initialised');
      expect(prompt.asked).toEqual([]);
    } finally {
      await fs.remove(elsewhere);
    }
  });
});

describe('keel new in a service the product lists', () => {
  it('refuses one emptied of its project, naming what the product records there', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    await fs.remove(at('backend'));
    await fs.ensureDir(at('backend'));
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd: at('backend'),
          stack: 'go-cli',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    // Scaffolded, it would be a second repository's hooks and
    // changelog inside the product's, of a stack the product does not
    // record there.
    expect(error.code).toBe('keel.inside-product');
    expect(error.message).toBe(
      'this directory is backend/ of the product at ../, recorded as quarkus-rest; re-scaffolding a service is not supported yet',
    );
    expect(await fs.readdir(at('backend'))).toEqual([]);
  });

  it('refuses one that still holds its project as already initialised', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd: at('backend'),
          stack: 'quarkus-rest',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(error.code).toBe('keel.already-initialised');
  });

  it('leaves one whose manifest it cannot read to be reported, as anywhere', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    // Not emptied: the broken file is what the run says, not the
    // service the product records there.
    const manifest = path.join(projectScopeRoot(at('backend')), MANIFEST_FILENAME);
    await fs.writeFile(manifest, '{ broken');
    const prompt = new FakePrompt({});
    await expect(
      installMediator({ prompt }).dispatch(
        newProjectCommand({ cwd: at('backend'), answers: {}, interactive: true, dryRun: true }),
      ),
    ).rejects.toThrow(manifest);
    expect(prompt.asked).toEqual([]);
  });
});

describe('keel add where no project is', () => {
  /** Why a project on the flat layout, as scaffolds default to, takes no bounded context. */
  const contextless = `a bounded context needs the modulith layout: contexts meet only at the peer-facing seam the modulith puts between them, and the flat layout is one hexagon for the whole service with no seam for a second context to meet the first at. "keel add module" needs a project scaffolded with --module-layout=modulith`;

  it('points a subdirectory of a project at the project it is in', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'polyrepo');
    await fs.ensureDir(at('backend', 'scripts'));
    const inside = expectErr(await add(mediator, at('backend', 'scripts'), ['ci']));
    expect(inside.code).toBe('keel.not-initialised');
    expect(inside.message).toBe(
      `no project initialised at ${at('backend', 'scripts', '.claude')} — this directory is inside the keel project at ../; run 'keel add' there`,
    );
  });

  it("points a polyrepo product's directory at the services below it", async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'polyrepo');
    const parent = expectErr(await add(mediator, cwd, ['persistence']));
    expect(parent.code).toBe('keel.not-initialised');
    expect(parent.message).toBe(
      `no project initialised at ${at('.claude')} — backend/ and frontend/ below hold keel projects; run 'keel add' in one of them`,
    );
  });

  it('points keel add module, keel link and keel toolchain there too, or says why the project refuses a context as well, the status as the click', async () => {
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'polyrepo');
    const scripts = at('backend', 'scripts');
    await fs.ensureDir(scripts);
    const refused = async (action: Action): Promise<string> => {
      const error = expectErr(await mediator.dispatch(action));
      expect(error.code).toBe('keel.not-initialised');
      return error.message;
    };
    const here = `no project initialised at ${path.join(scripts, '.claude')} — this directory is inside the keel project at ../`;
    const inside = (command: string) => `${here}; run '${command}' there`;
    const module = (dir: string) =>
      addModuleCommand({
        cwd: dir,
        module: 'billing',
        answers: {},
        interactive: false,
        dryRun: true,
      });
    // The backend is on the flat layout, as scaffolds default to: it
    // takes no bounded context either, so it is not pointed at.
    const refusesToo = `${here}, which refuses 'keel add module' too, since ${contextless}`;
    expect(await refused(module(scripts))).toBe(refusesToo);
    // The status reports the click's own sentence.
    expect((await status(mediator, scripts)).moduleRefusal).toEqual({
      code: 'keel.not-initialised',
      message: refusesToo,
    });
    expect(await refused(linkPeerCommand({ cwd: scripts, ref: '../../frontend' }))).toBe(
      inside('keel link'),
    );
    expect(await refused(toolchainInstallCommand({ cwd: scripts, interactive: false }))).toBe(
      inside('keel toolchain install'),
    );
    expect(await refused(toolchainCheckQuery({ cwd: scripts }))).toBe(
      inside('keel toolchain check'),
    );

    // Above a polyrepo product's services, at them; and where no
    // project is near, at scaffolding one.
    const holding = `no project initialised at ${at('.claude')} — backend/ and frontend/ below hold keel projects`;
    const below = (command: string) => `${holding}; run '${command}' in one of them`;
    const eachRefusing = `${holding}, each refusing 'keel add module' too, since ${contextless}`;
    expect(await refused(module(cwd))).toBe(eachRefusing);
    expect((await status(mediator, cwd)).moduleRefusal?.message).toBe(eachRefusing);
    expect(await refused(linkPeerCommand({ cwd, ref: 'frontend' }))).toBe(below('keel link'));
    expect(await refused(toolchainInstallCommand({ cwd, interactive: false }))).toBe(
      below('keel toolchain install'),
    );
    expect(await refused(toolchainCheckQuery({ cwd }))).toBe(below('keel toolchain check'));
    const nowhere = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-nowhere-'));
    try {
      const first = (command: string) =>
        `no project initialised at ${path.join(nowhere, '.claude')} — run '${command}' first to create one`;
      expect(await refused(module(nowhere))).toBe(
        first('keel new --stack=<id> --module-layout=modulith'),
      );
      expect(await refused(linkPeerCommand({ cwd: nowhere, ref: '..' }))).toBe(
        first('keel new --stack=<id>'),
      );
    } finally {
      await fs.remove(nowhere);
    }
  });

  it('points keel add module and keel toolchain inside a monorepo product root at its services, or says why they refuse it too', async () => {
    // The root refuses a bounded context and declares no toolchain: a
    // directory under it, in no service, is sent where they run.
    // `keel add` and `keel link` run at the root, and are sent there.
    const mediator = mediatorOver();
    await scaffold(mediator, 'fullstack', 'monorepo');
    const notes = at('notes');
    await fs.ensureDir(notes);
    const refused = async (action: Action): Promise<string> => {
      const error = expectErr(await mediator.dispatch(action));
      expect(error.code).toBe('keel.not-initialised');
      return error.message;
    };
    const none = `no project initialised at ${path.join(notes, '.claude')}`;
    const product = `${none} — this directory is inside the keel product at ../, whose services are ../backend/ and ../frontend/`;
    const services = (command: string) => `${product}; run '${command}' in one of them`;
    const module = addModuleCommand({
      cwd: notes,
      module: 'billing',
      answers: {},
      interactive: false,
      dryRun: true,
    });
    // Neither service, on the flat layout, takes a bounded context: said,
    // with why, rather than sending the user into one to be refused.
    const eachRefusing = `${product}, each refusing 'keel add module' too, since ${contextless}`;
    expect(await refused(module)).toBe(eachRefusing);
    expect((await status(mediator, notes)).moduleRefusal).toEqual({
      code: 'keel.not-initialised',
      message: eachRefusing,
    });
    expect(await refused(toolchainInstallCommand({ cwd: notes, interactive: false }))).toBe(
      services('keel toolchain install'),
    );
    expect(await refused(toolchainCheckQuery({ cwd: notes }))).toBe(
      services('keel toolchain check'),
    );
    const root = (command: string) =>
      `${none} — this directory is inside the keel project at ../; run '${command}' there`;
    expect(await refused(linkPeerCommand({ cwd: notes, ref: '../backend' }))).toBe(
      root('keel link'),
    );
    expect(expectErr(await add(mediator, notes, ['dev-env'])).message).toBe(root('keel add'));
    // What the root says of each, where they are sent from here.
    expect(expectErr(await mediator.dispatch({ ...module, cwd })).code).toBe('keel.invalid-module');
    // And at the root itself, which declares no toolchain: its services.
    for (const [action, command] of [
      [toolchainInstallCommand({ cwd, interactive: false }), 'keel toolchain install'],
      [toolchainCheckQuery({ cwd }), 'keel toolchain check'],
    ] as const) {
      const undeclared = expectErr(await mediator.dispatch(action));
      expect(undeclared.code).toBe('keel.toolchain-not-declared');
      expect(undeclared.message).toBe(
        `this is a product root, which declares no toolchain: a toolchain belongs to a service — run '${command}' in backend/ or frontend/`,
      );
    }
  });

  it('points keel add module at a project above that takes a bounded context, the status as the click', async () => {
    const mediator = mediatorOver();
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'go-cli',
          moduleLayout: 'modulith',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const tools = at('tools');
    await fs.ensureDir(tools);
    const error = expectErr(
      await mediator.dispatch(
        addModuleCommand({
          cwd: tools,
          module: 'billing',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(error.code).toBe('keel.not-initialised');
    expect(error.message).toBe(
      `no project initialised at ${path.join(tools, '.claude')} — this directory is inside the keel project at ../; run 'keel add module' there`,
    );
    expect((await status(mediator, tools)).moduleRefusal).toEqual({
      code: error.code,
      message: error.message,
    });
  });
});

describe('a plugin product whose glue builds no image for its backend', () => {
  it('leaves the image to add there, and its report says so', async () => {
    const mediator = mediatorOver(pluginProduct());
    const notes = await scaffold(mediator, 'acme-product', 'monorepo');
    expect(notes).toEqual([
      "backend/ has no Container image from the product root, which builds one only for the stacks it knows — 'keel add containerization' there adds its own",
    ]);
    expect(await fs.pathExists(at('backend', 'Dockerfile'))).toBe(false);

    const backend = await status(mediator, at('backend'));
    expect(backend.provided.map((vertical) => vertical.id)).toEqual(['vcs']);
    expect(card(backend, 'containerization').readiness).toBe('ready');
    const report = expectOk(await add(mediator, at('backend'), ['containerization']));
    expect(report.changes.map((change) => change.path)).toContain('Dockerfile');

    // The frontend's image the glue does build.
    const frontend = await status(mediator, at('frontend'));
    expect(frontend.provided.map((vertical) => vertical.id)).toEqual(['containerization', 'vcs']);
  });

  it('sends the image from its root to the backend, and once there says where each has it from', async () => {
    const mediator = mediatorOver(pluginProduct());
    await scaffold(mediator, 'acme-product', 'monorepo');

    // One service could take it and the other has it: still the
    // backend's to take, not there already.
    const before = await status(mediator, cwd);
    const refused = await refusedAlike(mediator, cwd, before, 'containerization');
    expect(refused.code).toBe('keel.wrong-scope');
    expect(refused.message).toBe(
      'Container image belongs to a service, not to the product root — it goes in backend/',
    );
    expect(refused.refusal).toEqual({
      kind: 'elsewhere',
      vertical: 'containerization',
      services: [
        { path: 'backend', stack: 'spring-rest-kotlin', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'included', fromProduct: true },
      ],
    });
    expect(before.provided.map((vertical) => vertical.id)).not.toContain('containerization');

    // Added there, both have it — the backend its own, the frontend the
    // root's — so the root's add adds nothing, and a re-render at the
    // root says which of them installed it.
    expectOk(await add(mediator, at('backend'), ['containerization'], false));
    const after = await status(mediator, cwd);
    const note = 'Container image is already there: backend/ and frontend/ have it';
    expect(after.provided.find((vertical) => vertical.id === 'containerization')?.note).toBe(note);
    expect(expectOk(await add(mediator, cwd, ['containerization'])).notes).toEqual([note]);
    const again = expectErr(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['containerization'],
          reapply: true,
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    ) as RefusalError;
    expect(again.message).toBe(
      'Container image belongs to a service, not to the product root — backend/ has it already, and it is re-rendered there; frontend/ has it already, built by the product root',
    );
    expect(again.refusal).toEqual({
      kind: 'elsewhere',
      vertical: 'containerization',
      services: [
        { path: 'backend', stack: 'spring-rest-kotlin', readiness: 'included' },
        { path: 'frontend', stack: 'web-components', readiness: 'included', fromProduct: true },
      ],
    });
  });

  it('names, in both phases, the service the root builds it for beside two that could take it', async () => {
    // `keel new --with` on the product sends it to no one service —
    // two could take it — and its refusal carries where the frontend
    // has it from, as the root's add refuses it once scaffolded.
    const mediator = mediatorOver(pluginProduct());
    const greenfield = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'acme-trio',
          layout: 'monorepo',
          extraVerticals: ['containerization'],
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    ) as RefusalError;
    expect(greenfield.code).toBe('keel.wrong-scope');
    expect(greenfield.message).toBe(
      'Container image belongs to a service, not to the product root — it goes in backend/ or worker/',
    );
    expect(greenfield.refusal).toEqual({
      kind: 'elsewhere',
      vertical: 'containerization',
      services: [
        { path: 'backend', stack: 'spring-rest-kotlin', readiness: 'ready' },
        { path: 'worker', stack: 'spring-rest-kotlin', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'included', fromProduct: true },
      ],
    });

    await scaffold(mediator, 'acme-trio', 'monorepo');
    const brownfield = await refusedAlike(
      mediator,
      cwd,
      await status(mediator, cwd),
      'containerization',
    );
    expect([brownfield.code, brownfield.message, brownfield.refusal]).toEqual([
      greenfield.code,
      greenfield.message,
      greenfield.refusal,
    ]);
  });

  it('scaffolds a monorepo service without what only a repository root reads', async () => {
    // The backend's own extras name `ci`: placed at a repository root,
    // so a monorepo backend is scaffolded without it — the declaration
    // `keel add ci` there refuses by — and a polyrepo one with it.
    const mediator = mediatorOver(pluginProduct());
    await scaffold(mediator, 'acme-product', 'monorepo');
    expect(await fs.pathExists(at('backend', '.github', 'workflows', 'ci.yml'))).toBe(false);
    expect(await fs.pathExists(at('backend', '.githooks'))).toBe(false);
    const monorepo = await fsManifestStore.read(projectScopeRoot(at('backend')));
    expect(monorepo?.verticals.map((vertical) => vertical.id)).not.toContain('ci');

    await fs.remove(cwd);
    await fs.ensureDir(cwd);
    await scaffold(mediator, 'acme-product', 'polyrepo');
    expect(await fs.pathExists(at('backend', '.github', 'workflows', 'ci.yml'))).toBe(true);
    expect(await fs.pathExists(at('backend', '.githooks'))).toBe(true);
  });
});

describe("keel new: a product's extras, each in its service", () => {
  /** Every file under `root`, by its path from there, with its bytes. */
  async function filesUnder(root: string): Promise<ReadonlyMap<string, Buffer>> {
    const files = new Map<string, Buffer>();
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.set(path.relative(root, full), await fs.readFile(full));
      }
    };
    await walk(root);
    return files;
  }

  /**
   * What a manifest records of the project — its verticals, tags,
   * answers, peers and which harness files each contributor owns —
   * leaving out the provenance hash an owned file is recorded with,
   * which is the file as the run that recorded it left it: one run
   * or two write the same file, and hash it at different moments.
   */
  const recorded = async (dir: string) => {
    const manifest = await fsManifestStore.read(projectScopeRoot(dir));
    return {
      verticals: manifest?.verticals,
      tags: manifest?.tags,
      answers: manifest?.answers,
      peers: manifest?.peers,
      services: manifest?.services,
      entries: (manifest?.entries ?? []).map((entry) => `${entry.source} → ${entry.target}`).sort(),
    };
  };

  it.each(['monorepo', 'polyrepo'] as const)(
    'installs --with backend:persistence as scaffolding and then adding it in backend/ does (%s)',
    async (layout) => {
      const mediator = mediatorOver();
      const named = at('named');
      const added = at('added');
      const scaffoldIn = (dir: string, services?: { backend: { extraVerticals: string[] } }) =>
        mediator.dispatch(
          newProjectCommand({
            cwd: dir,
            stack: 'fullstack',
            layout,
            answers: {},
            interactive: false,
            dryRun: false,
            ...(services === undefined ? {} : { services }),
          }),
        );
      await fs.ensureDir(named);
      await fs.ensureDir(added);
      expectOk(await scaffoldIn(named, { backend: { extraVerticals: ['persistence'] } }));
      expectOk(await scaffoldIn(added));
      expectOk(await add(mediator, path.join(added, 'backend'), ['persistence'], false));

      const manifest = path.join('.claude', '.keel-manifest.json');
      const project = (files: ReadonlyMap<string, Buffer>) =>
        new Map([...files].filter(([file]) => !file.endsWith(manifest)));
      const one = project(await filesUnder(named));
      const two = project(await filesUnder(added));
      expect([...one.keys()].sort()).toEqual([...two.keys()].sort());
      for (const [file, bytes] of one) expect(two.get(file)?.equals(bytes), file).toBe(true);
      expect([...one.keys()]).toContain(path.join('backend', 'migrations', 'Dockerfile'));
      for (const dir of ['', 'backend', 'frontend']) {
        if (layout === 'polyrepo' && dir === '') continue;
        expect(await recorded(path.join(named, dir))).toEqual(
          await recorded(path.join(added, dir)),
        );
      }
    },
  );

  it.each(['monorepo', 'polyrepo'] as const)(
    'refuses what one service cannot carry naming the one that can, as its menu does (%s)',
    async (layout) => {
      const mediator = mediatorOver();
      const target = {
        kind: 'new-project' as const,
        stack: 'fullstack',
        layout,
        services: { frontend: { extraVerticals: ['persistence'] } },
      };
      const error = expectErr(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'fullstack',
            layout,
            answers: {},
            interactive: false,
            dryRun: false,
            services: target.services,
          }),
        ),
      );
      // Not the product's scope: the front end's own refusal, with the
      // sibling that can take it named after what stops it here.
      expect(error.code).toBe('keel.uncoverable-vertical');
      expect(error.message).toBe(
        "Persistence has no adapter for this project's stack; backend/ can take it",
      );
      expect((error as RefusalError).refusal).toMatchObject({
        kind: 'unavailable',
        vertical: 'persistence',
        elsewhere: [{ path: 'backend', stack: 'quarkus-rest', readiness: 'ready' }],
      });
      expect(await fs.readdir(cwd)).toEqual([]);

      // The page's menu for the front end, and the reason it drops the
      // pick, say the same.
      const dials = expectOk(await mediator.dispatch(dialsQuery({ target })));
      const frontend = dials.services.find((service) => service.path === 'frontend');
      expect(frontend?.verticals.find((option) => option.id === 'persistence')?.refusal).toEqual({
        code: error.code,
        message: error.message,
        refusal: (error as RefusalError).refusal,
      });
      expect(dials.adjustments).toContainEqual({
        id: 'persistence',
        change: 'dropped',
        because: error.message,
        service: 'frontend',
      });

      // One the backend has already is named as had, not as to take.
      const had = expectErr(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'fullstack',
            layout,
            answers: {},
            interactive: false,
            dryRun: true,
            services: { frontend: { extraVerticals: ['observability'] } },
          }),
        ),
      );
      expect(had.message).toBe(
        "Observability has no adapter for this project's stack; backend/ has it already",
      );
    },
  );

  it('refuses a pipeline in a monorepo service before a file is written', async () => {
    const mediator = mediatorOver();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack',
          answers: {},
          interactive: false,
          dryRun: false,
          services: { backend: { extraVerticals: ['ci'] } },
        }),
      ),
    );
    expect(error.code).toBe('keel.wrong-scope');
    expect(error.message).toMatch(/^Continuous integration cannot go in a monorepo service: /);
    expect(await fs.readdir(cwd)).toEqual([]);
    expect(ran).toEqual([]);
  });

  it('refuses a product two of whose scopes write one file, in its preview and its dry run alike', async () => {
    // A preset that installs the image in its monorepo backend as well
    // as building one there from the root: two Trees, one Dockerfile.
    // Each scope staged alone would take it; together the last commit
    // would win, so neither a plan nor an install gets past the check.
    const fullstack = STACKS['fullstack'] as Stack;
    const image = shippedRegistry.vertical('containerization');
    if (image === null) throw new Error('the shipped registry lost containerization');
    const registry = registryOf([
      shippedSource,
      {
        origin: "plugin 'acme'",
        stacks: [
          {
            ...fullstack,
            id: 'acme-imaged',
            services: (fullstack.services ?? []).map((service) =>
              service.path === 'backend'
                ? { ...service, extraVerticals: [...(service.extraVerticals ?? []), image] }
                : service,
            ),
          },
        ],
      },
    ]);
    const mediator = mediatorOver(registry);
    const target = {
      kind: 'new-project' as const,
      stack: 'acme-imaged',
      layout: 'monorepo' as const,
    };
    const preview = expectErr(await mediator.dispatch(previewQuery({ cwd, target, answers: {} })));
    const install = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'acme-imaged',
          layout: 'monorepo',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(preview.code).toBe('keel.cross-scope-write');
    expect(install.code).toBe(preview.code);
    expect(install.message).toBe(preview.message);
    expect(preview.message).toBe(
      "backend/.dockerignore would be written by two scopes of this product — by fullstack/product-compose at the product root, and by containerization/quarkus-rest-image in backend/ — and the one written last would silently replace the other; one of the product's pieces has to leave the file to the other",
    );
    expect(await fs.readdir(cwd)).toEqual([]);

    // A polyrepo product has no root writing into its services.
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'acme-imaged',
          layout: 'polyrepo',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
  });

  it("names a service's file from the product root, keeping what its refusal says of it", async () => {
    // A plugin's extra whose patch of the service's README meets the
    // file lacking its block, or already using its name. The service's
    // Tree is rooted at `backend/`; the user ran `keel new` one level up.
    const refusing = (id: string, anchor?: string, taken?: string): Vertical => ({
      id,
      description: `Patches README.md, and finds it wanting (${id}).`,
      dimensions: [],
      adapters: [
        {
          id: `${id}/readme`,
          vertical: id,
          covers: [],
          predicate: {},
          contribute: () => ({
            patches: [
              {
                target: 'README.md',
                apply: () => {
                  throw new PathConflictError('README.md', `${id}/readme`, anchor, taken);
                },
              },
            ],
          }),
        },
      ],
    });
    const mediator = mediatorOver(
      registryOf([
        shippedSource,
        {
          origin: "plugin 'acme'",
          verticals: [
            refusing('acme-anchored', "'## Acme' section"),
            refusing('acme-named', undefined, 'acme'),
          ],
        },
      ]),
    );
    const refusedWith = async (extra: string): Promise<Error> =>
      expectErr(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'fullstack',
            answers: {},
            interactive: false,
            dryRun: true,
            services: { backend: { extraVerticals: [extra] } },
          }),
        ),
      );

    const anchored = await refusedWith('acme-anchored');
    expect((anchored as RefusalError).refusal).toEqual({
      kind: 'path-conflict',
      path: 'backend/README.md',
      adapterId: 'acme-anchored/readme',
      anchor: "'## Acme' section",
    });
    expect(anchored.message).toBe(
      "'backend/README.md' has no '## Acme' section — keel adds its lines inside it and does not rewrite the file; add one, then re-run",
    );

    const named = await refusedWith('acme-named');
    expect((named as RefusalError).refusal).toEqual({
      kind: 'path-conflict',
      path: 'backend/README.md',
      adapterId: 'acme-named/readme',
      taken: 'acme',
    });
    expect(named.message).toBe(
      "'backend/README.md' already has a 'acme' where keel adds one of that name — keel renames neither, and the two would not build; rename the one there, then re-run",
    );
    expect(await fs.readdir(cwd)).toEqual([]);
  });
});
