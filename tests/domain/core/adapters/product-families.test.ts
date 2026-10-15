/**
 * The product glue's families, held to what they are for: every
 * service keel scaffolds that could build its own image belongs to
 * exactly one — on the predicate its own image adapter selects on — and
 * no family keys on a dial, so what `providesInServices` declares from
 * a stack's own tags is what the adapter writes from a service's.
 *
 * **Scenario.** A product's services as facets: shipped presets on a
 * chosen build system, and plugin stacks tagged like a family or like
 * none (`lang.elixir`), with a dial a family can read or not.
 *
 * **Factory.** {@link service} and {@link plugin}, and `makeCtx` over
 * the real templates for keel's two glue adapters.
 *
 * **Port.** `familyOf` and each family's `runHint`/`imageVars`; the
 * `product-compose` and `product-docs` contributions; and, for the
 * scope that reads the same declaration, `provisionsFor`.
 */
import { describe, expect, it } from 'vitest';
import type { Adapter, ProductService, Tag } from '../../../../src/domain/contract/composition.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { DomainError } from '../../../../src/domain/kernel/result.js';
import { productComposeAdapter } from '../../../../src/domain/core/adapters/product-compose.js';
import { productDocsAdapter } from '../../../../src/domain/core/adapters/product-docs.js';
import {
  familyOf,
  SERVICE_FAMILIES,
  UNBUILDABLE_SERVICE_CODE,
} from '../../../../src/domain/core/adapters/product-families.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { matches } from '../../../../src/domain/core/predicate.js';
import { serviceFacets } from '../../../../src/domain/core/product-services.js';
import {
  registryOf,
  shippedRegistry,
  shippedSource,
} from '../../../../src/domain/core/registry.js';
import { provisionsFor } from '../../../../src/domain/core/scope.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';

const singles = shippedRegistry.stacks().filter((stack) => (stack.services ?? []).length === 0);
const service = (id: string, buildSystem?: string, at = 'backend'): ProductService => {
  const stack = shippedRegistry.stack(id);
  if (stack === null) throw new Error(`no stack '${id}'`);
  return {
    path: at,
    stack: id,
    tags: serviceFacets(stack, buildSystem === undefined ? {} : { buildSystem }),
  };
};

/** A plugin's stack as a product's backend, on exactly `tags`. */
const plugin = (id: string, tags: readonly Tag[]): ProductService => ({
  path: 'backend',
  stack: id,
  tags,
});

/** The image a preset's own facets imply, read independently of the families. */
const impliedImage = (tags: ReadonlySet<Tag>): string => {
  for (const framework of ['quarkus', 'spring', 'micronaut']) {
    if (tags.has(`framework.${framework}`)) return `backend-${framework}`;
  }
  if (tags.has('lang.go')) return 'backend-go';
  if (tags.has('lang.rust')) return 'backend-rust';
  if (tags.has('framework.web-components')) return 'frontend-spa';
  return 'backend-ts';
};

const frontend = service('web-components', 'npm', 'frontend');

/** What one of keel's glue adapters contributes at a root over `services`. */
const contribute = async (adapter: Adapter, services: readonly ProductService[]) =>
  adapter.contribute(
    makeCtx(
      adapter,
      {},
      {
        manifest: emptyManifestV2('2026-10-14T00:00:00Z', '0.5.0-alpha'),
        logger: new FakeLogger(),
        cwd: '/tmp/dummy',
        templates: ejsTemplateSource,
        processes: new FakeProcessRunner(),
        services,
      },
    ),
  );

const paths = async (services: readonly ProductService[]): Promise<readonly string[]> =>
  ((await contribute(productComposeAdapter, services)).files ?? []).map((file) => file.path);

const dockerfile = async (services: readonly ProductService[]): Promise<string> => {
  const at = 'backend/Dockerfile';
  const files = (await contribute(productComposeAdapter, services)).files ?? [];
  const found = files.find((f) => f.path === at);
  if (found === undefined) throw new Error(`no file '${at}'`);
  return String(found.content);
};

/** The README `product-docs` seeds, as a new product root gets it. */
const readme = async (services: readonly ProductService[]): Promise<string> => {
  const patch = ((await contribute(productDocsAdapter, services)).patches ?? []).find(
    (p) => p.target === 'README.md',
  );
  if (patch?.seed === undefined) throw new Error('no README seeded');
  return patch.seed;
};

