/**
 * Integration test for `keel add persistence` — the SQL persistence
 * vertical layered brownfield onto a Quarkus REST project.
 *
 * Each scenario runs `keel new` to seed a project, adds the
 * vertical through the mediator, and asserts what landed on disk and
 * in the manifest: the isolated migrations unit, the compose
 * database, the module registration per build system, and the
 * capability tags. The unsupported-stack refusal (uncovered
 * dimensions) closes the file.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectOk, installMediator, runActionsExcept } from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-persistence-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Deferred actions that shell out to tools the test host may lack. */
const SKIPPED_ACTIONS = [
  'walking-skeleton/gradle-wrapper',
  'walking-skeleton/maven-wrapper',
  'walking-skeleton/npm-install',
  'walking-skeleton/pnpm-install',
  'observability/ts-observability',
  'persistence/ts-persistence',
];

const seed = async (stack: string, buildSystem?: string): Promise<void> => {
  const mediator = installMediator({ runDeferred: runActionsExcept(SKIPPED_ACTIONS) });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: { 'vcs/git-init': { remote: '', defaultBranch: 'main' } },
        interactive: false,
        dryRun: false,
        ...(buildSystem ? { buildSystem } : {}),
      }),
    ),
  );
};

const addPersistence = async (): Promise<void> => {
  expectOk(
    await installMediator({ runDeferred: runActionsExcept(SKIPPED_ACTIONS) }).dispatch(
      addVerticalCommand({
        cwd,
        vertical: 'persistence',
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
};

const readFile = (p: string): Promise<string> => fs.readFile(path.join(cwd, p), 'utf8');

const manifest = async (): Promise<ManifestV2> => {
  const stored = await fsManifestStore.read(projectScopeRoot(cwd));
  expect(stored).not.toBeNull();
  return stored!;
};

describe('keel.add-vertical (keel add persistence)', () => {
  it('layers the SQL slice onto a Gradle Quarkus REST project', async () => {
    await seed('quarkus-rest');
    await addPersistence();

    expect(await readFile('migrations/sql/V1__create_greeting.sql')).toContain(
      'create table greeting',
    );
    expect(await readFile('migrations/Dockerfile')).toContain('FROM flyway/flyway:13-alpine');
    const compose = await readFile('dev/compose.yaml');
    expect(compose).toContain('image: postgres:18-alpine');
    expect(compose).toContain('build: ../migrations');
    expect(await readFile('settings.gradle.kts')).toContain(
      'include(":infrastructure:greeting-log:jdbc")',
    );
    // The quarkus-rest stack installs observability by default, so
    // the datasource joins the exported traces.
    const properties = await readFile(
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('quarkus.datasource.jdbc.telemetry=true');

    const stored = await manifest();
    expect(stored.verticals.map((v) => v.id)).toContain('persistence');
    expect(stored.tags).toContain('db.postgres');
    expect(stored.tags).toContain('db.migrations.flyway');
  });

  it('registers the modules through the poms on a Maven project', async () => {
    await seed('quarkus-rest', 'maven');
    await addPersistence();

    expect(await readFile('pom.xml')).toContain(
      '<module>infrastructure/greeting-log/jdbc</module>',
    );
    expect(await readFile('application/rest/executable/pom.xml')).toContain(
      '<artifactId>quarkus-flyway</artifactId>',
    );
    expect(await readFile('infrastructure/unit-of-work/jta/pom.xml')).toContain(
      '<artifactId>infrastructure-unit-of-work-jta</artifactId>',
    );
  });

  it('layers the Spring slice onto a Gradle spring-rest project', async () => {
    await seed('spring-rest');
    await addPersistence();

    expect(await readFile('settings.gradle.kts')).toContain(
      'include(":infrastructure:unit-of-work:spring-tx")',
    );
    expect(await readFile('application/rest/executable/build.gradle.kts')).toContain(
      'spring-boot-starter-jdbc',
    );
    expect(
      await readFile('application/rest/executable/src/main/resources/application-prod.properties'),
    ).toContain('spring.flyway.enabled=false');

    const stored = await manifest();
    expect(stored.tags).toContain('db.postgres');
  });

  it('layers the TS slice onto an npm ts-http project', async () => {
    await seed('ts-http');
    await addPersistence();

    expect(await readFile('application/rest/src/server.ts')).toContain(
      "url.pathname === '/greetings'",
    );
    expect(await readFile('application/rest/package.json')).toContain(
      '"@acme/infrastructure-unit-of-work": "*"',
    );
    expect(await readFile('migrations/Dockerfile')).toContain('FROM flyway/flyway:13-alpine');

    const stored = await manifest();
    expect(stored.verticals.map((v) => v.id)).toContain('persistence');
    expect(stored.tags).toContain('db.postgres');
  });

  it('threads preset dial answers (--set) through the install and persists them', async () => {
    await seed('ts-http');
    expectOk(
      await installMediator({ runDeferred: runActionsExcept(SKIPPED_ACTIONS) }).dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'persistence',
          answers: { 'persistence/database-compose': { migrations: 'liquibase' } },
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    expect(await readFile('migrations/Dockerfile')).toContain(
      'FROM liquibase/liquibase:5.0-alpine',
    );
    expect(await readFile('migrations/changelog.yaml')).toContain(
      'path: sql/V1__create_greeting.sql',
    );

    const stored = await manifest();
    expect(stored.tags).toContain('db.migrations.liquibase');
    expect(stored.answers['persistence/database-compose']?.['migrations']).toBe('liquibase');
  });

  it('hard-fails on a CLI-shaped project with the uncovered dimensions', async () => {
    await seed('quarkus-cli');
    await expect(
      installMediator().dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'persistence',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    ).rejects.toThrow(/no adapter covers dimension\(s\)/);
  });
});
