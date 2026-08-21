/**
 * Tests for the `walking-skeleton` vertical against Kotlin JVM tag
 * sets. The resolution block proves `lang.kotlin` swaps both the
 * entrypoint bootstrap and the sample-port adapter while the Java
 * siblings stay out — for all three frameworks. The install blocks
 * assert the rendered Kotlin tree shape: `src/main/kotlin` sources,
 * the shared Kotlin domain trisection, the Kotlin Clock fake, and
 * per-framework build wiring.
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
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/micronaut-rest-kotlin-bootstrap.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-cli-bootstrap.js';
import { QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-cli-kotlin-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-rest-bootstrap.js';
import { QUARKUS_REST_KOTLIN_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-rest-kotlin-bootstrap.js';
import { SAMPLE_PORT_FAKE_ID } from '../../../../src/domain/core/adapters/sample-port-fake.js';
import { SAMPLE_PORT_FAKE_KOTLIN_ID } from '../../../../src/domain/core/adapters/sample-port-fake-kotlin.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/spring-rest-kotlin-bootstrap.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

const kotlinTags = (framework: string, ...extra: string[]): string[] => [
  'lang.kotlin',
  'runtime.jvm',
  'pkg.gradle',
  `framework.${framework}`,
  'arch.hexagonal',
  ...extra,
];

const installWith = async (tags: string[]): Promise<{ tree: FsTree; cwd: string }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-kotlin-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
    tags,
    answers: {},
  };
  await installVertical({
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
  return { tree, cwd };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('walking-skeleton resolution (language by predicate)', () => {
  it('lang.kotlin swaps the Quarkus bootstrap and the sample-port adapter for their Kotlin siblings', () => {
    const adapters = resolveVertical(
      walkingSkeletonVertical,
      kotlinTags('quarkus', 'arch.server-http'),
    );
    const ids = adapters.map((a) => a.id);
    expect(ids).toContain(QUARKUS_REST_KOTLIN_BOOTSTRAP_ID);
    expect(ids).toContain(SAMPLE_PORT_FAKE_KOTLIN_ID);
    expect(ids).not.toContain(QUARKUS_REST_BOOTSTRAP_ID);
    expect(ids).not.toContain(SAMPLE_PORT_FAKE_ID);

    const covered = new Set(adapters.flatMap((a) => [...a.covers]));
    for (const dimension of walkingSkeletonVertical.dimensions) {
      expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
    }
  });

  it('lang.java keeps the Kotlin siblings out', () => {
    const ids = resolveVertical(walkingSkeletonVertical, [
      'lang.java',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.cli',
    ]).map((a) => a.id);
    expect(ids).toContain(QUARKUS_CLI_BOOTSTRAP_ID);
    expect(ids).toContain(SAMPLE_PORT_FAKE_ID);
    expect(ids).not.toContain(QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID);
    expect(ids).not.toContain(SAMPLE_PORT_FAKE_KOTLIN_ID);
  });

  it('covers the entrypoint dimension for every framework in Kotlin, CLI and REST alike', () => {
    for (const framework of ['quarkus', 'spring', 'micronaut']) {
      for (const arch of ['arch.cli', 'arch.server-http']) {
        const adapters = resolveVertical(walkingSkeletonVertical, kotlinTags(framework, arch));
        const bootstraps = adapters.filter((a) => a.covers.includes('entrypoint'));
        expect(
          bootstraps.map((a) => a.id),
          `${framework} + ${arch}`,
        ).toHaveLength(1);
        expect(bootstraps[0]?.id).toContain('kotlin');
      }
    }
  });
});

describe('walking-skeleton vertical (Quarkus REST, Kotlin)', () => {
  it('renders Kotlin sources over the shared Kotlin domain trisection', async () => {
    const { tree, cwd } = await installWith(kotlinTags('quarkus', 'arch.server-http'));
    cwds.push(cwd);

    const expected = [
      'build.gradle.kts',
      'domain/kernel/src/main/kotlin/com/example/kernel/Mediator.kt',
      'domain/contract/src/main/kotlin/com/example/contract/greet/GreetCommand.kt',
      'domain/contract/src/main/kotlin/com/example/contract/greet/GreetRejected.kt',
      'domain/core/src/main/kotlin/com/example/core/RegistryMediator.kt',
      'domain/core/src/test/kotlin/com/example/core/greet/GreetTest.kt',
      'domain/contract/src/main/kotlin/com/example/contract/Clock.kt',
      'infrastructure/clock/fake/src/main/kotlin/com/example/clock/fake/FakeClock.kt',
      'application/rest/contract/src/main/kotlin/com/example/rest/contract/GreetResponse.kt',
      'application/rest/executable/src/main/kotlin/com/example/rest/GreetResource.kt',
      'application/rest/executable/src/test/kotlin/com/example/rest/GreetResourceTest.kt',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    const root = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(root).toContain('kotlin("jvm") version');

    const executable = tree.read('application/rest/executable/build.gradle.kts')?.toString() ?? '';
    expect(executable).toContain('io.quarkus:quarkus-kotlin');
    expect(executable).toContain('allOpen');

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":infrastructure:clock:fake")');
  });
});

describe('walking-skeleton vertical (Spring REST, Kotlin)', () => {
  it('renders the Spring Kotlin application layer', async () => {
    const { tree, cwd } = await installWith(kotlinTags('spring', 'arch.server-http'));
    cwds.push(cwd);

    const application =
      tree.read('application/rest/executable/src/main/kotlin/com/example/rest/Application.kt') ??
      null;
    expect(application?.toString()).toContain('runApplication<Application>');

    const executable = tree.read('application/rest/executable/build.gradle.kts')?.toString() ?? '';
    expect(executable).toContain('kotlin("plugin.spring")');
    expect(executable).toContain('spring-boot-starter-webmvc');
  });
});

describe('walking-skeleton vertical (Micronaut REST, Kotlin)', () => {
  it('renders the Micronaut Kotlin application layer with KSP processing', async () => {
    const { tree, cwd } = await installWith(kotlinTags('micronaut', 'arch.server-http'));
    cwds.push(cwd);

    const executable = tree.read('application/rest/executable/build.gradle.kts')?.toString() ?? '';
    expect(executable).toContain('id("com.google.devtools.ksp")');
    expect(executable).toContain('mainClass.set("com.example.rest.ApplicationKt")');

    const root = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(root).toContain('id("com.google.devtools.ksp") version');
  });
});

describe.each([
  ['quarkus', QUARKUS_REST_KOTLIN_BOOTSTRAP_ID],
  ['spring', SPRING_REST_KOTLIN_BOOTSTRAP_ID],
  ['micronaut', MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID],
])('kotlin REST bootstrap identity (%s)', (framework, id) => {
  it(`resolves ${id} for framework.${framework}`, () => {
    const adapters = resolveVertical(
      walkingSkeletonVertical,
      kotlinTags(framework, 'arch.server-http'),
    );
    expect(adapters.map((a) => a.id)).toContain(id);
  });
});

/**
 * The Kotlin half of `walking-skeleton.test.ts`'s combined-arch
 * coverage — Kotlin's root `build.gradle.kts` needs the `kotlin("jvm")`
 * base plugin plus a framework-specific one (`plugin.allopen` for
 * Quarkus), and the composable-entrypoint seed used to omit the base
 * plugin, a regression only a real Gradle configure phase (not a
 * string-contains check on its own) would have caught — see
 * `jvm-shared-root.ts`.
 */
describe('walking-skeleton vertical (Quarkus Kotlin, composed cli + server-http)', () => {
  it('emits the Kotlin plugin block once on the shared root build file', async () => {
    const { tree, cwd } = await installWith(kotlinTags('quarkus', 'arch.cli', 'arch.server-http'));
    cwds.push(cwd);

    expect(tree.read('application/cli/build.gradle.kts')).not.toBeNull();
    expect(tree.read('application/rest/executable/build.gradle.kts')).not.toBeNull();

    const root = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(root).toContain('kotlin("jvm") version');
    expect(root).toContain('kotlin("plugin.allopen") version');
    expect(root.match(/kotlin\("jvm"\) version/g)).toHaveLength(1);

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":application:cli")');
    expect(settings).toContain('include(":application:rest:executable")');
  });
});
