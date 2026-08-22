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
      extraVerticals: '',
      'keel.review': 'proceed',
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
      withPeerContext: 'no',
      remote: '',
      defaultBranch: 'main',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      extraVerticals: '',
      'keel.review': 'proceed',
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

    // A declared rule now, not a hand-written branch — so the refusal
    // carries the rule's id and the tags that matched, and the same
    // sentence is what keeps the choice off the interactive menu.
    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toMatch(/needs the modulith layout/);
    expect(error.message).toContain('walking-skeleton/peer-context-needs-modulith');
    expect(error.message).toContain('modules.peer-context');
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

/**
 * The wizard's first question: which stack to scaffold. Gap #1 from
 * the interactive-flow issue — `keel new` used to default to
 * `quarkus-cli` silently, even when interactive.
 */
describe('keel.new-project stack selection', () => {
  it('drills down language → adapters → framework when interactive and omitted', async () => {
    const prompt = new FakePrompt({
      language: 'java@jvm',
      entrypoints: 'cli',
      framework: 'quarkus',
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          answers: {},
          interactive: true,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('quarkus-cli');
    expect(prompt.asked.slice(0, 3)).toEqual(['language', 'entrypoints', 'framework']);
    expect(prompt.asked).not.toContain('stack');
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
  });

  it('resolves both user-side adapters to the composed preset, not a product', async () => {
    const prompt = new FakePrompt({
      language: 'go',
      entrypoints: 'cli,server-http',
      moduleLayout: 'basic',
      modulePath: 'example.com/demo',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      // `observability/monitoring-compose` declares a question of its
      // own under this id; the wizard's own `stack` question is not
      // asked here, and the two are told apart by their asker.
      stack: 'granular',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/go-mod-tidy']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, answers: {}, interactive: true, dryRun: true }),
      ),
    );
    expect(report.subject).toBe('go-cli-http');
    // One project, not two services — nothing is scaffolded under a
    // service subdirectory.
    expect(report.changes.every((c) => !c.path.startsWith('backend/'))).toBe(true);
  });

  it('never asks for a framework where the language has only one', async () => {
    const prompt = new FakePrompt({
      language: 'rust',
      entrypoints: 'cli',
      moduleLayout: 'basic',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, answers: {}, interactive: true, dryRun: true }),
      ),
    );
    expect(report.subject).toBe('rust-cli');
    expect(prompt.asked).not.toContain('framework');
  });

  it('skips the adapter question where the language reaches one combination', async () => {
    const prompt = new FakePrompt({
      language: 'typescript@browser',
      buildSystem: 'npm',
      moduleLayout: 'basic',
      npmScope: 'demo',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, answers: {}, interactive: true, dryRun: true }),
      ),
    );
    expect(report.subject).toBe('web-components');
    expect(prompt.asked).not.toContain('entrypoints');
    expect(prompt.asked).not.toContain('framework');
  });

  it('falls through to the flat preset list for the products no language covers', async () => {
    const prompt = new FakePrompt({
      language: 'keel.by-id',
      // Asked twice under one id, by two different askers: the
      // wizard's flat preset list, then the backend's
      // `observability/monitoring-compose` dial.
      stack: ['fullstack-go', 'granular'],
      layout: 'monorepo',
      'buildSystem:frontend': 'npm',
      modulePath: 'example.com/demo',
      npmScope: 'demo',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, answers: {}, interactive: true, dryRun: true }),
      ),
    );
    expect(report.subject).toBe('fullstack-go');
    expect(prompt.asked.slice(0, 2)).toEqual(['language', 'stack']);
  });

  it('rejects a combination the menus never offered', async () => {
    const prompt = new FakePrompt({ language: 'typescript@node', entrypoints: 'spa' });
    const mediator = installMediator({ prompt });
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({ cwd, answers: {}, interactive: true, dryRun: true }),
      ),
    );
    expect(error.code).toBe('keel.unknown-stack');
    expect(error.message).toContain('TypeScript (Node)');
    expect(error.message).toContain('Browser SPA');
  });

  it('an explicit --stack suppresses the whole drill-down', async () => {
    const prompt = new FakePrompt({
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
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
    expect(report.subject).toBe('quarkus-cli');
    expect(prompt.asked).not.toContain('stack');
    expect(prompt.asked).not.toContain('language');
    expect(prompt.asked).not.toContain('entrypoints');
    expect(prompt.asked).not.toContain('framework');
  });

  it('defaults to quarkus-cli non-interactively when omitted', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.subject).toBe('quarkus-cli');
  });
});

/**
 * The wizard's fourth step: verticals layered on top of the stack's
 * own, in the same run. `--with` is the flag half; the multi-select
 * is the interactive half.
 */
