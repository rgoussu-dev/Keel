/**
 * Tests for per-service build systems in composite stacks (#73):
 * the `--build-system path=id` syntax, the per-service interactive
 * question, the choice recorded on the product manifest's service
 * refs, the compose Dockerfiles + product README following it, and
 * the proof that `keel add ci` on a service follows the same
 * choice through the service manifest's `pkg.*` tag. Deferred
 * actions are recorded, not run.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-builds-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const newComposite = (stack: string, opts: { buildSystem?: string; interactive?: boolean } = {}) =>
  newProjectCommand({
    cwd,
    stack,
    answers: {},
    interactive: opts.interactive ?? false,
    dryRun: false,
    ...(opts.buildSystem !== undefined ? { buildSystem: opts.buildSystem } : {}),
  });

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

describe('fullstack per-service build systems (--build-system path=id)', () => {
  it('scaffolds a Maven backend and a pnpm frontend, and records both choices', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(
      await mediator.dispatch(
        newComposite('fullstack', { buildSystem: 'backend=maven,frontend=pnpm' }),
      ),
    );

    expect(read('backend/pom.xml')).not.toBeNull();
    expect(read('backend/settings.gradle.kts')).toBeNull();
    expect(read('frontend/pnpm-workspace.yaml')).not.toBeNull();

    const root = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(root?.services).toEqual([
      { path: 'backend', stack: 'quarkus-rest', buildSystem: 'maven' },
      { path: 'frontend', stack: 'web-components', buildSystem: 'pnpm' },
    ]);

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.tags).toContain('pkg.maven');
    expect(backend?.tags).not.toContain('pkg.gradle');
    const frontend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'frontend')));
    expect(frontend?.tags).toContain('pkg.pnpm');
    expect(frontend?.tags).not.toContain('pkg.npm');

    expect(ran.find((a) => a.id === 'walking-skeleton/maven-wrapper')?.cwd).toBe(
      path.join(cwd, 'backend'),
    );
    expect(ran.find((a) => a.id === 'walking-skeleton/pnpm-install')?.cwd).toBe(
      path.join(cwd, 'frontend'),
    );
  });

  it('renders the compose Dockerfiles for the recorded build systems', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(
      await mediator.dispatch(
        newComposite('fullstack', { buildSystem: 'backend=maven,frontend=pnpm' }),
      ),
    );

    const backendDockerfile = read('backend/Dockerfile') ?? '';
    expect(backendDockerfile).toContain('FROM maven:3-eclipse-temurin-25 AS build');
    expect(backendDockerfile).toContain('RUN mvn -B package -DskipTests');
    expect(backendDockerfile).toContain('application/rest/executable/target/quarkus-app/');
    expect(backendDockerfile).not.toContain('gradle');

    const frontendDockerfile = read('frontend/Dockerfile') ?? '';
    expect(frontendDockerfile).toContain('corepack enable && pnpm install && pnpm run build');
    expect(frontendDockerfile).not.toContain('RUN npm install');
  });

  it('keeps the default Dockerfiles byte-compatible when no choice is made', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newComposite('fullstack')));

    const backendDockerfile = read('backend/Dockerfile') ?? '';
    expect(backendDockerfile).toContain('FROM gradle:jdk25 AS build');
    expect(backendDockerfile).toContain('RUN gradle build -x test');
    expect(backendDockerfile).toContain('application/rest/executable/build/quarkus-app/');

    const frontendDockerfile = read('frontend/Dockerfile') ?? '';
    expect(frontendDockerfile).toContain('RUN npm install && npm run build');
    expect(frontendDockerfile).not.toContain('pnpm');
  });

  it('writes run hints in the product README that match the recorded build systems', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(
      await mediator.dispatch(
        newComposite('fullstack', { buildSystem: 'backend=maven,frontend=pnpm' }),
      ),
    );

    const readme = read('README.md') ?? '';
    expect(readme).toContain('./mvnw -am -pl application/rest/executable quarkus:dev');
    expect(readme).toContain('pnpm run dev');
    expect(readme).not.toContain('./gradlew quarkusDev');
  });

  it('parameterises the ts-http backend image by the recorded package manager', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(
      await mediator.dispatch(newComposite('fullstack-ts', { buildSystem: 'backend=pnpm' })),
    );

    const backendDockerfile = read('backend/Dockerfile') ?? '';
    expect(backendDockerfile).toContain('corepack enable && pnpm install --prod --frozen-lockfile');
    expect(backendDockerfile).not.toContain('npm ci');

    const root = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(root?.services).toEqual([
      { path: 'backend', stack: 'ts-http', buildSystem: 'pnpm' },
      { path: 'frontend', stack: 'web-components', buildSystem: 'npm' },
    ]);
  });

  it('omits the ref field for services whose stack pins its build system', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newComposite('fullstack-go')));

    const root = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(root?.services).toEqual([
      { path: 'backend', stack: 'go-http' },
      { path: 'frontend', stack: 'web-components', buildSystem: 'npm' },
    ]);
  });

  it('asks the build-system question per service when interactive', async () => {
    const prompt = new FakePrompt({
      layout: 'monorepo',
      'buildSystem:backend': 'maven',
      'buildSystem:frontend': 'pnpm',
      remote: '',
      defaultBranch: 'main',
      basePackage: 'com.acme',
      projectName: 'walking-skeleton',
      npmScope: 'acme',
      stack: 'granular',
    });
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred, prompt });
    expectOk(await mediator.dispatch(newComposite('fullstack', { interactive: true })));

    expect(prompt.asked).toContain('buildSystem:backend');
    expect(prompt.asked).toContain('buildSystem:frontend');
    expect(read('backend/pom.xml')).not.toBeNull();
    expect(read('frontend/pnpm-workspace.yaml')).not.toBeNull();
  });

  it('rejects an unknown service path', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(newComposite('fullstack', { buildSystem: 'api=maven' })),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/no service 'api'/);
    expect(error.message).toMatch(/backend, frontend/);
  });

  it('rejects a build system the service stack does not offer', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(newComposite('fullstack', { buildSystem: 'backend=pnpm' })),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/does not support build system 'pnpm'/);
  });

  it('rejects a choice for a service whose stack pins its build system', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(newComposite('fullstack-go', { buildSystem: 'backend=gradle' })),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/fixed build system/);
  });

  it('rejects naming the same service twice', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newComposite('fullstack', { buildSystem: 'backend=maven,backend=gradle' }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/twice/);
  });
});

describe('ci follows the per-service choice through the service manifest', () => {
  it('emits a Maven pipeline for a backend scaffolded with backend=maven', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newComposite('fullstack', { buildSystem: 'backend=maven' })));

    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: path.join(cwd, 'backend'),
          vertical: 'ci',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    const workflow = read('backend/.github/workflows/ci.yml') ?? '';
    expect(workflow).toContain('./mvnw --batch-mode verify');
    expect(workflow).not.toContain('gradlew');
  });
});
