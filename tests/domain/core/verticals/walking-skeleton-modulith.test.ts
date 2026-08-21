/**
 * Tests for the `layout.modulith` module layout on the JVM stacks.
 *
 * The layout is a *shape* of the same adapters, not a second set of
 * them, so these tests assert what actually changes: where files
 * land, what the build registers, that the in-process service seam is
 * emitted, and that the layout-dependent verticals follow the
 * assembly rather than the flat executable. The flat layout stays
 * covered by its own suites — the point here is that both shapes come
 * out of one adapter id, keyed by one manifest tag.
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
import { observabilityVertical } from '../../../../src/domain/core/verticals/observability.js';
import { persistenceVertical } from '../../../../src/domain/core/verticals/persistence.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-rest-bootstrap.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from '../../../../src/domain/core/adapters/quarkus-cli-bootstrap.js';
import {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  jvmLayout,
  jvmModuleLayout,
} from '../../../../src/domain/core/adapters/jvm-module-layout.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';

const tags = (...extra: string[]): string[] => [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  ...extra,
];

const BOOTSTRAP_ANSWERS = {
  [QUARKUS_REST_BOOTSTRAP_ID]: { basePackage: 'com.example', projectName: 'demo' },
  [QUARKUS_CLI_BOOTSTRAP_ID]: { basePackage: 'com.example', projectName: 'demo' },
};

const install = async (
  vertical: Vertical,
  projectTags: string[],
  tree?: FsTree,
  cwd?: string,
): Promise<{ tree: FsTree; cwd: string }> => {
  const dir = cwd ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'keel-modulith-')));
  const target = tree ?? new FsTree(dir);
  await installVertical({
    vertical,
    manifest: {
      ...emptyManifestV2('2026-08-14T00:00:00Z', '0.5.0-alpha'),
      tags: projectTags,
      answers: BOOTSTRAP_ANSWERS,
    },
    tree: target,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: dir,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-14T12:00:00Z',
  });
  return { tree: target, cwd: dir };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('jvmLayout', () => {
  it('defaults to the flat trisection when no layout tag is recorded', () => {
    // Every project scaffolded before the dial existed lands here.
    expect(jvmModuleLayout([])).toBe('basic');
    expect(jvmLayout([]).domainCore).toBe('domain/core');
    expect(jvmLayout([]).service).toBeNull();
  });

  it('resolves the modulith paths and packages from the tag', () => {
    const layout = jvmLayout([MODULITH_LAYOUT_TAG]);
    expect(layout.kernel).toBe('platform/kernel');
    expect(layout.domainCore).toBe('modules/greeting/domain/core');
    expect(layout.restAdapters).toBe('modules/greeting/user-side/api/adapters');
    expect(layout.restRuntime).toBe('application/api');
    expect(layout.service).toBe('modules/greeting/user-side/service');
    expect(layout.infra('clock/fake')).toBe('modules/greeting/infra/clock/fake');
    expect(layout.gradleProject('application/api')).toBe(':application:api');
  });

  it('keeps the adapter and the assembly in one module under the flat layout', () => {
    const layout = jvmLayout([BASIC_LAYOUT_TAG]);
    expect(layout.restAdapters).toBe(layout.restRuntime);
  });

  it('derives Maven artifactIds from the module path, dropping the modules/ prefix', () => {
    // `modules/` is scaffolding, not identity: an artifact reads as
    // <context>-<path> so its name states the module's address.
    const basic = jvmLayout([]);
    expect(basic.mavenArtifact('domain/core')).toBe('domain-core');
    expect(basic.mavenArtifact(basic.infra('greeting-log/jdbc'))).toBe(
      'infrastructure-greeting-log-jdbc',
    );
    const modulith = jvmLayout([MODULITH_LAYOUT_TAG]);
    expect(modulith.mavenArtifact('platform/kernel')).toBe('platform-kernel');
    expect(modulith.mavenArtifact(modulith.domainCore)).toBe('greeting-domain-core');
    expect(modulith.mavenArtifact(modulith.infra('greeting-log/jdbc'))).toBe(
      'greeting-infra-greeting-log-jdbc',
    );
  });

  it('counts the way back to the project root, which both layouts do differently', () => {
    // Maven's <relativePath> and Flyway's filesystem: locations both
    // need this, and both get it wrong by hand.
    expect(jvmLayout([]).upToRoot('application/rest/executable')).toBe('../../../');
    expect(jvmLayout([MODULITH_LAYOUT_TAG]).upToRoot('application/api')).toBe('../../');
    expect(jvmLayout([MODULITH_LAYOUT_TAG]).upToRoot('modules/greeting/domain/contract')).toBe(
      '../../../../',
    );
  });

  it('names a driven adapter package only where the layout has peers to disambiguate', () => {
    // Under `basic` the adapters sit directly under the base package —
    // `infrastructure/` is a build-module name, never a package segment.
    expect(jvmLayout([]).infraPkg('clock.fake')).toBe('clock.fake');
    expect(jvmLayout([MODULITH_LAYOUT_TAG]).infraPkg('clock.fake')).toBe(
      'greeting.infra.clock.fake',
    );
  });
});

describe('walking-skeleton under layout.modulith (Quarkus REST)', () => {
  it('carves the skeleton into platform/, modules/ and application/', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    cwds.push(cwd);

    const expected = [
      'settings.gradle.kts',
      'platform/kernel/build.gradle.kts',
      'platform/kernel/src/main/java/com/example/platform/kernel/Command.java',
      'platform/kernel/src/main/java/com/example/platform/kernel/Handler.java',
      'platform/kernel/src/main/java/com/example/platform/kernel/Mediator.java',
      'platform/kernel/src/main/java/com/example/platform/kernel/RegistryMediator.java',
      'platform/kernel/src/main/java/com/example/platform/kernel/DomainHandler.java',
      'modules/greeting/domain/contract/build.gradle.kts',
      'modules/greeting/domain/contract/src/main/java/com/example/greeting/domain/contract/greet/GreetCommand.java',
      'modules/greeting/domain/core/src/main/java/com/example/greeting/domain/core/greet/GreetHandler.java',
      'modules/greeting/domain/core/src/test/java/com/example/greeting/domain/core/greet/GreetTest.java',
      'modules/greeting/user-side/api/contract/src/main/java/com/example/greeting/userside/api/contract/GreetResponse.java',
      'modules/greeting/user-side/api/adapters/src/main/java/com/example/greeting/userside/api/GreetResource.java',
      'modules/greeting/user-side/api/adapters/src/main/java/com/example/greeting/userside/api/GreetRejectedMapper.java',
      'modules/greeting/user-side/service/src/main/java/com/example/greeting/userside/service/GreetingService.java',
      'modules/greeting/user-side/service/src/main/java/com/example/greeting/userside/service/GreetingServiceAdapter.java',
      'modules/greeting/user-side/service/src/test/java/com/example/greeting/userside/service/GreetingServiceAdapterTest.java',
      'application/api/build.gradle.kts',
      'application/api/src/main/java/com/example/application/api/MediatorProducer.java',
      'application/api/src/main/resources/application.properties',
      'application/api/src/test/java/com/example/application/api/GreetResourceTest.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }

    // …and nothing of the flat layout survives.
    for (const p of [
      'domain/kernel/build.gradle.kts',
      'domain/core/src/main/java/com/example/core/RegistryMediator.java',
      'application/rest/executable/build.gradle.kts',
    ]) {
      expect(tree.read(p), `unexpected ${p}`).toBeNull();
    }
  });

  it('registers every module with the build, the port fake included', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    cwds.push(cwd);
    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    for (const project of [
      ':platform:kernel',
      ':modules:greeting:domain:contract',
      ':modules:greeting:domain:core',
      ':modules:greeting:user-side:service',
      ':modules:greeting:user-side:api:contract',
      ':modules:greeting:user-side:api:adapters',
      ':application:api',
      ':modules:greeting:infra:clock:fake',
    ]) {
      expect(settings, `missing include for ${project}`).toContain(`include("${project}")`);
    }
  });

  it('keeps a module out of its peers: the service exposes the domain only as implementation', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    cwds.push(cwd);
    const build =
      tree.read('modules/greeting/user-side/service/build.gradle.kts')?.toString() ?? '';
    // `api` would put the greeting commands on a consuming module's
    // compile classpath — the one thing the seam exists to prevent.
    expect(build).toContain('implementation(project(":modules:greeting:domain:contract"))');
    expect(build).not.toContain('api(project(":modules:greeting:domain:contract"))');
  });

  it('keeps a module out of its peers under Maven too: the domain dependency is optional', async () => {
    // The Maven twin of the rule above, and a real regression: Maven's
    // `compile` scope is transitive, so a plain dependency here hands
    // the greeting domain to every peer that depends on this module —
    // verified by building a three-module reactor, where the peer
    // compiled `import …greeting.domain.contract…` with no dependency
    // on it. `optional` is Maven's only non-transitive compile scope.
    const { tree, cwd } = await install(walkingSkeletonVertical, [
      'lang.java',
      'runtime.jvm',
      'pkg.maven',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
      MODULITH_LAYOUT_TAG,
    ]);
    cwds.push(cwd);
    const pom = tree.read('modules/greeting/user-side/service/pom.xml')?.toString() ?? '';
    const contractDep =
      /<dependency>(?:(?!<\/dependency>)[\s\S])*greeting-domain-contract[\s\S]*?<\/dependency>/.exec(
        pom,
      );
    expect(contractDep, 'the service pom must declare greeting-domain-contract').not.toBeNull();
    expect(contractDep?.[0]).toContain('<optional>true</optional>');
    // `provided` would also be non-transitive but drops the contract
    // from this module's runtime classpath, and the adapter dispatches
    // a real GreetCommand — so it must not be used here.
    expect(contractDep?.[0]).not.toContain('<scope>provided</scope>');
  });

  it('scaffolds a second bounded context that meets the first only at the service seam', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG),
    );
    cwds.push(cwd);

    // The consumer owns the port, in its own vocabulary.
    const port =
      tree
        .read(
          'modules/guestbook/domain/contract/src/main/java/com/example/guestbook/domain/contract/signing/Welcome.java',
        )
        ?.toString() ?? '';
    expect(port).toContain('WelcomeMessage welcomeFor(Visitor visitor)');
    // The prose may name greeting to explain what it avoids; the code
    // must not depend on it. Imports are the part that binds.
    expect(
      port.split('\n').filter((l) => l.startsWith('import ')),
      'the consumer port must not import the provider',
    ).toEqual([]);

    // Exactly one class names two contexts, and it is the gateway.
    const gateway =
      tree
        .read(
          'modules/guestbook/infra/greeting-gateway/src/main/java/com/example/guestbook/infra/greetinggateway/GreetingWelcome.java',
        )
        ?.toString() ?? '';
    expect(gateway).toContain('import com.example.greeting.userside.service.GreetingService;');
    expect(
      gateway.split('\n').filter((l) => l.startsWith('import ') && l.includes('greeting.domain')),
      "the gateway must not reach past the seam into greeting's domain",
    ).toEqual([]);

    // The build graph gives the gateway the seam and nothing behind it.
    const gatewayBuild =
      tree.read('modules/guestbook/infra/greeting-gateway/build.gradle.kts')?.toString() ?? '';
    expect(gatewayBuild).toContain('project(":modules:greeting:user-side:service")');
    expect(gatewayBuild).not.toContain('project(":modules:greeting:domain:contract")');
  });

  it('binds the peer port lazily, or the container recurses until the stack runs out', async () => {
    // Regression: the mediator is built by materialising every handler,
    // so resolving the greeting service while producing Welcome closes
    // a cycle — mediator → SignHandler → Welcome → GreetingService →
    // mediator. The first build of this shape died with a
    // StackOverflowError; a single-context skeleton cannot reach it.
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG),
    );
    cwds.push(cwd);
    const producer =
      tree
        .read('application/api/src/main/java/com/example/application/api/MediatorProducer.java')
        ?.toString() ?? '';
    expect(producer).toContain('public Welcome welcome(Instance<GreetingService> greeting)');
    expect(producer).toContain('new GreetingWelcome(greeting::get)');
  });

  it('gives the Maven assembly real dependencies, not managed versions', async () => {
    // Regression: a Quarkus pom opens with a <dependencyManagement>
    // block, so anchoring the patch on the closing </dependencies>
    // tag filed the peer modules under version management — where
    // they pin versions and add nothing to the compile classpath.
    // Only a real `mvn verify` caught it: `package ... does not exist`.
    const { tree, cwd } = await install(walkingSkeletonVertical, [
      'lang.java',
      'runtime.jvm',
      'pkg.maven',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
      MODULITH_LAYOUT_TAG,
      PEER_CONTEXT_TAG,
    ]);
    cwds.push(cwd);
    const pom = tree.read('application/api/pom.xml')?.toString() ?? '';
    const managed = /<dependencyManagement>[\s\S]*?<\/dependencyManagement>/.exec(pom)?.[0] ?? '';
    expect(managed, 'peer modules must not be filed under dependencyManagement').not.toContain(
      'guestbook',
    );
    expect(pom).toContain('<artifactId>guestbook-domain-core</artifactId>');
    expect(pom).toContain('<artifactId>guestbook-infra-greeting-gateway</artifactId>');
  });

  it('leaves the skeleton untouched when the peer context is not opted into', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    cwds.push(cwd);
    expect(tree.read('modules/guestbook/domain/contract/build.gradle.kts')).toBeNull();
    expect(tree.read('settings.gradle.kts')?.toString()).not.toContain('guestbook');
  });

  it('the service adapter dispatches through the module mediator, not the handler', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    cwds.push(cwd);
    const adapter =
      tree
        .read(
          'modules/greeting/user-side/service/src/main/java/com/example/greeting/userside/service/GreetingServiceAdapter.java',
        )
        ?.toString() ?? '';
    expect(adapter).toContain('import com.example.platform.kernel.Mediator;');
    expect(adapter).toContain('mediator.dispatch(new GreetCommand(name))');
    expect(adapter).not.toContain('GreetHandler');
  });

  it('scaffolds the CLI arch as an application/cli assembly over the same module', async () => {
    const { tree, cwd } = await install(
      walkingSkeletonVertical,
      tags('arch.cli', MODULITH_LAYOUT_TAG),
    );
    cwds.push(cwd);
    expect(
      tree.read(
        'modules/greeting/user-side/cli/src/main/java/com/example/greeting/userside/cli/HelloCommand.java',
      ),
    ).not.toBeNull();
    expect(
      tree.read('application/cli/src/main/java/com/example/application/cli/Main.java'),
    ).not.toBeNull();
    const main =
      tree
        .read('application/cli/src/main/java/com/example/application/cli/Main.java')
        ?.toString() ?? '';
    // Main now lives in a different module from the subcommand it lists.
    expect(main).toContain('import com.example.greeting.userside.cli.HelloCommand;');
  });
});

describe('layout-dependent verticals under layout.modulith', () => {
  it('observability targets the assembly, because correlation and probes are assembly-level', async () => {
    const projectTags = tags('arch.server-http', MODULITH_LAYOUT_TAG);
    const { tree, cwd } = await install(walkingSkeletonVertical, projectTags);
    cwds.push(cwd);
    await install(observabilityVertical, projectTags, tree, cwd);

    expect(
      tree.read(
        'application/api/src/main/java/com/example/application/api/observability/RequestContextFilter.java',
      ),
    ).not.toBeNull();
    expect(tree.read('application/api/build.gradle.kts')?.toString()).toContain(
      'quarkus-smallrye-health',
    );
    expect(
      tree.read('application/api/src/main/resources/application.properties')?.toString(),
    ).toContain('%X{correlationId}');
  });

  it('persistence puts the driven port in the module and the datasource in the assembly', async () => {
    const projectTags = tags('arch.server-http', 'persistence.sql', MODULITH_LAYOUT_TAG);
    const { tree, cwd } = await install(walkingSkeletonVertical, projectTags);
    cwds.push(cwd);
    await install(persistenceVertical, projectTags, tree, cwd);

    // The port and its handlers belong to the bounded context…
    expect(
      tree.read(
        'modules/greeting/domain/contract/src/main/java/com/example/greeting/domain/contract/greetinglog/GreetingLog.java',
      ),
    ).not.toBeNull();
    expect(
      tree.read(
        'modules/greeting/domain/core/src/main/java/com/example/greeting/domain/core/greetinglog/RecordGreetingHandler.java',
      ),
    ).not.toBeNull();
    // …its adapters to the context's driven side…
    expect(
      tree.read(
        'modules/greeting/infra/greeting-log/jdbc/src/main/java/com/example/greeting/infra/greetinglog/jdbc/JdbcGreetingLog.java',
      ),
    ).not.toBeNull();
    expect(
      tree.read(
        'modules/greeting/infra/unit-of-work/jta/src/main/java/com/example/greeting/infra/unitofwork/jta/JtaUnitOfWork.java',
      ),
    ).not.toBeNull();
    // …the HTTP resource to the context's user side…
    expect(
      tree.read(
        'modules/greeting/user-side/api/adapters/src/main/java/com/example/greeting/userside/api/GreetingLogResource.java',
      ),
    ).not.toBeNull();
    // …and only the datasource wiring to the assembly.
    expect(
      tree.read(
        'application/api/src/main/java/com/example/application/api/PersistenceProducer.java',
      ),
    ).not.toBeNull();
    expect(tree.exists('domain/contract')).toBe(false);
    expect(tree.exists('infrastructure')).toBe(false);

    // The build registers the four new modules under the module root
    // and the assembly depends on the two real adapters.
    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('include(":modules:greeting:infra:greeting-log:jdbc")');
    expect(settings).toContain('include(":modules:greeting:infra:unit-of-work:jta")');
    expect(tree.read('application/api/build.gradle.kts')?.toString()).toContain(
      'implementation(project(":modules:greeting:infra:greeting-log:jdbc"))',
    );
    expect(tree.read('modules/greeting/domain/core/build.gradle.kts')?.toString()).toContain(
      'testImplementation(project(":modules:greeting:infra:unit-of-work:fake"))',
    );
    // Flyway reaches migrations/ from two directories up, not three.
    expect(
      tree.read('application/api/src/main/resources/application.properties')?.toString(),
    ).toContain('filesystem:../../migrations/sql');
    // …and from the JDBC module — five deep, and running from its own
    // directory — from five up. Both build systems run a test with the
    // module as its working directory, so this depth is the difference
    // between the contract test finding the schema and not.
    expect(
      tree
        .read(
          'modules/greeting/infra/greeting-log/jdbc/src/test/java/com/example/greeting/infra/greetinglog/jdbc/JdbcGreetingLogTest.java',
        )
        ?.toString(),
    ).toContain('filesystem:../../../../../migrations/sql');
  });
});

describe('the Micronaut modulith reactor on Maven', () => {
  // Only the assembly parents `micronaut-parent`; every other module
  // parents the reactor root, and Maven allows one parent. So the
  // root has to import the platform BOM itself, or the library module
  // holding the framework-facing adapter declares `io.micronaut:*`
  // with no version and Maven cannot even read the reactor. A real
  // defect: it shipped, and stayed invisible for as long as no
  // Micronaut project had been built by Maven in any layout.
  const combos = [
    {
      arch: 'arch.server-http',
      lang: 'lang.java',
      module: 'modules/greeting/user-side/api/adapters',
    },
    {
      arch: 'arch.server-http',
      lang: 'lang.kotlin',
      module: 'modules/greeting/user-side/api/adapters',
    },
    { arch: 'arch.cli', lang: 'lang.java', module: 'modules/greeting/user-side/cli' },
    { arch: 'arch.cli', lang: 'lang.kotlin', module: 'modules/greeting/user-side/cli' },
  ] as const;

  for (const { arch, lang, module } of combos) {
    it(`manages Micronaut versions from the root for ${lang} ${arch}`, async () => {
      const { tree, cwd } = await install(walkingSkeletonVertical, [
        lang,
        'runtime.jvm',
        'pkg.maven',
        'framework.micronaut',
        'arch.hexagonal',
        arch,
        MODULITH_LAYOUT_TAG,
      ]);
      cwds.push(cwd);

      const root = tree.read('pom.xml')?.toString() ?? '';
      const managed =
        /<dependencyManagement>[\s\S]*?<\/dependencyManagement>/.exec(root)?.[0] ?? '';
      expect(managed, 'the reactor root must manage dependency versions').not.toBe('');
      expect(managed).toContain('<groupId>io.micronaut.platform</groupId>');
      expect(managed).toContain('<artifactId>micronaut-platform</artifactId>');
      expect(managed).toContain('<scope>import</scope>');

      // …which is load-bearing precisely because this module asks for
      // Micronaut without naming a version, and does not inherit one.
      const pom = tree.read(`${module}/pom.xml`)?.toString() ?? '';
      const micronautDep =
        /<dependency>(?:(?!<\/dependency>)[\s\S])*<groupId>io\.micronaut[\s\S]*?<\/dependency>/.exec(
          pom,
        );
      expect(micronautDep, `${module} must depend on Micronaut`).not.toBeNull();
      expect(micronautDep?.[0]).not.toContain('<version>');
      expect(pom).toContain('<relativePath>');
    });

    it(`runs the Micronaut annotation processor in ${module} for ${lang} ${arch}`, async () => {
      // Micronaut resolves beans at compile time, per compiled module.
      // The assembly's own processor does not reach into a sibling
      // jar, so a library module holding a @Controller or @Command
      // that does not process itself contributes no bean definition —
      // and nothing says so: it compiles, packages, and starts, then
      // 404s every route. The Gradle twin gets this from applying
      // `io.micronaut.library`.
      const { tree, cwd } = await install(walkingSkeletonVertical, [
        lang,
        'runtime.jvm',
        'pkg.maven',
        'framework.micronaut',
        'arch.hexagonal',
        arch,
        MODULITH_LAYOUT_TAG,
      ]);
      cwds.push(cwd);

      const pom = tree.read(`${module}/pom.xml`)?.toString() ?? '';
      expect(pom).toContain('<annotationProcessorPath');
      expect(pom).toContain('<artifactId>micronaut-inject-java</artifactId>');
      if (lang === 'lang.kotlin') {
        // On Kotlin the processor runs through kapt, not javac.
        expect(pom).toContain('<goal>kapt</goal>');
      }
    });
  }
});

/**
 * A tag set carrying both `arch.cli` and `arch.server-http` resolves
 * both JVM bootstrap adapters under the modulith too — the same
 * composable-entrypoint mechanism `jvm-shared-root.ts` gave the basic
 * layout, ported to this tree shape in
 * `jvm-shared-root-modulith.ts`. The regression this guards: before
 * that port, each bootstrap rendered its own whole-file copy of
 * `settings.gradle.kts` / `pom.xml` / `build.gradle.kts` /
 * `gradle.properties` / `README.md` with its own module list baked
 * in, so the second adapter to resolve threw
 * `ContributionConflictError` on a path the first had created.
 *
 * The matrix is every (framework, language, build system) the JVM
 * bootstraps cover, because the seeds differ along all three axes —
 * Kotlin moves the Gradle plugins and the Maven reactor block,
 * Micronaut adds a reactor-root BOM import, and the two build systems
 * carry the module list in different files.
 */
