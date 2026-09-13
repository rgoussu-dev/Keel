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
  it('fills the stack section under the preamble and wires the hook (Quarkus REST, basic)', async () => {
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
    expect(agents).toContain('## Stack — Quarkus REST on Gradle (basic)');
    expect(agents).toContain('`./gradlew :application:rest:executable:quarkusDev`');
    expect(agents).toContain('<!-- keel:stack-runbook:end -->');
    // The section lands in the slot under the preamble, not appended
    // after the conventions: an agent orients before it reads rules.
    expect(agents.indexOf('<!-- keel:stack-runbook:begin -->')).toBeLessThan(
      agents.indexOf('## Architecture'),
    );
    // Only this language's stance and this layout's map ship.
    expect(agents).toContain('**Dispatch.** Registry Mediator.');
    expect(agents).toContain('`@DomainHandler`');
    expect(agents).toContain(
      '`application/rest/executable/` — resources, error mappers and `MediatorProducer`',
    );
    expect(agents).toContain('`infrastructure/<port>/{<impl>,fake}/`');
    expect(agents).not.toContain('modules/<ctx>');

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
    expect(agents).toContain('## Stack — Spring Boot REST on Maven (modulith)');
    expect(agents).toContain('`./mvnw -am -pl application/api spring-boot:run`');
    expect(agents).toContain('`platform/kernel/`');
    expect(agents).toContain(
      '`application/api/` — the REST assembly (package `application.api`): `MediatorConfig` builds the mediator, `<Ctx>Wiring` wires each context’s service and gateways into it.',
    );
    expect(agents).toContain('`modules/<ctx>/infra/<peer>-gateway/` — `<Peer>Gateway`');
    expect(agents).toContain('`migrations/sql/V<n>__<name>.sql`');
    expect(agents).not.toContain('`modules/<ctx>/user-side/cli/`');
    expect(read(tree, '.claude/hooks/pre-commit-format.sh')).toContain(
      './mvnw --batch-mode verify',
    );
  });

  it('gives a combo stack a command and a check for both entrypoints (Quarkus CLI + REST, Maven)', async () => {
    const tree = await install(
      [
        'lang.java',
        'runtime.jvm',
        'framework.quarkus',
        'arch.hexagonal',
        'arch.cli',
        'arch.server-http',
        'pkg.maven',
      ],
      {
        'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'demo', basePackage: 'x.y' },
        'walking-skeleton/quarkus-cli-bootstrap': { projectName: 'demo', basePackage: 'x.y' },
      },
    );
    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('## Stack — Quarkus REST + CLI on Maven (basic)');
    expect(agents).toContain(
      '| Run (dev) | `./mvnw -am -pl application/rest/executable quarkus:dev` |',
    );
    expect(agents).toContain('| Probe |');
    expect(agents).toContain(
      '| Run (cli) | `./mvnw -am -pl application/cli quarkus:dev -Dquarkus.args="hello --name World"` |',
    );
    const skill = read(tree, '.claude/skills/run/SKILL.md');
    expect(skill).toContain('application/rest/executable quarkus:dev');
    expect(skill).toContain('4. Run the CLI and read its output');
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
    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('`./gradlew :application:cli:run --args="hello --name World"`');
    expect(agents).toContain('`application/cli/` — picocli commands, `Main` and `MediatorFactory`');
    expect(agents).not.toContain('application/rest');
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
    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('**Dispatch.** No mediator object');
    expect(agents).toContain('`internal/app/<channel>/` — driving adapters (`resthttp`)');
    expect(agents).not.toContain('internal/modules');
  });

  it('names one build per Go entrypoint on a combo', async () => {
    const tree = await install(
      ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli', 'arch.server-http'],
      {
        'walking-skeleton/go-bootstrap': {
          projectName: 'shipper',
          modulePath: 'example.com/shipper',
        },
      },
    );
    const agents = read(tree, 'AGENTS.md');
    expect(agents).toContain('## Stack — Go CLI + HTTP (basic)');
    expect(agents).toContain(
      'Binaries build to `bin/`: `go build -o bin/shipper-http ./cmd/http` and `go build -o bin/shipper ./cmd/cli`.',
    );
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
    expect(agents).toContain('**Dispatch.** Per-use-case driving-port traits');
    expect(agents).toContain(
      '`application/<unit>/` — the bin crates (`http`; bins `ledger-http`): `src/main.rs` assembles, `src/<ctx>.rs` wires one context’s service and gateways into it.',
    );
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
    expect(agents).toContain('web-components SPA on Vite (npm, basic)');
    expect(agents).toContain('import map');
    expect(agents).toContain(
      '**Dispatch.** No mediator: per-use-case driving ports delivered by typed context keys',
    );
    expect(agents).toContain('`domain/domain-api/src/`');
  });

  it('swaps the runbook to the CLI shape on ts-cli', async () => {
    const ts = await install(
      ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.cli', 'pkg.npm'],
      { 'walking-skeleton/ts-cli-bootstrap': { projectName: 'tool' } },
    );
    const agents = read(ts, 'AGENTS.md');
    expect(agents).toContain('TypeScript CLI on Node (npm, basic)');
    expect(agents).toContain('node application/cli/src/main.ts --name World');
    expect(agents).toContain(
      '`application/<unit>/src/main.ts` — the composition root (`cli`), transport beside it (`cli.ts`).',
    );
    expect(agents).toContain('erasableSyntaxOnly');
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
          ...(stack.buildSystems?.[0] ? [stack.buildSystems[0].tag] : []),
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
