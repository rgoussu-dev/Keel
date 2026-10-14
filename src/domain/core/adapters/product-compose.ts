/**
 * `fullstack/product-compose` adapter — the monorepo product's
 * container story: a root `compose.yaml` running the pair, with a
 * Dockerfile beside each deployment unit (per the house rule:
 * containerisation lives next to its unit).
 *
 *   - the backend image is chosen by what the service is — its facets,
 *     never its preset id (`./product-families.ts`): a JVM multi-stage
 *     build for a Quarkus, Spring or Micronaut HTTP service, Java or
 *     Kotlin, with a CLI beside it or not; a Go multi-stage build onto
 *     distroless for a Go one; a musl-static cargo build onto
 *     distroless for a Rust one; and a single Node stage running the
 *     TypeScript sources for a Node one;
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
 * into the service directories via path-prefixed contributions. Which
 * services get an image is declared, not only done:
 * `providesInServices` names the families it has a Dockerfile for, by
 * the predicates their stacks' tags match (`serves`), and the
 * contribution writes one for a service exactly when its facets
 * (`Ctx.services`) match one there, whatever its place among the
 * product's services — so in such a service
 * `containerization` reads as there already (`../scope.ts`), and
 * `keel add containerization` there is an Ok that installs nothing
 * rather than a collision with the files written here. A service no
 * family matches — a plugin's backend on a platform keel does not
 * build — gets none, keeps `containerization` to add, and the
 * product's `keel new` report says so.
 */

import type {
  Adapter,
  ContributionFile,
  Ctx,
  ServiceProvision,
} from '../../contract/composition.js';
import { familyOf, SERVICE_FAMILIES } from './product-families.js';

export const PRODUCT_COMPOSE_ID = 'fullstack/product-compose';

const TEMPLATE_ROOT = 'composition/fullstack/product-compose';

/**
 * The services this adapter builds an image for, as it declares them —
 * every family it has a Dockerfile for, by what a service is.
 */
const BUILDS: ServiceProvision = {
  // The id of `containerization`, whose part in the service this is;
  // an adapter does not import a vertical, which imports adapters.
  vertical: 'containerization',
  serves: SERVICE_FAMILIES.map((family) => family.serves),
};

export const productComposeAdapter: Adapter = {
  id: PRODUCT_COMPOSE_ID,
  vertical: 'fullstack',
  covers: ['product-compose'],
  predicate: {},
  providesInServices: BUILDS,
  async contribute(ctx: Ctx) {
    const services = ctx.services;
    const backend = services[0];
    const frontend = services[services.length - 1];
    if (!backend || !frontend) {
      throw new Error(`${PRODUCT_COMPOSE_ID}: product manifest declares no services`);
    }

    const files: ContributionFile[] = await ctx.templates.render(`${TEMPLATE_ROOT}/root`, '', {
      backend,
      frontend,
    });
    // Every service a family matches, each once: a middle service of
    // a three-service product too, since `serves` declares it.
    for (const service of services) {
      const family = familyOf(service);
      if (family === undefined) continue;
      files.push(
        ...(await ctx.templates.render(
          `${TEMPLATE_ROOT}/${family.image}`,
          service.path,
          family.imageVars(service),
        )),
      );
    }
    return { files };
  },
};
