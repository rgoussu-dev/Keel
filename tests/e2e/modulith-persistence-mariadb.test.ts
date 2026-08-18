/**
 * The `modulith-persistence` cell pattern extended along the engine
 * dial: `keel add persistence` with the sticky `engine` answer preset
 * to `mariadb`, onto `quarkus-rest --module-layout=modulith`, and a
 * build.
 *
 * What only this cell proves: the MariaDB spec record's build
 * coordinates resolve (quarkus-jdbc-mariadb, flyway-mysql,
 * mariadb-java-client, org.testcontainers:mariadb) and the
 * engine-conditional template branches — the `Timestamp`-based JDBC
 * time mapping, the MariaDbTestFixture-free Quarkus shape, the
 * contract test's MariaDBContainer — compile. Per I.5 the shard runs
 * no Docker daemon, so the emitted Docker-bound tests are excluded
 * and the cell asserts compilation and wiring, exactly like its
 * postgres sibling.
 *
 * Not a cell of the modulith grid but a vertical layered onto one —
 * sibling of `modulith-persistence.test.ts`; its own file because a
 * test file is the unit of CI scheduling.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmPersistenceE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-pers-mariadb-'));
  gradleUserHome = await fs.mkdtemp(
    path.join(os.tmpdir(), 'keel-e2e-modulith-pers-mariadb-gradle-'),
  );
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e (persistence, mariadb)', () => {
  it(
    'layers the persistence vertical dialed to mariadb and still builds',
    async () => {
      await runJvmPersistenceE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/q/health/live',
          healthReadyPath: '/q/health/ready',
        },
        cwd,
        gradleUserHome,
        { 'persistence/database-compose': { engine: 'mariadb', migrations: 'flyway' } },
      );

      // The dial's fingerprints, on top of the shared assertions: the
      // engine followed into config, build, schema and compose.
      const properties = await fs.readFile(
        path.join(cwd, 'application/api/src/main/resources/application.properties'),
        'utf8',
      );
      expect(properties).toContain('quarkus.datasource.db-kind=mariadb');
      expect(properties).toContain('quarkus.datasource.devservices.image-name=mariadb:12');
      const assemblyBuild = await fs.readFile(
        path.join(cwd, 'application/api/build.gradle.kts'),
        'utf8',
      );
      expect(assemblyBuild).toContain('io.quarkus:quarkus-jdbc-mariadb');
      expect(assemblyBuild).toContain('org.flywaydb:flyway-mysql');
      const migration = await fs.readFile(
        path.join(cwd, 'migrations/sql/V1__create_greeting.sql'),
        'utf8',
      );
      expect(migration).toContain('bigint auto_increment primary key');
      const compose = await fs.readFile(path.join(cwd, 'dev/compose.yaml'), 'utf8');
      expect(compose).toContain('image: mariadb:12');
      expect(compose).toContain('MARIADB_DATABASE: walking_skeleton_quarkus_rest_e2e');
    },
    E2E_TIMEOUT_MS,
  );
});
