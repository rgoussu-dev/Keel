/**
 * Integration test for `keel new` — the `keel.new-project` command
 * dispatched through the mediator.
 *
 * Drives the full flow against a real temp directory: stack lookup,
 * vertical install, tree commit, action execution (real `git init`),
 * and manifest persistence. Scenario data lives in each test; the
 * wiring comes from the shared Factory.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakePrompt } from '../../../../src/infrastructure/prompt/fake.js';
import {
  expectErr,
  expectOk,
  installMediator,
  runActionsExcept,
} from '../../../support/factory.js';

const bootstrapAnswers = {
  'walking-skeleton/quarkus-cli-bootstrap': {
    basePackage: 'com.acme.cli',
    projectName: 'demo',
  },
  'vcs/git-init': { remote: '', defaultBranch: 'main' },
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-new-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe('keel.new-project (keel new)', () => {
  it('bootstraps a Quarkus CLI project end-to-end', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('quarkus-cli');
    expect(report.committed).toBe(true);
    expect(report.changes.length).toBeGreaterThan(0);

    // Tree-emitted files landed on disk.
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'settings.gradle.kts'))).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'application/cli/src/main/java/com/acme/cli/cli/Main.java'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'domain/kernel/src/main/java/com/acme/cli/kernel/Mediator.java'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'domain/core/src/main/java/com/acme/cli/core/greet/GreetHandler.java'),
      ),
    ).toBe(true);

    // Binding spec landed at the project root, with its pointer.
    const agentsMd = await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(await fs.readFile(path.join(cwd, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');

    // Action ran: git repo exists, branch is main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('main');

    // Manifest was persisted with the stack's tags + verticals + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(
      [
        'agentic.claude-kit',
        'arch.cli',
        'arch.hexagonal',
        'dev.container',
        'framework.quarkus',
        'lang.java',
        'layout.basic',
        'pkg.gradle',
        'runtime.jvm',
        'style.lint-managed',
        'style.managed',
      ].sort(),
    );
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual([
      'code-style',
      'dev-container',
      'vcs',
      'walking-skeleton',
    ]);
    expect(manifest!.answers['walking-skeleton/quarkus-cli-bootstrap']).toEqual({
      basePackage: 'com.acme.cli',
      projectName: 'demo',
    });
  });

  it('bootstraps a Go CLI project end-to-end', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/go-bootstrap']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'go-cli',
          answers: {
            'walking-skeleton/go-bootstrap': {
              modulePath: 'github.com/acme/shipper',
              projectName: 'shipper',
            },
            'vcs/git-init': { remote: '', defaultBranch: 'main' },
          },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('go-cli');
    expect(report.committed).toBe(true);

    // The Go reference tree landed on disk: assembly point, contract
    // face, hidden core, primary adapter, port fake.
    for (const p of [
      'go.mod',
      'cmd/cli/main.go',
      'internal/domain/greet.go',
      'internal/domain/internal/greet/greet.go',
      'internal/app/cli/app.go',
      'internal/infra/clockfake/clock.go',
      'AGENTS.md',
    ]) {
      expect(await fs.pathExists(path.join(cwd, p)), `missing ${p}`).toBe(true);
    }

    // Action ran: git repo exists on main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);

    // Manifest was persisted with the stack's tags + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(
      // `layout.basic` is the dial's default, recorded so a later
      // `keel add` resolves the same shape the project was built on.
      [
        'agentic.claude-kit',
        'arch.cli',
        'arch.hexagonal',
        'dev.container',
        'lang.go',
        'layout.basic',
        'pkg.go-modules',
        'style.lint-managed',
        'style.managed',
      ].sort(),
    );
    expect(manifest!.answers['walking-skeleton/go-bootstrap']).toEqual({
      modulePath: 'github.com/acme/shipper',
      projectName: 'shipper',
    });
  });

  it('bootstraps a Rust CLI project end-to-end', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/rust-bootstrap']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'rust-cli',
          answers: {
            'walking-skeleton/rust-bootstrap': { projectName: 'shipper' },
            'vcs/git-init': { remote: '', defaultBranch: 'main' },
          },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('rust-cli');
    expect(report.committed).toBe(true);

    // The Rust reference tree landed on disk: assembly point, contract
    // face, hidden core, primary adapter, port fake.
    for (const p of [
      'Cargo.toml',
      'src/bin/cli/main.rs',
      'src/bin/cli/app.rs',
      'src/domain.rs',
      'src/domain/greet.rs',
      'src/infra/clock_fake.rs',
      'AGENTS.md',
    ]) {
      expect(await fs.pathExists(path.join(cwd, p)), `missing ${p}`).toBe(true);
    }

    // Action ran: git repo exists on main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);

    // Manifest was persisted with the stack's tags + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(
      // `layout.basic` is the dial's default, recorded so a later
      // `keel add` resolves the same shape the project was built on.
      [
        'agentic.claude-kit',
        'arch.cli',
        'arch.hexagonal',
        'dev.container',
        'lang.rust',
        'layout.basic',
        'pkg.cargo',
        'style.lint-managed',
        'style.managed',
      ].sort(),
    );
    expect(manifest!.answers['walking-skeleton/rust-bootstrap']).toEqual({
      projectName: 'shipper',
    });
  });

  it('writes nothing under --dry-run', async () => {
    const mediator = installMediator();
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(report.committed).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
    expect(await fs.pathExists(path.join(projectScopeRoot(cwd), '.keel-manifest.json'))).toBe(
      false,
    );
  });

  it('refuses to run if a manifest already exists', async () => {
    await fs.ensureDir(projectScopeRoot(cwd));
    await fs.writeJson(path.join(projectScopeRoot(cwd), '.keel-manifest.json'), {
      version: 2,
      keelVersion: '0.4.0-alpha',
      installedAt: 'x',
      updatedAt: 'x',
      tags: [],
      verticals: [],
      versions: {},
      answers: {},
      entries: [],
    });
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.already-initialised');
    expect(error.message).toMatch(/already initialised/);
  });

  it('rejects an unknown stack id', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'imaginary-stack',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(error.code).toBe('keel.unknown-stack');
    expect(error.message).toMatch(/unknown stack/);
  });
});

describe('keel.new-project build-system selection', () => {
  it('scaffolds quarkus-cli on Maven with an explicit build-system id', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/maven-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
          buildSystem: 'maven',
        }),
      ),
    );
    expect(report.committed).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'application/cli/pom.xml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
    expect(report.actions.some((a) => a.startsWith('mvn -N wrapper:wrapper'))).toBe(true);

    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('pkg.maven');
    expect(manifest?.tags).not.toContain('pkg.gradle');
  });

  it('defaults to Gradle when no build system is chosen non-interactively', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(false);

    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('pkg.gradle');
  });

  it('asks interactively and honours the chosen build system', async () => {
    const prompt = new FakePrompt({
      buildSystem: 'maven',
      moduleLayout: 'basic',
      remote: '',
      defaultBranch: 'main',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/maven-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: false,
        }),
      ),
    );
    expect(prompt.asked).toContain('buildSystem');
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
  });

  it('rejects a build system the stack does not offer', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'pnpm',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/does not support build system 'pnpm'/);
    expect(error.message).toMatch(/gradle, maven/);
  });

  it('rejects --build-system for a stack with a fixed build system', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'go-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'maven',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/fixed build system/);
  });

  it('rejects a bare build-system id on composite stacks — the choice is per service', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack',
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'maven',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-build-system');
    expect(error.message).toMatch(/composite/);
    expect(error.message).toMatch(/backend=maven/);
  });
});

describe('keel.new-project module-layout selection', () => {
  it('defaults to the flat trisection, and records the tag', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('layout.basic');
    expect(await fs.pathExists(path.join(cwd, 'domain/kernel'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'modules'))).toBe(false);
  });

  it('honours --module-layout=modulith and scaffolds the carved tree', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          moduleLayout: 'modulith',
        }),
      ),
    );
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('layout.modulith');
    expect(await fs.pathExists(path.join(cwd, 'platform/kernel'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'modules/greeting/user-side/service'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'application/cli'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'domain'))).toBe(false);
  });

  it('asks interactively and honours the chosen layout', async () => {
    const prompt = new FakePrompt({
      buildSystem: 'gradle',
      moduleLayout: 'modulith',
      remote: '',
      defaultBranch: 'main',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: false,
        }),
      ),
    );
    expect(prompt.asked).toContain('moduleLayout');
    expect(await fs.pathExists(path.join(cwd, 'platform/kernel'))).toBe(true);
  });

  it('rejects a module layout the stack does not offer', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          moduleLayout: 'hexagon',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-module-layout');
    expect(error.message).toMatch(/does not support module layout 'hexagon'/);
    expect(error.message).toMatch(/basic, modulith/);
  });

  /**
   * This replaced a test that used `rust-cli` as its example of a
   * stack shipping one layout. Roadmap item I is what made that
   * example impossible: with I.4 the fifth and last stack family got
   * the dial, so no single-arch service stack shipped a single layout
   * any more. The composable-entrypoint combos (`quarkus-cli-rest`,
   * …, `ts-cli-http`) were the last exemption — they shipped
   * `arch.cli` + `arch.server-http` on one hexagon under `basic`
   * only, until the same shared-root upsert mechanism reached the
   * modulith tree shape. The list is now empty, and that is the
   * assertion.
   *
   * The branch this guards is kept rather than deleted — a future
   * stack that ships one layout must still reject the flag rather
   * than silently accept one it cannot honour — and this test pins
   * the invariant as "every service stack offers the dial" rather
   * than letting it go untested.
   */
  it('offers the module-layout dial on every service stack', () => {
    const singleLayout = Object.values(STACKS)
      .filter((stack) => stack.services === undefined)
      .filter((stack) => stack.moduleLayouts === undefined)
      .map((stack) => stack.id)
      .sort();

    expect(singleLayout).toEqual([]);
  });

  it('rejects --module-layout on composite stacks', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack',
          answers: {},
          interactive: false,
          dryRun: false,
          moduleLayout: 'modulith',
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-module-layout');
    expect(error.message).toMatch(/composite/);
  });
});

