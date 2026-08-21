/**
 * Test for the `walking-skeleton` vertical against Maven tag sets
 * (`pkg.maven` instead of `pkg.gradle`). Asserts the same sources
 * render with Maven build files instead of Gradle ones, that the
 * sample-port-fake module registers via a root pom `<module>` patch,
 * and that the deferred action is the Maven wrapper. The Gradle
 * shape is covered by `walking-skeleton.test.ts` and siblings.
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
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const mavenTags = (framework: string, arch: string, lang = 'lang.java'): string[] => [
  lang,
  'runtime.jvm',
  'pkg.maven',
  `framework.${framework}`,
  'arch.hexagonal',
  arch,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-maven-'));
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

describe('walking-skeleton vertical (Maven, Quarkus REST)', () => {
  it('renders the runnable project with poms instead of Gradle files', async () => {
    const { tree, cwd } = await installWith(mavenTags('quarkus', 'arch.server-http'));
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'pom.xml',
      'domain/kernel/pom.xml',
      'domain/kernel/src/main/java/com/example/kernel/Mediator.java',
      'domain/contract/pom.xml',
      'domain/contract/src/main/java/com/example/contract/greet/GreetCommand.java',
      'domain/core/pom.xml',
      'domain/core/src/test/java/com/example/core/greet/GreetTest.java',
      'application/rest/contract/pom.xml',
      'application/rest/executable/pom.xml',
      'application/rest/executable/src/main/java/com/example/rest/GreetResource.java',
      'infrastructure/clock/fake/pom.xml',
      'infrastructure/clock/fake/src/main/java/com/example/clock/fake/FakeClock.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    expect(tree.read('build.gradle.kts')).toBeNull();
    expect(tree.read('settings.gradle.kts')).toBeNull();
    expect(tree.read('gradle.properties')).toBeNull();
    expect(tree.read('domain/kernel/build.gradle.kts')).toBeNull();
    expect(tree.read('infrastructure/clock/fake/build.gradle.kts')).toBeNull();
  });

  it('registers the fake module by patching the root pom modules block', async () => {
    const { tree, cwd } = await installWith(mavenTags('quarkus', 'arch.server-http'));
    cwds.push(cwd);
    const rootPom = tree.read('pom.xml')?.toString() ?? '';
    expect(rootPom).toContain('<module>domain/kernel</module>');
    expect(rootPom).toContain('<module>application/rest/executable</module>');
    expect(rootPom).toContain('<module>infrastructure/clock/fake</module>');
    expect(rootPom.indexOf('<module>infrastructure/clock/fake</module>')).toBeLessThan(
      rootPom.indexOf('</modules>'),
    );
  });

  it('substitutes basePackage and projectName into the poms', async () => {
    const { tree, cwd } = await installWith(mavenTags('quarkus', 'arch.server-http'), {
      'walking-skeleton/quarkus-rest-bootstrap': {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const rootPom = tree.read('pom.xml')?.toString() ?? '';
    expect(rootPom).toContain('<groupId>com.acme.tooling</groupId>');
    expect(rootPom).toContain('<artifactId>shipper</artifactId>');

    const kernelPom = tree.read('domain/kernel/pom.xml')?.toString() ?? '';
    expect(kernelPom).toContain('<artifactId>shipper</artifactId>');
    expect(kernelPom).toContain('<artifactId>domain-kernel</artifactId>');

    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('# shipper');
    expect(readme).toContain('./mvnw');
    expect(readme).not.toContain('gradlew');
  });

  it('emits a deferred maven wrapper action instead of the gradle one', async () => {
    const { result, cwd } = await installWith(mavenTags('quarkus', 'arch.server-http'));
    cwds.push(cwd);
    const wrapper = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/maven-wrapper',
    );
    expect(wrapper).toBeDefined();
    expect(wrapper?.description).toMatch(/^mvn -N wrapper:wrapper -Dmaven=\d+\.\d+/);
    expect(
      result.applyResult.actions.find((a) => a.id === 'walking-skeleton/gradle-wrapper'),
    ).toBeUndefined();
  });
});

describe('walking-skeleton vertical (Maven, other Java combos)', () => {
  it.each([
    [
      'spring',
      'arch.server-http',
      'application/rest/executable/pom.xml',
      'spring-boot-maven-plugin',
    ],
    ['micronaut', 'arch.server-http', 'application/rest/executable/pom.xml', 'micronaut-parent'],
    ['quarkus', 'arch.cli', 'application/cli/pom.xml', 'quarkus-maven-plugin'],
    ['spring', 'arch.cli', 'application/cli/pom.xml', 'picocli-spring-boot-starter'],
    ['micronaut', 'arch.cli', 'application/cli/pom.xml', 'micronaut-picocli'],
  ])('renders a %s %s Maven project', async (framework, arch, appPom, marker) => {
    const { tree, cwd } = await installWith(mavenTags(framework, arch));
    cwds.push(cwd);
    expect(tree.read('pom.xml'), 'missing root pom').not.toBeNull();
    const pom = tree.read(appPom)?.toString() ?? '';
    expect(pom).toContain(marker);
    expect(tree.read('build.gradle.kts')).toBeNull();
  });
});

describe('walking-skeleton vertical (Maven, Kotlin combos)', () => {
  it.each([
    ['quarkus', 'arch.server-http', 'application/rest/executable/pom.xml', 'kotlin-maven-allopen'],
    ['quarkus', 'arch.cli', 'application/cli/pom.xml', 'kotlin-maven-allopen'],
    [
      'spring',
      'arch.server-http',
      'application/rest/executable/pom.xml',
      '<plugin>spring</plugin>',
    ],
    ['spring', 'arch.cli', 'application/cli/pom.xml', '<plugin>spring</plugin>'],
    ['micronaut', 'arch.server-http', 'application/rest/executable/pom.xml', '<goal>kapt</goal>'],
    ['micronaut', 'arch.cli', 'application/cli/pom.xml', '<goal>kapt</goal>'],
  ])('renders a %s %s Kotlin Maven project', async (framework, arch, appPom, marker) => {
    const { tree, cwd } = await installWith(mavenTags(framework, arch, 'lang.kotlin'));
    cwds.push(cwd);

    const rootPom = tree.read('pom.xml')?.toString() ?? '';
    expect(rootPom).toContain('kotlin-maven-plugin');
    expect(rootPom).toContain('<module>infrastructure/clock/fake</module>');

    const pom = tree.read(appPom)?.toString() ?? '';
    expect(pom).toContain(marker);

    expect(tree.read('build.gradle.kts')).toBeNull();
    expect(tree.read('settings.gradle.kts')).toBeNull();
    expect(tree.read('infrastructure/clock/fake/build.gradle.kts')).toBeNull();
    expect(tree.read('infrastructure/clock/fake/pom.xml')).not.toBeNull();
    expect(
      tree.read('infrastructure/clock/fake/src/main/kotlin/com/example/clock/fake/FakeClock.kt'),
    ).not.toBeNull();
  });
});

/**
 * A tag set carrying both `arch.cli` and `arch.server-http` resolves
 * both Maven bootstrap adapters onto one root `pom.xml` — the Maven
 * half of `walking-skeleton.test.ts`'s Gradle combined-arch coverage.
 */
describe('walking-skeleton vertical (Maven, composed cli + server-http)', () => {
  it('lists every entrypoint module on the one root pom', async () => {
    const { tree, cwd } = await installWith([
      'lang.java',
      'runtime.jvm',
      'pkg.maven',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    expect(tree.read('application/cli/pom.xml')).not.toBeNull();
    expect(tree.read('application/rest/contract/pom.xml')).not.toBeNull();
    expect(tree.read('application/rest/executable/pom.xml')).not.toBeNull();

    const rootPom = tree.read('pom.xml')?.toString() ?? '';
    expect(rootPom).toContain('<module>domain/kernel</module>');
    expect(rootPom).toContain('<module>application/cli</module>');
    expect(rootPom).toContain('<module>application/rest/contract</module>');
    expect(rootPom).toContain('<module>application/rest/executable</module>');
    expect(rootPom.match(/<module>domain\/kernel<\/module>/g)).toHaveLength(1);
  });
});
