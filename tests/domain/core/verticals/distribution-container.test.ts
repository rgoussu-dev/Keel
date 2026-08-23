/**
 * Tests for the `distribution` vertical's container family — the
 * server-shaped sibling of `quarkus-cli-native`. One adapter per
 * stack family, so one happy path per family asserting the emitted
 * release pipeline builds the family's artifact and pushes the
 * containerization Dockerfile's image on tag push — plus the
 * provider dial both ways (and its deference to the `ci` vertical's
 * recorded tag), the deploy-flavor dial both ways, the JVM
 * jvm-vs-native flavor read from the recorded containerization dial,
 * the refusal to run without the containerization Dockerfile, and
 * the hard fail when no family matches (a CLI-shaped project keeps
 * resolving to `quarkus-cli-native` alone).
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { distributionVertical } from '../../../../src/domain/core/verticals/distribution.js';
import { ResolutionError } from '../../../../src/domain/core/resolver.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { ManifestV2 } from '../../../../src/domain/contract/composition.js';

type AnswerMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

interface InstalledDistribution {
  readonly read: (p: string) => string;
  readonly manifest: ManifestV2;
}

async function installDistribution(
  tags: string[],
  answers: AnswerMap = {},
  verticals: readonly string[] = [],
): Promise<InstalledDistribution> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dist-container-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
    tags,
    answers,
    verticals: verticals.map((id) => ({ id, installedAt: '2026-08-17T00:00:00Z' })),
  };
  const result = await installVertical({
    vertical: distributionVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-17T12:00:00Z',
  });
  return {
    read: (p: string) => tree.read(p)?.toString() ?? '',
    manifest: result.manifest,
  };
}

/** Tag sets mirroring what `keel new` + `keel add containerization` record. */
const JVM_TAGS = [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
];
const GO_TAGS = [
  'lang.go',
  'pkg.go-modules',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
];
const RUST_TAGS = [
  'lang.rust',
  'pkg.cargo',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
];
const TS_TAGS = [
  'lang.typescript',
  'runtime.node',
  'pkg.npm',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
];
const WC_TAGS = [
  'lang.typescript',
  'runtime.browser',
  'pkg.npm',
  'framework.web-components',
  'arch.hexagonal',
  'arch.spa',
  'deploy.container-image',
];

const GO_ANSWERS: AnswerMap = {
  'walking-skeleton/go-bootstrap': {
    modulePath: 'github.com/acme/shipper',
    projectName: 'shipper',
  },
};
const RUST_ANSWERS: AnswerMap = {
  'walking-skeleton/rust-bootstrap': { projectName: 'shipper' },
};

const WORKFLOW = '.github/workflows/release-image.yml';

