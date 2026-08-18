/**
 * The Go persistence cell extended along the migrations dial:
 * `keel add persistence` with the sticky `migrations` answer preset
 * to `liquibase`, on the Go modulith.
 *
 * What only this file proves: the dial rides the whole install path
 * (questions preset → dials adapter guard → the Flyway adapter
 * standing down → the Liquibase unit landing) and the emitted
 * project neither knows nor cares — `go vet/test/build` all green,
 * the contract test replaying the same `migrations/sql/*.sql`
 * against its Testcontainers database (this shard has Docker). The
 * runner unit's shape is asserted directly: Liquibase image, YAML
 * changelog wrapping the SQL, `LIQUIBASE_COMMAND_*` one-shot in the
 * dev compose, and no Flyway fingerprints anywhere.
 *
 * Sibling of `modulith-go-persistence.test.ts`; its own file because
 * a test file is the unit of CI scheduling.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addVertical,
  E2E_TIMEOUT_MS,
  goRun,
  mkTempDir,
  scaffold,
  sharedGoHome,
  skipGoE2E,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await sharedGoHome();
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-go-persistence-liquibase-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipGoE2E)('go-http modulith persistence e2e (liquibase)', () => {
  it(
    'takes the persistence vertical dialed to liquibase and stays green',
    async () => {
      await scaffold({ stack: 'go-http', projectName: 'skel', moduleLayout: 'modulith' }, cwd);
      await addVertical('persistence', cwd, {
        'persistence/database-compose': { engine: 'postgres', migrations: 'liquibase' },
      });

      goRun(cwd, goHome, ['vet', './...']);
      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', './...']);

      const dockerfile = await fs.readFile(path.join(cwd, 'migrations', 'Dockerfile'), 'utf8');
      expect(dockerfile).toContain('FROM liquibase/liquibase:5.0-alpine');
      expect(dockerfile).toContain('CMD ["update"]');
      const changelog = await fs.readFile(path.join(cwd, 'migrations', 'changelog.yaml'), 'utf8');
      expect(changelog).toContain('path: sql/V1__create_greeting.sql');
      await expect(
        fs.pathExists(path.join(cwd, 'migrations', 'sql', 'V1__create_greeting.sql')),
      ).resolves.toBe(true);
      const compose = await fs.readFile(path.join(cwd, 'dev', 'compose.yaml'), 'utf8');
      expect(compose).toContain('LIQUIBASE_COMMAND_URL: jdbc:postgresql://db:5432/skel');
      expect(compose).not.toContain('FLYWAY_URL');
    },
    E2E_TIMEOUT_MS,
  );
});
