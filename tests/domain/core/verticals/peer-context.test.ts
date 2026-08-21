/**
 * Tests for the JVM peer-context family — the second bounded context
 * `keel new --module-layout=modulith --with-peer-context` scaffolds,
 * across all three frameworks and both languages.
 *
 * What is worth asserting here is narrow, and deliberately so. The
 * guestbook tree itself is framework-independent, so it is checked
 * once per language; everything else is the **binding**, and a
 * binding is only half-checkable from emitted text. These tests hold
 * the half that is: that each container is told about the new
 * context in the place it needs telling — Spring's `@ComponentScan`
 * list, Micronaut's `@Import` packages, Micronaut Kotlin's explicit
 * handler list — and that the peer is resolved through a deferred
 * handle rather than eagerly.
 *
 * The other half is not assertable from files at all: whether the
 * container actually finds the handler. That is what the emitted
 * `GuestbookWiringTest` is for, and what
 * `tests/e2e/walking-skeleton-modulith.test.ts` runs.
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
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

/** Every JVM bootstrap answers the same two questions, identically. */
const BOOTSTRAP_ANSWERS = Object.fromEntries(
  ['quarkus', 'spring', 'micronaut'].flatMap((framework) =>
    ['cli', 'rest'].flatMap((arch) =>
      ['', '-kotlin'].map((lang) => [
        `walking-skeleton/${framework}-${arch}${lang}-bootstrap`,
        { basePackage: 'com.example', projectName: 'demo' },
      ]),
    ),
  ),
);

interface Combo {
  readonly framework: 'quarkus' | 'spring' | 'micronaut';
  readonly language: 'java' | 'kotlin';
  readonly arch: 'cli' | 'rest';
}

const cwds: string[] = [];

/** Installs the walking skeleton with the peer context opted in. */
const scaffold = async (combo: Combo, peer = true): Promise<FsTree> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-peer-'));
  cwds.push(dir);
  const tree = new FsTree(dir);
  await installVertical({
    vertical: walkingSkeletonVertical,
    manifest: {
      ...emptyManifestV2('2026-08-14T00:00:00Z', '0.5.0-alpha'),
      tags: [
        `lang.${combo.language}`,
        'runtime.jvm',
        'pkg.gradle',
        `framework.${combo.framework}`,
        'arch.hexagonal',
        combo.arch === 'cli' ? 'arch.cli' : 'arch.server-http',
        MODULITH_LAYOUT_TAG,
        ...(peer ? [PEER_CONTEXT_TAG] : []),
      ],
      answers: BOOTSTRAP_ANSWERS,
    },
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd: dir,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-14T12:00:00Z',
  });
  return tree;
};

const read = (tree: FsTree, file: string): string => tree.read(file)?.toString() ?? '';

/** Source root of the assembly for one combination. */
const assemblyDir = (combo: Combo): string => `application/${combo.arch === 'cli' ? 'cli' : 'api'}`;

const assemblySource = (combo: Combo, className: string): string =>
  `${assemblyDir(combo)}/src/main/${combo.language}/com/example/application/${
    combo.arch === 'cli' ? 'cli' : 'api'
  }/${className}.${combo.language === 'java' ? 'java' : 'kt'}`;