describe('distribution vertical — the container family', () => {
  it('ships a Gradle Quarkus REST service: build, GHCR push on tag, compose descriptor', async () => {
    const { read, manifest } = await installDistribution(JVM_TAGS, {}, ['observability']);

    const workflow = read(WORKFLOW);
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain("java-version: '25'");
    expect(workflow).toContain('distribution: temurin');
    expect(workflow).toContain('run: ./gradlew build');
    expect(workflow).toContain('registry: ghcr.io');
    expect(workflow).toContain('docker build');
    expect(workflow).toContain('docker push');
    // The workflow builds the containerization Dockerfile — it never
    // carries a second image definition.
    expect(workflow).not.toContain('FROM ');

    const compose = read('deploy/compose.yaml');
    expect(compose).toContain('image: ${IMAGE:?');
    expect(compose).toContain("'${PORT:-8080}:8080'");
    // Config rides the environment: observability is installed, so
    // the OTel knobs are exposed as ${VAR:-default} passthroughs.
    expect(compose).toContain('OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-');
    expect(compose).toContain('OTEL_SERVICE_NAME: ${OTEL_SERVICE_NAME:-app}');

    expect(manifest.tags).toContain('dist.container-image');
    expect(manifest.answers['distribution/jvm-container']).toEqual({
      provider: 'github-actions',
      deploy: 'compose',
    });
  });

  it('exposes the datasource env when persistence is installed — split login on the JVM only', async () => {
    const jvm = await installDistribution(JVM_TAGS, {}, ['persistence']);
    const jvmCompose = jvm.read('deploy/compose.yaml');
    expect(jvmCompose).toContain('DB_URL: ${DB_URL:?');
    expect(jvmCompose).toContain('DB_USERNAME: ${DB_USERNAME:-}');
    expect(jvmCompose).toContain('DB_PASSWORD: ${DB_PASSWORD:-}');

    const go = await installDistribution(GO_TAGS, GO_ANSWERS, ['persistence']);
    const goCompose = go.read('deploy/compose.yaml');
    expect(goCompose).toContain('DB_URL: ${DB_URL:?');
    expect(goCompose).not.toContain('DB_USERNAME');

    // Never invented: without the vertical, no datasource knob.
    const bare = await installDistribution(GO_TAGS, GO_ANSWERS);
    expect(bare.read('deploy/compose.yaml')).not.toContain('DB_URL');
  });

  it('reads the recorded JVM flavor: runtime.graalvm-native flips the build to GraalVM', async () => {
    const { read } = await installDistribution([...JVM_TAGS, 'runtime.graalvm-native']);
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('graalvm/setup-graalvm@v1');
    // The CI build drops the host-only container-build flag — the
    // runner is the Linux host the flag exists to simulate.
    expect(workflow).toContain('run: ./gradlew build -Dquarkus.native.enabled=true');
    expect(workflow).not.toContain('container-build');
    expect(workflow).not.toContain('setup-java');
  });

  it('derives the Maven artifact for the GitLab pipeline from the shared derivation', async () => {
    const tags = JVM_TAGS.map((t) => (t === 'pkg.gradle' ? 'pkg.maven' : t));
    const { read } = await installDistribution(tags, {
      'distribution/jvm-container': { provider: 'gitlab-ci', deploy: 'compose' },
    });
    const gitlab = read('.gitlab-ci.yml');
    expect(gitlab).toContain('./mvnw package');
    expect(gitlab).toContain('application/rest/executable/target/quarkus-app/');
    expect(gitlab).toContain('$CI_REGISTRY_IMAGE:$CI_COMMIT_TAG');
    expect(read(WORKFLOW)).toBe('');
  });

  it('ships the Go service pinned to its own go.mod toolchain', async () => {
    const { read } = await installDistribution(GO_TAGS, GO_ANSWERS);
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('go-version-file: go.mod');
    expect(workflow).toContain('CGO_ENABLED=0 GOOS=linux go build -o bin/shipper-http ./cmd/http');
    expect(workflow).toContain('registry: ghcr.io');
  });

  it('ships the Rust service on latest stable with a release build', async () => {
    const { read } = await installDistribution(RUST_TAGS, RUST_ANSWERS);
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('rustup update stable');
    expect(workflow).toContain('cargo build --release');
    expect(workflow).toContain('registry: ghcr.io');
  });

  it('ships ts-http with no host build at all — the image installs the sources', async () => {
    const { read } = await installDistribution(TS_TAGS);
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('docker build');
    expect(workflow).not.toContain('setup-node');
    expect(workflow).not.toContain('npm ci');
  });

  it('ships the SPA assets image after building the bundle, and deploys it as an init container', async () => {
    const { read } = await installDistribution(WC_TAGS);
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('registry: ghcr.io');

    const compose = read('deploy/compose.yaml');
    // The init-container shape: the assets image populates the named
    // volume and must complete before stock nginx serves it.
    expect(compose).toContain("restart: 'no'");
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).toContain('image: nginx:alpine');
    expect(compose).toContain('spa-assets:/assets');
    expect(compose).toContain('spa-assets:/usr/share/nginx/html:ro');
    // Deploy-time config: the API base URL is env, never a rebuild.
    expect(compose).toContain('API_BASE_URL: ${API_BASE_URL:-/api}');
  });

  it('builds the SPA bundle with pnpm when the workspace is pnpm-managed', async () => {
    const tags = WC_TAGS.map((t) => (t === 'pkg.npm' ? 'pkg.pnpm' : t));
    const { read } = await installDistribution(tags);
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('corepack enable');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    expect(workflow).not.toContain('npm ci');
  });
});

