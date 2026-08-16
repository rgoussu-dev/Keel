/**
 * Shared machinery for the JVM **peer context** adapters — the
 * `walking-skeleton/<framework>-peer-context` family scaffolding a
 * second bounded context beside the skeleton's own, opted into with
 * `keel new --module-layout=modulith --with-peer-context`.
 *
 * The modulith exists to make one claim true: contexts meet only at
 * `user-side/service`, so carving one out is a wiring change. With a
 * single context that claim is asserted and never exercised — nothing
 * in the emitted project consumes the seam, so nothing proves it
 * holds. (That gap is not hypothetical: the Maven twin of the seam
 * shipped without its non-transitive scope, and no generated project
 * could have caught it.) These adapters emit the consumer that closes
 * it: `guestbook` declares a `Welcome` port in its own vocabulary, and
 * reaches `greeting` only through a gateway over
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
 *   inter-context edge in the build graph, and grep-ability is the
 *   point: one directory lists every such edge.
 * - **The seam cannot be reached past.** `greeting-user-side-service`
 *   declares its own domain non-transitively — `implementation` under
 *   Gradle, `optional` under Maven — so `greeting.domain.contract` is
 *   not on the gateway's compile classpath. An import of it does not
 *   compile, which is the whole property under test.
 *
 * - **The wiring is exercised, not asserted.** Every combination
 *   emits a `GuestbookWiringTest` in the assembly that dispatches a
 *   `SignCommand` through the real Mediator out of the real
 *   container. Nothing else can catch a handler the container never
 *   discovered: that costs nothing at compile time and the
 *   application still starts.
 *
 * Everything above is framework-independent, and so is everything in
 * this file: the guestbook sources (one tree per language), its build
 * files (one tree per build system), and the registration of its three
 * modules with the root build. What each framework brings is the
 * **binding** — how its container is told that `Welcome` is answered
 * by `GreetingWelcome` — and that is the {@link JvmPeerContextSpec.bind}
 * hook, implemented once per (framework, language) in
 * `quarkus-peer-context.ts`, `spring-peer-context.ts` and
 * `micronaut-peer-context.ts`.
 *
 * Two rules every binding obeys, both learned from a container that
 * did not:
 *
 * - **Resolve the peer lazily.** A composition root materialises every
 *   handler to build the mediator, so a handler whose port reaches
 *   back through the dispatch seam closes a construction cycle:
 *   mediator → SignHandler → Welcome → GreetingService → mediator.
 *   Every binding takes the peer as its container's deferred handle
 *   (CDI `Instance`, Spring `ObjectProvider`, Micronaut `BeanProvider`)
 *   and hands the gateway a supplier.
 * - **Say the new context's name wherever the container needs it
 *   spelled.** Spring's `@ComponentScan` and Micronaut's `@Import`
 *   both take explicit package lists; a context missing from one is
 *   simply never discovered, with no error and no bean.
 *
 * Covers no dimension deliberately: the family is additive, selected
 * purely by the `modules.peer-context` tag, so the walking skeleton
 * resolves identically with the flag absent.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import type { JvmLanguage } from './jvm-bootstrap.js';
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  PEER_MODULE,
  SKELETON_MODULE,
  gradleProject,
  jvmLayout,
} from './jvm-module-layout.js';
import { eolOf, packageToPath, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

const SOURCE_TEMPLATE_ROOT = 'composition/walking-skeleton/jvm-peer-context';

const MAVEN_MODULES_END = '  </modules>';

/** The gateway module's directory name under `modules/<peer>/infra/`. */
const GATEWAY_MODULE = `${SKELETON_MODULE}-gateway`;

/** The three modules the peer context contributes, in build order. */
const peerModules = (): readonly string[] => [
  `modules/${PEER_MODULE}/domain/contract`,
  `modules/${PEER_MODULE}/domain/core`,
  `modules/${PEER_MODULE}/infra/${GATEWAY_MODULE}`,
];

/**
 * What a framework's binding needs to know about the assembly it is
 * patching. Everything here is derived from the layout resolver and
 * the bootstrap's answers — no binding computes a path itself.
 */
export interface PeerBinding {
  /** The project's root package, e.g. `com.example`. */
  readonly basePackage: string;
  /** The assembly's module directory, e.g. `application/api`. */
  readonly assembly: string;
  /** The assembly's package segment, e.g. `application.api`. */
  readonly assemblyPkg: string;
  /**
   * Path of a source file in the assembly's own package, e.g.
   * `sourceFile('MediatorConfig')` →
   * `application/api/src/main/java/com/example/application/api/MediatorConfig.java`.
   * The language's source root and extension come from the spec, so a
   * binding never spells `src/main/kotlin` by hand.
   */
  sourceFile(className: string): string;
}