describe('keel.new-project extra verticals', () => {
  it('layers the verticals --with names on top of the stack’s own', async () => {
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
          extraVerticals: ['distribution', 'ci'],
        }),
      ),
    );
    expect(report.subject).toBe('quarkus-cli');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    const installed = manifest?.verticals.map((v) => v.id) ?? [];
    expect(installed).toContain('distribution');
    expect(installed).toContain('ci');
    // The stack's own first, the extras after, in the order named —
    // which is what lets them resolve against one another's tags.
    expect(installed.slice(-2)).toEqual(['distribution', 'ci']);
  });

  it('installs none when --with is omitted non-interactively', async () => {
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
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.verticals.map((v) => v.id)).not.toContain('distribution');
  });

  it('asks for them interactively, as a set, and honours the answer', async () => {
    const prompt = new FakePrompt({
      extraVerticals: 'ci',
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      provider: 'github-actions',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: true,
        }),
      ),
    );
    expect(prompt.asked).toContain('extraVerticals');
    expect(report.changes.some((c) => c.path.startsWith('.github/workflows/'))).toBe(true);
  });

  it('is asked last of the stack dials, so the menu can be pruned against their answers', async () => {
    const prompt = new FakePrompt({
      extraVerticals: '',
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: true,
        }),
      ),
    );
    expect(prompt.asked.slice(0, 3)).toEqual(['buildSystem', 'moduleLayout', 'extraVerticals']);
  });

  it('never offers a vertical the stack already installs, nor one it cannot cover', async () => {
    const prompt = new FakePrompt({
      extraVerticals: '',
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: true,
        }),
      ),
    );
    const asked = prompt.questions.find((q) => q.id === 'extraVerticals');
    expect(asked?.kind).toBe('multi-select');
    const offered = asked?.choices?.map((c) => c.value) ?? [];
    for (const own of STACKS['quarkus-cli']?.verticals ?? []) {
      expect(offered).not.toContain(own.id);
    }
    expect(offered).toContain('ci');
    // `persistence` needs a datasource adapter, and a CLI-only preset
    // has none — offering it would be offering a `ResolutionError`.
    expect(offered).not.toContain('persistence');
  });

  it('an explicit --with suppresses the question, including when it is empty', async () => {
    const prompt = new FakePrompt({
      buildSystem: 'gradle',
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: true,
          extraVerticals: [],
        }),
      ),
    );
    expect(prompt.asked).not.toContain('extraVerticals');
  });

  it('rejects an unknown vertical id, naming what is available here', async () => {
    const error = expectErr(
      await installMediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: true,
          extraVerticals: ['nonsense'],
        }),
      ),
    );
    expect(error.code).toBe('keel.unknown-vertical');
    expect(error.message).toContain('ci');
  });

  it('rejects a vertical the stack already installs', async () => {
    const error = expectErr(
      await installMediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: true,
          extraVerticals: ['vcs'],
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-extra-verticals');
    expect(error.message).toContain('already installs');
  });

  it('rejects the same vertical named twice', async () => {
    const error = expectErr(
      await installMediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: true,
          extraVerticals: ['ci', 'ci'],
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-extra-verticals');
    expect(error.message).toContain('twice');
  });

  it('reads as a set at the review step, empty included', async () => {
    const prompt = new FakePrompt({
      language: 'go',
      entrypoints: 'cli,server-http',
      moduleLayout: 'basic',
      extraVerticals: '',
      modulePath: 'example.com/demo',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      stack: 'granular',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, answers: {}, interactive: true, dryRun: true }),
      ),
    );
    const review = prompt.questions.find((q) => q.id === 'keel.review');
    const labels = review?.choices?.map((c) => c.label) ?? [];
    expect(labels).toContain('Change: User-side adapters (Go) = cli, server-http');
    expect(labels).toContain('Change: Additional verticals = (none)');
  });

  it('rejects --with on a composite stack, whose services declare their own', async () => {
    const error = expectErr(
      await installMediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack',
          answers: {},
          interactive: false,
          dryRun: true,
          extraVerticals: ['ci'],
        }),
      ),
    );
    expect(error.code).toBe('keel.invalid-extra-verticals');
    expect(error.message).toContain('composite');
  });
});

/**
 * Gap #2 from the interactive-flow issue: `--with-peer-context` was
 * flag-only, never offered to an interactive user who picked the
 * modulith layout.
 */
