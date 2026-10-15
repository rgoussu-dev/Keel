/**
 * I13's clauses, each on its own (`holdProductRuns`), over product
 * roots built by hand.
 *
 * The composite axis holds I13 on every product keel ships, each
 * service on its default build system, and every one of those holds. So
 * no cell there shows that a clause can fail, and none reaches the
 * Maven clause, since every JVM default is Gradle. Here each clause is
 * held both ways: a root shaped as keel's glue writes one holds for
 * every runner a run hint uses, and the same root with one thing
 * changed fails. Each failing root fails on one clause alone, so
 * weakening that clause alone turns its case red.
 *
 * **Scenario.** A product root in miniature ({@link productRoot}): the
 * `compose.yaml`, the README's two run lines, and the files they name,
 * with the backend's hint and build files from {@link BACKENDS}. Each
 * failing case changes one thing in it. Where that thing is a `cd`, the
 * case adds a third run line, so the two the compose file needs stay.
 *
 * **Factory.** The tree written into `product/` of a scratch directory,
 * so a path starting `../` lands beside the root, and a {@link Grid}
 * holding I13 alone.
 *
 * **Port.** `holdProductRuns`, read back through `Grid.violations`.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';
import { Grid, holdProductRuns } from '../../../support/composition-grid.js';

/** A product root, as relative path → content. */
type Tree = ReadonlyMap<string, string>;

/** A backend service: the command its run line gives, and the files that command needs. */
interface Backend {
  readonly hint: string;
  readonly files: Readonly<Record<string, string>>;
}

const cargoManifest = (...binaries: readonly string[]): string =>
  [
    '[package]',
    'name = "walking-skeleton"',
    'version = "0.1.0"',
    '',
    '[dependencies]',
    'axum = "0.8"',
    ...binaries.flatMap((name) => [
      '',
      '[[bin]]',
      `name = "${name}"`,
      `path = "src/bin/${name}.rs"`,
    ]),
  ].join('\n');

const packageJson = (...scripts: readonly string[]): string =>
  JSON.stringify({ scripts: Object.fromEntries(scripts.map((script) => [script, 'vite'])) });

/** One backend per runner a product's run hint uses, as keel's glue writes them. */
const BACKENDS = {
  gradle: { hint: './gradlew quarkusDev', files: { 'build.gradle.kts': '' } },
  'gradle, a qualified task': {
    hint: './gradlew :application:rest:executable:quarkusDev',
    files: { 'settings.gradle.kts': '', 'application/rest/executable/build.gradle.kts': '' },
  },
  maven: {
    hint: 'SPRING_PROFILES_ACTIVE=dev ./mvnw -am -pl application/rest/executable spring-boot:run',
    files: { 'pom.xml': '', 'application/rest/executable/pom.xml': '' },
  },
  go: {
    hint: 'GO_ENV=dev go run ./cmd/http',
    files: { 'go.mod': '', 'cmd/http/main.go': 'package main\n' },
  },
  'cargo, one binary': { hint: 'cargo run', files: { 'Cargo.toml': cargoManifest() } },
  'cargo, two binaries': {
    hint: 'cargo build && ./target/debug/*-http',
    files: { 'Cargo.toml': cargoManifest('walking-skeleton', 'walking-skeleton-http') },
  },
  pnpm: { hint: 'pnpm run dev:rest', files: { 'package.json': packageJson('dev:rest', 'test') } },
} satisfies Readonly<Record<string, Backend>>;

const COMPOSE = [
  'volumes:',
  '  spa-assets:',
  '',
  'services:',
  '  backend:',
  '    build: ./backend',
  '  frontend-assets:',
  '    build: ./frontend',
  '    volumes:',
  '      - spa-assets:/assets',
  '  frontend:',
  '    image: nginx:alpine',
  '    volumes:',
  '      - spa-assets:/usr/share/nginx/html:ro',
  '      - ./frontend/nginx.conf:/etc/nginx/templates/default.conf.template:ro,z',
].join('\n');

const readme = (backend: string): string =>
  [
    '## Run order (development)',
    '',
    '1. Start the backend first:',
    '   ```sh',
    `   cd backend && ${backend}   # serves http://localhost:8080`,
    '   ```',
    '2. Then the frontend dev server:',
    '   ```sh',
    '   cd frontend && npm run dev   # proxies /api → localhost:8080',
    '   ```',
  ].join('\n');

/**
 * A monorepo product root as keel's glue writes one, in miniature, its
 * backend `backend`: what I13 reads, and nothing else.
 */
const productRoot = (backend: Backend): Map<string, string> =>
  new Map([
    ['compose.yaml', COMPOSE],
    ['README.md', readme(backend.hint)],
    ['backend/Dockerfile', 'FROM scratch\n'],
    ...Object.entries(backend.files).map(
      ([file, content]) => [`backend/${file}`, content] as const,
    ),
    ['frontend/Dockerfile', 'FROM scratch\n'],
    ['frontend/nginx.conf', 'server {}\n'],
    ['frontend/package.json', packageJson('dev', 'build')],
  ]);