describe('walking-skeleton under layout.modulith (composed cli + server-http)', () => {
  const read = (tree: FsTree, file: string): string => tree.read(file)?.toString() ?? '';

  const comboTags = (framework: string, lang: string, build: string): string[] => [
    lang,
    'runtime.jvm',
    `pkg.${build}`,
    `framework.${framework}`,
    'arch.hexagonal',
    'arch.cli',
    'arch.server-http',
    MODULITH_LAYOUT_TAG,
  ];

  /** Every module the composed project must register, in build order. */
  const MODULES = [
    'platform/kernel',
    'modules/greeting/domain/contract',
    'modules/greeting/domain/core',
    'modules/greeting/user-side/service',
    'modules/greeting/user-side/cli',
    'application/cli',
    'modules/greeting/user-side/api/contract',
    'modules/greeting/user-side/api/adapters',
    'application/api',
  ];

  for (const framework of ['quarkus', 'spring', 'micronaut']) {
    for (const lang of ['lang.java', 'lang.kotlin']) {
      const ext = lang === 'lang.java' ? 'java' : 'kt';
      const src = lang === 'lang.java' ? 'java' : 'kotlin';

      it(`registers both entrypoints once in settings.gradle.kts for ${framework} ${lang}`, async () => {
        const { tree, cwd } = await install(
          walkingSkeletonVertical,
          comboTags(framework, lang, 'gradle'),
        );
        cwds.push(cwd);

        const settings = read(tree, 'settings.gradle.kts');
        for (const module of MODULES) {
          const include = `include(":${module.split('/').join(':')}")`;
          expect(settings, `missing ${include}`).toContain(include);
          // Exactly once: the shared seed is upserted, never re-emitted
          // whole by the second adapter to resolve.
          expect(settings.split(include)).toHaveLength(2);
        }
      });

      it(`registers both entrypoints once in the reactor pom for ${framework} ${lang}`, async () => {
        const { tree, cwd } = await install(
          walkingSkeletonVertical,
          comboTags(framework, lang, 'maven'),
        );
        cwds.push(cwd);

        const root = read(tree, 'pom.xml');
        for (const module of MODULES) {
          const entry = `<module>${module}</module>`;
          expect(root, `missing ${entry}`).toContain(entry);
          expect(root.split(entry)).toHaveLength(2);
        }
      });

      it(`emits both deployment units onto one hexagon for ${framework} ${lang}`, async () => {
        const { tree, cwd } = await install(
          walkingSkeletonVertical,
          comboTags(framework, lang, 'gradle'),
        );
        cwds.push(cwd);

        // One context, two driving adapters, two assemblies.
        for (const file of [
          `modules/greeting/domain/core/src/main/${src}/com/example/greeting/domain/core/greet/GreetHandler.${ext}`,
          `modules/greeting/user-side/service/src/main/${src}/com/example/greeting/userside/service/GreetingService.${ext}`,
          `modules/greeting/user-side/cli/build.gradle.kts`,
          `modules/greeting/user-side/api/contract/build.gradle.kts`,
          `modules/greeting/user-side/api/adapters/build.gradle.kts`,
          `application/cli/build.gradle.kts`,
          `application/api/build.gradle.kts`,
        ]) {
          expect(tree.read(file), `missing ${file}`).not.toBeNull();
        }

        const readme = read(tree, 'README.md');
        expect(readme).toContain('### cli');
        expect(readme).toContain('### rest');
      });

      it(`unifies the domain on the richer (REST) shape for ${framework} ${lang}`, async () => {
        // The CLI-only modulith used to ship a handler that never
        // refused; composing the two would otherwise mean two
        // different GreetHandlers writing one path.
        const { tree, cwd } = await install(
          walkingSkeletonVertical,
          comboTags(framework, lang, 'gradle'),
        );
        cwds.push(cwd);

        const contract = `modules/greeting/domain/contract/src/main/${src}/com/example/greeting/domain/contract/greet`;
        expect(tree.read(`${contract}/GreetRejected.${ext}`)).not.toBeNull();
        expect(
          read(
            tree,
            `modules/greeting/domain/core/src/main/${src}/com/example/greeting/domain/core/greet/GreetHandler.${ext}`,
          ),
        ).toContain('GreetRejected');
      });
    }
  }

  it('keeps every module archive uniquely named, whichever framework composed it', async () => {
    // `contract` names two modules once both entrypoints are present
    // (`domain/contract` and `user-side/api/contract`), and a flat
    // lib/ layout packs by file name — so under the modulith the
    // archive rename is unconditional rather than Spring/Micronaut's
    // concern alone.
    for (const framework of ['quarkus', 'spring', 'micronaut']) {
      const { tree, cwd } = await install(
        walkingSkeletonVertical,
        comboTags(framework, 'lang.java', 'gradle'),
      );
      cwds.push(cwd);
      expect(read(tree, 'build.gradle.kts'), framework).toContain(
        `archiveBaseName.set(project.path.removePrefix(":").replace(':', '-'))`,
      );
    }
  });
});