describe('distribution container family — the provider dial', () => {
  it('emits the GitLab release jobs into .gitlab-ci.yml on a stored gitlab-ci answer, and only those', async () => {
    const { read, manifest } = await installDistribution(GO_TAGS, {
      ...GO_ANSWERS,
      'distribution/go-container': { provider: 'gitlab-ci', deploy: 'compose' },
    });
    const gitlab = read('.gitlab-ci.yml');
    expect(gitlab).toContain('release-artifact:');
    expect(gitlab).toContain('release-image:');
    expect(gitlab).toContain("if: '$CI_COMMIT_TAG =~ /^v/'");
    expect(gitlab).toContain('docker login -u "$CI_REGISTRY_USER"');
    expect(read(WORKFLOW)).toBe('');
    expect(manifest.tags).toContain('dist.container-image');
  });

  it("appends the release jobs to the ci vertical's existing .gitlab-ci.yml instead of clobbering it", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dist-append-'));
    cwds.push(cwd);
    await fs.writeFile(
      path.join(cwd, '.gitlab-ci.yml'),
      'image: golang:1.24\n\nbuild:\n  script:\n    - go test ./...\n',
    );
    const tree = new FsTree(cwd);
    await installVertical({
      vertical: distributionVertical,
      manifest: {
        ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
        tags: [...GO_TAGS, 'ci.gitlab-ci'],
        answers: GO_ANSWERS,
      },
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-17T12:00:00Z',
    });
    const gitlab = tree.read('.gitlab-ci.yml')?.toString() ?? '';
    expect(gitlab).toContain('build:\n  script:\n    - go test ./...');
    expect(gitlab).toContain('release-image:');
  });

  it("defers to the ci vertical's recorded provider tag over its own question", async () => {
    // Non-interactive, the question would default to github-actions;
    // the recorded ci.gitlab-ci tag must win — two providers that
    // disagree would emit a pipeline no host runs.
    const { read } = await installDistribution([...GO_TAGS, 'ci.gitlab-ci'], GO_ANSWERS);
    expect(read(WORKFLOW)).toBe('');
    expect(read('.gitlab-ci.yml')).toContain('release-image:');
  });

  it('rejects an unsupported provider answer loudly', async () => {
    await expect(
      installDistribution(GO_TAGS, {
        ...GO_ANSWERS,
        'distribution/go-container': { provider: 'circleci', deploy: 'compose' },
      }),
    ).rejects.toThrow(/unsupported provider 'circleci'/);
  });
});

describe('distribution container family — the deploy-flavor dial', () => {
  it('defaults to compose and never emits a chart beside it', async () => {
    const { read } = await installDistribution(GO_TAGS, GO_ANSWERS);
    expect(read('deploy/compose.yaml')).not.toBe('');
    expect(read('deploy/chart/Chart.yaml')).toBe('');
  });

  it('emits a minimal chart on the helm answer — values feed the container env', async () => {
    const { read } = await installDistribution(GO_TAGS, {
      ...GO_ANSWERS,
      'distribution/go-container': { provider: 'github-actions', deploy: 'helm' },
    });
    expect(read('deploy/compose.yaml')).toBe('');
    expect(read('deploy/chart/Chart.yaml')).toContain('name: shipper');
    const values = read('deploy/chart/values.yaml');
    expect(values).toContain('repository:');
    expect(values).toContain('env: {}');
    const deployment = read('deploy/chart/templates/deployment.yaml');
    expect(deployment).toContain('range $name, $value := .');
    expect(deployment).toContain('containerPort: 8080');
  });

  it('deploys the SPA chart as a real initContainers entry over a shared volume', async () => {
    const { read } = await installDistribution(WC_TAGS, {
      'distribution/wc-container': { provider: 'github-actions', deploy: 'helm' },
    });
    const deployment = read('deploy/chart/templates/deployment.yaml');
    expect(deployment).toContain('initContainers:');
    expect(deployment).toContain('emptyDir: {}');
    expect(deployment).toContain('name: API_BASE_URL');
    expect(deployment).toContain('readOnly: true');
    expect(read('deploy/chart/templates/nginx-configmap.yaml')).toContain(
      'try_files $uri /index.html',
    );
    expect(read('deploy/chart/values.yaml')).toContain('nginx:');
  });

  it('rejects an unsupported deploy answer loudly', async () => {
    await expect(
      installDistribution(GO_TAGS, {
        ...GO_ANSWERS,
        'distribution/go-container': { provider: 'github-actions', deploy: 'swarm' },
      }),
    ).rejects.toThrow(/unsupported deploy flavor 'swarm'/);
  });
});

