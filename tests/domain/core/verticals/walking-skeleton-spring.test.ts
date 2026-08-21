/**
 * Tests for the `walking-skeleton` vertical against Spring Boot tag
 * sets. The resolution block proves `framework.spring` swaps the
 * entrypoint bootstrap while the Quarkus siblings stay out; the
 * install blocks assert the rendered tree shape for both shapes —
 * the shared domain trisection, the Spring application layer, the
 * `settings.gradle.kts` includes, and the sample Clock port landing
 * framework-agnostically.
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
import { resolveVertical } from '../../../../src/domain/core/resolver.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-cli-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-rest-bootstrap.js';
import { SPRING_CLI_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/spring-cli-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/spring-rest-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.spring',
  'arch.hexagonal',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-spring-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
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
    now: () => '2026-08-10T12:00:00Z',
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

describe('walking-skeleton resolution (framework by predicate)', () => {
  it('framework.spring + arch.server-http selects the Spring REST bootstrap and covers all dimensions', () => {
    const adapters = resolveVertical(walkingSkeletonVertical, baseTags('arch.server-http'));
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(SPRING_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(SPRING_CLI_BOOTSTRAP_ID);
    expect(ids).not.toContain(QUARKUS_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(QUARKUS_CLI_BOOTSTRAP_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });

  it('framework.spring + arch.cli selects the Spring CLI bootstrap and covers all dimensions', () => {
    const adapters = resolveVertical(walkingSkeletonVertical, baseTags('arch.cli'));
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(SPRING_CLI_BOOTSTRAP_ID);
    expect(ids).not.toContain(SPRING_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(QUARKUS_CLI_BOOTSTRAP_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });
});

describe('walking-skeleton vertical (Spring REST)', () => {
  it('renders the minimum runnable hexagonal REST project with default answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'build.gradle.kts',
      'gradle.properties',
      'settings.gradle.kts',
      'domain/kernel/src/main/java/com/example/kernel/Mediator.java',
      'domain/contract/src/main/java/com/example/contract/greet/GreetRejected.java',
      'domain/core/src/main/java/com/example/core/greet/GreetHandler.java',
      'application/rest/contract/src/main/java/com/example/rest/contract/GreetResponse.java',
      'application/rest/contract/src/main/java/com/example/rest/contract/ProblemDetails.java',
      'application/rest/executable/build.gradle.kts',
      'application/rest/executable/src/main/java/com/example/rest/Application.java',
      'application/rest/executable/src/main/java/com/example/rest/GreetController.java',
      'application/rest/executable/src/main/java/com/example/rest/GreetRejectedAdvice.java',
      'application/rest/executable/src/main/java/com/example/rest/MediatorConfig.java',
      'application/rest/executable/src/main/resources/application.properties',
      'application/rest/executable/src/test/java/com/example/rest/GreetControllerTest.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    const executable = tree.read('application/rest/executable/build.gradle.kts')?.toString() ?? '';
    expect(executable).toContain('id("org.springframework.boot")');
    expect(executable).toContain('spring-boot-starter-webmvc');
  });

  it('discovers handlers through the domain-owned @DomainHandler marker', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    // The marker belongs to the domain and names no framework.
    const marker =
      tree
        .read('domain/contract/src/main/java/com/example/contract/DomainHandler.java')
        ?.toString() ?? '';
    expect(marker).toContain('@interface DomainHandler');
    expect(marker).not.toContain('org.springframework');

    const handler =
      tree.read('domain/core/src/main/java/com/example/core/greet/GreetHandler.java')?.toString() ??
      '';
    expect(handler).toContain('@DomainHandler');
    expect(handler).not.toContain('org.springframework');

    // Spring reads that marker via an include filter, and the scan is
    // widened to the domain package — Application sits under .rest, so
    // the default root would never reach .core.
    const app =
      tree
        .read('application/rest/executable/src/main/java/com/example/rest/Application.java')
        ?.toString() ?? '';
    expect(app).toContain('classes = DomainHandler.class');
    expect(app).toContain('"com.example.core"');

    // The composition root takes the discovered collection rather than
    // constructing handlers by hand.
    const config =
      tree
        .read('application/rest/executable/src/main/java/com/example/rest/MediatorConfig.java')
        ?.toString() ?? '';
    expect(config).toContain('mediator(List<Handler<?, ?>> handlers)');
    expect(config).not.toContain('new GreetHandler()');
  });

  it('wires the five subprojects and the sample Clock fake module', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":domain:kernel")');
    expect(settings).toContain('include(":domain:contract")');
    expect(settings).toContain('include(":domain:core")');
    expect(settings).toContain('include(":application:rest:contract")');
    expect(settings).toContain('include(":application:rest:executable")');
    expect(settings).toContain('include(":infrastructure:clock:fake")');

    const port = tree
      .read('domain/contract/src/main/java/com/example/contract/Clock.java')
      ?.toString();
    expect(port).toContain('public interface Clock');
  });

  it('substitutes basePackage and projectName from sticky answers recorded under the Spring REST bootstrap id', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'), {
      [SPRING_REST_BOOTSTRAP_ID]: {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('rootProject.name = "shipper"');

    const controller =
      tree
        .read(
          'application/rest/executable/src/main/java/com/acme/tooling/rest/GreetController.java',
        )
        ?.toString() ?? '';
    expect(controller).toContain('package com.acme.tooling.rest;');
    expect(controller).toContain('import com.acme.tooling.kernel.Mediator;');
  });

  it('emits a deferred gradle wrapper action', async () => {
    const { result, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const wrapperAction = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/gradle-wrapper',
    );
    expect(wrapperAction).toBeDefined();
  });
});

describe('walking-skeleton vertical (Spring CLI)', () => {
  it('renders the picocli application layer over the shared domain trisection', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const expected = [
      'application/cli/build.gradle.kts',
      'application/cli/src/main/java/com/example/cli/Main.java',
      'application/cli/src/main/java/com/example/cli/RootCommand.java',
      'application/cli/src/main/java/com/example/cli/HelloCommand.java',
      'application/cli/src/main/java/com/example/cli/MediatorConfig.java',
      'application/cli/src/test/java/com/example/cli/HelloCommandTest.java',
      'domain/core/src/main/java/com/example/core/RegistryMediator.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":application:cli")');
    expect(settings).not.toContain('include(":application:rest:executable")');

    const cliBuild = tree.read('application/cli/build.gradle.kts')?.toString() ?? '';
    expect(cliBuild).toContain('picocli-spring-boot-starter');
  });

  /**
   * The shared root build.gradle.kts's `archiveBaseName` override
   * (added to keep `domain/contract` and `application/rest/contract`
   * from colliding on `contract-<version>.jar` once both entrypoints
   * can coexist — see jvm-shared-root.ts) applies to every subproject,
   * matching the Maven artifactIds these builds already carry — so the
   * CLI's own boot jar is `application-cli-0.1.0-SNAPSHOT.jar`, not the
   * bare `cli-0.1.0-SNAPSHOT.jar` the module's own project name would
   * default to.
   */
  it('renames the CLI module jar to its full module path on the shared root build file', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const root = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(root).toContain(
      "archiveBaseName.set(project.path.removePrefix(\":\").replace(':', '-'))",
    );
    expect(root).not.toContain('if (project.name == "contract")');
  });
});