describe('keel.new-project peer-context selection', () => {
  /**
   * Every single-service stack, with the flag and the layout it
   * needs. Used by both invariant tests below, which between them
   * partition this list: a stack either scaffolds the peer or is
   * named as unable to, and neither set may be silent.
   */
  const singleServiceStacks = Object.values(STACKS).filter((stack) => stack.services === undefined);

  /** Dispatches `keel new --module-layout=modulith --with-peer-context`. */
  const withPeer = async (stack: string, dryRun = true) => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    return mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: {},
        interactive: false,
        dryRun,
        moduleLayout: 'modulith',
        withPeerContext: true,
      }),
    );
  };

  /**
   * The bug this guard exists for, stated as the invariant rather
   * than pinned to an example stack: `--with-peer-context` used to
   * exit 0 having emitted nothing, and the resolver cannot catch that
   * because a peer-context adapter declares `covers: []` and leaves
   * no dimension uncovered. So the flag must be accepted exactly
   * where it scaffolds a second context, and rejected everywhere
   * else — never accepted in silence.
   *
   * `keel.invalid-module-layout` counts as rejected too: the
   * basic-only composable-entrypoint combo stacks (see the
   * module-layout dial test above) refuse `--module-layout modulith`
   * itself before peer-context resolution is ever reached, which is
   * a more fundamental "no" than "no peer-context adapter" but not a
   * silent accept.
   *
   * Deliberately not written against a named unsupported stack. That
   * is what the first version did, and it went stale in the same
   * commit that gave Go its adapter.
   */
  it('is accepted exactly where it scaffolds a second context', async () => {
    const outcomes: Record<string, string> = {};
    for (const stack of singleServiceStacks) {
      const result = await withPeer(stack.id);
      outcomes[stack.id] = result.ok
        ? result.value.changes.some((change) => change.path.includes('guestbook'))
          ? 'scaffolded'
          : 'accepted in silence'
        : result.error.code === 'keel.invalid-peer-context' ||
            result.error.code === 'keel.invalid-module-layout'
          ? 'rejected'
          : `failed with ${result.error.code}`;
    }

    const wrong = Object.entries(outcomes).filter(
      ([, outcome]) => outcome !== 'scaffolded' && outcome !== 'rejected',
    );
    expect(wrong).toEqual([]);
  });

  /**
   * The rejection names the stack and the alternatives, and the list
   * is derived from the adapters rather than written down — so this
   * asserts the derivation, not a copy of it.
   *
   * The list is also what makes the message survive: once every stack
   * in the catalog has a peer-context adapter, no real stack reaches
   * this branch, and the assertion below says so rather than
   * quietly testing nothing. Same shape as the `single module layout`
   * branch above, and for the same reason.
   */
  it('names the stack and the alternatives when it rejects', async () => {
    const rejected: string[] = [];
    let message = '';
    for (const stack of singleServiceStacks) {
      const result = await withPeer(stack.id);
      if (!result.ok && result.error.code === 'keel.invalid-peer-context') {
        rejected.push(stack.id);
        message = result.error.message;
      }
    }

    if (rejected.length === 0) {
      // Unreachable through any shipped stack. Kept rather than
      // deleted: a future family arrives without an adapter, and must
      // still be told rather than silently handed one context.
      const supported = singleServiceStacks.map((s) => s.id);
      expect(rejected).toEqual([]);
      expect(supported.length).toBeGreaterThan(0);
      return;
    }

    const named = rejected[rejected.length - 1] as string;
    expect(message).toMatch(new RegExp(`stack '${named}' has no peer-context adapter`));
    expect(message).toMatch(/would scaffold nothing/);
    const listed = (/Stacks that support it: (.*)$/.exec(message)?.[1] ?? '').split(', ');
    expect(listed).not.toContain(named);
    expect(listed.length).toBeGreaterThan(0);
  });

  /**
   * And every accepted stack emits a second context rather than
   * merely tolerating the flag — the same failure again, restated as
   * a positive so a regression reads as a missing guestbook.
   */
  it('scaffolds a guestbook context on every stack it accepts', async () => {
    for (const stack of singleServiceStacks) {
      const result = await withPeer(stack.id);
      if (!result.ok) continue;
      expect({
        stack: stack.id,
        peer: result.value.changes.some((change) => change.path.includes('guestbook')),
      }).toEqual({ stack: stack.id, peer: true });
    }
  });

  it('rejects the flag under the flat layout, and says which layout it needs', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: false,
          dryRun: true,
          moduleLayout: 'basic',
          withPeerContext: true,
        }),
      ),
    );

    expect(error.code).toBe('keel.invalid-peer-context');
    expect(error.message).toMatch(/needs the modulith layout/);
    // Language-neutral: `user-side/service` is the JVM and Rust
    // spelling of the seam, and Go has no such path at all.
    expect(error.message).not.toMatch(/user-side\/service/);
  });

  it('rejects the flag on composite stacks', async () => {
    const mediator = installMediator();
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack',
          answers: {},
          interactive: false,
          dryRun: true,
          withPeerContext: true,
        }),
      ),
    );

    expect(error.code).toBe('keel.invalid-peer-context');
    expect(error.message).toMatch(/composite/);
  });
});

