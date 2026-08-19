/**
 * Shared scenario builder for the provisioning-context tests: a
 * project under a fake tree, a manifest with (or without) a
 * `toolchain` block, a scripted process runner, and a scripted
 * prompt for the manager dial — every port a shipped fake, per the
 * binding spec §3.
 */

import { projectScopeRoot, emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import type { ToolchainBlock } from '../../../src/domain/contract/toolchain.js';
import type { ToolchainDeps } from '../../../src/domain/toolchain/core/engine.js';
import { FakeManifestStore } from '../../../src/infrastructure/manifest/fake.js';
import { FakePrompt } from '../../../src/infrastructure/prompt/fake.js';
import {
  FakeProcessRunner,
  type ScriptedProcess,
} from '../../../src/infrastructure/process/fake.js';
import { FakeTree } from '../../../src/infrastructure/tree/fake.js';

/** The project directory every scenario runs against. */
export const CWD = '/project';

/** A representative block: a Gradle-flavored JVM project. */
export const JVM_BLOCK: ToolchainBlock = {
  schemaVersion: 1,
  needs: [
    { tool: 'gradle', version: '9.4.1', source: 'jvm-gradle-wrapper' },
    { tool: 'jdk', version: '25', source: 'jvm-jdk' },
  ],
};

/** The npm-tagged TypeScript profile: Node alone (npm rides with it). */
export const TS_NPM_BLOCK: ToolchainBlock = {
  schemaVersion: 1,
  needs: [{ tool: 'node', version: '22', source: 'node-active-lts' }],
};

/** The pnpm-tagged TypeScript profile — where the combination appears. */
export const TS_PNPM_BLOCK: ToolchainBlock = {
  schemaVersion: 1,
  needs: [
    { tool: 'node', version: '22', source: 'node-active-lts' },
    { tool: 'pnpm', version: '10.33.0', source: 'ts-pnpm' },
  ],
};

/** The Go profile — where the dial offers the ecosystem's own no-op. */
export const GO_BLOCK: ToolchainBlock = {
  schemaVersion: 1,
  needs: [{ tool: 'go', version: '1.24', source: 'go-toolchain' }],
};

/** The Rust profile, whose need the scaffolds pin as a bare major. */
export const RUST_BLOCK: ToolchainBlock = {
  schemaVersion: 1,
  needs: [{ tool: 'rust', version: '1', source: 'image-rust' }],
};

/** A `go.mod` as the Go scaffolds emit it — go-native's file. */
export const GO_MOD = 'module example.com/demo\n\ngo 1.24\n';

/** A `package.json` as the TS scaffolds emit it — corepack's file. */
export const PACKAGE_JSON = '{\n  "name": "demo",\n  "private": true\n}\n';

/** Scripts the presence probe as "binary not on PATH". */
export const MISE_ABSENT: ScriptedProcess = {
  command: 'mise',
  argsPrefix: ['--version'],
  result: { status: null, startFailure: { code: 'ENOENT', message: 'spawn mise ENOENT' } },
};

/** `mise ls --current --json` output over the {@link JVM_BLOCK} tools. */
export function miseLs(entries: Record<string, boolean>): ScriptedProcess {
  const payload = Object.fromEntries(
    Object.entries(entries).map(([name, installed]) => [
      name,
      [{ version: 'x', requested_version: 'x', installed, active: installed }],
    ]),
  );
  return { command: 'mise', argsPrefix: ['ls'], result: { stdout: JSON.stringify(payload) } };
}

export interface Scenario {
  readonly tree: FakeTree;
  readonly manifests: FakeManifestStore;
  readonly processes: FakeProcessRunner;
  readonly prompt: FakePrompt;
  readonly deps: ToolchainDeps;
}

/** The block the scenario's manifest carries, after the run. */
export async function recordedBlock(s: Scenario): Promise<ToolchainBlock | undefined> {
  return (await s.manifests.read(projectScopeRoot(CWD)))?.toolchain;
}

/**
 * Builds the ports. `block: null` means an initialised project whose
 * manifest declares no toolchain; `initialised: false` means no keel
 * project at all.
 */
export async function scenario(
  options: {
    readonly block?: ToolchainBlock | null;
    readonly initialised?: boolean;
    readonly scripts?: readonly ScriptedProcess[];
    /** Scripted prompt answers, keyed by question id. */
    readonly answers?: Readonly<Record<string, string>>;
  } = {},
): Promise<Scenario> {
  const tree = new FakeTree();
  const manifests = new FakeManifestStore();
  const processes = new FakeProcessRunner(options.scripts ?? []);
  const prompt = new FakePrompt(options.answers ?? {});
  if (options.initialised !== false) {
    const base = emptyManifestV2('2026-08-19T12:00:00Z', '0.0.0-test');
    const block = options.block === undefined ? JVM_BLOCK : options.block;
    await manifests.write(
      projectScopeRoot(CWD),
      block === null ? base : { ...base, toolchain: block },
    );
  }
  return {
    tree,
    manifests,
    processes,
    prompt,
    deps: { trees: () => tree, manifests, processes, prompt },
  };
}
