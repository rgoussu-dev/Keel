/**
 * Tests for the `walking-skeleton` vertical against a Quarkus REST
 * tag set. The resolution block proves the entrypoint dimension is
 * selected by predicate — `arch.server-http` picks the REST bootstrap
 * and keeps the CLI bootstrap out, and vice versa — with all four
 * dimensions covered either way. The install block asserts the
 * rendered tree shape: the earned `application/rest/contract` +
 * `application/rest/executable` pair, the RFC 9457 Problem Details
 * mapper, and the `settings.gradle.kts` includes.
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
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-rest-'));
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

describe('walking-skeleton resolution (entrypoint by predicate)', () => {
  it('arch.server-http selects the REST bootstrap, keeps the CLI bootstrap out, and covers all dimensions', () => {
    const adapters = resolveVertical(walkingSkeletonVertical, baseTags('arch.server-http'));
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(QUARKUS_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(QUARKUS_CLI_BOOTSTRAP_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });

  it('arch.cli selects the CLI bootstrap, keeps the REST bootstrap out, and covers all dimensions', () => {
    const adapters = resolveVertical(walkingSkeletonVertical, baseTags('arch.cli'));
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(QUARKUS_CLI_BOOTSTRAP_ID);
    expect(ids).not.toContain(QUARKUS_REST_BOOTSTRAP_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });
});

describe('walking-skeleton vertical (Quarkus REST)', () => {
  it('renders the minimum runnable hexagonal REST project with default answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
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
      'domain/contract/src/main/java/com/example/contract/greet/GreetRejected.java',
      'domain/core/build.gradle.kts',
      'domain/core/src/main/java/com/example/core/RegistryMediator.java',
      'domain/core/src/main/java/com/example/core/greet/GreetHandler.java',
      'domain/core/src/test/java/com/example/core/greet/GreetTest.java',
      'application/rest/contract/build.gradle.kts',
      'application/rest/contract/src/main/java/com/example/rest/contract/GreetResponse.java',
      'application/rest/contract/src/main/java/com/example/rest/contract/ProblemDetails.java',
      'application/rest/executable/build.gradle.kts',
      'application/rest/executable/src/main/java/com/example/rest/GreetResource.java',
      'application/rest/executable/src/main/java/com/example/rest/GreetRejectedMapper.java',
      'application/rest/executable/src/main/java/com/example/rest/MediatorProducer.java',
      'application/rest/executable/src/main/resources/application.properties',
      'application/rest/executable/src/test/java/com/example/rest/GreetResourceTest.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
  });

  it('settings.gradle.kts wires the five subprojects', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":domain:kernel")');
    expect(settings).toContain('include(":domain:contract")');
    expect(settings).toContain('include(":domain:core")');
    expect(settings).toContain('include(":application:rest:contract")');
    expect(settings).toContain('include(":application:rest:executable")');
    expect(settings).not.toContain('include(":application:cli")');
  });

  it('maps the GreetRejected domain error to RFC 9457 Problem Details in the interface adapter', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    const mapper =
      tree
        .read('application/rest/executable/src/main/java/com/example/rest/GreetRejectedMapper.java')
        ?.toString() ?? '';
    expect(mapper).toContain('implements ExceptionMapper<GreetRejected>');
    expect(mapper).toContain('application/problem+json');

    const problem =
      tree
        .read(
          'application/rest/contract/src/main/java/com/example/rest/contract/ProblemDetails.java',
        )
        ?.toString() ?? '';
    expect(problem).toContain(
      'public record ProblemDetails(String type, String title, int status, String detail, String instance)',
    );

    const handler =
      tree.read('domain/core/src/main/java/com/example/core/greet/GreetHandler.java')?.toString() ??
      '';
    expect(handler).toContain('throw new GreetRejected("name must not be blank")');
  });

  it('discovers handlers as a CDI stereotype, with the domain modules marked bean archives', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    // The marker is the domain's own; only Jakarta specification APIs
    // meta-annotate it, and they stay off every runtime classpath.
    const marker =
      tree
        .read('domain/contract/src/main/java/com/example/contract/DomainHandler.java')
        ?.toString() ?? '';
    expect(marker).toContain('@Stereotype');
    expect(marker).toContain('@Singleton');
    expect(marker).not.toContain('io.quarkus');

    const contractBuild = tree.read('domain/contract/build.gradle.kts')?.toString() ?? '';
    expect(contractBuild).toContain('compileOnlyApi("jakarta.inject:jakarta.inject-api');
    expect(contractBuild).toContain(
      'compileOnlyApi("jakarta.enterprise:jakarta.enterprise.cdi-api',
    );

    // ArC only sees beans in modules that are bean archives.
    expect(tree.read('domain/core/src/main/resources/META-INF/beans.xml')).not.toBeNull();
    expect(tree.read('domain/contract/src/main/resources/META-INF/beans.xml')).not.toBeNull();

    const producer =
      tree
        .read('application/rest/executable/src/main/java/com/example/rest/MediatorProducer.java')
        ?.toString() ?? '';
    expect(producer).toContain('Instance<Handler<?, ?>> handlers');
    expect(producer).not.toContain('new GreetHandler()');
  });

  it('emits the sample Clock port and FakeClock module in the REST shape too', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    const port = tree
      .read('domain/contract/src/main/java/com/example/contract/Clock.java')
      ?.toString();
    expect(port).toContain('public interface Clock');

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":infrastructure:clock:fake")');
  });

  it('substitutes basePackage and projectName from sticky answers recorded under the REST bootstrap id', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'), {
      [QUARKUS_REST_BOOTSTRAP_ID]: {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('rootProject.name = "shipper"');

    const resource =
      tree
        .read('application/rest/executable/src/main/java/com/acme/tooling/rest/GreetResource.java')
        ?.toString() ?? '';
    expect(resource).toContain('package com.acme.tooling.rest;');
    expect(resource).toContain('import com.acme.tooling.kernel.Mediator;');
    expect(resource).toContain('import com.acme.tooling.contract.greet.GreetCommand;');

    const port = tree
      .read('domain/contract/src/main/java/com/acme/tooling/contract/Clock.java')
      ?.toString();
    expect(port).toContain('package com.acme.tooling.contract;');
  });

  it('emits a deferred gradle wrapper action for the REST shape', async () => {
    const { result, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const wrapperAction = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/gradle-wrapper',
    );
    expect(wrapperAction).toBeDefined();
  });
});
