/**
 * Tests for the `observability` vertical across the HTTP stacks.
 * The resolution block proves per-stack adapter selection and the
 * `arch.cli` hard-fail (no probe surface on a CLI). The install
 * blocks chain `walking-skeleton` then `observability` on one tree —
 * exactly how greenfield stacks run them — and assert the layered
 * result: rendered context/filter/readiness sources, build files
 * patched with the framework's dependencies, config patched with
 * probe + MDC + OTel settings, and the README section. The patch
 * helpers' drift guards are covered directly.
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
import { devEnvVertical } from '../../../../src/domain/core/verticals/dev-env.js';
import { observabilityVertical } from '../../../../src/domain/core/verticals/observability.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { resolveVertical, ResolutionError } from '../../../../src/domain/core/resolver.js';
import { QUARKUS_OBSERVABILITY_ID } from '../../../../src/domain/core/adapters/quarkus-observability.js';
import { SPRING_OBSERVABILITY_ID } from '../../../../src/domain/core/adapters/spring-observability.js';
import { MICRONAUT_OBSERVABILITY_KOTLIN_ID } from '../../../../src/domain/core/adapters/micronaut-observability-kotlin.js';
import { MONITORING_COMPOSE_ID } from '../../../../src/domain/core/adapters/monitoring-compose.js';
import {
  GO_OBSERVABILITY_ID,
  patchMain,
} from '../../../../src/domain/core/adapters/go-observability.js';
import { RUST_OBSERVABILITY_ID } from '../../../../src/domain/core/adapters/rust-observability.js';
import {
  TS_OBSERVABILITY_ID,
  addOtelDependencies,
  patchMainTs,
} from '../../../../src/domain/core/adapters/ts-observability.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { DeferredAction } from '../../../../src/domain/contract/composition.js';

const read = (tree: FsTree, p: string): string => tree.read(p)?.toString() ?? '';

const installBoth = async (
  tags: string[],
  answers: Record<string, Record<string, string>> = {},
): Promise<{ tree: FsTree; cwd: string; actions: readonly DeferredAction[] }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-obs-'));
  const tree = new FsTree(cwd);
  let manifest: ManifestV2 = {
    ...emptyManifestV2('2026-08-11T00:00:00Z', '0.0.0-test'),
    tags,
    answers,
  };
  const deps = {
    tree,
    mode: 'non-interactive' as const,
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-11T12:00:00Z',
  };
  const skeleton = await installVertical({ vertical: walkingSkeletonVertical, manifest, ...deps });
  manifest = skeleton.manifest;
  const devEnv = await installVertical({ vertical: devEnvVertical, manifest, ...deps });
  manifest = devEnv.manifest;
  const observability = await installVertical({
    vertical: observabilityVertical,
    manifest,
    ...deps,
  });
  return { tree, cwd, actions: observability.applyResult.actions };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('observability resolution (per-stack adapter by predicate)', () => {
  const jvm = (framework: string, lang: string): string[] => [
    `lang.${lang}`,
    'runtime.jvm',
    'pkg.gradle',
    `framework.${framework}`,
    'arch.hexagonal',
    'arch.server-http',
  ];

  it.each([
    [jvm('quarkus', 'java'), QUARKUS_OBSERVABILITY_ID],
    [jvm('spring', 'java'), SPRING_OBSERVABILITY_ID],
    [jvm('micronaut', 'kotlin'), MICRONAUT_OBSERVABILITY_KOTLIN_ID],
    [['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'], GO_OBSERVABILITY_ID],
    [['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.server-http'], RUST_OBSERVABILITY_ID],
    [
      ['lang.typescript', 'runtime.node', 'pkg.npm', 'arch.hexagonal', 'arch.server-http'],
      TS_OBSERVABILITY_ID,
    ],
  ])(
    'selects the stack adapter + the monitoring stack, covering all dimensions (%j)',
    (tags, expected) => {
      const adapters = resolveVertical(observabilityVertical, tags as string[]);
      const ids = adapters.map((a) => a.id);
      expect(ids).toContain(expected);
      expect(ids).toContain(MONITORING_COMPOSE_ID);
      expect(ids).toHaveLength(2);
      const covered = new Set(adapters.flatMap((a) => [...a.covers]));
      for (const dimension of observabilityVertical.dimensions) {
        expect(covered.has(dimension), `dimension '${dimension}' uncovered`).toBe(true);
      }
    },
  );

  it('hard-fails on a CLI tag set — a CLI has no probe surface', () => {
    expect(() =>
      resolveVertical(observabilityVertical, [
        'lang.java',
        'runtime.jvm',
        'pkg.gradle',
        'framework.quarkus',
        'arch.hexagonal',
        'arch.cli',
      ]),
    ).toThrow(ResolutionError);
  });
});

describe('observability on the Quarkus REST skeleton (Java, Gradle)', () => {
  it('layers health + request context + telemetry onto the bootstrap output', async () => {
    const { tree, cwd } = await installBoth([
      'lang.java',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    const base = 'application/rest/executable/src/main/java/com/example/rest/observability';
    expect(tree.exists(`${base}/RequestContext.java`)).toBe(true);
    expect(tree.exists(`${base}/RequestContextFilter.java`)).toBe(true);
    expect(tree.exists(`${base}/ServiceReadyCheck.java`)).toBe(true);
    expect(
      tree.exists(
        'application/rest/executable/src/test/java/com/example/rest/observability/ObservabilityTest.java',
      ),
    ).toBe(true);

    const filter = read(tree, `${base}/RequestContextFilter.java`);
    expect(filter).toContain('package com.example.rest.observability;');
    expect(filter).toContain('app.http.requests');

    const build = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(build).toContain('io.quarkus:quarkus-smallrye-health');
    expect(build).toContain('io.quarkus:quarkus-opentelemetry');

    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('%X{correlationId}');
    expect(properties).toContain('quarkus.otel.metrics.enabled=true');
    expect(properties).toContain('%test.quarkus.otel.sdk.disabled=true');

    expect(read(tree, 'README.md')).toContain('### Observability');
    expect(read(tree, 'README.md')).toContain('/q/health/ready');

    // The monitoring stack (granular by default) supplements the
    // dev-env compose, listening where the service exports.
    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('name: walking-skeleton-dev');
    expect(compose).not.toContain('services: {}');
    expect(compose).toContain('otel-collector:');
    expect(compose).toContain('"4317:4317"');
    expect(compose).toContain('grafana-data:');
    for (const f of [
      'otel-collector.yaml',
      'prometheus.yml',
      'tempo.yaml',
      'grafana-datasources.yaml',
    ]) {
      expect(tree.exists(`dev/observability/${f}`), f).toBe(true);
    }
    expect(read(tree, 'README.md')).toContain('### Dev environment');
    expect(read(tree, 'README.md')).toContain('### Monitoring stack');
  });
});

describe('the monitoring stack shape question', () => {
  it('patches the all-in-one lgtm service in on the sticky answer', async () => {
    const { tree, cwd } = await installBoth(
      ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
      { 'observability/monitoring-compose': { stack: 'lgtm' } },
    );
    cwds.push(cwd);

    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('grafana/otel-lgtm');
    expect(compose).toContain('"4318:4318"');
    expect(compose).not.toContain('services: {}');
    expect(tree.exists('dev/observability/otel-collector.yaml')).toBe(false);
  });

  it('stands alone without dev-env — the seeded patch creates the base itself', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-obs-nodev-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const deps = {
      tree,
      mode: 'non-interactive' as const,
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-11T12:00:00Z',
    };
    const tags = ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'];
    let manifest: ManifestV2 = {
      ...emptyManifestV2('2026-08-11T00:00:00Z', '0.0.0-test'),
      tags,
    };
    const skeleton = await installVertical({
      vertical: walkingSkeletonVertical,
      manifest,
      ...deps,
    });
    manifest = skeleton.manifest;
    await installVertical({ vertical: observabilityVertical, manifest, ...deps });

    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('name: walking-skeleton-dev');
    expect(compose).toContain('otel-collector:');
    expect(compose).not.toContain('services: {}');
  });
});

describe('observability on the Spring REST skeleton (Java, Maven)', () => {
  it('patches the executable pom and the actuator probe config', async () => {
    const { tree, cwd } = await installBoth([
      'lang.java',
      'runtime.jvm',
      'pkg.maven',
      'framework.spring',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    const pom = read(tree, 'application/rest/executable/pom.xml');
    expect(pom).toContain('<artifactId>spring-boot-starter-actuator</artifactId>');
    expect(pom).toContain('<artifactId>micrometer-tracing-bridge-otel</artifactId>');
    expect(pom).toContain('<artifactId>opentelemetry-exporter-otlp</artifactId>');

    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('management.endpoint.health.probes.enabled=true');
    expect(properties).toContain('serviceReady');

    expect(
      tree.exists(
        'application/rest/executable/src/main/java/com/example/rest/observability/ServiceReadyHealthIndicator.java',
      ),
    ).toBe(true);
    expect(read(tree, 'README.md')).toContain('/actuator/health/readiness');
  });
});

describe('observability on the Micronaut REST skeleton (Kotlin, Gradle)', () => {
  it('renders Kotlin sources and patches logback with the MDC pattern', async () => {
    const { tree, cwd } = await installBoth([
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    expect(
      tree.exists(
        'application/rest/executable/src/main/kotlin/com/example/rest/observability/RequestContextFilter.kt',
      ),
    ).toBe(true);
    const build = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(build).toContain('io.micronaut:micronaut-management');
    expect(build).toContain('io.micronaut.tracing:micronaut-tracing-opentelemetry-http');

    const logback = read(tree, 'application/rest/executable/src/main/resources/logback.xml');
    expect(logback).toContain('%X{correlationId}');
    expect(read(tree, 'README.md')).toContain('/health/readiness');
  });
});

describe('observability on the Go HTTP skeleton', () => {
  it('renders the observability package and wires main.go at its anchors', async () => {
    const { tree, cwd, actions } = await installBoth([
      'lang.go',
      'pkg.go-modules',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    for (const file of ['context.go', 'logging.go', 'middleware.go', 'otel.go', 'health.go']) {
      expect(tree.exists(`internal/app/observability/${file}`), file).toBe(true);
    }
    const main = read(tree, 'cmd/http/main.go');
    expect(main).toContain('observability.SetupLogging()');
    expect(main).toContain('observability.SetupOTel(context.Background()');
    expect(main).toContain('health.Register(mux)');
    expect(main).toContain('"context"');
    expect(main).toContain('example.com/walking-skeleton/internal/app/observability');

    expect(actions.map((a) => a.id)).toContain(GO_OBSERVABILITY_ID);
    expect(read(tree, 'README.md')).toContain('/health/ready');
  });

  it('leaves a hand-edited main.go unchanged (drift guard)', () => {
    const drifted = 'package main\n\nfunc main() { custom() }\n';
    expect(patchMain(drifted, 'example.com/walking-skeleton', 'demo')).toBe(drifted);
  });
});

describe('observability on the Rust HTTP skeleton', () => {
  it('renders the modules and patches Cargo.toml + main.rs', async () => {
    const { tree, cwd } = await installBoth([
      'lang.rust',
      'pkg.cargo',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    expect(tree.exists('src/bin/http/observability.rs')).toBe(true);
    expect(tree.exists('src/bin/http/health.rs')).toBe(true);

    const cargo = read(tree, 'Cargo.toml');
    expect(cargo).toContain('tracing-opentelemetry');
    expect(cargo).toContain('opentelemetry-otlp');
    expect(cargo).toContain('uuid');

    const main = read(tree, 'src/bin/http/main.rs');
    expect(main).toContain('mod observability;');
    expect(main).toContain('observability::init("walking-skeleton");');
    expect(main).toContain('health::router(ready.clone())');
    expect(read(tree, 'README.md')).toContain('/health/ready');
  });
});

describe('observability on the TypeScript HTTP skeleton', () => {
  it('renders the observability modules and patches package.json + main.ts', async () => {
    const { tree, cwd, actions } = await installBoth([
      'lang.typescript',
      'runtime.node',
      'pkg.npm',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    cwds.push(cwd);

    for (const file of ['context.ts', 'logger.ts', 'otel.ts', 'http.ts']) {
      expect(tree.exists(`application/rest/src/observability/${file}`), file).toBe(true);
    }
    expect(tree.exists('application/rest/tests/observability.test.ts')).toBe(true);

    const pkg = JSON.parse(read(tree, 'application/rest/package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@opentelemetry/sdk-node']).toBeDefined();
    expect(pkg.dependencies['@opentelemetry/api']).toBeDefined();

    const main = read(tree, 'application/rest/src/main.ts');
    expect(main).toContain("import './observability/otel.ts';");
    expect(main).toContain('instrument(createGreetServer(mediator))');
    expect(main).toContain('markReady();');

    expect(actions.map((a) => a.id)).toContain(TS_OBSERVABILITY_ID);
    expect(read(tree, 'README.md')).toContain('/health/ready');
  });

  it('patch helpers are idempotent and drift-guarded', () => {
    const patched = addOtelDependencies('{\n  "dependencies": {\n    "a": "1"\n  }\n}\n');
    expect(addOtelDependencies(patched)).toBe(patched);

    const drifted = 'console.log("rewritten by hand");\n';
    expect(patchMainTs(drifted)).toBe(drifted);
  });
});