describe('distribution container family — refusals', () => {
  it('refuses to emit a pipeline for a Dockerfile that does not exist', async () => {
    await expect(
      installDistribution(
        GO_TAGS.filter((t) => t !== 'deploy.container-image'),
        GO_ANSWERS,
      ),
    ).rejects.toThrow(/keel add containerization/);
  });

  it('hard-fails when no family matches (a Go CLI covers no dimension)', async () => {
    await expect(
      installDistribution(['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli']),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('leaves the CLI story to quarkus-cli-native, untouched', async () => {
    // A Quarkus CLI on Gradle still resolves to the native-binaries
    // adapter — the container family never fires on arch.cli.
    const { read, manifest } = await installDistribution(
      ['lang.java', 'runtime.jvm', 'pkg.gradle', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
      {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'com.acme.cli',
          projectName: 'shipper',
        },
      },
    );
    expect(read('.github/workflows/release.yml')).toContain('name: release');
    expect(read(WORKFLOW)).toBe('');
    expect(manifest.tags).toContain('runtime.graalvm-native');
    expect(manifest.tags).not.toContain('dist.container-image');
  });
});

/**
 * A composed `arch.cli + arch.server-http` stack reaches both shapes
 * at once, and they disagreed: the CLI shape asked for native build
 * targets on top of a `flavor: jvm` answer, then promoted
 * `runtime.graalvm-native` — the tag `jvm-container` reads to decide
 * whether its release pipeline builds a native artifact for the
 * Dockerfile to copy. The `containerization` vertical now records the
 * flavor either way, and the CLI shape stands down where the answer
 * already said no.
 */
describe('distribution vertical — the GraalVM dial is one dial per project', () => {
  const COMBO = [
    'lang.java',
    'runtime.jvm',
    'pkg.gradle',
    'framework.quarkus',
    'arch.hexagonal',
    'arch.cli',
    'arch.server-http',
    'deploy.container-image',
  ];
  const CLI_ANSWERS: AnswerMap = {
    'walking-skeleton/quarkus-cli-bootstrap': {
      basePackage: 'com.acme.cli',
      projectName: 'shipper',
    },
  };

  it('ships through the image alone when the recorded flavor is jvm', async () => {
    const { read, manifest } = await installDistribution(
      [...COMBO, 'runtime.jvm-image'],
      CLI_ANSWERS,
    );

    expect(read(WORKFLOW)).toContain('docker push');
    // The native-binaries workflow is not emitted, its sticky answer
    // is not recorded, and the tag that contradicts the Dockerfile is
    // not promoted.
    expect(read('.github/workflows/release.yml')).toBe('');
    expect(manifest.answers['distribution/quarkus-cli-native']).toBeUndefined();
    expect(manifest.tags).not.toContain('runtime.graalvm-native');
    // The jvm flavor keeps the JVM artifact in the release pipeline.
    expect(read(WORKFLOW)).toContain('run: ./gradlew build');
    expect(read(WORKFLOW)).not.toContain('quarkus.native.enabled');
  });

  it('still ships native binaries beside the image when the recorded flavor is native', async () => {
    const { read, manifest } = await installDistribution(
      [...COMBO, 'runtime.graalvm-native'],
      CLI_ANSWERS,
    );

    expect(read('.github/workflows/release.yml')).toContain('name: release');
    expect(read(WORKFLOW)).toContain('quarkus.native.enabled');
    expect(manifest.answers['distribution/quarkus-cli-native']).toEqual({
      targets: 'linux-amd64,linux-arm64,darwin-arm64',
    });
    expect(manifest.tags).toContain('runtime.graalvm-native');
    expect(manifest.tags).toContain('dist.container-image');
  });
});