beforeEach(() => {
  cwds.length = 0;
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('the guestbook context, per language', () => {
  it.each([
    { language: 'java' as const, ext: 'java' },
    { language: 'kotlin' as const, ext: 'kt' },
  ])('emits the $language tree with a port that names no peer', async ({ language, ext }) => {
    const tree = await scaffold({ framework: 'spring', language, arch: 'rest' });
    const root = `modules/guestbook/domain/contract/src/main/${language}/com/example/guestbook/domain/contract/signing`;

    const port = read(tree, `${root}/Welcome.${ext}`);
    expect(port).toContain('Welcome');
    // The prose may name greeting to explain what it avoids; the code
    // must not depend on it. Imports are the part that binds.
    expect(
      port.split('\n').filter((l) => l.startsWith('import ')),
      'the consumer port must not import the provider',
    ).toEqual([]);

    // Exactly one class names two contexts, and it is the gateway.
    const gateway = read(
      tree,
      `modules/guestbook/infra/greeting-gateway/src/main/${language}/com/example/guestbook/infra/greetinggateway/GreetingWelcome.${ext}`,
    );
    expect(gateway).toContain('com.example.greeting.userside.service.GreetingService');
    expect(
      gateway.split('\n').filter((l) => l.startsWith('import ') && l.includes('greeting.domain')),
      "the gateway must not reach past the seam into greeting's domain",
    ).toEqual([]);
  });
});

describe('Spring binds the port and widens the component scan', () => {
  it('adds an ObjectProvider-backed @Bean, never an eager GreetingService', async () => {
    const combo: Combo = { framework: 'spring', language: 'java', arch: 'rest' };
    const config = read(await scaffold(combo), assemblySource(combo, 'MediatorConfig'));
    expect(config).toContain('public Welcome welcome(ObjectProvider<GreetingService> greeting)');
    expect(config).toContain('new GreetingWelcome(greeting::getObject)');
    expect(config).toContain('import org.springframework.beans.factory.ObjectProvider;');
  });

  it('binds through a deferred handle in Kotlin too', async () => {
    const combo: Combo = { framework: 'spring', language: 'kotlin', arch: 'rest' };
    const config = read(await scaffold(combo), assemblySource(combo, 'MediatorConfig'));
    expect(config).toContain('fun welcome(greeting: ObjectProvider<GreetingService>): Welcome');
    expect(config).toContain('GreetingWelcome { greeting.getObject() }');
  });

  // The component scan names every context one by one. A context left
  // off the list is never scanned: SignHandler is never discovered,
  // the mediator is short one handler, and the application starts
  // perfectly — no error, nothing to read in a file.
  it.each([
    { arch: 'rest' as const, bootClass: 'Application' },
    { arch: 'cli' as const, bootClass: 'Main' },
  ])('lists the peer package on $bootClass for the $arch assembly', async ({ arch, bootClass }) => {
    const combo: Combo = { framework: 'spring', language: 'java', arch };
    const boot = read(await scaffold(combo), assemblySource(combo, bootClass));
    expect(boot).toContain('"com.example.guestbook"');
    expect(boot).toContain('"com.example.greeting"');
  });

  it('lists the peer package on the Kotlin boot class', async () => {
    const combo: Combo = { framework: 'spring', language: 'kotlin', arch: 'rest' };
    const boot = read(await scaffold(combo), assemblySource(combo, 'Application'));
    expect(boot).toContain('"com.example.guestbook",');
  });
});

describe('Micronaut admits the peer the way each language can', () => {
  it('widens @Import to the peer core package — it does not recurse', async () => {
    const combo: Combo = { framework: 'micronaut', language: 'java', arch: 'rest' };
    const factory = read(await scaffold(combo), assemblySource(combo, 'MediatorFactory'));
    expect(factory).toContain('"com.example.greeting.domain.core.greet"');
    expect(factory).toContain('"com.example.guestbook.domain.core.signing"');
    expect(factory).toContain('public Welcome welcome(BeanProvider<GreetingService> greeting)');
  });

  // The Kotlin bootstrap wires handlers by hand — @Import is
  // documented as Java-only — so a new handler is an edit, not a
  // discovery. Nothing else in the project would notice its absence.
  it('adds SignHandler to the explicit Kotlin wiring', async () => {
    const combo: Combo = { framework: 'micronaut', language: 'kotlin', arch: 'rest' };
    const factory = read(await scaffold(combo), assemblySource(combo, 'MediatorFactory'));
    expect(factory).toContain('RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))');
    expect(factory).toContain('fun welcome(greeting: BeanProvider<GreetingService>): Welcome');
    expect(factory).toContain('import com.example.guestbook.domain.core.signing.SignHandler');
  });
});

describe('Quarkus keeps its CDI shape in both languages', () => {
  it('produces Welcome from a lazily-resolved Instance', async () => {
    const combo: Combo = { framework: 'quarkus', language: 'kotlin', arch: 'rest' };
    const producer = read(await scaffold(combo), assemblySource(combo, 'MediatorProducer'));
    expect(producer).toContain('fun welcome(greeting: Instance<GreetingService>): Welcome');
    expect(producer).toContain('GreetingWelcome { greeting.get() }');
  });

  it('marks the peer core a bean archive, as the greeting module is', async () => {
    const tree = await scaffold({ framework: 'quarkus', language: 'kotlin', arch: 'rest' });
    expect(
      tree.read('modules/guestbook/domain/core/src/main/resources/META-INF/beans.xml'),
    ).not.toBeNull();
  });
});

describe('the wiring test — the only thing that catches a handler nobody found', () => {
  it.each([
    { framework: 'quarkus' as const, language: 'java' as const, arch: 'rest' as const },
    { framework: 'spring' as const, language: 'java' as const, arch: 'cli' as const },
    { framework: 'micronaut' as const, language: 'kotlin' as const, arch: 'rest' as const },
  ])('lands in the $framework $arch assembly under its own package ($language)', async (combo) => {
    const tree = await scaffold(combo);
    const suffix = combo.arch === 'cli' ? 'cli' : 'api';
    const test = read(
      tree,
      `${assemblyDir(combo)}/src/test/${combo.language}/com/example/application/${suffix}/GuestbookWiringTest.${combo.language === 'java' ? 'java' : 'kt'}`,
    );
    expect(test).toContain(`package com.example.application.${suffix}`);
    expect(test, 'the test must dispatch through the real mediator').toContain(
      'mediator.dispatch(',
    );
    expect(test).toContain('SignCommand("Romain")');
  });
});

describe('without the flag, nothing changes', () => {
  it.each(['quarkus', 'spring', 'micronaut'] as const)(
    'leaves the %s skeleton exactly as the modulith emits it',
    async (framework) => {
      const tree = await scaffold({ framework, language: 'java', arch: 'rest' }, false);
      expect(tree.read('modules/guestbook/domain/contract/build.gradle.kts')).toBeNull();
      expect(read(tree, 'settings.gradle.kts')).not.toContain('guestbook');
      expect(read(tree, 'application/api/build.gradle.kts')).not.toContain('guestbook');
    },
  );
});

/**
 * On a stack composing `arch.cli` and `arch.server-http`, the peer
 * context has *two* assemblies to reach — and the adapter used to
 * take whichever one an `if (arch.cli)` picked, wiring the CLI and
 * leaving the HTTP assembly knowing nothing of guestbook. That
 * project compiles, packages and starts; it simply does not do half
 * of what was asked for, which is the failure mode `jvmAssemblies`
 * exists to remove.
 */
describe('a composed cli + server-http project wires the peer into both assemblies', () => {
  const composed = async (framework: Combo['framework'], language: Combo['language']) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-peer-combo-'));
    cwds.push(dir);
    const tree = new FsTree(dir);
    await installVertical({
      vertical: walkingSkeletonVertical,
      manifest: {
        ...emptyManifestV2('2026-08-14T00:00:00Z', '0.5.0-alpha'),
        tags: [
          `lang.${language}`,
          'runtime.jvm',
          'pkg.gradle',
          `framework.${framework}`,
          'arch.hexagonal',
          'arch.cli',
          'arch.server-http',
          MODULITH_LAYOUT_TAG,
          PEER_CONTEXT_TAG,
        ],
        answers: BOOTSTRAP_ANSWERS,
      },
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd: dir,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-14T12:00:00Z',
    });
    return tree;
  };

  for (const framework of ['quarkus', 'spring', 'micronaut'] as const) {
    for (const language of ['java', 'kotlin'] as const) {
      it(`declares guestbook on both assemblies for ${framework} ${language}`, async () => {
        const tree = await composed(framework, language);

        for (const assembly of ['application/cli', 'application/api']) {
          const build = read(tree, `${assembly}/build.gradle.kts`);
          expect(build, `${assembly} must depend on guestbook's core`).toContain(
            'modules:guestbook:domain:core',
          );
        }
      });

      it(`renders a wiring test into both assemblies for ${framework} ${language}`, async () => {
        const tree = await composed(framework, language);
        const ext = language === 'java' ? 'java' : 'kt';

        for (const [assembly, pkg] of [
          ['application/cli', 'cli'],
          ['application/api', 'api'],
        ]) {
          const test = `${assembly}/src/test/${language}/com/example/application/${pkg}/GuestbookWiringTest.${ext}`;
          expect(tree.read(test), `missing ${test}`).not.toBeNull();
        }
      });
    }
  }
});
