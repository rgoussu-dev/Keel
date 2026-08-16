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
import { expectOk, installMediator } from '../../../support/factory.js';

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

async function addModule(module: string, consumes?: string): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
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
