/**
 * `fullstack/product-compose` adapter — the monorepo product's
 * container story: a root `compose.yaml` running the pair, with a
 * Dockerfile beside each deployment unit (per the house rule:
 * containerisation lives next to its unit).
 *
 *   - the backend image is chosen by the service's stack — a JVM
 *     multi-stage build for `quarkus-rest` / `spring-rest` /
 *     `micronaut-rest`, a Go multi-stage build onto distroless for
 *     `go-http`, a musl-static cargo build onto distroless for
 *     `rust-http`;
 *   - the frontend image builds the Vite bundle into an **assets
 *     image** whose entrypoint populates a named volume
 *     (clear-then-copy + `env.js` templated from the environment) as
 *     an init container; an unmodified official nginx serves the
 *     volume with the SPA config mounted read-only, proxying `/api`
 *     to an env-configured backend URL — the same `/api` convention
 *     the dev proxy uses, so the bundle's default API base works
 *     unchanged in both worlds, and a frontend release re-runs the
 *     assets image while nginx never rebuilds.
 *
 * Every Dockerfile follows the build system the composite install
 * recorded on the service ref (`keel new --stack=fullstack
 * --build-system backend=maven,frontend=pnpm`): the JVM builder
 * stage, its build command, and the artifact path it copies differ
 * between Gradle and Maven — the artifact derivation is the shared
 * `jvmRestArtifact`, so this Dockerfile can never disagree with the
 * `containerization`/`distribution` adapters about what a build
 * produces — and the Node images install with the recorded package
 * manager. Refs without a recorded choice (manifests predating it)
 * fall back to each stack's default.
 *
 * Runs at the product root (the `fullstack` vertical), so it writes
 * into the service directories via path-prefixed contributions. A
 * backend stack without a Dockerfile template simply gets none —
 * compose then covers the services that have one.
 */

import type { Adapter, ContributionFile, Ctx } from '../../contract/composition.js';
import type { ServiceRef } from '../../contract/manifest.js';
import { jvmRestArtifact, type JvmBuildSystem, type JvmRestFramework } from './container-image.js';
import { jvmLayout } from './jvm-module-layout.js';

export const PRODUCT_COMPOSE_ID = 'fullstack/product-compose';

const TEMPLATE_ROOT = 'composition/fullstack/product-compose';

const BACKEND_IMAGES: Readonly<Record<string, string>> = {
  'quarkus-rest': 'backend-quarkus',
  'spring-rest': 'backend-spring',
  'micronaut-rest': 'backend-micronaut',
  'go-http': 'backend-go',
  'rust-http': 'backend-rust',
  'ts-http': 'backend-ts',
};

const JVM_FRAMEWORKS: Readonly<Record<string, JvmRestFramework>> = {
  'quarkus-rest': 'quarkus',
  'spring-rest': 'spring',
  'micronaut-rest': 'micronaut',
};

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

const FRONTEND_IMAGES: Readonly<Record<string, string>> = {
  'web-components': 'frontend-spa',
};

/**
 * The recorded JVM build system of a service ref, defaulting to
 * Gradle for refs that predate the per-service choice.
 */
function jvmBuild(service: ServiceRef): JvmBuildSystem {
  const id = service.buildSystem ?? 'gradle';
  if (id !== 'gradle' && id !== 'maven') {
    throw new Error(
      `${PRODUCT_COMPOSE_ID}: service '${service.path}' (${service.stack}) records unknown JVM build system '${id}'`,
    );
  }
  return id;
}

/**
 * The recorded package manager of a Node service ref, defaulting to
 * npm for refs that predate the per-service choice.
 */
function nodePm(service: ServiceRef): 'npm' | 'pnpm' {
  const id = service.buildSystem ?? 'npm';
  if (id !== 'npm' && id !== 'pnpm') {
    throw new Error(
      `${PRODUCT_COMPOSE_ID}: service '${service.path}' (${service.stack}) records unknown package manager '${id}'`,
    );
  }
  return id;
}

/** Template vars for a backend Dockerfile, per stack family. */
function backendVars(service: ServiceRef): Readonly<Record<string, unknown>> {
  const framework = JVM_FRAMEWORKS[service.stack];
  if (framework) {
    const build = jvmBuild(service);
    const builder = JVM_BUILDERS[build];
    const artifact = jvmRestArtifact(framework, build, 'jvm', jvmLayout([]).restRuntime);
    return {
      builderImage: builder.image,
      buildCommand: builder.command,
      artifactPath: artifact.artifactPath,
    };
  }
  if (service.stack === 'ts-http') return { pm: nodePm(service) };
  return {};
}

export const productComposeAdapter: Adapter = {
  id: PRODUCT_COMPOSE_ID,
  vertical: 'fullstack',
  covers: ['product-compose'],
  predicate: {},
  async contribute(ctx: Ctx) {
    const services = ctx.manifest.services;
    const backend = services[0];
    const frontend = services[services.length - 1];
    if (!backend || !frontend) {
      throw new Error(`${PRODUCT_COMPOSE_ID}: product manifest declares no services`);
    }

    const files: ContributionFile[] = await ctx.templates.render(`${TEMPLATE_ROOT}/root`, '', {
      backend,
      frontend,
    });
    const backendImage = BACKEND_IMAGES[backend.stack];
    if (backendImage) {
      files.push(
        ...(await ctx.templates.render(
          `${TEMPLATE_ROOT}/${backendImage}`,
          backend.path,
          backendVars(backend),
        )),
      );
    }
    const frontendImage = FRONTEND_IMAGES[frontend.stack];
    if (frontendImage) {
      files.push(
        ...(await ctx.templates.render(`${TEMPLATE_ROOT}/${frontendImage}`, frontend.path, {
          backendService: backend.path,
          pm: nodePm(frontend),
        })),
      );
    }
    return { files };
  },
};
