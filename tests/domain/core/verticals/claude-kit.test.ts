/**
 * Tests for the walking-skeleton's claude-kit family adapters. The
 * install blocks prove the emitted `.claude/` shape and the runbook
 * addendum against representative tag sets — commands resolved from
 * the build-system and layout tags, never minted per `pkg.*` tag —
 * and the coverage block proves every non-composite stack's tag set
 * resolves exactly one family adapter, so no stack can silently
 * lose its kit.
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
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { resolveVertical } from '../../../../src/domain/core/resolver.js';
import { CLAUDE_KIT_DIMENSION } from '../../../../src/domain/core/adapters/claude-kit.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

async function install(
  tags: string[],
  answers: Record<string, Record<string, string>> = {},
): Promise<FsTree> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-claude-kit-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  await installVertical({
    vertical: walkingSkeletonVertical,
    manifest: { ...emptyManifestV2('2026-08-18T00:00:00Z', '0.5.0-alpha'), tags, answers },
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-18T12:00:00Z',
  });
  return tree;
}

const read = (tree: FsTree, p: string): string => tree.read(p)?.toString() ?? '';

describe('claude-kit on the JVM family', () => {
  it('appends the Gradle runbook under sentinels and wires the hook (Quarkus REST, basic)', async () => {
    const tree = await install(
      [
        'lang.java',
        'runtime.jvm',
        'framework.quarkus',
        'arch.hexagonal',
        'arch.server-http',
        'pkg.gradle',
      ],
      { 'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'demo', basePackage: 'x.y' } },
    );

    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('<!-- keel:stack-runbook:begin -->');
    expect(agents).toContain('## Stack runbook — Quarkus REST on Gradle');
    expect(agents).toContain('`./gradlew :application:rest:executable:quarkusDev`');
    expect(agents).toContain('<!-- keel:stack-runbook:end -->');

    const hook = read(tree, '.claude/hooks/pre-commit-format.sh');
    expect(hook).toContain('./gradlew build');
    expect(hook).not.toContain('git add');
    expect(read(tree, '.claude/settings.json')).toContain('pre-commit-format.sh');
    expect(read(tree, '.claude/skills/run/SKILL.md')).toContain(
      ':application:rest:executable:quarkusDev',
    );
  });

  it('spells Maven commands and the modulith assembly path (Spring REST, modulith)', async () => {
    const tree = await install(
      [
        'lang.java',
        'runtime.jvm',
        'framework.spring',
        'arch.hexagonal',
        'arch.server-http',
        'pkg.maven',
        'layout.modulith',
      ],
      { 'walking-skeleton/spring-rest-bootstrap': { projectName: 'demo', basePackage: 'x.y' } },
    );

    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('## Stack runbook — Spring Boot REST on Maven');
    expect(agents).toContain('`./mvnw -am -pl application/api spring-boot:run`');
    expect(agents).toContain('Modulith layout');
    expect(read(tree, '.claude/hooks/pre-commit-format.sh')).toContain(
      './mvnw --batch-mode verify',
    );
  });

  it('documents the CLI run per framework (Micronaut CLI, Gradle)', async () => {
    const tree = await install(
      [
        'lang.java',
        'runtime.jvm',
        'framework.micronaut',
        'arch.hexagonal',
        'arch.cli',
        'pkg.gradle',
      ],
      { 'walking-skeleton/micronaut-cli-bootstrap': { projectName: 'tool', basePackage: 'x.y' } },
    );
    expect(read(tree, 'AGENTS.md')).toContain(
      '`./gradlew :application:cli:run --args="hello --name World"`',
    );
  });
});

describe('claude-kit on the other families', () => {
  it('auto-formats with gofmt and runs the Go gate', async () => {
    const tree = await install(
      ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
      {
        'walking-skeleton/go-bootstrap': {
          projectName: 'shipper',
          modulePath: 'example.com/shipper',
        },
      },
    );
    const hook = read(tree, '.claude/hooks/pre-commit-format.sh');
    expect(hook).toContain('gofmt -w .');
    expect(hook).toContain('go build ./... && go test ./...');
    expect(hook).toContain('git add');
    expect(read(tree, '.claude/skills/run/SKILL.md')).toContain('go run ./cmd/http');
  });

  it('names the Rust bins and carries the seam rule under the modulith', async () => {
    const tree = await install(
      [
        'lang.rust',
        'pkg.cargo',
        'arch.hexagonal',
        'arch.server-http',
        'layout.modulith',
        'modules.peer-context',
      ],
      { 'walking-skeleton/rust-bootstrap': { projectName: 'ledger' } },
    );
    expect(read(tree, '.claude/skills/run/SKILL.md')).toContain('cargo run --bin ledger-http');
    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('only its own DTOs');
    expect(agents).toContain('exported_private_dependencies');
    expect(read(tree, '.claude/hooks/pre-commit-format.sh')).toContain('cargo fmt');
  });

  it('resolves the package manager for ts-http and the SPA', async () => {
    const ts = await install(
      ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http', 'pkg.pnpm'],
      { 'walking-skeleton/ts-http-bootstrap': { projectName: 'api' } },
    );
    expect(read(ts, '.claude/hooks/pre-commit-format.sh')).toContain(
      'pnpm run --if-present lint && pnpm run typecheck && pnpm test',
    );
    expect(read(ts, '.claude/skills/run/SKILL.md')).toContain('pnpm run dev:rest');

    const wc = await install(
      [
        'lang.typescript',
        'runtime.browser',
        'framework.web-components',
        'arch.hexagonal',
        'arch.spa',
        'pkg.npm',
      ],
      { 'walking-skeleton/wc-spa-bootstrap': { projectName: 'shop' } },
    );
    expect(read(wc, '.claude/hooks/pre-commit-format.sh')).toContain(
      'npm run lint --if-present && npm run typecheck && npm test',
    );
    const agents = read(wc, 'AGENTS.md');
    expect(agents).toContain('web-components SPA on Vite (npm)');
    expect(agents).toContain('import map');
  });

  it('swaps the runbook to the CLI shape on ts-cli', async () => {
    const ts = await install(
      ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.cli', 'pkg.npm'],
      { 'walking-skeleton/ts-cli-bootstrap': { projectName: 'tool' } },
    );
    const agents = read(ts, 'AGENTS.md');
    expect(agents).toContain('TypeScript CLI on Node (npm)');
    expect(agents).toContain('node application/cli/src/main.ts --name World');
    // The HTTP twin's commands must not leak in: the CLI scaffold has
    // no dev script and no server to probe.
    expect(agents).not.toContain('npm run dev');
    expect(agents).not.toContain('curl');
    const skill = read(ts, '.claude/skills/run/SKILL.md');
    expect(skill).toContain('node application/cli/src/main.ts --name World');
    expect(skill).toContain('exit code 2');
    expect(skill).not.toContain('curl');
  });
});

describe('claude-kit coverage across the stack registry', () => {
  it('resolves exactly one family adapter for every non-composite stack, on every layout', () => {
    for (const stack of Object.values(STACKS)) {
      if (stack.services) continue;
      for (const layout of stack.moduleLayouts ?? [{ tag: null }]) {
        const tags = [
          ...stack.tags,
          ...(stack.buildSystems ? [stack.buildSystems[0].tag] : []),
          ...(layout.tag ? [layout.tag] : []),
        ];
        const kit = resolveVertical(walkingSkeletonVertical, tags).filter((a) =>
          a.covers.includes(CLAUDE_KIT_DIMENSION),
        );
        expect(kit, `${stack.id} (${layout.tag ?? 'default'})`).toHaveLength(1);
      }
    }
  });
});
