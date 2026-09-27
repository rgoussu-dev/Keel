/**
 * Tests for the JVM bounded-context adapters — what
 * `keel add module <name>` writes into a JVM modulith, across the six
 * (framework, language) bindings.
 *
 * These hold the facts that are checkable from emitted text: which
 * modules exist, which names derive from the context's own, what each
 * build file declares and — the load-bearing one — what it
 * deliberately does not. Whether the result *compiles* is not
 * assertable here and is not tried; that is
 * `tests/e2e/add-module-jvm.test.ts`, which builds three contexts and
 * proves the wall with a real javac failure.
 *
 * The other thing asserted here and nowhere else is **repetition**.
 * `keel add module` runs once per context, and three of the six
 * bindings widen a list the container reads. Every such test adds
 * *two* contexts, because a patch that works once and silently stops
 * working is the failure mode this family was built around.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { addModuleCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import type {
  Adapter,
  ContributionPatch,
  Tag,
} from '../../../../src/domain/contract/composition.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { PathConflictError } from '../../../../src/domain/contract/refusal.js';
import {
  ADD_MODULE_INPUT_ID,
  CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/added-context.js';
import { MODULITH_LAYOUT_TAG } from '../../../../src/domain/core/adapters/module-layout.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { resolveVertical } from '../../../../src/domain/core/resolver.js';
import { boundedContextVertical } from '../../../../src/domain/core/verticals/bounded-context.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-jvm-context-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

interface ScaffoldOptions {
  readonly stack?: string;
  readonly buildSystem?: string;
  readonly withPeerContext?: boolean;
}

async function scaffold(options: ScaffoldOptions = {}): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: options.stack ?? 'quarkus-rest',
        answers: {},
        interactive: false,
        dryRun: false,
        moduleLayout: 'modulith',
        ...(options.buildSystem === undefined ? {} : { buildSystem: options.buildSystem }),
        ...(options.withPeerContext === true ? { withPeerContext: true } : {}),
      }),
    ),
  );
}

/** `keel add module <module>`, consuming `consumes` where given: the adapters it ran, by id. */
async function addModule(module: string, consumes?: string): Promise<readonly string[]> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  const report = expectOk(
    await mediator.dispatch(
      addModuleCommand({
        cwd,
        module,
        ...(consumes === undefined ? {} : { consumes }),
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
  return (report.resolvedAdapters ?? []).map((adapter) => adapter.id);
}

const read = (rel: string): Promise<string> => fs.readFile(path.join(cwd, rel), 'utf8');
const exists = (rel: string): Promise<boolean> => fs.pathExists(path.join(cwd, rel));

const JAVA_SRC = 'src/main/java/com/example';
const ASSEMBLY = 'application/api/src/main/java/com/example/application/api';

describe('the JVM added context', () => {
  it('emits a seam of its own, which the peer context has none of', async () => {
    await scaffold({ withPeerContext: true });
    await addModule('ordering');

    expect(await exists(`modules/ordering/user-side/service/${JAVA_SRC}/ordering`)).toBe(true);
    // The asymmetry this whole feature turns on, asserted rather than
    // assumed: --with-peer-context emits a pure consumer.
    expect(await exists('modules/guestbook/user-side/service')).toBe(false);
  });

  it('emits no gateway when nothing was consumed', async () => {
    await scaffold();
    await addModule('ordering');

    expect(await exists('modules/ordering/infra')).toBe(false);
  });

  it('spells its seam the way the skeleton spells its own', async () => {
    await scaffold();
    await addModule('ordering');
    const seam = await read(
      `modules/ordering/user-side/service/${JAVA_SRC}/ordering/userside/service/OrderingService.java`,
    );

    // greeting publishes GreetingService.greetingFor(String) -> String.
    // Matching that shape is what lets one gateway template reach any
    // context, keel's own skeleton included.
    expect(seam).toContain('public interface OrderingService');
    expect(seam).toContain('String orderingFor(String subject);');
  });

  it('reaches an added context through the same seam shape as the skeleton', async () => {
    await scaffold();
    await addModule('ordering', 'greeting');
    await addModule('shipping', 'ordering');
    const gateway = await read(
      `modules/shipping/infra/ordering-gateway/${JAVA_SRC}/shipping/infra/orderinggateway/OrderingGateway.java`,
    );

    expect(gateway).toContain('ordering.get().orderingFor(subject)');
  });

  describe('the gateway module', () => {
    it('declares the consumed seam and not its domain, under Gradle', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      const build = await read('modules/ordering/infra/greeting-gateway/build.gradle.kts');

      const declared = [...build.matchAll(/^\s*(?:api|implementation)\(project\("(.*)"\)\)/gm)].map(
        (m) => m[1],
      );
      expect(declared).toEqual([
        ':modules:ordering:domain:contract',
        ':modules:greeting:user-side:service',
      ]);
    });

    it('declares the consumed seam and not its domain, under Maven', async () => {
      await scaffold({ buildSystem: 'maven' });
      await addModule('ordering', 'greeting');
      const pom = await read('modules/ordering/infra/greeting-gateway/pom.xml');

      expect(pom).toContain('<artifactId>greeting-user-side-service</artifactId>');
      // Read the declared artifacts rather than substring the file:
      // the pom's comment explains why there is no
      // greeting-domain-contract entry, so a substring check matches
      // the prose that documents the rule and fails a pom that obeys
      // it.
      expect(dependencyArtifacts(pom)).not.toContain('greeting-domain-contract');
    });
  });

  describe('the seam module', () => {
    it('declares its own contract non-transitively under Gradle', async () => {
      await scaffold();
      await addModule('ordering');
      const build = await read('modules/ordering/user-side/service/build.gradle.kts');

      expect(build).toContain('implementation(project(":modules:ordering:domain:contract"))');
      expect(build).not.toContain('api(project(":modules:ordering:domain:contract"))');
    });

    it('declares its own contract optional under Maven — the twin wall', async () => {
      await scaffold({ buildSystem: 'maven' });
      await addModule('ordering');
      const pom = await read('modules/ordering/user-side/service/pom.xml');

      // The Maven half of this wall shipped missing once on the peer
      // context, and no generated project could have caught it.
      expect(pom).toMatch(
        /<artifactId>ordering-domain-contract<\/artifactId>[\s\S]*?<optional>true<\/optional>/,
      );
    });
  });

  describe('the assembly', () => {
    it('gains one wiring class per context, never a shared one', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'greeting');

      // Both contexts declare a GreetingClient of their own — same
      // simple name, different types. One import block could not name
      // both, which is why each binding lands in a class of its own
      // and the composition root imports neither.
      expect(await read(`${ASSEMBLY}/OrderingWiring.java`)).toContain(
        'import com.example.ordering.domain.contract.GreetingClient;',
      );
      expect(await read(`${ASSEMBLY}/ShippingWiring.java`)).toContain(
        'import com.example.shipping.domain.contract.GreetingClient;',
      );
      const root = await read(`${ASSEMBLY}/MediatorProducer.java`);
      expect(root).not.toContain('import com.example.ordering.');
      expect(root).not.toContain('import com.example.shipping.');
    });

    it('registers every module of every context exactly once', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');
      const settings = await read('settings.gradle.kts');

      for (const project of [
        ':modules:ordering:domain:contract',
        ':modules:ordering:domain:core',
        ':modules:ordering:user-side:service',
        ':modules:ordering:infra:greeting-gateway',
        ':modules:shipping:infra:ordering-gateway',
      ]) {
        expect(settings.split(`include("${project}")`)).toHaveLength(2);
      }
    });

    it('does not re-declare the skeleton seam it already depended on', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      const build = await read('application/api/build.gradle.kts');

      expect(
        build.split('implementation(project(":modules:greeting:user-side:service"))'),
      ).toHaveLength(2);
    });

    it('corrects the composition root note that nothing consumes the seam', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      const root = await read(`${ASSEMBLY}/MediatorProducer.java`);

      expect(root).not.toContain('Nothing consumes it yet');
      expect(root).toContain('`ordering` consumes it through its own {@code GreetingClient}');
      expect(root).toContain('port, bound in {@link OrderingWiring}.');
    });
  });

  describe('Spring, whose component scan names every context', () => {
    it('widens the scan once per context, from the one-line form', async () => {
      await scaffold({ stack: 'spring-rest' });
      await addModule('ordering');
      await addModule('shipping');
      const boot = await read(`${ASSEMBLY}/Application.java`);

      expect(boot).toContain('"com.example.ordering"');
      expect(boot).toContain('"com.example.shipping"');
      // A scan note stacked once per run would be the tell that the
      // patch is appending rather than re-emitting.
      expect(boot.split('Every bounded context is named here')).toHaveLength(2);
    });

    it('widens the scan the peer context already rewrote', async () => {
      await scaffold({ stack: 'spring-rest', withPeerContext: true });
      await addModule('ordering');
      const boot = await read(`${ASSEMBLY}/Application.java`);

      expect(boot).toContain('"com.example.guestbook"');
      expect(boot).toContain('"com.example.ordering"');
    });
  });

  describe('Micronaut, whose two languages discover handlers differently', () => {
    it('widens @Import once per context, from the single-string form', async () => {
      await scaffold({ stack: 'micronaut-rest' });
      await addModule('ordering');
      await addModule('shipping');
      const root = await read(`${ASSEMBLY}/MediatorFactory.java`);

      expect(root).toContain('"com.example.ordering.domain.core"');
      expect(root).toContain('"com.example.shipping.domain.core"');
      expect(root).toContain('"com.example.greeting.domain.core.greet"');
      expect(root.split('One entry per aggregate package')).toHaveLength(2);
    });

    it('adds each handler to the hand-wired Kotlin list, with its parameter', async () => {
      await scaffold({ stack: 'micronaut-rest-kotlin' });
      await addModule('ordering');
      await addModule('shipping', 'ordering');
      const root = await read(
        'application/api/src/main/kotlin/com/example/application/api/MediatorFactory.kt',
      );

      expect(root).toContain('ordering: OrderingHandler,');
      expect(root).toContain('shipping: ShippingHandler,');
      expect(root).toContain('GreetHandler(),');
      // Parameter and list entry have to arrive together — a parameter
      // with no entry compiles and dispatches nothing.
      const list = between(root, 'listOf(', '\n            ),');
      expect(list).toContain('ordering,');
      expect(list).toContain('shipping,');
    });

    it('refuses a Kotlin context named for a port the mediator already takes', async () => {
      // The peer context injects its `Welcome` port as `welcome`; a
      // context of that name would be a second `welcome` parameter,
      // which does not compile. The refusal names the wiring adapter
      // that patches the REST assembly's root, not the context's shell.
      await scaffold({ stack: 'micronaut-rest-kotlin', withPeerContext: true });
      const root = 'application/api/src/main/kotlin/com/example/application/api/MediatorFactory.kt';
      const before = await read(root);
      const refused = expectErr(
        await installMediator({ runDeferred: discardDeferred() }).dispatch(
          addModuleCommand({
            cwd,
            module: 'welcome',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      expect(refused).toBeInstanceOf(PathConflictError);
      expect((refused as PathConflictError).refusal).toEqual({
        kind: 'path-conflict',
        path: root,
        adapterId: 'bounded-context/micronaut-context-kotlin-rest',
        taken: 'welcome',
      });
      expect(await read(root)).toBe(before);
      expect(await exists('modules/welcome')).toBe(false);
    });

    it('produces the Kotlin handler as a bean, since nothing discovers it', async () => {
      await scaffold({ stack: 'micronaut-rest-kotlin' });
      await addModule('ordering', 'greeting');
      const wiring = await read(
        'application/api/src/main/kotlin/com/example/application/api/OrderingWiring.kt',
      );

      expect(wiring).toContain('fun orderingHandler(greeting: GreetingClient): OrderingHandler');
    });
  });
});

/** The text between the first `open` and the `close` after it. */
function between(source: string, open: string, close: string): string {
  const from = source.indexOf(open) + open.length;
  return source.slice(from, source.indexOf(close, from));
}

/** The artifactIds a pom declares as dependencies, comments excluded. */
function dependencyArtifacts(pom: string): readonly string[] {
  return [...pom.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)]
    .map((m) => m[1] as string)
    .slice(1);
}

/**
 * A project scaffolded from a combo stack has two assemblies, and
 * `keel add module` has to reach both. The adapter used to pick one
 * with `tags.includes('arch.cli') ? cli : rest`, which on these
 * stacks wired the CLI and left the HTTP assembly with no binding for
 * the new context's handler — a project that builds and runs and is
 * half-wired. Which assemblies a context is wired into is now read off
 * the predicates: a shell, and one wiring adapter per entrypoint the
 * project has, so a project that grows an entrypoint installs the one
 * that newly matches and the wiring already there is never rendered
 * again (roadmap R.3d). Asserted on one stack per framework, and what
 * each wiring adapter refuses on all six bindings: the split is in
 * `jvm-context.ts`, shared by them all, and what each binding writes
 * into an assembly is covered above.
 */
describe('the JVM added context, wired per entrypoint', () => {
  it('is wired into each assembly by an adapter of its own, the same class in each', async () => {
    await scaffold({ stack: 'quarkus-cli-rest' });
    expect(await addModule('billing', 'greeting')).toEqual([
      'bounded-context/quarkus-context',
      'bounded-context/quarkus-context-cli',
      'bounded-context/quarkus-context-rest',
    ]);

    for (const assembly of ['application/cli', 'application/api']) {
      expect(await read(`${assembly}/build.gradle.kts`), assembly).toContain(
        'modules:billing:domain:core',
      );
    }
    // Byte-identical but for the package each assembly's class is in.
    const wiring = (pkg: string): Promise<string> =>
      read(`application/${pkg}/src/main/java/com/example/application/${pkg}/BillingWiring.java`);
    expect(await wiring('cli')).toBe(
      (await wiring('api')).replace(
        'package com.example.application.api;',
        'package com.example.application.cli;',
      ),
    );

    await fs.emptyDir(cwd);
    await scaffold({ stack: 'quarkus-cli' });
    expect(await addModule('billing', 'greeting')).toEqual([
      'bounded-context/quarkus-context',
      'bounded-context/quarkus-context-cli',
    ]);
    expect(
      await exists('application/cli/src/main/java/com/example/application/cli/BillingWiring.java'),
    ).toBe(true);
    expect(await exists('application/api')).toBe(false);
  });

  it('widens the boot class of each assembly, Main in the CLI’s and Application in the REST one', async () => {
    await scaffold({ stack: 'spring-cli-rest' });
    expect(await addModule('billing')).toEqual([
      'bounded-context/spring-context',
      'bounded-context/spring-context-cli',
      'bounded-context/spring-context-rest',
    ]);

    for (const [pkg, boot] of [
      ['cli', 'Main'],
      ['api', 'Application'],
    ] as const) {
      expect(
        await read(`application/${pkg}/src/main/java/com/example/application/${pkg}/${boot}.java`),
        boot,
      ).toContain('"com.example.billing"');
    }
  });

  it.each(['micronaut-cli-rest', 'quarkus-cli-rest'])(
    'declares the context right after the skeleton’s seam in each Maven assembly, on %s',
    async (stack) => {
      await scaffold({ stack, buildSystem: 'maven' });
      await addModule('billing', 'greeting');

      for (const assembly of ['application/cli', 'application/api']) {
        // The anchor a fresh assembly pom carries, never `</dependencies>`,
        // whose first match on Quarkus closes `<dependencyManagement>`.
        const deps = dependencyArtifacts(await read(`${assembly}/pom.xml`));
        const seam = deps.indexOf('greeting-user-side-service');
        expect(deps.slice(seam, seam + 5), assembly).toEqual([
          'greeting-user-side-service',
          'billing-domain-contract',
          'billing-domain-core',
          'billing-user-side-service',
          'billing-infra-greeting-gateway',
        ]);
      }
    },
  );

  it('names the wiring adapter in what each of its patches refuses, on every binding', async () => {
    const named: string[] = [];
    for (const framework of ['quarkus', 'spring', 'micronaut'] as const) {
      for (const language of ['java', 'kotlin'] as const) {
        for (const pkg of ['gradle', 'maven'] as const) {
          for (const [entrypoint, arch] of [
            ['arch.cli', 'cli'],
            ['arch.server-http', 'rest'],
          ] as const) {
            const tags: readonly Tag[] = [
              `lang.${language}`,
              'runtime.jvm',
              `pkg.${pkg}`,
              `framework.${framework}`,
              'arch.hexagonal',
              entrypoint,
              MODULITH_LAYOUT_TAG,
              CONTEXT_TAG,
            ];
            const id = `bounded-context/${framework}-context${language === 'kotlin' ? '-kotlin' : ''}-${arch}`;
            const adapter = resolveVertical(boundedContextVertical, tags).find((a) => a.id === id);
            expect(adapter, id).toBeDefined();
            const patches = await patchesOf(adapter as Adapter, tags);
            // Every file it patches, drifted past recognition. The seam
            // note's correction, after the dependencies, is the one that
            // lets it be, since an absent note is one already corrected;
            // every other patch refuses, naming this adapter, not the shell.
            const refusers = patches.map((patch) => refuserOf(() => patch.apply('')));
            expect(refusers, id).toEqual(patches.map((_, index) => (index === 1 ? null : id)));
            named.push(...refusers.filter((refuser) => refuser !== null));
          }
        }
      }
    }
    // The dependencies on each of the 24, and Spring's boot class (8)
    // and Micronaut's `@Import` or handler list (8) besides.
    expect(named).toHaveLength(40);
  });
});

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

/**
 * The patches a wiring adapter contributes for `billing`, consuming
 * the skeleton, on a project with `tags`: what `keel add module
 * billing --consumes greeting` seeds before it resolves.
 */
async function patchesOf(
  adapter: Adapter,
  tags: readonly Tag[],
): Promise<readonly ContributionPatch[]> {
  const ctx = makeCtx(
    adapter,
    {},
    {
      manifest: {
        ...emptyManifestV2('2026-08-14T00:00:00Z', '0.5.0-alpha'),
        tags: [...tags],
        answers: {
          ...BOOTSTRAP_ANSWERS,
          [ADD_MODULE_INPUT_ID]: { name: 'billing', consumes: 'greeting' },
        },
      },
      logger: new FakeLogger(),
      cwd: os.tmpdir(),
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    },
  );
  return (await adapter.contribute(ctx)).patches ?? [];
}

/**
 * The adapter a patch's refusal names — a refusal's data, or a plain
 * throw's prefix — or null where the patch applies.
 */
function refuserOf(apply: () => string): string | null {
  try {
    apply();
    return null;
  } catch (error) {
    if (error instanceof PathConflictError) return error.adapterId;
    return (error as Error).message.split(': ')[0] ?? '';
  }
}
