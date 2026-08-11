/**
 * Integration test for `keel add containerization` — the thin-image
 * vertical layered onto each HTTP-shaped stack.
 *
 * Each scenario runs `keel new` to seed a project, adds the
 * vertical, and asserts the Dockerfile beside the deployment unit is
 * thin — no build stage, copying the artifact the host build
 * produces — with the artifact path following the build system and
 * the flavor answer. The CLI-shaped refusal (uncovered `image`
 * dimension) closes the file.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addVerticalCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectOk, installMediator, runActionsExcept } from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-container-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Deferred actions that shell out to tools the test host may lack. */
const SKIPPED_ACTIONS = [
  'walking-skeleton/gradle-wrapper',
  'walking-skeleton/maven-wrapper',
  'walking-skeleton/go-bootstrap',
  'walking-skeleton/rust-bootstrap',
  'walking-skeleton/npm-install',
  'walking-skeleton/pnpm-install',
  'observability/go-observability',
  'observability/ts-observability',
];

const seed = async (
  stack: string,
  answers: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
  buildSystem?: string,
): Promise<void> => {
  const mediator = installMediator({ runDeferred: runActionsExcept(SKIPPED_ACTIONS) });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: { ...answers, 'vcs/git-init': { remote: '', defaultBranch: 'main' } },
        interactive: false,
        dryRun: false,
        ...(buildSystem ? { buildSystem } : {}),
      }),
    ),
  );
};

const addContainerization = async (
  answers: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): Promise<void> => {
  expectOk(
    await installMediator().dispatch(
      addVerticalCommand({
        cwd,
        vertical: 'containerization',
        answers,
        interactive: false,
        dryRun: false,
      }),
    ),
  );
};

const dockerfile = (): Promise<string> => fs.readFile(path.join(cwd, 'Dockerfile'), 'utf8');

const manifest = async (): Promise<ManifestV2> => {
  const stored = await fsManifestStore.read(projectScopeRoot(cwd));
  expect(stored).not.toBeNull();
  return stored!;
};