describe('product families', () => {
  it('serve every stack a containerization adapter images, each by exactly one family', () => {
    const image = shippedRegistry.vertical('containerization');
    const predicates = (image?.adapters ?? []).map((adapter) => adapter.predicate);
    expect(SERVICE_FAMILIES.map((family) => family.serves)).toEqual(predicates);
    for (const stack of singles) {
      const tags = new Set(stack.tags);
      const serving = SERVICE_FAMILIES.filter((family) => matches(family.serves, tags));
      const serves = tags.has('arch.server-http') || tags.has('arch.spa');
      expect(serving.length, stack.id).toBe(serves ? 1 : 0);
      if (serves) expect(familyOf(stack)?.image, stack.id).toBe(impliedImage(tags));
    }
  });

  it('key on what a service is, never on a dial', () => {
    for (const family of SERVICE_FAMILIES) {
      for (const tag of [...(family.serves.requires ?? []), ...(family.serves.excludes ?? [])]) {
        expect(tag).toMatch(/^(lang|runtime|framework|arch)\./);
      }
    }
  });

  it.each([
    ['quarkus-rest', 'gradle', './gradlew quarkusDev'],
    ['quarkus-rest', 'maven', './mvnw -am -pl application/rest/executable quarkus:dev'],
    ['quarkus-cli-rest-kotlin', 'gradle', './gradlew :application:rest:executable:quarkusDev'],
    [
      'spring-cli-rest',
      'gradle',
      'SPRING_PROFILES_ACTIVE=dev ./gradlew :application:rest:executable:bootRun',
    ],
    [
      'spring-cli-rest',
      'maven',
      'SPRING_PROFILES_ACTIVE=dev ./mvnw -am -pl application/rest/executable spring-boot:run',
    ],
    [
      'micronaut-cli-rest',
      'gradle',
      'MICRONAUT_ENVIRONMENTS=dev ./gradlew :application:rest:executable:run',
    ],
    [
      'micronaut-cli-rest',
      'maven',
      'MICRONAUT_ENVIRONMENTS=dev ./mvnw -am -pl application/rest/executable mn:run',
    ],
    [
      'spring-cli-rest-kotlin',
      'maven',
      'SPRING_PROFILES_ACTIVE=dev ./mvnw -am -pl application/rest/executable spring-boot:run',
    ],
    ['go-cli-http', undefined, 'GO_ENV=dev go run ./cmd/http'],
    ['rust-http', undefined, 'cargo run'],
    ['rust-cli-http', undefined, 'cargo build && ./target/debug/*-http'],
    ['ts-cli-http', 'pnpm', 'pnpm run dev:rest'],
    ['ts-http', 'npm', 'npm run dev:rest'],
    ['web-components', 'npm', 'npm run dev'],
    ['web-components', 'pnpm', 'pnpm run dev'],
  ])('run %s on %s as `%s`', (id, build, hint) => {
    const s = service(id, build);
    expect(familyOf(s)?.runHint(s)).toBe(hint);
  });

  it('install a Node service that records no package manager with npm, as its own image does', () => {
    const bare = plugin('acme-ts', ['lang.typescript', 'runtime.node', 'arch.server-http']);
    const family = familyOf(bare);
    expect(family?.image).toBe('backend-ts');
    expect(family?.runHint(bare)).toBe('npm run dev:rest');
    expect(family?.imageVars(bare)).toEqual({ pm: 'npm' });
    const spa = plugin('acme-spa', ['framework.web-components', 'arch.spa']);
    expect(familyOf(spa)?.runHint(spa)).toBe('npm run dev');
  });

  it('refuse, naming the stack, a JVM service built with neither Gradle nor Maven', () => {
    const bazel = plugin('acme-spring', ['framework.spring', 'arch.server-http', 'pkg.bazel']);
    const family = familyOf(bazel);
    expect(family?.image).toBe('backend-spring');
    for (const read of [() => family?.runHint(bazel), () => family?.imageVars(bazel)]) {
      let thrown: unknown;
      try {
        read();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(DomainError);
      expect((thrown as DomainError).code).toBe(UNBUILDABLE_SERVICE_CODE);
      expect((thrown as DomainError).message).toContain("service 'backend'");
      expect((thrown as DomainError).message).toContain("'acme-spring'");
    }
  });
});

describe("keel's product glue", () => {
  it('prints a run hint as it is, `&&` included', async () => {
    const text = await readme([service('rust-cli-http'), frontend]);
    expect(text).toContain('cd backend && cargo build && ./target/debug/*-http');
    expect(text).not.toContain('&amp;');
  });

  it('builds nothing for a service no family matches, which keeps containerization to add', async () => {
    const elixir = plugin('acme-elixir', ['lang.elixir', 'arch.server-http']);
    const written = await paths([elixir, frontend]);
    expect(written.filter((p) => p.startsWith('backend/'))).toEqual([]);
    expect(written).toContain('frontend/Dockerfile');
    expect(await readme([elixir, frontend])).toContain('cd backend && see its README');

    const registry = registryOf([
      shippedSource,
      {
        origin: "plugin 'acme'",
        stacks: [
          {
            id: 'acme-elixir',
            description: 'An Elixir HTTP service.',
            tags: ['lang.elixir', 'arch.server-http'],
            verticals: [],
          },
        ],
      },
    ]);
    const root = { installed: ['vcs', 'fullstack'], tags: ['agentic.harness'] };
    expect(provisionsFor(registry, root, 'acme-elixir').map(({ vertical }) => vertical.id)).toEqual(
      ['vcs'],
    );
  });

  it('builds a Kotlin CLI + REST backend on Maven from its REST assembly', async () => {
    const text = await dockerfile([service('spring-cli-rest-kotlin', 'maven'), frontend]);
    expect(text).toContain('FROM maven:3-eclipse-temurin-25 AS build');
    expect(text).toContain(
      'COPY --from=build /workspace/application/rest/executable/target/application-rest-executable-0.1.0-SNAPSHOT.jar /app/app.jar',
    );
  });

  it('writes the image of every service a family matches, each once', async () => {
    const go = service('go-http');
    const once = (await paths([go])).filter((p) => p.startsWith('backend/'));
    expect(once).toEqual([...new Set(once)]);
    expect(once).toContain('backend/Dockerfile');
    const worker = { ...service('rust-http'), path: 'worker' };
    const trio = await paths([go, worker, frontend]);
    expect(trio).toContain('backend/Dockerfile');
    expect(trio).toContain('worker/Dockerfile');
    expect(trio).toContain('frontend/Dockerfile');
  });
});
