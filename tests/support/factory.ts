/**
 * The test Factory per the binding spec (§3): wires the system under
 * test behind its port interfaces. Tests depend on a Scenario (their
 * own data), this Factory, and the dispatched port — never on
 * concrete handler wiring.
 *
 * Defaults are the real filesystem-facing adapters over a temp cwd
 * (these are integration-style flows exercising real assets and real
 * git); every port is overridable with the shipped fakes.
 */

import type { Mediator } from '../../src/domain/kernel/mediator.js';
import type { Result } from '../../src/domain/kernel/result.js';
import { DomainError } from '../../src/domain/kernel/result.js';
import { RegistryMediator } from '../../src/domain/core/mediator.js';
import { NewProjectHandler } from '../../src/domain/core/handlers/new-project.js';
import { AddModuleHandler } from '../../src/domain/core/handlers/add-module.js';
import { AddVerticalHandler } from '../../src/domain/core/handlers/add-vertical.js';
import { LinkPeerHandler } from '../../src/domain/core/handlers/link-peer.js';
import { ToolchainCheckHandler } from '../../src/domain/toolchain/core/check.js';
import { ToolchainInstallHandler } from '../../src/domain/toolchain/core/install.js';
import type { InstallDeps } from '../../src/domain/core/handlers/deps.js';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { FakeClock } from '../../src/infrastructure/commons/fake-clock.js';
import { FakeLogger } from '../../src/infrastructure/commons/fake-logger.js';
import { fsManifestStore } from '../../src/infrastructure/manifest/fs-manifest-store.js';
import { spawnProcessRunner } from '../../src/infrastructure/process/spawn-process-runner.js';
import { rejectingPrompt } from '../../src/infrastructure/prompt/fake.js';
import { ejsTemplateSource } from '../../src/infrastructure/template/ejs-template-source.js';
import { fsTreeFactory } from '../../src/infrastructure/tree/fs-tree.js';

/** The instant every factory-built clock is pinned to. */
export const PINNED_NOW = '2026-04-26T12:00:00Z';

/** Builds a mediator over the install handlers with overridable ports. */
export function installMediator(overrides: Partial<InstallDeps> = {}): Mediator {
  const deps: InstallDeps = {
    trees: fsTreeFactory,
    manifests: fsManifestStore,
    prompt: rejectingPrompt,
    clock: new FakeClock(PINNED_NOW),
    logger: new FakeLogger(),
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    keelVersion: '0.4.0-alpha',
    ...overrides,
  };
  return new RegistryMediator([
    new NewProjectHandler(deps),
    new AddVerticalHandler(deps),
    new AddModuleHandler(deps),
    new LinkPeerHandler(deps),
    new ToolchainInstallHandler(deps),
    new ToolchainCheckHandler(deps),
  ]);
}

/**
 * Deferred-action runner that skips actions whose id is in `skip`
 * and passes the rest to the real runner. Lets a flow exercise
 * `git-init` end-to-end while sidestepping `gradle wrapper`.
 */
export function runActionsExcept(skip: readonly string[]) {
  const blocked = new Set(skip);
  return (inputs: RunActionsInputs): Promise<void> =>
    runActions({ ...inputs, actions: inputs.actions.filter((a) => !blocked.has(a.id)) });
}

/** Unwraps an Ok result or fails the test with the error message. */
export function expectOk<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok result, got error: ${result.error.message}`);
  return result.value;
}

/** Unwraps an Err result or fails the test. */
export function expectErr<T>(result: Result<T>): DomainError {
  if (result.ok) throw new Error('expected err result, got ok');
  return result.error;
}