/** Declaration of one JVM peer-context combination. */
export interface JvmPeerContextSpec {
  /** Full adapter id, e.g. `walking-skeleton/spring-peer-context`. */
  readonly id: string;
  /** Framework tag suffix: `quarkus`, `spring`, `micronaut`. */
  readonly framework: string;
  readonly language: JvmLanguage;
  /**
   * The bootstraps this peer context layers onto — the CLI and REST
   * bootstrap of the same framework and language. One of them holds
   * the `basePackage` / `projectName` answers.
   */
  readonly bootstrapIds: readonly string[];
  /**
   * Template subtrees under `jvm-peer-context/` rendered on top of the
   * language sources — Quarkus' bean-archive marker is the only one
   * so far.
   */
  readonly frameworkTemplates?: readonly string[];
  /** Patches binding guestbook's `Welcome` port at the composition root. */
  readonly bind: (binding: PeerBinding) => readonly ContributionPatch[];
}

const SOURCE_ROOT: Readonly<Record<JvmLanguage, string>> = { java: 'java', kotlin: 'kotlin' };
const EXTENSION: Readonly<Record<JvmLanguage, string>> = { java: 'java', kotlin: 'kt' };

/**
 * Builds the peer-context adapter for one JVM (framework, language)
 * combination. Both entrypoint shapes are served by the one adapter:
 * the assembly it patches is resolved from the `arch.*` tag, exactly
 * as the layout resolver does everywhere else.
 */
export function jvmPeerContextAdapter(spec: JvmPeerContextSpec): Adapter {
  return {
    id: spec.id,
    vertical: 'walking-skeleton',
    covers: [],
    predicate: {
      requires: [
        'runtime.jvm',
        `lang.${spec.language}`,
        `framework.${spec.framework}`,
        MODULITH_LAYOUT_TAG,
        PEER_CONTEXT_TAG,
      ],
    },
    after: [...spec.bootstrapIds],
    async contribute(ctx) {
      const bootstrap = spec.bootstrapIds
        .map((id) => ctx.manifest.answers[id])
        .find((answers) => answers?.basePackage);
      const basePackage = bootstrap?.basePackage;
      const projectName = bootstrap?.projectName;
      if (!basePackage || !projectName) {
        throw new Error(
          `${spec.id}: requires a walking-skeleton bootstrap (one of ${spec.bootstrapIds.join(', ')}) to have run first; basePackage/projectName not in manifest`,
        );
      }
      const vars = { basePackage, projectName, pkgPath: packageToPath(basePackage) };
      const buildSystem = jvmBuildSystem(ctx.manifest.tags);
      const layout = jvmLayout(ctx.manifest.tags);
      const cli = ctx.manifest.tags.includes('arch.cli');
      const assembly = cli ? layout.cliRuntime : layout.restRuntime;
      const assemblyPkg = cli ? layout.cliRuntimePkg : layout.restRuntimePkg;

      const trees = [
        `${SOURCE_TEMPLATE_ROOT}/${SOURCE_ROOT[spec.language]}`,
        ...(spec.frameworkTemplates ?? []).map((t) => `${SOURCE_TEMPLATE_ROOT}/${t}`),
        `${SOURCE_TEMPLATE_ROOT}/build/${buildSystem}`,
      ];
      // The wiring test lands in the assembly, whose directory and
      // package are both layout decisions — so it renders under the
      // resolved assembly rather than at a path of its own.
      const wiring = `${SOURCE_TEMPLATE_ROOT}/wiring/${spec.framework}/${spec.language}`;
      const rendered = await Promise.all([
        ...trees.map((t) => ctx.templates.render(t, '', vars)),
        ctx.templates.render(wiring, assembly, {
          ...vars,
          assemblyPkg,
          assemblyPkgPath: assemblyPkg.replace(/\./g, '/'),
        }),
      ]);

      const binding: PeerBinding = {
        basePackage,
        assembly,
        assemblyPkg,
        sourceFile: (className) =>
          `${assembly}/src/main/${SOURCE_ROOT[spec.language]}/${packageToPath(basePackage)}/${assemblyPkg.replace(/\./g, '/')}/${className}.${EXTENSION[spec.language]}`,
      };

      return {
        files: rendered.flat(),
        patches: [
          buildSystem === 'maven' ? mavenModulesPatch(spec.id) : gradleIncludesPatch(),
          assemblyDepsPatch(spec.id, buildSystem, basePackage, assembly, layout.mavenArtifact),
          ...spec.bind(binding),
        ],
      };
    },
  };
}

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
function mavenModulesPatch(adapterId: string): ContributionPatch {
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
          `${adapterId}: could not find the <modules> block in the root pom.xml — add the ${PEER_MODULE} modules manually`,
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
  adapterId: string,
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
    const anchor = dependency(mavenArtifact(`modules/${SKELETON_MODULE}/user-side/service`));
    return {
      target: `${assembly}/pom.xml`,
      apply: (existing) => {
        if (existing.includes(`<artifactId>${guard}</artifactId>`)) return existing;
        if (!existing.includes(anchor)) {
          throw new Error(
            `${adapterId}: could not find the ${SKELETON_MODULE}-user-side-service dependency in ${assembly}/pom.xml`,
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
          `${adapterId}: could not find the platform:kernel dependency in ${assembly}/build.gradle.kts`,
        );
      }
      return existing.replace(anchor, [anchor, ...deps].join(eolOf(existing)));
    },
  };
}