describe('keel.add-vertical (keel add containerization)', () => {
  it('ships the Quarkus fast-jar layout on a JRE base by default (Gradle)', async () => {
    await seed('quarkus-rest');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain('FROM eclipse-temurin:25-jre');
    expect(content).toContain('COPY application/rest/executable/build/quarkus-app/ /app/');
    expect(content).toContain('./gradlew build');
    expect(content).not.toContain('AS build');
    // The whole context reaches the builder regardless of what the
    // Dockerfile copies, so secrets stay out of it.
    expect(await fs.readFile(path.join(cwd, '.dockerignore'), 'utf8')).toContain('.env');

    const stored = await manifest();
    expect(stored.verticals.map((v) => v.id)).toContain('containerization');
    expect(stored.tags).toContain('deploy.container-image');
    expect(stored.answers['containerization/quarkus-rest-image']).toEqual({ flavor: 'jvm' });
  });

  it('opts a Maven Quarkus service into the native flavor', async () => {
    await seed('quarkus-rest', {}, 'maven');
    await addContainerization({ 'containerization/quarkus-rest-image': { flavor: 'native' } });

    const content = await dockerfile();
    expect(content).toContain('FROM quay.io/quarkus/quarkus-micro-image:2.0');
    expect(content).toContain('COPY --chown=1001:root application/rest/executable/target/*-runner');
    expect(content).toContain('./mvnw package -Dquarkus.native.enabled=true');
    expect(content).not.toContain('AS build');

    const stored = await manifest();
    expect(stored.tags).toContain('runtime.graalvm-native');
  });

  it('ships the Spring boot jar from build/libs under Gradle', async () => {
    await seed('spring-rest');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain(
      'COPY application/rest/executable/build/libs/application-rest-executable-0.1.0-SNAPSHOT.jar /app/app.jar',
    );
    expect(content).toContain('./gradlew build');
  });

  it('ships the Spring boot jar from target under Maven', async () => {
    await seed('spring-rest', {}, 'maven');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain(
      'COPY application/rest/executable/target/application-rest-executable-0.1.0-SNAPSHOT.jar /app/app.jar',
    );
    expect(content).toContain('./mvnw package');
  });

  it('opts a Gradle Spring service into the native flavor, patching the build wiring in', async () => {
    await seed('spring-rest');
    await addContainerization({ 'containerization/spring-rest-image': { flavor: 'native' } });

    const content = await dockerfile();
    expect(content).toContain('FROM cgr.dev/chainguard/wolfi-base:latest');
    expect(content).toContain(
      'COPY application/rest/executable/build/native/nativeCompile/* /app/application',
    );
    expect(content).toContain(':application:rest:executable:nativeCompile');

    const buildFile = await fs.readFile(
      path.join(cwd, 'application/rest/executable/build.gradle.kts'),
      'utf8',
    );
    expect(buildFile).toContain('id("org.graalvm.buildtools.native") version "1.1.8"');
    expect(buildFile.indexOf('org.graalvm.buildtools.native')).toBeGreaterThan(
      buildFile.indexOf('org.springframework.boot'),
    );
    expect((await manifest()).tags).toContain('runtime.graalvm-native');
  });

  it('opts a Maven Spring service into the native flavor via a native profile', async () => {
    await seed('spring-rest', {}, 'maven');
    await addContainerization({ 'containerization/spring-rest-image': { flavor: 'native' } });

    const content = await dockerfile();
    expect(content).toContain(
      'COPY application/rest/executable/target/application-rest-executable /app/application',
    );
    expect(content).toContain('./mvnw package -Pnative');

    const pom = await fs.readFile(path.join(cwd, 'application/rest/executable/pom.xml'), 'utf8');
    expect(pom).toContain('<id>native</id>');
    expect(pom).toContain('<artifactId>native-maven-plugin</artifactId>');
    expect(pom).toContain('<goal>process-aot</goal>');
    expect(pom.trimEnd().endsWith('</project>')).toBe(true);
    expect((await manifest()).tags).toContain('runtime.graalvm-native');
  });

  it('merges the native profile into an existing <profiles> block instead of doubling it', async () => {
    await seed('spring-rest', {}, 'maven');
    const pomPath = path.join(cwd, 'application/rest/executable/pom.xml');
    const original = await fs.readFile(pomPath, 'utf8');
    await fs.writeFile(
      pomPath,
      original.replace(
        /<\/project>\s*$/,
        '  <profiles>\n    <profile>\n      <id>existing</id>\n    </profile>\n  </profiles>\n</project>\n',
      ),
    );
    await addContainerization({ 'containerization/spring-rest-image': { flavor: 'native' } });

    const pom = await fs.readFile(pomPath, 'utf8');
    expect(pom.match(/<profiles>/g)).toHaveLength(1);
    expect(pom).toContain('<id>existing</id>');
    expect(pom).toContain('<id>native</id>');
    expect(pom).toContain('<artifactId>native-maven-plugin</artifactId>');
    expect(pom.trimEnd().endsWith('</project>')).toBe(true);
  });

  it('ships the Micronaut shadow jar under Gradle', async () => {
    await seed('micronaut-rest');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain(
      'COPY application/rest/executable/build/libs/application-rest-executable-0.1.0-SNAPSHOT-all.jar /app/app.jar',
    );
  });

  it('opts a Gradle Micronaut service into the native flavor', async () => {
    await seed('micronaut-rest');
    await addContainerization({ 'containerization/micronaut-rest-image': { flavor: 'native' } });

    const content = await dockerfile();
    expect(content).toContain('FROM cgr.dev/chainguard/wolfi-base:latest');
    expect(content).toContain(
      'COPY application/rest/executable/build/native/nativeCompile/* /app/application',
    );
    expect(content).toContain(':application:rest:executable:nativeCompile');
    expect((await manifest()).tags).toContain('runtime.graalvm-native');
  });

  it('opts a Maven Micronaut service into the native flavor', async () => {
    await seed('micronaut-rest', {}, 'maven');
    await addContainerization({ 'containerization/micronaut-rest-image': { flavor: 'native' } });

    const content = await dockerfile();
    expect(content).toContain(
      'COPY application/rest/executable/target/application-rest-executable /app/application',
    );
    expect(content).toContain('./mvnw package -Dpackaging=native-image');
  });

  it('ships the Go binary onto the distroless static base', async () => {
    await seed('go-http', {
      'walking-skeleton/go-bootstrap': {
        modulePath: 'github.com/acme/shipper',
        projectName: 'shipper',
      },
    });
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain('FROM gcr.io/distroless/static-debian12:nonroot');
    expect(content).toContain('COPY bin/shipper-http /shipper-http');
    expect(content).toContain('CGO_ENABLED=0 GOOS=linux go build -o bin/shipper-http ./cmd/http');
    expect(content).not.toContain('AS build');
  });

  it('ships the Rust release binary onto the distroless cc base', async () => {
    await seed('rust-http', { 'walking-skeleton/rust-bootstrap': { projectName: 'shipper' } });
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain('FROM gcr.io/distroless/cc-debian12:nonroot');
    expect(content).toContain('COPY target/release/shipper-http /shipper-http');
    expect(content).toContain('cargo build --release');
  });

  it('ships the ts-http sources onto node:22-alpine with npm', async () => {
    await seed('ts-http');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain('FROM node:22-alpine');
    expect(content).toContain('RUN npm ci --omit=dev');
    expect(content).toContain('CMD ["node", "application/rest/src/main.ts"]');
  });

  it('installs with pnpm when the workspace is pnpm-managed', async () => {
    await seed('ts-http', {}, 'pnpm');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain('RUN corepack enable && pnpm install --prod --frozen-lockfile');
    expect(content).not.toContain('npm ci');
  });

  it('serves the SPA bundle from nginx with the history-API fallback', async () => {
    await seed('web-components');
    await addContainerization();

    const content = await dockerfile();
    expect(content).toContain('FROM nginx:alpine');
    expect(content).toContain('COPY application/web-app/dist/ /usr/share/nginx/html/');
    expect(content).toContain('npm run build');
    const nginx = await fs.readFile(path.join(cwd, 'nginx.conf'), 'utf8');
    expect(nginx).toContain('try_files $uri /index.html');
  });

  it('hard-fails on a CLI-shaped project with the uncovered image dimension', async () => {
    await seed('quarkus-cli');
    await expect(
      installMediator().dispatch(
        addVerticalCommand({
          cwd,
          vertical: 'containerization',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    ).rejects.toThrow(/no adapter covers dimension\(s\): image/);
  });
});