const changed = (
  tree: Map<string, string>,
  change: (tree: Map<string, string>) => void,
): Map<string, string> => {
  change(tree);
  return tree;
};

const runningBy = (backend: Backend, hint: string): Map<string, string> =>
  changed(productRoot(backend), (tree) => tree.set('README.md', readme(hint)));

/** The root of `backend`, its README given the run line `line` after its two. */
const alsoRunning = (backend: Backend, line: string): Map<string, string> =>
  changed(productRoot(backend), (tree) =>
    tree.set('README.md', `${readme(backend.hint)}\n   ${line}\n`),
  );

/** A compose file that builds nothing: one service, from an image. */
const IMAGE_ONLY = ['services:', '  web:', '    image: nginx:alpine'].join('\n');

const grid = new Grid(['I13']);
afterAll(() => grid.dispose());

let cells = 0;

/** Whether the product root `tree`, written to disk, holds I13. */
const holds = async (tree: Tree): Promise<boolean> => {
  const root = path.join(await grid.scratch(), 'product');
  for (const [file, content] of tree) await fs.outputFile(path.join(root, file), content);
  const cell = `new:product-${(cells += 1)}`;
  await holdProductRuns(grid, cell, root);
  return !grid.violations('I13').includes(cell);
};

describe('I13: a monorepo product runs as its root says', () => {
  it.each(Object.entries(BACKENDS))('holds a root whose backend runs by %s', async (_, backend) => {
    expect(await holds(productRoot(backend))).toBe(true);
  });

  it('holds a binary run by its exact name after cargo build', async () => {
    const tree = runningBy(
      BACKENDS['cargo, two binaries'],
      'cargo build && ./target/debug/walking-skeleton-http',
    );
    expect(await holds(tree)).toBe(true);
  });

  it('holds a polyrepo root trivially: it has no compose.yaml', async () => {
    const tree = changed(productRoot(BACKENDS.gradle), (root) => {
      root.delete('compose.yaml');
      root.set('README.md', readme('see its README'));
    });
    expect(await holds(tree)).toBe(true);
  });

  it.each<readonly [string, Tree]>([
    [
      'a removed backend/Dockerfile',
      changed(productRoot(BACKENDS.gradle), (tree) => tree.delete('backend/Dockerfile')),
    ],
    [
      'a long-form build naming a Dockerfile its context lacks',
      changed(productRoot(BACKENDS.gradle), (tree) =>
        tree.set(
          'compose.yaml',
          COMPOSE.replace(
            '    build: ./backend',
            ['    build:', '      context: ./backend', '      dockerfile: Containerfile'].join(
              '\n',
            ),
          ),
        ),
      ),
    ],
    [
      'an absolute build context',
      changed(productRoot(BACKENDS.gradle), (tree) =>
        tree.set('compose.yaml', COMPOSE.replace('build: ./backend', 'build: /backend')),
      ),
    ],
    [
      'a removed bind-mounted nginx.conf',
      changed(productRoot(BACKENDS.gradle), (tree) => tree.delete('frontend/nginx.conf')),
    ],
    [
      'a long-form bind mount whose source is missing',
      changed(productRoot(BACKENDS.gradle), (tree) =>
        tree.set(
          'compose.yaml',
          [
            COMPOSE,
            '      - type: bind',
            '        source: ./frontend/env.conf',
            '        target: /etc/env.conf',
          ].join('\n'),
        ),
      ),
    ],
    [
      'a directory the product lacks',
      alsoRunning(BACKENDS.go, 'cd api && go run ../backend/cmd/http'),
    ],
    ['a cd to a file', alsoRunning(BACKENDS.go, 'cd backend/cmd/http/main.go && go run ..')],
    [
      'a cd to the root itself',
      changed(alsoRunning(BACKENDS.gradle, 'cd . && ./gradlew quarkusDev'), (tree) =>
        tree.set('build.gradle.kts', ''),
      ),
    ],
    [
      'a cd out of the root',
      changed(alsoRunning(BACKENDS.gradle, 'cd ../elsewhere && ./gradlew quarkusDev'), (tree) =>
        tree.set('../elsewhere/build.gradle.kts', ''),
      ),
    ],
    [
      'a cd to an absolute path',
      alsoRunning(BACKENDS.gradle, 'cd /backend && ./gradlew quarkusDev'),
    ],
    [
      'a cd to a home path',
      changed(alsoRunning(BACKENDS.gradle, 'cd ~/backend && ./gradlew quarkusDev'), (tree) =>
        tree.set('~/backend/build.gradle.kts', ''),
      ),
    ],
    ['a bare cd backend', alsoRunning(BACKENDS.gradle, 'cd backend')],
    [
      'a cd given two directories',
      alsoRunning(BACKENDS.gradle, 'cd backend frontend && ./gradlew quarkusDev'),
    ],
    [
      'a compose-built service no run line starts in',
      changed(productRoot(BACKENDS.gradle), (tree) =>
        tree.set('README.md', readme(BACKENDS.gradle.hint).replace(/^.*cd backend.*$/m, '')),
      ),
    ],
    [
      'a README with no run line',
      changed(productRoot(BACKENDS.gradle), (tree) => {
        tree.set('compose.yaml', IMAGE_ONLY);
        tree.set('README.md', '# The product\n');
      }),
    ],
    [
      'a removed README.md',
      changed(productRoot(BACKENDS.gradle), (tree) => {
        tree.set('compose.yaml', IMAGE_ONLY);
        tree.delete('README.md');
      }),
    ],
    [
      'a compose service with no body',
      changed(productRoot(BACKENDS.gradle), (tree) =>
        tree.set('compose.yaml', `${COMPOSE}\n  db:\n`),
      ),
    ],
    ['./gradlew with no task', runningBy(BACKENDS.gradle, './gradlew')],
    [
      'a wrong Gradle project',
      runningBy(BACKENDS['gradle, a qualified task'], './gradlew :application:api:quarkusDev'),
    ],
    [
      'a second Gradle task whose project is missing',
      runningBy(
        BACKENDS['gradle, a qualified task'],
        './gradlew :application:rest:executable:quarkusDev :application:api:run',
      ),
    ],
    [
      'a Maven module with no POM',
      runningBy(BACKENDS.maven, './mvnw -am -pl application/api spring-boot:run'),
    ],
    [
      'a -pl list with one module missing',
      runningBy(
        BACKENDS.maven,
        './mvnw -am -pl application/rest/executable,application/api spring-boot:run',
      ),
    ],
    ['a Go package the service lacks', runningBy(BACKENDS.go, 'go run ./cmd/api')],
    [
      'a Go package with no .go file',
      changed(productRoot(BACKENDS.go), (tree) => {
        tree.delete('backend/cmd/http/main.go');
        tree.set('backend/cmd/http/README.md', '# http\n');
      }),
    ],
    ['go build, not go run', runningBy(BACKENDS.go, 'go build ./cmd/http')],
    [
      'a renamed npm script',
      changed(productRoot(BACKENDS.gradle), (tree) =>
        tree.set('frontend/package.json', packageJson('start', 'build')),
      ),
    ],
    [
      'cargo build with no Cargo.toml',
      changed(runningBy(BACKENDS['cargo, two binaries'], 'cargo build'), (tree) =>
        tree.delete('backend/Cargo.toml'),
      ),
    ],
    ['cargo run with two binaries', runningBy(BACKENDS['cargo, two binaries'], 'cargo run')],
    [
      'a glob matching two binaries',
      changed(productRoot(BACKENDS['cargo, two binaries']), (tree) =>
        tree.set('backend/Cargo.toml', cargoManifest('admin-http', 'walking-skeleton-http')),
      ),
    ],
    [
      'a built binary run with no cargo build before it',
      runningBy(BACKENDS['cargo, two binaries'], './target/debug/walking-skeleton-http'),
    ],
    ...['--release', '-r', '--profile release', '--profile=release'].map(
      (flag): readonly [string, Tree] => [
        `a built binary after cargo build ${flag}`,
        runningBy(BACKENDS['cargo, two binaries'], `cargo build ${flag} && ./target/debug/*-http`),
      ],
    ),
    [
      'a binary named exactly that no [[bin]] declares',
      runningBy(
        BACKENDS['cargo, two binaries'],
        'cargo build && ./target/debug/walking-skeleton-grpc',
      ),
    ],
    [
      'a binary no [[bin]] names',
      runningBy(BACKENDS['cargo, two binaries'], 'cargo build && ./target/debug/*-grpc'),
    ],
    ['a pointer to a README: see its README', runningBy(BACKENDS.gradle, 'see its README')],
    ['a runner it does not know', runningBy(BACKENDS.gradle, 'make run')],
    [
      'an escaped &amp;&amp;',
      runningBy(BACKENDS['cargo, two binaries'], 'cargo build &amp;&amp; ./target/debug/*-http'),
    ],
  ])('fails %s', async (_, tree) => {
    expect(await holds(tree)).toBe(false);
  });

  it.each([
    ['./gradlew quarkusDev; make x'],
    ['./gradlew quarkusDev | tee log'],
    ['./gradlew quarkusDev || true'],
    ['./gradlew quarkusDev &'],
    ['./gradlew `echo quarkusDev`'],
    ['./gradlew $(echo quarkusDev)'],
    ['./gradlew quarkusDev > log'],
    ['./gradlew quarkusDev < /dev/null'],
    ["./gradlew 'quarkusDev'"],
    ['./gradlew "quarkusDev'],
    ['./gradlew quarkusDev \\'],
  ])('fails a character no plain run line holds: %s', async (hint) => {
    expect(await holds(runningBy(BACKENDS.gradle, hint))).toBe(false);
  });
});