/**
 * `keel new` records which bounded contexts it emitted.
 *
 * The tags say a project is a modulith and that a peer context was
 * opted into; neither says *which* contexts exist, and that is the
 * question `keel add module` has to answer before it can refuse a
 * duplicate name or bind a gateway. So the manifest carries the list,
 * and these tests hold the two facts that make it useful: the flat
 * layout has no contexts to record, and the peer context is recorded
 * as publishing no seam.
 */
describe('keel new records its bounded contexts', () => {
  const scaffold = async (moduleLayout: string, withPeerContext: boolean) => {
    const mediator = installMediator({
      runDeferred: runActionsExcept([
        'walking-skeleton/gradle-wrapper',
        'walking-skeleton/cargo-check',
      ]),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'rust-cli',
          answers: {},
          interactive: false,
          dryRun: false,
          moduleLayout,
          withPeerContext,
        }),
      ),
    );
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    return manifest?.modules ?? [];
  };

  it('records nothing under the flat layout, which has no contexts to name', async () => {
    expect(await scaffold('basic', false)).toEqual([]);
  });

  it('records the skeleton context, with its seam', async () => {
    expect(await scaffold('modulith', false)).toEqual([
      { name: 'greeting', installedAt: expect.any(String) as unknown as string, seam: true },
    ]);
  });

  it('records the peer context as publishing no seam of its own', async () => {
    const modules = await scaffold('modulith', true);
    expect(modules.map((m) => [m.name, m.seam])).toEqual([
      ['greeting', true],
      ['guestbook', false],
    ]);
  });
});
