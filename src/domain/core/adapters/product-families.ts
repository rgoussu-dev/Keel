/**
 * The service families a product root's glue knows, keyed by facets —
 * shared by `fullstack/product-compose` (which image a service gets)
 * and `fullstack/product-docs` (which command runs it in development).
 *
 * A family is what a service *is* — a platform and an entrypoint,
 * matched on the service's tags (`Ctx.services`) — never the preset it
 * came from, so every preset those tags describe gets the family's
 * image and run hint: `quarkus-rest` and `quarkus-cli-rest-kotlin`
 * alike. Each family's predicate is the one the service's own
 * `containerization` image adapter selects on, so the root builds an
 * image for exactly the services that could build one themselves.
 *
 * How the image is built and how the service is run follow its dials:
 * the recorded build system picks the builder stage, the artifact and
 * the command; the module layout places the runnable assembly. A
 * family's predicate names no dial (`serves` in `ServiceProvision`),
 * so where a dial is one the family cannot read, it answers as the
 * service's own image adapter does: a Node service on anything but
 * `pkg.pnpm` installs with npm (`./ts-http-image.ts`), and a JVM one
 * on neither `pkg.gradle` nor `pkg.maven` — a plugin's stack, since
 * every JVM stack keel ships offers both — cannot name its artifact,
 * so the glue refuses it as {@link UNBUILDABLE_SERVICE_CODE}.
 */

import type { Predicate, ProductService, Tag } from '../../contract/composition.js';
import {
  jvmRestArtifact,
  jvmRestFramework,
  type JvmBuildSystem,
  type JvmRestFramework,
} from './container-image.js';
import { gradleProject, jvmLayout } from './jvm-module-layout.js';
import { matches } from '../predicate.js';
import { DomainError } from '../../kernel/result.js';

/** Requester id the shared helpers name in a failure. */
const GLUE_ID = 'fullstack';

/** One family of service a product root builds an image for and knows how to run. */
export interface ServiceFamily {
  /** What a service of the family is, over its tags. Names no dial. */
  readonly serves: Predicate;
  /** The `product-compose` template tree its image is rendered from. */
  readonly image: string;
  /** Template vars for its image. */
  imageVars(service: ProductService): Readonly<Record<string, unknown>>;
  /** The development command the product README gives for it. */
  runHint(service: ProductService): string;
}

/**
 * The builder stage per JVM build system. The compose Dockerfiles
 * build in-image (unlike the `containerization` images, which copy a
 * host build), so the stage carries the tool itself rather than the
 * project's wrapper — the wrapper would re-download its distribution
 * on every image build.
 */
const JVM_BUILDERS: Readonly<Record<JvmBuildSystem, { image: string; command: string }>> = {
  gradle: { image: 'gradle:jdk25', command: 'gradle build -x test' },
  maven: { image: 'maven:3-eclipse-temurin-25', command: 'mvn -B package -DskipTests' },
};

/**
 * How each JVM framework runs its REST assembly in development: the
 * Gradle task, the Maven goal, and the environment that switches on
 * its dev-only CORS accommodation where it needs one.
 */
const JVM_DEV: Readonly<Record<JvmRestFramework, { task: string; goal: string; env: string }>> = {
  quarkus: { task: 'quarkusDev', goal: 'quarkus:dev', env: '' },
  spring: { task: 'bootRun', goal: 'spring-boot:run', env: 'SPRING_PROFILES_ACTIVE=dev ' },
  micronaut: { task: 'run', goal: 'mn:run', env: 'MICRONAUT_ENVIRONMENTS=dev ' },
};

/** Whether the service carries a second runnable assembly beside its HTTP one. */
const hasCli = (service: ProductService): boolean => service.tags.includes('arch.cli');

// npm unless pnpm is recorded, as the service's own image installs.
const nodePm = (service: ProductService): 'npm' | 'pnpm' =>
  service.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';

/**
 * The code under which the glue refuses a JVM service that records
 * neither a Gradle nor a Maven build: its image cannot name the
 * artifact, just as the service's own `containerization` adapter
 * cannot.
 */
export const UNBUILDABLE_SERVICE_CODE = 'keel.unbuildable-service';

function buildOf(service: ProductService): JvmBuildSystem {
  if (service.tags.includes('pkg.gradle')) return 'gradle';
  if (service.tags.includes('pkg.maven')) return 'maven';
  throw new DomainError(
    `service '${service.path}' (stack '${service.stack}') records no Gradle or Maven build, ` +
      `so keel's product glue cannot build its image or say how to run it: ` +
      `build it with Gradle or Maven — offer one among the stack's build systems and pick it ` +
      `for the service — or give the product a glue of its own`,
    UNBUILDABLE_SERVICE_CODE,
  );
}

function jvmFamily(framework: JvmRestFramework, image: string): ServiceFamily {
  return {
    serves: { requires: [`framework.${framework}`, 'arch.server-http'] },
    image,
    imageVars(service) {
      const build = buildOf(service);
      const builder = JVM_BUILDERS[build];
      const unit = jvmLayout(service.tags).restRuntime;
      return {
        builderImage: builder.image,
        buildCommand: builder.command,
        artifactPath: jvmRestArtifact(jvmRestFramework(service, GLUE_ID), build, 'jvm', unit)
          .artifactPath,
      };
    },
    runHint(service) {
      const dev = JVM_DEV[framework];
      const unit = jvmLayout(service.tags).restRuntime;
      if (buildOf(service) === 'maven') {
        return `${dev.env}./mvnw -am -pl ${unit} ${dev.goal}`;
      }
      // An unqualified task runs in every project that has it: with a
      // CLI assembly beside the REST one, that is the CLI first.
      const task = hasCli(service) ? `${gradleProject(unit)}:${dev.task}` : dev.task;
      return `${dev.env}./gradlew ${task}`;
    },
  };
}

/** Every family, in the order a service is matched against them. */
export const SERVICE_FAMILIES: readonly ServiceFamily[] = [
  jvmFamily('quarkus', 'backend-quarkus'),
  jvmFamily('spring', 'backend-spring'),
  jvmFamily('micronaut', 'backend-micronaut'),
  {
    serves: { requires: ['lang.go', 'arch.server-http'] },
    image: 'backend-go',
    imageVars: () => ({}),
    runHint: () => 'GO_ENV=dev go run ./cmd/http',
  },
  {
    serves: { requires: ['lang.rust', 'arch.server-http'] },
    image: 'backend-rust',
    imageVars: () => ({}),
    // `cargo run` picks the one binary; beside a CLI's there are two,
    // and the HTTP one's name is the service's own answer, which the
    // root never sees — so run it by the suffix every one carries, as
    // the image does. A debug build keeps the dev-only CORS layer on.
    runHint: (service) => (hasCli(service) ? 'cargo build && ./target/debug/*-http' : 'cargo run'),
  },
  {
    serves: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
    image: 'backend-ts',
    imageVars: (service) => ({ pm: nodePm(service) }),
    runHint: (service) => `${nodePm(service)} run dev:rest`,
  },
  {
    serves: { requires: ['framework.web-components', 'arch.spa'] },
    image: 'frontend-spa',
    imageVars: (service) => ({ pm: nodePm(service) }),
    runHint: (service) => `${nodePm(service)} run dev`,
  },
];

/** The family `service` belongs to, or undefined for one the glue does not know. */
export function familyOf(service: { readonly tags: readonly Tag[] }): ServiceFamily | undefined {
  const tags = new Set(service.tags);
  return SERVICE_FAMILIES.find((family) => matches(family.serves, tags));
}
