/**
 * Tests for the composite (fullstack) install flow: monorepo and
 * polyrepo layouts, vcs hoisting, peer recording, peer-conditional
 * gateway adapters, and the brownfield `keel link` + `keel add
 * gateway` path. All deferred actions are recorded instead of run —
 * the real npm/gradle/git flows belong to the e2e suites.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  linkPeerCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import { MANIFEST_FILENAME, projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import { RefusalError } from '../../../../src/domain/contract/refusal.js';
import { peerRef } from '../../../../src/domain/core/handlers/new-project.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakePrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

interface RecordedAction {
  readonly id: string;
  readonly cwd: string;
}

const recordActions = (): {
  ran: RecordedAction[];
  runDeferred: (inputs: RunActionsInputs) => Promise<void>;
} => {
  const ran: RecordedAction[] = [];
  return {
    ran,
    runDeferred: (inputs: RunActionsInputs): Promise<void> => {
      for (const a of inputs.actions) ran.push({ id: a.id, cwd: inputs.cwd });
      return Promise.resolve();
    },
  };
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const newFullstack = (opts: {
  layout?: 'monorepo' | 'polyrepo';
  dryRun?: boolean;
  interactive?: boolean;
}) =>
  newProjectCommand({
    cwd,
    stack: 'fullstack',
    answers: {},
    interactive: opts.interactive ?? false,
    dryRun: opts.dryRun ?? false,
    ...(opts.layout !== undefined ? { layout: opts.layout } : {}),
  });

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

describe('peerRef', () => {
  it('computes sibling refs at any nesting depth', () => {
    expect(peerRef('backend', 'frontend')).toBe('../frontend');
    expect(peerRef('apps/backend', 'apps/frontend')).toBe('../frontend');
    expect(peerRef('backend', 'apps/frontend')).toBe('../apps/frontend');
    expect(peerRef('apps/api/backend', 'web')).toBe('../../../web');
  });
});

describe('fullstack composite install (monorepo)', () => {
  it.each([false, true])(
    'installs no family harness at the product root even with family tags (%s)',
    async (familyTags) => {
      const { ran, runDeferred } = recordActions();
      const mediator = installMediator({ runDeferred });
      expectOk(await mediator.dispatch(newFullstack({})));
      const stored = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
      const before = familyTags ? { ...stored, tags: [...stored.tags, 'lang.go'] } : stored;
      await fsManifestStore.write(projectScopeRoot(cwd), before);
      const actionsBefore = [...ran];
      // The product root has a document of its own (`fullstack/product-harness`);
      // what the add must not do is replace it with a service's binding spec.
      const rootDocBefore = read('AGENTS.md');
      const report = expectOk(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['agent-harness'],
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      // Not a special case any more: the product glue declares the rule
      // (`fullstack/one-harness`), so the planner reads a family kit as
      // not for the root even where the root's tags match a family —
      // and the root's services have it, so it is there already.
      expect(report.changes).toEqual([]);
      expect(report.notes).toEqual([
        'Agent harness is already there: backend/ and frontend/ have it',
      ]);
      expect(read('AGENTS.md')).toBe(rootDocBefore);
      expect(rootDocBefore).toContain('Work inside a service');
      expect(rootDocBefore).not.toContain('Engineering conventions');
      expect(await fsManifestStore.read(projectScopeRoot(cwd))).toEqual(before);
      expect(ran).toEqual(actionsBefore);
    },
  );

  it('names a file in the way inside a service from the product root it was run in', async () => {
    // Each service's Tree is rooted at its own directory, so its
    // adapters see `go.mod`; the user ran `keel new` one level up,
    // where the file in the way is `backend/go.mod`. (A README there
    // would be adopted, as at the root.)
    await fs.outputFile(path.join(cwd, 'backend/go.mod'), 'module example.com/mine\n');
    const { runDeferred } = recordActions();
    const error = expectErr(
      await installMediator({ runDeferred }).dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack-go',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(error.code).toBe('keel.path-conflict');
    expect(error.message).toBe(
      "'backend/go.mod' already exists, and keel does not overwrite a file this run did not write",
    );
    expect((error as RefusalError).refusal).toMatchObject({
      kind: 'path-conflict',
      path: 'backend/go.mod',
    });
    expect(read('backend/go.mod')).toBe('module example.com/mine\n');
  });

  it('sends a capability the root cannot carry into its services, naming them', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));
    const before = await fsManifestStore.read(projectScopeRoot(cwd));
    const actionsBefore = [...ran];
    const error = expectErr(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['persistence'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    // A refusal of the scope, not of the project: a root carries almost
    // no tags, so the gap of the adapter nearest to it is advice for
    // some other product, and where the capability belongs is the whole
    // answer — read from each service's own manifest: the backend takes
    // it, the frontend cannot.
    expect(error.code).toBe('keel.wrong-scope');
    expect(error.message).toBe(
      'Persistence belongs to a service, not to the product root — it goes in backend/',
    );
    expect(error).toBeInstanceOf(RefusalError);
    expect((error as RefusalError).refusal).toEqual({
      kind: 'elsewhere',
      vertical: 'persistence',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'frontend', stack: 'web-components', readiness: 'unavailable' },
      ],
    });
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toEqual(before);
    expect(ran).toEqual(actionsBefore);
  });

  it('reads where it goes from what each service has, not what its preset had', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));
    const persistence = (at: string) =>
      addVerticalCommand({
        cwd: at,
        verticals: ['persistence'],
        answers: {},
        interactive: false,
        dryRun: false,
      });
    expectOk(await mediator.dispatch(persistence(path.join(cwd, 'backend'))));

    // Its preset would take it; its manifest says it has it now, and
    // the other service cannot: it is there already.
    const there = expectOk(await mediator.dispatch(persistence(cwd)));
    expect(there.changes).toEqual([]);
    expect(there.notes).toEqual(['Persistence is already there: backend/ has it']);

    // A service manifest keel cannot read words nothing wrong here —
    // the root reads that service from its preset, which would take
    // it, so it refuses, sending it there.
    await fs.writeFile(
      path.join(projectScopeRoot(path.join(cwd, 'backend')), MANIFEST_FILENAME),
      '{ broken',
    );
    const unread = expectErr(await mediator.dispatch(persistence(cwd)));
    expect(unread.code).toBe('keel.wrong-scope');
    expect((unread as RefusalError).refusal).toMatchObject({
      services: [{ path: 'backend', readiness: 'ready' }, { path: 'frontend' }],
    });
  });

  it('lets through a capability the root itself can carry', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));
    // The redirect is the coverage check asked of the root's own tags,
    // not a blanket refusal: `dev-env`'s compose adapter matches
    // anywhere, so the root resolves it and nothing sends it away.
    const report = expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['dev-env'],
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(report.changes.map((change) => change.path)).toContain('dev/compose.yaml');
  });

  it('scaffolds both services, root glue, and hoists vcs to the root', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const report = expectOk(await mediator.dispatch(newFullstack({})));

    expect(report.subject).toBe('fullstack');
    expect(read('README.md')).toContain('keel fullstack product');
    expect(read('backend/settings.gradle.kts')).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();

    const gitRuns = ran.filter((a) => a.id === 'vcs/git-init');
    expect(gitRuns).toHaveLength(1);
    expect(gitRuns[0]?.cwd).toBe(cwd);
    expect(ran.find((a) => a.id === 'walking-skeleton/gradle-wrapper')?.cwd).toBe(
      path.join(cwd, 'backend'),
    );
    expect(ran.find((a) => a.id === 'walking-skeleton/npm-install')?.cwd).toBe(
      path.join(cwd, 'frontend'),
    );
  });

  it('records services on the root manifest and reciprocal peers on the services', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));

    const root = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(root?.services).toEqual([
      { path: 'backend', stack: 'quarkus-rest', buildSystem: 'gradle' },
      { path: 'frontend', stack: 'web-components', buildSystem: 'npm' },
    ]);
    expect(root?.verticals.map((v) => v.id)).toEqual(['vcs', 'fullstack']);

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.projects).toEqual(['peer.api.rest']);
    expect(backend?.peers).toEqual([{ ref: '../frontend', tags: ['peer.ui.spa'] }]);
    expect(backend?.verticals.map((v) => v.id)).toEqual([
      'walking-skeleton',
      'agent-harness',
      'code-style',
      'dev-env',
      'observability',
      'dev-container',
      'gateway',
    ]);

    const frontend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'frontend')));
    expect(frontend?.projects).toEqual(['peer.ui.spa']);
    expect(frontend?.peers).toEqual([{ ref: '../backend', tags: ['peer.api.rest'] }]);
  });

  it('wires the frontend to the backend through the gateway seam', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));

    expect(read('frontend/infrastructure/gateway-rest/src/rest-greet-gateway.ts')).toContain(
      'createRestGreetGateway',
    );
    expect(read('frontend/domain/domain-api/src/ports/greet-gateway.ts')).toContain(
      'export interface GreetGateway',
    );
    expect(read('frontend/domain/domain-api/src/index.ts')).toContain(
      "export * from './ports/greet-gateway';",
    );
    expect(read('frontend/domain/domain-core/src/internal/greet-service.ts')).toContain(
      'GreetGateway',
    );
    expect(read('frontend/domain/domain-core/package.json')).toContain('"@acme/gateway-rest"');
    expect(read('frontend/application/web-app/package.json')).toContain('"@acme/gateway-rest"');
    expect(read('frontend/application/web-app/src/main.ts')).toContain('createRestGreetGateway');
    expect(read('frontend/application/web-app/vite.config.ts')).toContain("'/api'");

    expect(
      read('backend/application/rest/executable/src/main/resources/application.properties'),
    ).toContain('%dev.quarkus.http.cors.enabled=true');
    expect(read('backend/contract/greet.openapi.yaml')).toContain('openapi: 3.1.0');
  });

  it('gives the product root the agent pair and the shims, with a map over its services', async () => {
    const { runDeferred } = recordActions();
    expectOk(await installMediator({ runDeferred }).dispatch(newFullstack({})));

    const doc = read('AGENTS.md')!;
    expect(doc).toContain('# Product root (keel)');
    expect(doc).toContain('- [`backend/`](backend/AGENTS.md) — a `quarkus-rest` service;');
    expect(doc).toContain('- [`frontend/`](frontend/AGENTS.md) — a `web-components` service;');
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(read('.gemini/settings.json')).toContain('"AGENTS.md"');
    expect(read('.aider.conf.yml')).toContain('read: [AGENTS.md]');
    // The rows resolve: every service of a composite install carries
    // its own harness, because --no-agent-harness is refused there.
    expect(read('backend/AGENTS.md')).toContain('Engineering conventions');
    expect(read('frontend/AGENTS.md')).toContain('Engineering conventions');
  });

  it('hoists no settings, hooks or skills to the product root', async () => {
    const { runDeferred } = recordActions();
    expectOk(await installMediator({ runDeferred }).dispatch(newFullstack({})));

    expect(read('.claude/settings.json')).toBeNull();
    expect(fs.pathExistsSync(path.join(cwd, '.claude', 'hooks'))).toBe(false);
    expect(fs.pathExistsSync(path.join(cwd, '.claude', 'skills'))).toBe(false);
    // The services keep theirs.
    expect(read('backend/.claude/settings.json')).not.toBeNull();
    expect(fs.pathExistsSync(path.join(cwd, 'backend', '.claude', 'skills'))).toBe(true);
  });

  it('containerises the pair with a Quarkus backend image', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));

    const compose = read('compose.yaml') ?? '';
    expect(compose).toContain('build: ./backend');
    expect(read('backend/Dockerfile')).toContain('FROM gradle:jdk25 AS build');
    // The SPA ships as an assets image populating a named volume as
    // an init container; a stock nginx serves the volume.
    const frontendImage = read('frontend/Dockerfile') ?? '';
    expect(frontendImage).toContain('FROM node:24-alpine AS build');
    expect(frontendImage).toContain('FROM alpine:3');
    expect(frontendImage).not.toContain('FROM nginx');
    expect(compose).toContain('image: nginx:alpine');
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).toContain('spa-assets:/assets');
    expect(compose).toContain('spa-assets:/usr/share/nginx/html:ro');
    // Clear-then-copy: a release must not leave the previous
    // release's files behind in the volume.
    const script = read('frontend/deploy-assets.sh') ?? '';
    expect(script.indexOf('find /assets -mindepth 1 -delete')).toBeGreaterThan(-1);
    expect(script.indexOf('find /assets -mindepth 1 -delete')).toBeLessThan(
      script.indexOf('cp -R /bundle/. /assets/'),
    );
    // The backend is an attached resource: nginx resolves the /api
    // proxy target from the environment at start, defaulted to the
    // sibling service — never baked into an image.
    expect(read('frontend/nginx.conf')).toContain('proxy_pass ${BACKEND_URL}/');
    expect(compose).toContain('BACKEND_URL: ${BACKEND_URL:-http://backend:8080}');
    // Docker sends the whole context to the builder, so secrets stay
    // out of it for every deployment unit.
    expect(read('backend/.dockerignore')).toContain('.env');
    expect(read('frontend/.dockerignore')).toContain('.env');
  });

  it('prefixes report changes and action descriptions with the service path', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const report = expectOk(await mediator.dispatch(newFullstack({})));

    expect(report.changes.some((c) => c.path === 'README.md')).toBe(true);
    expect(report.changes.some((c) => c.path.startsWith('backend/domain/'))).toBe(true);
    expect(report.changes.some((c) => c.path.startsWith('frontend/design-system/'))).toBe(true);
    expect(report.actions.some((a) => a.startsWith('backend: '))).toBe(true);
    expect(report.actions.some((a) => a.startsWith('frontend: npm install'))).toBe(true);
  });

  it('dry-run stages nothing on disk', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const report = expectOk(await mediator.dispatch(newFullstack({ dryRun: true })));
    expect(report.committed).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(read('README.md')).toBeNull();
    expect(read('backend/settings.gradle.kts')).toBeNull();
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toBeNull();
    expect(ran).toHaveLength(0);
  });

  it('refuses when a service directory is already initialised', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: path.join(cwd, 'backend'),
          stack: 'quarkus-rest',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const error = expectErr(await mediator.dispatch(newFullstack({})));
    expect(error.code).toBe('keel.already-initialised');
  });

  it('rejects an invalid layout with a clear message', async () => {
    const mediator = installMediator(recordActions());
    const error = expectErr(
      await mediator.dispatch({
        ...newFullstack({}),
        layout: 'many-repos' as unknown as 'monorepo',
      }),
    );
    expect(error.code).toBe('keel.invalid-layout');
  });
});

describe('fullstack composite install (polyrepo)', () => {
  it('gives each service its own repo and skips the shared root entirely', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({ layout: 'polyrepo' })));

    expect(read('README.md')).toBeNull();
    expect(read('compose.yaml')).toBeNull();
    // No shared root means no product-root harness either: there is
    // nothing for the map to be the root of.
    expect(read('AGENTS.md')).toBeNull();
    expect(read('CLAUDE.md')).toBeNull();
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toBeNull();

    const gitRuns = ran.filter((a) => a.id === 'vcs/git-init');
    expect(gitRuns.map((a) => a.cwd).sort()).toEqual([
      path.join(cwd, 'backend'),
      path.join(cwd, 'frontend'),
    ]);

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.verticals.map((v) => v.id)).toEqual([
      'vcs',
      'walking-skeleton',
      'agent-harness',
      'code-style',
      'dev-env',
      'observability',
      'dev-container',
      'gateway',
    ]);
    expect(backend?.peers).toEqual([{ ref: '../frontend', tags: ['peer.ui.spa'] }]);
  });

  it('prompts for the layout and each service build system when interactive', async () => {
    const prompt = new FakePrompt({
      layout: 'polyrepo',
      'buildSystem:backend': 'gradle',
      'buildSystem:frontend': 'npm',
      remote: '',
      commitHook: 'yes',
      changelog: 'yes',
      defaultBranch: 'main',
      basePackage: 'com.acme',
      projectName: 'walking-skeleton',
      npmScope: 'acme',
      stack: 'granular',
      'keel.review': 'proceed',
    });
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred, prompt });
    expectOk(await mediator.dispatch(newFullstack({ interactive: true })));
    expect(prompt.asked).toContain('layout');
    expect(prompt.asked).toContain('buildSystem:backend');
    expect(prompt.asked).toContain('buildSystem:frontend');
    expect(read('README.md')).toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();
  });
});

describe('brownfield: keel link + keel add gateway', () => {
  it('links two standalone projects and installs each side of the seam', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const backendDir = path.join(cwd, 'api');
    const frontendDir = path.join(cwd, 'app');
    await fs.ensureDir(backendDir);
    await fs.ensureDir(frontendDir);

    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: backendDir,
          stack: 'quarkus-rest',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: frontendDir,
          stack: 'web-components',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    const link = expectOk(
      await mediator.dispatch(linkPeerCommand({ cwd: frontendDir, ref: '../api' })),
    );
    expect(link.ref).toBe('../api');
    expect(link.projectedHere).toEqual(['peer.api.rest']);
    expect(link.projectedThere).toEqual(['peer.ui.spa']);

    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: frontendDir,
          verticals: ['gateway'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const gateway = path.join(frontendDir, 'infrastructure/gateway-rest/src/rest-greet-gateway.ts');
    expect(await fs.pathExists(gateway)).toBe(true);

    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: backendDir,
          verticals: ['gateway'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const properties = await fs.readFile(
      path.join(
        backendDir,
        'application/rest/executable/src/main/resources/application.properties',
      ),
      'utf8',
    );
    expect(properties).toContain('%dev.quarkus.http.cors.enabled=true');
  });

  it('refuses the gateway where no project is linked, and its card says so first', async () => {
    // It used to "install" here: zero files, recorded as installed —
    // which then blocked the real install after `keel link`.
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const appDir = path.join(cwd, 'solo');
    await fs.ensureDir(appDir);
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: appDir,
          stack: 'web-components',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const error = expectErr(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: appDir,
          verticals: ['gateway'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.uncoverable-vertical');
    expect(error.message).toBe(
      'Service gateway wires linked projects, and no linked project serves it here — link one that does first',
    );
    const manifest = await fsManifestStore.read(projectScopeRoot(appDir));
    expect(manifest?.verticals.map((v) => v.id)).not.toContain('gateway');

    const status = expectOk(await mediator.dispatch(projectStatusQuery({ cwd: appDir })));
    expect(status.available.find((v) => v.id === 'gateway')).toMatchObject({
      readiness: 'unavailable',
      refusal: { code: error.code, message: error.message },
    });
  });

  it('installs the gateway on a lone go-http once a project is linked, with no --reapply', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const apiDir = path.join(cwd, 'api');
    const appDir = path.join(cwd, 'app');
    for (const [dir, stack] of [
      [apiDir, 'go-http'],
      [appDir, 'web-components'],
    ] as const) {
      await fs.ensureDir(dir);
      expectOk(
        await mediator.dispatch(
          newProjectCommand({ cwd: dir, stack, answers: {}, interactive: false, dryRun: false }),
        ),
      );
    }
    const gateway = () =>
      mediator.dispatch(
        addVerticalCommand({
          cwd: apiDir,
          verticals: ['gateway'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      );
    const card = async () =>
      expectOk(await mediator.dispatch(projectStatusQuery({ cwd: apiDir }))).available.find(
        (v) => v.id === 'gateway',
      );

    // Alone, it is refused, and nothing is recorded that would stand in
    // the way later.
    expect((await card())?.readiness).toBe('unavailable');
    expect(expectErr(await gateway()).code).toBe('keel.uncoverable-vertical');

    expectOk(await mediator.dispatch(linkPeerCommand({ cwd: apiDir, ref: '../app' })));
    expect(await card()).toMatchObject({ readiness: 'ready', requires: [] });
    const report = expectOk(await gateway());
    expect(report.changes.length).toBeGreaterThan(0);
    const manifest = await fsManifestStore.read(projectScopeRoot(apiDir));
    expect(manifest?.verticals.map((v) => v.id)).toContain('gateway');
  });

  it('link refuses an uninitialised peer', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const appDir = path.join(cwd, 'solo');
    await fs.ensureDir(appDir);
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: appDir,
          stack: 'web-components',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const error = expectErr(
      await mediator.dispatch(linkPeerCommand({ cwd: appDir, ref: '../nowhere' })),
    );
    expect(error.code).toBe('keel.peer-not-initialised');
  });
});
