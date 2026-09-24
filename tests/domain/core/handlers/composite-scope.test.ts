/**
 * A composite product's scopes, each answering for itself: the root
 * points into its services, a monorepo service says what it has from
 * the product and what only a repository root may carry, and `keel
 * new` refuses a directory the product does not list.
 *
 * **Scenario.** Real products scaffolded into a temporary directory —
 * `fullstack` under both repository layouts, and a plugin's product
 * whose backend the product glue has no image for — then asked from
 * the root, from a service, and from a directory beside them. And
 * `keel new` asked for a service's own extras (`--with
 * backend:persistence`), held to scaffolding then adding them there,
 * and a preset whose monorepo backend installs the image its root
 * already builds: two scopes, one file.
 *
 * **Factory.** `installMediator` over the real templates and
 * filesystem, deferred actions recorded rather than run.
 *
 * **Port.** `Mediator.dispatch`: `keel.project-status` for what a
 * card reads, and the add or new command — dry run unless it says so
 * — for what the click does. Every card is held to its add, code and
 * sentence, as the composition grid holds every cell (I4, I7); these
 * pin the sentences a user reads.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { Registry } from '../../../../src/domain/contract/ports/registry.js';
import {
  previewQuery,
  projectStatusQuery,
  type AvailableVerticalDescriptor,
  type ProjectStatus,
} from '../../../../src/domain/contract/queries.js';
import { RefusalError } from '../../../../src/domain/contract/refusal.js';
import type { Stack } from '../../../../src/domain/contract/stack.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import {
  registryOf,
  shippedRegistry,
  shippedSource,
} from '../../../../src/domain/core/registry.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import type { Mediator } from '../../../../src/domain/kernel/mediator.js';
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
 * placement — a pipeline among the backend's own extras.
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
      ],
    },
  ]);
}

/* ---- Factory ----------------------------------------------------- */

function mediatorOver(registry: Registry = shippedRegistry): Mediator {
  return installMediator({
    registry,
    runDeferred: (inputs: RunActionsInputs): Promise<void> => {
      for (const action of inputs.actions) ran.push(`${inputs.cwd}: ${action.id}`);
      return Promise.resolve();
    },
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

    // What the services have — the image the root builds for each,
    // the harness and gateway each installed — is where they already
    // are, not a gap of the root's.
    for (const id of ['containerization', 'agent-harness', 'gateway']) {
      const refused = await refusedAlike(mediator, cwd, root, id);
      expect(refused.code).toBe('keel.wrong-scope');
      expect(refused.refusal).toMatchObject({
        kind: 'elsewhere',
        services: [{ readiness: 'included' }, { readiness: 'included' }],
      });
    }
    expect(card(root, 'containerization').refusal?.message).toBe(
      'Container image belongs to a service, not to the product root — backend/ and frontend/ have it already',
    );
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
      'Container image is not installed in this service — the product root builds it for this service, and it is re-rendered there: nothing to refresh here',
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
});

describe('keel add where no project is', () => {
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
});
