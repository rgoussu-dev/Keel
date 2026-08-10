/**
 * Tests for the `walking-skeleton` vertical against Micronaut tag
 * sets. The resolution block proves `framework.micronaut` swaps the
 * entrypoint bootstrap while the Quarkus/Spring siblings stay out;
 * the install blocks assert the rendered tree shape for both shapes,
 * including the templated `mainClass` wiring and the sample Clock
 * port landing framework-agnostically.
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
import { MICRONAUT_CLI_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/micronaut-cli-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/micronaut-rest-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-rest-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/spring-rest-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.micronaut',
  'arch.hexagonal',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-micronaut-'));
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
  it('framework.micronaut + arch.server-http selects the Micronaut REST bootstrap and covers all dimensions', () => {
    const adapters = resolveVertical(walkingSkeletonVertical, baseTags('arch.server-http'));
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(MICRONAUT_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(MICRONAUT_CLI_BOOTSTRAP_ID);
    expect(ids).not.toContain(QUARKUS_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(SPRING_REST_BOOTSTRAP_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });

  it('framework.micronaut + arch.cli selects the Micronaut CLI bootstrap and covers all dimensions', () => {
    const adapters = resolveVertical(walkingSkeletonVertical, baseTags('arch.cli'));
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(MICRONAUT_CLI_BOOTSTRAP_ID);
    expect(ids).not.toContain(MICRONAUT_REST_BOOTSTRAP_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });
});

describe('walking-skeleton vertical (Micronaut REST)', () => {
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
      'application/rest/executable/src/main/java/com/example/rest/GreetRejectedHandler.java',
      'application/rest/executable/src/main/java/com/example/rest/MediatorFactory.java',
      'application/rest/executable/src/main/resources/application.properties',
      'application/rest/executable/src/test/java/com/example/rest/GreetControllerTest.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    const executable = tree.read('application/rest/executable/build.gradle.kts')?.toString() ?? '';
    expect(executable).toContain('id("io.micronaut.application")');
    expect(executable).toContain('mainClass.set("com.example.rest.Application")');
    expect(executable).toContain('annotations("com.example.*")');

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":infrastructure:clock:fake")');
  });

  it('substitutes basePackage and projectName from sticky answers recorded under the Micronaut REST bootstrap id', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'), {
      [MICRONAUT_REST_BOOTSTRAP_ID]: {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('rootProject.name = "shipper"');

    const properties =
      tree
        .read('application/rest/executable/src/main/resources/application.properties')
        ?.toString() ?? '';
    expect(properties).toContain('micronaut.application.name=shipper');

    const controller =
      tree
        .read(
          'application/rest/executable/src/main/java/com/acme/tooling/rest/GreetController.java',
        )
        ?.toString() ?? '';
    expect(controller).toContain('package com.acme.tooling.rest;');
    expect(controller).toContain('import com.acme.tooling.kernel.Mediator;');
  });
});

describe('walking-skeleton vertical (Micronaut CLI)', () => {
  it('renders the picocli application layer over the shared domain trisection', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const expected = [
      'application/cli/build.gradle.kts',
      'application/cli/src/main/java/com/example/cli/Main.java',
      'application/cli/src/main/java/com/example/cli/HelloCommand.java',
      'application/cli/src/main/java/com/example/cli/MediatorFactory.java',
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
    expect(cliBuild).toContain('micronaut-picocli');
    expect(cliBuild).toContain('mainClass.set("com.example.cli.Main")');
  });
});
