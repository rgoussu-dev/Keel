/**
 * Shared scenario builder for the provisioning-context tests: a
 * project under a fake tree, a manifest with (or without) a
 * `toolchain` block, and a scripted process runner — every port a
 * shipped fake, per the binding spec §3.
 */

import { projectScopeRoot, emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import type { ToolchainBlock } from '../../../src/domain/contract/toolchain.js';
import type { ToolchainDeps } from '../../../src/domain/toolchain/core/engine.js';
import { FakeManifestStore } from '../../../src/infrastructure/manifest/fake.js';
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
  readonly deps: ToolchainDeps;
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
  } = {},
): Promise<Scenario> {
  const tree = new FakeTree();
  const manifests = new FakeManifestStore();
  const processes = new FakeProcessRunner(options.scripts ?? []);
  if (options.initialised !== false) {
    const base = emptyManifestV2('2026-08-19T12:00:00Z', '0.0.0-test');
    const block = options.block === undefined ? JVM_BLOCK : options.block;
    await manifests.write(
      projectScopeRoot(CWD),
      block === null ? base : { ...base, toolchain: block },
    );
  }
  return { tree, manifests, processes, deps: { trees: () => tree, manifests, processes } };
}