describe('keel.new-project interactive peer-context question', () => {
  it('offers the peer context once the layout resolves to modulith interactively', async () => {
    const prompt = new FakePrompt({
      moduleLayout: 'modulith',
      withPeerContext: 'yes',
      projectName: 'shipper',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept([
        'walking-skeleton/rust-bootstrap',
        'walking-skeleton/cargo-check',
      ]),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'rust-cli',
          answers: {},
          interactive: true,
          dryRun: false,
        }),
      ),
    );
    expect(prompt.asked).toContain('withPeerContext');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.modules.map((m) => m.name)).toContain('guestbook');
  });

  it('never offers the peer context under the flat layout', async () => {
    const prompt = new FakePrompt({
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      buildSystem: 'gradle',
      extraVerticals: '',
      'keel.review': 'proceed',
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
    expect(prompt.asked).not.toContain('withPeerContext');
  });

  it('offers the choice exactly where the gate would accept it', async () => {
    // The property the declaration exists for: the menu and the
    // refusal are one rule read from two ends. Under each layout,
    // whether the question is asked must match whether the flag is
    // accepted — a rule taught to one and not the other is precisely
    // the "offered, then rejected" the hand-written branch shipped.
    for (const layout of ['basic', 'modulith'] as const) {
      const prompt = new FakePrompt({
        moduleLayout: layout,
        withPeerContext: 'no',
        projectName: 'shipper',
        remote: '',
        defaultBranch: 'main',
        extraVerticals: '',
        'keel.review': 'proceed',
      });
      expectOk(
        await installMediator({ prompt }).dispatch(
          newProjectCommand({
            cwd,
            stack: 'rust-cli',
            answers: {},
            interactive: true,
            dryRun: true,
          }),
        ),
      );
      const offered = prompt.asked.includes('withPeerContext');

      const flagged = await installMediator().dispatch(
        newProjectCommand({
          cwd,
          stack: 'rust-cli',
          answers: {},
          interactive: false,
          dryRun: true,
          moduleLayout: layout,
          withPeerContext: true,
        }),
      );
      expect(offered).toBe(flagged.ok);
      if (!flagged.ok) expect(flagged.error.code).toBe('keel.incompatible');
    }
  });

  it('an explicit --with-peer-context suppresses the question even under an interactively-chosen modulith', async () => {
    const prompt = new FakePrompt({
      moduleLayout: 'modulith',
      projectName: 'shipper',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept([
        'walking-skeleton/rust-bootstrap',
        'walking-skeleton/cargo-check',
      ]),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'rust-cli',
          answers: {},
          interactive: true,
          dryRun: false,
          withPeerContext: true,
        }),
      ),
    );
    expect(prompt.asked).not.toContain('withPeerContext');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.modules.map((m) => m.name)).toContain('guestbook');
  });
});

/**
 * Gaps #3/#4 from the interactive-flow issue: no review step, no way
 * back. The review step shows the staged plan and lets the user
 * proceed, cancel, or jump back to any answered question — which
 * re-stages everything asked from that point on, since a later
 * choice may depend on it.
 */
describe('keel.new-project review step', () => {
  it('cancelling at review writes nothing and reports keel.cancelled', async () => {
    const prompt = new FakePrompt({
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'cancel',
    });
    const mediator = installMediator({ prompt });
    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: false,
          buildSystem: 'gradle',
          moduleLayout: 'basic',
        }),
      ),
    );
    expect(error.code).toBe('keel.cancelled');
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toBeNull();
  });

  it('jumping back to an earlier answer re-stages everything asked after it', async () => {
    const prompt = new FakePrompt({
      buildSystem: ['maven', 'gradle'],
      moduleLayout: 'basic',
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': ['edit:0', 'proceed'],
    });
    const mediator = installMediator({
      prompt,
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
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
    expect(report.committed).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'pom.xml'))).toBe(false);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).toContain('pkg.gradle');
    expect(manifest?.tags).not.toContain('pkg.maven');
  });

  it('reviews the plan under --dry-run interactively without committing', async () => {
    const prompt = new FakePrompt({
      basePackage: 'com.acme.cli',
      projectName: 'demo',
      remote: '',
      defaultBranch: 'main',
      extraVerticals: '',
      'keel.review': 'proceed',
    });
    const mediator = installMediator({ prompt });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-cli',
          answers: {},
          interactive: true,
          dryRun: true,
          buildSystem: 'gradle',
          moduleLayout: 'basic',
        }),
      ),
    );
    expect(report.committed).toBe(false);
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
  });
});

/** `--yes` (non-interactive) must never ask anything, review included. */
describe('keel.new-project --yes stays fully non-interactive', () => {
  it('never touches the prompt port, even with no stack, build system, or module layout given', async () => {
    const mediator = installMediator({
      runDeferred: runActionsExcept(['walking-skeleton/gradle-wrapper']),
    });
    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          answers: bootstrapAnswers,
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    // `installMediator()`'s default prompt (`rejectingPrompt`) fails the
    // test the moment anything calls `ask` — reaching here at all is
    // the assertion that nothing did.
    expect(report.committed).toBe(true);
  });
});