/** The fully-qualified names a composition-root binding writes. */
export interface PeerNames {
  /** The port guestbook declares, and the assembly binds. */
  readonly welcome: string;
  /** The one class naming two contexts. */
  readonly gateway: string;
  /** The peer's in-process API the gateway calls through. */
  readonly serviceAdapter: string;
  /** Guestbook's handler, and the package a container must be told to look in. */
  readonly handler: string;
  readonly handlerPkg: string;
}

/**
 * Derives those names once, so no framework module spells a package
 * by hand. The `infra.<ctx>gateway` segment in particular is a
 * directory (`infra/greeting-gateway`) spelled differently from its
 * package — exactly the kind of drift a second copy invites.
 */
export function peerNames(basePackage: string): PeerNames {
  return {
    welcome: `${basePackage}.${PEER_MODULE}.domain.contract.signing.Welcome`,
    gateway: `${basePackage}.${PEER_MODULE}.infra.${SKELETON_MODULE}gateway.GreetingWelcome`,
    serviceAdapter: `${basePackage}.${SKELETON_MODULE}.userside.service.GreetingServiceAdapter`,
    handler: `${basePackage}.${PEER_MODULE}.domain.core.signing.SignHandler`,
    handlerPkg: `${basePackage}.${PEER_MODULE}.domain.core.signing`,
  };
}

/**
 * The line every modulith composition root carries above its
 * `greetingService` producer, and which a second bounded context makes
 * obsolete: something does consume the seam now.
 */
export const STALE_SERVICE_DOC =
  '     * Nothing consumes it yet — the second bounded context is the\n     * first thing that will, through a driven port of its own.';

/**
 * Its replacement, in Javadoc (`{@link}`) or KDoc (`[…]`) spelling.
 *
 * Parameterised by which context consumes the seam, through which
 * port, and where the binding lives, because two doors reach this
 * line: `--with-peer-context`, which binds guestbook's `Welcome` in
 * this same class, and `keel add module <name> --consumes greeting`,
 * which binds the new context's port in a wiring class of its own. A
 * doc comment that says "nothing consumes it yet" beside a producer
 * something now consumes is the kind of small lie that makes a reader
 * stop trusting the rest of the generated prose — and so is one that
 * points at a binding that is not there.
 *
 * @param consumer the bounded context that now reaches this seam
 * @param port the simple name of the driven port it reaches through
 * @param boundIn the class holding the binding, or `null` for this one
 */
export function freshServiceDoc(
  language: JvmLanguage,
  consumer: string,
  port: string,
  boundIn: string | null,
): string {
  const link = (name: string): string => (language === 'java' ? `{@link ${name}}` : `[${name}]`);
  const code = (name: string): string => (language === 'java' ? `{@code ${name}}` : `\`${name}\``);
  // Linked when the binding is in this class, because then the port is
  // one of its imports; spelled as code otherwise, since a wiring class
  // of its own leaves the port unimported here — and two contexts
  // consuming this seam would each contribute a different type of the
  // same simple name, which no link could disambiguate.
  const where = boundIn === null ? 'bound below' : `bound in ${link(boundIn)}`;
  const named = boundIn === null ? link(port) : code(port);
  return `     * \`${consumer}\` consumes it through its own ${named}\n     * port, ${where}.`;
}

/** The port `--with-peer-context` binds, named once for its doc line. */
export const PEER_PORT = 'Welcome';

/**
 * Appends a member to the last class body in a source file — the
 * shape every composition-root binding takes, since each is one more
 * producer method on the root that is already there.
 *
 * `member` carries its own indentation and stops before the class's
 * closing brace, which this puts back after a blank line — so the
 * result reads like the hand-written members above it.
 */
export function appendToClassBody(source: string, member: string): string {
  const end = source.lastIndexOf('}');
  return `${source.slice(0, end).trimEnd()}\n\n${member}\n}${source.slice(end + 1)}`;
}
