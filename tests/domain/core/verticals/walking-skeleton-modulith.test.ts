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
  });
});
