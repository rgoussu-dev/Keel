/**
 * `walking-skeleton/jvm-peer-context` adapter — scaffolds a **second
 * bounded context** beside the skeleton's own, opted into with
 * `keel new --module-layout=modulith --with-peer-context`.
 *
 * The modulith exists to make one claim true: contexts meet only at
 * `user-side/service`, so carving one out is a wiring change. With a
 * single context that claim is asserted and never exercised — nothing
 * in the emitted project consumes the seam, so nothing proves it
 * holds. (That gap is not hypothetical: the Maven twin of the seam
 * shipped without its non-transitive scope, and no generated project
 * could have caught it.) This adapter emits the consumer that closes
 * it: `guestbook` declares a `Welcome` port in its own vocabulary,
 * and reaches `greeting` only through a gateway over
 * `greeting/user-side/service`.
 *
 * What the emitted code demonstrates, and what a compiler enforces
 * about it:
 *
 * - **The consumer owns the port.** `Welcome` lives in
 *   `guestbook/domain/contract` and mentions neither greeting nor its
 *   types, so guestbook's domain has no opinion about where a welcome
 *   comes from.
 * - **One class names two contexts.** `GreetingWelcome` is the only
 *   inter-context edge in the build graph, and `cargo`-style
 *   grep-ability is the point: one directory lists every such edge.
 * - **The seam cannot be reached past.** `greeting-user-side-service`
 *   declares its own domain non-transitively — `implementation` under
 *   Gradle, `optional` under Maven — so `greeting.domain.contract` is
 *   not on the gateway's compile classpath. An import of it does not
 *   compile, which is the whole property under test.
 *
 * Covers no dimension deliberately: it is additive, selected purely
 * by the `modules.peer-context` tag, so the walking skeleton resolves
 * identically with the flag absent.
 *
 * Quarkus + Java first; the Spring, Micronaut and Kotlin siblings
 * cover the same ground under their own predicates, differing only in
 * how the assembly binds the port (a CDI producer here, an
 * `@Bean` method under Spring, a `@Factory` under Micronaut) and in
 * Spring's explicit `@ComponentScan` package list.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { PEER_MODULE, gradleProject, jvmLayout } from './jvm-module-layout.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './jvm-module-layout.js';
import { eolOf, packageToPath, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';

export const JVM_PEER_CONTEXT_ID = 'walking-skeleton/jvm-peer-context';

const SOURCE_TEMPLATE_ROOT = 'composition/walking-skeleton/jvm-peer-context';

const MAVEN_MODULES_END = '  </modules>';

const BOOTSTRAP_IDS = [QUARKUS_REST_BOOTSTRAP_ID, QUARKUS_CLI_BOOTSTRAP_ID] as const;

/** The three modules the peer context contributes, in build order. */
const peerModules = (): readonly string[] => [
  `modules/${PEER_MODULE}/domain/contract`,
  `modules/${PEER_MODULE}/domain/core`,
  `modules/${PEER_MODULE}/infra/greeting-gateway`,
];

export const jvmPeerContextAdapter: Adapter = {
  id: JVM_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: [
      'runtime.jvm',
      'lang.java',
      'framework.quarkus',
      MODULITH_LAYOUT_TAG,
      PEER_CONTEXT_TAG,
    ],
  },
  after: [...BOOTSTRAP_IDS],
  async contribute(ctx) {
    const bootstrap = BOOTSTRAP_IDS.map((id) => ctx.manifest.answers[id]).find(
      (answers) => answers?.basePackage,
    );
    const basePackage = bootstrap?.basePackage;
    const projectName = bootstrap?.projectName;
    if (!basePackage || !projectName) {
      throw new Error(
        `${JVM_PEER_CONTEXT_ID}: requires a Quarkus walking-skeleton bootstrap (one of ${BOOTSTRAP_IDS.join(', ')}) to have run first; basePackage/projectName not in manifest`,
      );
    }
    const vars = { basePackage, projectName, pkgPath: packageToPath(basePackage) };
    const buildSystem = jvmBuildSystem(ctx.manifest.tags);
    const layout = jvmLayout(ctx.manifest.tags);
    const assembly = ctx.manifest.tags.includes('arch.cli')
      ? layout.cliRuntime
      : layout.restRuntime;
    const assemblyPkg = ctx.manifest.tags.includes('arch.cli')
      ? layout.cliRuntimePkg
      : layout.restRuntimePkg;

    const [sources, beans, build] = await Promise.all([
      ctx.templates.render(`${SOURCE_TEMPLATE_ROOT}/java`, '', vars),
      ctx.templates.render(`${SOURCE_TEMPLATE_ROOT}/quarkus`, '', vars),
      ctx.templates.render(`${SOURCE_TEMPLATE_ROOT}/build/${buildSystem}`, '', vars),
    ]);

    return {
      files: [...sources, ...beans, ...build],
      patches: [
        buildSystem === 'maven' ? mavenModulesPatch() : gradleIncludesPatch(),
        assemblyDepsPatch(buildSystem, basePackage, assembly, layout.mavenArtifact),
        compositionRootPatch(basePackage, assembly, assemblyPkg),
      ],
    };
  },
};

/** Registers the peer context's three modules with `settings.gradle.kts`. */
function gradleIncludesPatch(): ContributionPatch {
  const includes = peerModules()
    .map((m) => `include("${gradleProject(m)}")`)
    .join('\n');
  const guard = `include("${gradleProject(peerModules()[0] as string)}")`;
  return {
    target: 'settings.gradle.kts',
    apply: (existing) => {
      if (existing.includes(guard)) return existing;
      const eol = eolOf(existing);
      return `${existing.trimEnd()}${withEol(`\n${includes}\n`, eol)}`;
    },
  };
}

