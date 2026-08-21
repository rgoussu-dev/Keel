/**
 * End-to-end test for the `walking-skeleton` vertical against a
 * Quarkus CLI tag set. Asserts the rendered tree shape matches the
 * minimum runnable project we promise; checks the predicate split
 * by removing every entrypoint arch tag and expecting a hard fail.
 * The REST tag set is covered by `walking-skeleton-rest.test.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { ResolutionError } from '../../../../src/domain/core/resolver.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
    tags,
    answers: answers ?? {},
  };
  const result = await installVertical({
    vertical: walkingSkeletonVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-04-26T12:00:00Z',
  });
  return { tree, cwd, result };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('walking-skeleton vertical (Quarkus CLI)', () => {
  it('renders the minimum runnable hexagonal project with default answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'build.gradle.kts',
      'gradle.properties',
      'settings.gradle.kts',
      'domain/kernel/build.gradle.kts',
      'domain/kernel/src/main/java/com/example/kernel/Command.java',
      'domain/kernel/src/main/java/com/example/kernel/Handler.java',
      'domain/kernel/src/main/java/com/example/kernel/Mediator.java',
      'domain/contract/build.gradle.kts',
      'domain/contract/src/main/java/com/example/contract/greet/GreetCommand.java',
      'domain/core/build.gradle.kts',
      'domain/core/src/main/java/com/example/core/RegistryMediator.java',
      'domain/core/src/main/java/com/example/core/greet/GreetHandler.java',
      'domain/core/src/test/java/com/example/core/greet/GreetTest.java',
      'application/cli/build.gradle.kts',
      'application/cli/src/main/java/com/example/cli/HelloCommand.java',
      'application/cli/src/main/java/com/example/cli/Main.java',
      'application/cli/src/main/java/com/example/cli/MediatorProducer.java',
      'application/cli/src/main/resources/application.properties',
      'application/cli/src/test/java/com/example/cli/HelloCommandTest.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
  });

  it('settings.gradle.kts wires the four subprojects', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":domain:kernel")');
    expect(settings).toContain('include(":domain:contract")');
    expect(settings).toContain('include(":domain:core")');
    expect(settings).toContain('include(":application:cli")');
  });

  it('emits the sample Clock port and FakeClock module, patching settings.gradle.kts', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const port = tree
      .read('domain/contract/src/main/java/com/example/contract/Clock.java')
      ?.toString();
    expect(port).toContain('public interface Clock');

    const fake = tree
      .read('infrastructure/clock/fake/src/main/java/com/example/clock/fake/FakeClock.java')
      ?.toString();
    expect(fake).toContain('public final class FakeClock implements Clock');

    const fakeTest = tree.read(
      'infrastructure/clock/fake/src/test/java/com/example/clock/fake/FakeClockTest.java',
    );
    expect(fakeTest).not.toBeNull();

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":infrastructure:clock:fake")');
  });

  it('reuses bootstrap basePackage for the sample-port-fake adapter without re-prompting', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'), {
      'walking-skeleton/quarkus-cli-bootstrap': {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const port = tree
      .read('domain/contract/src/main/java/com/acme/tooling/contract/Clock.java')
      ?.toString();
    expect(port).toContain('package com.acme.tooling.contract;');
  });

  it('substitutes basePackage and projectName from sticky answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'), {
      'walking-skeleton/quarkus-cli-bootstrap': {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('rootProject.name = "shipper"');

    const main =
      tree.read('application/cli/src/main/java/com/acme/tooling/cli/Main.java')?.toString() ?? '';
    expect(main).toContain('package com.acme.tooling.cli;');
    expect(main).toContain('public static final String NAME = "shipper";');

    const build = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(build).toContain('group = "com.acme.tooling"');

    const helloCmd =
      tree
        .read('application/cli/src/main/java/com/acme/tooling/cli/HelloCommand.java')
        ?.toString() ?? '';
    expect(helloCmd).toContain('import com.acme.tooling.kernel.Mediator;');
    expect(helloCmd).toContain('import com.acme.tooling.contract.greet.GreetCommand;');
  });

  it('emits the binding spec at AGENTS.md with a CLAUDE.md pointer', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const agentsMd = tree.read('AGENTS.md')?.toString() ?? '';
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(tree.read('CLAUDE.md')?.toString()).toBe('@AGENTS.md\n');
  });

  it('emits a deferred gradle wrapper action that runs after the bootstrap', async () => {
    const { result, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const wrapperAction = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/gradle-wrapper',
    );
    expect(wrapperAction).toBeDefined();
    expect(wrapperAction?.description).toMatch(/^gradle wrapper --gradle-version=\d+\.\d+/);
  });

  it('hard-fails when pkg.gradle is absent (no adapter covers build-tool)', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-fail-gradle-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    };
    await expect(
      installVertical({
        vertical: walkingSkeletonVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-04-26T12:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('hard-fails when no entrypoint arch tag is present (no adapter covers entrypoint)', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-fail-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: baseTags(),
    };
    await expect(
      installVertical({
        vertical: walkingSkeletonVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-04-26T12:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('rejects an invalid basePackage with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.cli'), {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'Not A Package',
          projectName: 'shipper',
        },
      }),
    ).rejects.toThrow(/invalid basePackage/);
  });

  it('rejects an invalid projectName with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.cli'), {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'com.example',
          projectName: 'Has Spaces',
        },
      }),
    ).rejects.toThrow(/invalid projectName/);
  });
});

/**
 * A tag set carrying both `arch.cli` and `arch.server-http` resolves
 * both JVM bootstrap adapters — the composable-entrypoint mechanism
 * `jvm-shared-root.ts` implements, mirroring what Go and Rust already
 * did. The regression this guards: before that mechanism, both
 * bootstraps rendered their own whole-file copy of `settings.gradle.kts`
 * / `build.gradle.kts` / `gradle.properties` / `README.md`, so the
 * second adapter's `files` write threw `ContributionConflictError` on
 * a path the first had already created.
 */
describe('walking-skeleton vertical (Quarkus, composed cli + server-http)', () => {
  it('renders both entrypoints onto one shared domain and root files', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli', 'arch.server-http'));
    cwds.push(cwd);

    const expected = [
      'domain/core/src/main/java/com/example/core/greet/GreetHandler.java',
      'domain/contract/src/main/java/com/example/contract/greet/GreetRejected.java',
      'application/cli/src/main/java/com/example/cli/HelloCommand.java',
      'application/rest/executable/src/main/java/com/example/rest/GreetResource.java',
      'application/rest/contract/src/main/java/com/example/rest/contract/GreetResponse.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":domain:kernel")');
    expect(settings).toContain('include(":application:cli")');
    expect(settings).toContain('include(":application:rest:contract")');
    expect(settings).toContain('include(":application:rest:executable")');
    // Every include appears exactly once — the shared seed is upserted,
    // never re-emitted whole by the second adapter to resolve.
    expect(settings.match(/include\(":domain:kernel"\)/g)).toHaveLength(1);

    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('### cli');
    expect(readme).toContain('### rest');
  });

  it('unifies the domain content on the richer (REST) shape, so the CLI handler validates too', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli', 'arch.server-http'));
    cwds.push(cwd);

    const handler = tree
      .read('domain/core/src/main/java/com/example/core/greet/GreetHandler.java')
      ?.toString();
    expect(handler).toContain('GreetRejected');
  });
});
