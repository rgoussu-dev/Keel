/**
 * Boots the emitted `dev/compose.yaml` — the one artefact of a
 * scaffolded project that no other suite in the tree ever runs.
 *
 * That gap shipped a bug. The dev database mounted its volume at
 * `/var/lib/postgresql/data`, which PostgreSQL 18 moved: `PGDATA` is
 * now a version-scoped subdirectory and the entrypoint *refuses to
 * start* when it finds a volume at the old path
 * (docker-library/postgres#1259). Every unit test passed — they read
 * the YAML — and every persistence e2e passed, because those reach
 * their database through Testcontainers, which mounts nothing. The
 * only check that could have caught it is this one: start the
 * container and wait for its healthcheck.
 *
 * Scope is deliberately the database. `docker compose config` parses
 * the whole file (mount options included), but the monitoring
 * services stay down: they are five image pulls, and the SELinux
 * relabel their mounts carry is inert on a GitHub runner, so booting
 * them would cost the shard a gigabyte to assert nothing this suite
 * can observe.
 *
 * Stack-agnostic content, scaffolded through the stack that reported
 * it: `database-compose` and `monitoring-compose` fire on
 * `arch.server-http` regardless of language. Every deferred action is
 * faked, so the suite needs a Docker daemon and no language
 * toolchain at all.
 *
 * Skip rules: skipped without a reachable Docker daemon; skipped on
 * CI by default, opt in with `KEEL_RUN_E2E=1`; opt out locally with
 * `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

/** A cold `postgres` pull plus a first-boot initdb. */
const TIMEOUT_MS = 10 * 60 * 1000;

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';

/**
 * A daemon, not a binary: `docker` on PATH with nothing listening is
 * exactly the shape of a shard that forgot to declare the tool, and
 * it fails minutes later inside `up` rather than skipping here.
 */
const dockerReady = (): boolean =>
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0 &&
  spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0;

const skip = optedOut || (onCI && !optedIn) || !dockerReady();

/** Runs `docker compose <args>` against the emitted file. */
function compose(cwd: string, project: string, args: readonly string[]): string {
  const r = spawnSync(
    'docker',
    ['compose', '-f', 'dev/compose.yaml', '--project-name', project, ...args],
    { cwd, encoding: 'utf8' },
  );
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed (exit ${r.status})\n${output}`);
  }
  return output;
}

/** Every deferred action faked — no toolchain is under test here. */
const fakeActions = (inputs: RunActionsInputs): Promise<void> =>
  runActions({
    ...inputs,
    actions: inputs.actions.map(
      (a): DeferredAction => ({
        id: a.id,
        description: `${a.description} [faked: no-op]`,
        run: () => Promise.resolve(),
      }),
    ),
  });

let cwd: string;
let project: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-dev-compose-'));
  // Compose's own `name:` would have every run of this suite share a
  // project; the temp directory's suffix keeps them apart.
  project = `keel-e2e-${path.basename(cwd).slice(-12)}`.toLowerCase();
});

afterEach(async () => {
  if (!skip) {
    spawnSync(
      'docker',
      [
        'compose',
        '-f',
        'dev/compose.yaml',
        '--project-name',
        project,
        'down',
        '-v',
        '--remove-orphans',
      ],
      { cwd, stdio: 'ignore' },
    );
  }
  await fs.remove(cwd);
});

describe.skipIf(skip)('the emitted dev environment', () => {
  it(
    'parses whole and brings the dev database up healthy',
    async () => {
      const mediator = installMediator({ keelVersion: '0.0.0-e2e', runDeferred: fakeActions });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'quarkus-cli-rest',
            moduleLayout: 'modulith',
            buildSystem: 'gradle',
            extraVerticals: ['persistence'],
            answers: {
              'walking-skeleton/quarkus-cli-bootstrap': {
                basePackage: 'com.acme.e2e',
                projectName: 'dev-compose-e2e',
              },
              'walking-skeleton/quarkus-rest-bootstrap': {
                basePackage: 'com.acme.e2e',
                projectName: 'dev-compose-e2e',
              },
              'vcs/git-init': { remote: '', defaultBranch: 'main' },
            },
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      // The whole file, monitoring services included: a mount option
      // compose cannot parse fails here rather than at the first
      // `up` a user runs.
      compose(cwd, project, ['config', '--quiet']);

      // `--wait` returns only once the healthcheck passes, so this
      // asserts a running server on an initialised data directory —
      // the postgres 18 failure exits before either.
      compose(cwd, project, ['up', '--detach', '--wait', 'db']);

      const container = compose(cwd, project, ['ps', '--quiet', 'db']).trim();
      expect(container).not.toBe('');
      const health = spawnSync(
        'docker',
        ['inspect', '--format', '{{.State.Health.Status}}', container],
        { encoding: 'utf8' },
      );
      expect(health.stdout.trim()).toBe('healthy');

      // One real query, which the healthcheck alone does not give:
      // `pg_isready` answers before initdb has necessarily created
      // the dialled role and database, and those live in the very
      // directory the mount point moved.
      // `-T`, not its `--no-tty` long form: the long spelling is a
      // recent addition and the runner's compose rejects it, where
      // the short flag has meant this since compose v2.
      const query = compose(cwd, project, [
        'exec',
        '-T',
        'db',
        'psql',
        '--username=app',
        '--dbname=dev_compose_e2e',
        '--tuples-only',
        '--command=select 1',
      ]);
      expect(query.trim()).toContain('1');
    },
    TIMEOUT_MS,
  );
});