/** Registers the peer context's three modules with the root pom. */
function mavenModulesPatch(): ContributionPatch {
  const entries = peerModules()
    .map((m) => `    <module>${m}</module>`)
    .join('\n');
  const guard = `<module>${peerModules()[0] as string}</module>`;
  return {
    target: 'pom.xml',
    apply: (existing) => {
      if (existing.includes(guard)) return existing;
      if (!existing.includes(MAVEN_MODULES_END)) {
        throw new Error(
          `${JVM_PEER_CONTEXT_ID}: could not find the <modules> block in the root pom.xml — add the ${PEER_MODULE} modules manually`,
        );
      }
      return existing.replace(
        MAVEN_MODULES_END,
        `${entries}${eolOf(existing)}${MAVEN_MODULES_END}`,
      );
    },
  };
}

/**
 * Gives the assembly its dependencies on the peer context: the core
 * (so its handler is discovered) and the gateway (so the port has an
 * implementation to bind). The assembly is the only module that
 * depends on either — everything else meets them through ports.
 */
function assemblyDepsPatch(
  buildSystem: 'gradle' | 'maven',
  basePackage: string,
  assembly: string,
  mavenArtifact: (dir: string) => string,
): ContributionPatch {
  const [, core, gateway] = peerModules() as unknown as [string, string, string];
  if (buildSystem === 'maven') {
    const guard = mavenArtifact(core);
    const dependency = (artifactId: string): string => `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>${artifactId}</artifactId>
      <version>\${project.version}</version>
    </dependency>`;
    const deps = [core, gateway].map((m) => dependency(mavenArtifact(m))).join('\n');
    // Anchor on a dependency the modulith assembly always declares,
    // never on the closing `</dependencies>` tag: a Quarkus pom opens
    // with a `<dependencyManagement>` block that closes one of those
    // first, so anchoring on the tag silently files the dependencies
    // under version management — where they pin versions and add
    // nothing to the classpath. That failed only under a real Maven
    // build, with `package ... does not exist` in the assembly.
    const anchor = dependency(mavenArtifact('modules/greeting/user-side/service'));
    return {
      target: `${assembly}/pom.xml`,
      apply: (existing) => {
        if (existing.includes(`<artifactId>${guard}</artifactId>`)) return existing;
        if (!existing.includes(anchor)) {
          throw new Error(
            `${JVM_PEER_CONTEXT_ID}: could not find the greeting-user-side-service dependency in ${assembly}/pom.xml`,
          );
        }
        return existing.replace(anchor, `${anchor}${eolOf(existing)}${deps}`);
      },
    };
  }
  const guard = `implementation(project("${gradleProject(core)}"))`;
  const deps = [core, gateway].map((m) => `    implementation(project("${gradleProject(m)}"))`);
  return {
    target: `${assembly}/build.gradle.kts`,
    apply: (existing) => {
      if (existing.includes(guard)) return existing;
      const anchor = `    implementation(project("${gradleProject('platform/kernel')}"))`;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${JVM_PEER_CONTEXT_ID}: could not find the platform:kernel dependency in ${assembly}/build.gradle.kts`,
        );
      }
      return existing.replace(anchor, [anchor, ...deps].join(eolOf(existing)));
    },
  };
}

/**
 * Binds the port at the composition root — the one line the whole
 * layout exists to make swappable. Replacing `GreetingWelcome` with
 * an HTTP twin here is the entire carve-out, which is why the
 * emitted comment says so at the binding site rather than in a
 * README nobody opens.
 */
function compositionRootPatch(
  basePackage: string,
  assembly: string,
  assemblyPkg: string,
): ContributionPatch {
  const anchorImport = `import ${basePackage}.greeting.userside.service.GreetingServiceAdapter;`;
  const addedImports = [
    anchorImport,
    `import ${basePackage}.guestbook.domain.contract.signing.Welcome;`,
    `import ${basePackage}.guestbook.infra.greetinggateway.GreetingWelcome;`,
  ].join('\n');
  const stale =
    '     * Nothing consumes it yet — the second bounded context is the\n     * first thing that will, through a driven port of its own.';
  const fresh =
    '     * `guestbook` consumes it through its own {@link Welcome}\n     * port, bound below.';
  const producer = `
    /**
     * Binds guestbook's {@link Welcome} port to the greeting module.
     * This is the carve-out seam: swapping {@link GreetingWelcome}
     * for an HTTP twin built on greeting's published API moves that
     * module into its own service, and nothing above this line
     * changes.
     *
     * <p>The peer is injected as {@link Instance} and handed over as
     * a supplier, not resolved here. The mediator is built by
     * materialising every handler, so resolving the greeting service
     * at this point would close a construction cycle — mediator →
     * SignHandler → Welcome → GreetingService → mediator — and the
     * container would recurse until the stack ran out. Deferring the
     * lookup to the first call breaks it.
     */
    @Produces
    @Singleton
    public Welcome welcome(Instance<GreetingService> greeting) {
        return new GreetingWelcome(greeting::get);
    }
}`;
  return {
    target: `${assembly}/src/main/java/${packageToPath(basePackage)}/${assemblyPkg.replace(/\./g, '/')}/MediatorProducer.java`,
    apply: (existing) => {
      if (existing.includes('GreetingWelcome')) return existing;
      if (!existing.includes(anchorImport)) {
        throw new Error(
          `${JVM_PEER_CONTEXT_ID}: could not find the GreetingServiceAdapter import in the composition root`,
        );
      }
      const withImports = existing.replace(anchorImport, addedImports);
      const withDoc = withImports.replace(stale, fresh);
      const end = withDoc.lastIndexOf('}');
      return `${withDoc.slice(0, end)}${producer.trimStart()}${withDoc.slice(end + 1)}`;
    },
  };
}
