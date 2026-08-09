/**
 * End-to-end test for the `walking-skeleton` vertical against the
 * Rust tag sets. Asserts the rendered tree follows the house Rust
 * hexagonal reference (`src/bin/` deployment units, `src/domain.rs`
 * contract face over the compiler-hidden `src/domain/greet.rs` core,
 * `src/infra/` fakes), that the CLI and HTTP entrypoints compose —
 * separately and both at once — that the module-declaration and
 * Cargo.toml patches stitch the pieces together, and that the other
 * platforms' adapters stay out of Rust projects.
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
import { ResolutionError } from '../../../../src/domain/core/resolver.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.rust',
  'pkg.cargo',
  'arch.hexagonal',
  ...extra,
];

const sharedFiles = [
  '.gitignore',
  'README.md',
  'Cargo.toml',
  'src/lib.rs',
  'src/domain.rs',
  'src/domain/greet.rs',
  'tests/greet.rs',
  'src/domain/clock.rs',
  'src/infra.rs',
  'src/infra/clock_fake.rs',
];

const cliFiles = ['src/bin/cli/main.rs', 'src/bin/cli/app.rs'];

const httpFiles = ['src/bin/http/main.rs', 'src/bin/http/handler.rs'];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-rust-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-09T00:00:00Z', '0.5.0-alpha'),
    tags,
    answers: answers ?? {},
  };
  const result = await installVertical({
    vertical: walkingSkeletonVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-09T12:00:00Z',
  });
  return { tree, cwd, result };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('walking-skeleton vertical (Rust)', () => {
  it('renders the Rust CLI skeleton with default answers, without the other platforms', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    for (const p of [...sharedFiles, ...cliFiles]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('src/bin/http/main.rs')).toBeNull();
    expect(tree.read('go.mod')).toBeNull();
    expect(tree.read('build.gradle.kts')).toBeNull();
    expect(tree.read('package.json')).toBeNull();

    const cargoToml = tree.read('Cargo.toml')?.toString() ?? '';
    expect(cargoToml).toContain('name = "walking-skeleton"');
    expect(cargoToml).not.toContain('axum');
  });

  it('renders the Rust HTTP skeleton under arch.server-http with the axum dependencies', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    for (const p of [...sharedFiles, ...httpFiles]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('src/bin/cli/main.rs')).toBeNull();

    const cargoToml = tree.read('Cargo.toml')?.toString() ?? '';
    expect(cargoToml).toContain('axum = "0.8"');
    expect(cargoToml).toContain('[dev-dependencies]');
    expect(cargoToml).toContain('name = "walking-skeleton-http"');
    expect(cargoToml).toContain('path = "src/bin/http/main.rs"');
  });

  it('ships both deployment units when both arch tags are present', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli', 'arch.server-http'));
    cwds.push(cwd);

    for (const p of [...sharedFiles, ...cliFiles, ...httpFiles]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('### cli');
    expect(readme).toContain('### http');

    const cargoToml = tree.read('Cargo.toml')?.toString() ?? '';
    expect(cargoToml).toContain('path = "src/bin/cli/main.rs"');
    expect(cargoToml).toContain('path = "src/bin/http/main.rs"');
  });

  it('substitutes projectName (and the derived crate name) from sticky answers everywhere', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'), {
      'walking-skeleton/rust-bootstrap': { projectName: 'ship-it' },
    });
    cwds.push(cwd);

    const cargoToml = tree.read('Cargo.toml')?.toString() ?? '';
    expect(cargoToml).toContain('name = "ship-it"');

    const domainTest = tree.read('tests/greet.rs')?.toString() ?? '';
    expect(domainTest).toContain('use ship_it::domain::');

    const main = tree.read('src/bin/cli/main.rs')?.toString() ?? '';
    expect(main).toContain('use ship_it::domain::new_greeter;');

    const app = tree.read('src/bin/cli/app.rs')?.toString() ?? '';
    expect(app).toContain('const PROGRAM: &str = "ship-it";');

    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('# ship-it');
    expect(readme).toContain('./target/release/ship-it --name World');
  });

  it('keeps the Clock port with its consumer and stitches the modules in by patch', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const port = tree.read('src/domain/clock.rs')?.toString() ?? '';
    expect(port).toContain('pub trait Clock');

    const fake = tree.read('src/infra/clock_fake.rs')?.toString() ?? '';
    expect(fake).toContain('pub struct FakeClock');
    expect(fake).toContain('impl Clock for FakeClock');

    const domain = tree.read('src/domain.rs')?.toString() ?? '';
    expect(domain).toContain('pub mod clock;');
    expect(domain).toContain('pub use clock::Clock;');

    const lib = tree.read('src/lib.rs')?.toString() ?? '';
    expect(lib).toContain('pub mod infra;');
  });

  it('emits the binding spec at AGENTS.md with a CLAUDE.md pointer', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const agentsMd = tree.read('AGENTS.md')?.toString() ?? '';
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(tree.read('CLAUDE.md')?.toString()).toBe('@AGENTS.md\n');
  });

  it('emits a deferred cargo check action from the bootstrap', async () => {
    const { result, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const check = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/rust-bootstrap',
    );
    expect(check).toBeDefined();
    expect(check?.description).toBe('cargo check');
  });

  it('hard-fails when no arch tag selects an entrypoint', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-rust-fail-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-08-09T00:00:00Z', '0.5.0-alpha'),
      tags: baseTags(),
    };
    await expect(
      installVertical({
        vertical: walkingSkeletonVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-08-09T12:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });
});
