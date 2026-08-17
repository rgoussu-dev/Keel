/**
 * The body every `add-module-<stack>-<build>` cell runs.
 *
 * `keel add module` has the same 24-cell grid `keel new` has — 12
 * stacks × 2 build systems — because the emitter branches on all three
 * axes that grid is built from. Framework and language pick the
 * binding (six of them, over one `jvmContextAdapter`); **typology**
 * picks the assembly the wiring class is rendered into and the build
 * file the new dependencies are anchored in, and on Spring it also
 * moves `@ComponentScan` between `Main` and `Application`. A cell is
 * therefore a real intersection here, not a duplicate of its row.
 *
 * What varies across the 24 is the spec. What every one of them does
 * is this function, so the grid cannot drift into 24 slightly
 * different assertions — the cells that also carry a *negative* keep
 * it in their own file, beside this call.
 *
 * The shape is four bounded contexts: the skeleton's `greeting`, then
 * `ordering` consuming it, `shipping` consuming `ordering`, and
 * `billing` consuming nothing. Three linked is the first shape where
 * the consumed context is not always the skeleton, which is where the
 * emitters branch; the fourth proves the no-`--consumes` path still
 * works once peers exist.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { addModule, buildProject, scaffold, type JvmProjectSpec } from './jvm-e2e.js';

/**
 * The source language of a stack, which its id encodes as a suffix.
 *
 * Derived rather than declared because the 24 cells would otherwise
 * repeat it 24 times, and a spec that disagreed with its own stack id
 * would be the kind of wrong that still passes. A mistake here is
 * loud: the paths below stop resolving and the read fails by name.
 */
const languageOf = (stack: string): 'java' | 'kotlin' =>
  stack.endsWith('-kotlin') ? 'kotlin' : 'java';

/** The runnable assembly a stack's typology puts the wiring class in. */
const assemblyOf = (stack: string): string =>
  stack.includes('-cli') ? 'application/cli' : 'application/api';

const EXTENSION = { java: 'java', kotlin: 'kt' } as const;

const PKG = 'com.acme.e2e';

/** greeting ← ordering ← shipping, plus a context consuming nothing. */
export async function addThreeContexts(spec: JvmProjectSpec, cwd: string): Promise<void> {
  await scaffold(spec, cwd);
  await addModule('ordering', 'greeting', cwd);
  await addModule('shipping', 'ordering', cwd);
  await addModule('billing', null, cwd);
}

/**
 * Scaffolds one cell's stack, adds three bounded contexts to it, and
 * builds the result with the generated wrapper.
 *
 * The build is the assertion that matters, and three things only it
 * settles:
 *
 *   - **The container found every handler.** Each added context emits
 *     a `<Name>WiringTest` that dispatches its command through the
 *     real Mediator out of the real container. A handler the container
 *     never discovered costs nothing at compile time and the
 *     application starts perfectly, so this is the only thing that
 *     catches a `@ComponentScan` or `@Import` list that stopped
 *     growing — the exact failure mode `keel add module` invites,
 *     because it runs once per context and every such list must
 *     accumulate.
 *   - **No construction cycle.** `mediator → ShippingHandler →
 *     OrderingClient → OrderingService → mediator` is a real cycle
 *     that only a container closes. Every gateway takes its peer as a
 *     deferred handle for that reason, and only starting the container
 *     proves it worked.
 *   - **The new modules are on a classpath**, rather than merely
 *     present in the tree.
 */
export async function runJvmAddModuleE2E(
  spec: JvmProjectSpec,
  cwd: string,
  depCache: string,
): Promise<void> {
  const maven = spec.buildSystem === 'maven';
  const language = languageOf(spec.stack);
  const assembly = assemblyOf(spec.stack);
  const read = (rel: string): Promise<string> =>
    fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

  await addThreeContexts(spec, cwd);

  // Every module of every context is a module of the build, not a
  // directory sitting outside it.
  const registered = await read(maven ? 'pom.xml' : 'settings.gradle.kts');
  for (const module of [
    'modules/ordering/user-side/service',
    'modules/ordering/infra/greeting-gateway',
    'modules/shipping/user-side/service',
    'modules/shipping/infra/ordering-gateway',
    'modules/billing/domain/core',
  ]) {
    expect(registered, module).toContain(
      maven ? `<module>${module}</module>` : `include(":${module.replace(/\//g, ':')}")`,
    );
  }

  // Each context binds in a class of its own, in the assembly its
  // typology resolves to. Both consumers declare a client named after
  // what they consume — different types, identical simple names, which
  // is why one import block could not have named both.
  const wiring = `${assembly}/src/main/${language}/${PKG.replace(/\./g, '/')}/${assembly}/ShippingWiring.${EXTENSION[language]}`;
  // Terminated, so the match is the whole import rather than a prefix
  // of a longer type name — and the terminator is the language's, since
  // Kotlin ends an import at the newline.
  const terminator = language === 'kotlin' ? '\n' : ';';
  expect(await read(wiring)).toContain(
    `import ${PKG}.shipping.domain.contract.OrderingClient${terminator}`,
  );

  if (maven) {
    // The assembly's new dependencies landed on the classpath, not
    // under <dependencyManagement>. Reading the position rather than
    // the presence is the only way to tell those apart, and the
    // difference is invisible until something tries to compile against
    // them — a Quarkus pom opens with a block that closes a
    // `</dependencies>` of its own, so anchoring on that tag files the
    // new modules under version management instead.
    const assemblyPom = await read(`${assembly}/pom.xml`);
    expect(assemblyPom.indexOf('<artifactId>ordering-domain-core</artifactId>')).toBeGreaterThan(
      assemblyPom.indexOf('</dependencyManagement>'),
    );
  }

  buildProject(spec, cwd, depCache, []);
}
