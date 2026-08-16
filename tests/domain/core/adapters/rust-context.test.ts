/**
 * Tests for the Rust bounded-context adapter — what
 * `keel add module <name>` writes into a Rust modulith.
 *
 * These hold the facts that are checkable from emitted text: which
 * crates exist, what each `Cargo.toml` declares and — the load-bearing
 * one — what it deliberately does not. Whether the result *compiles*
 * is not assertable here and is not tried; that is
 * `tests/e2e/add-module-rust.test.ts`, which builds three contexts and
 * proves the wall with a real `cargo` failure.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { addModuleCommand, newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-rust-context-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function scaffold(withPeerContext = false): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'rust-cli',
        answers: {},
        interactive: false,
        dryRun: false,
        moduleLayout: 'modulith',
        withPeerContext,
      }),
    ),
  );
}

async function addModule(module: string, consumes?: string): Promise<void> {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      addModuleCommand({
        cwd,
        module,
        ...(consumes === undefined ? {} : { consumes }),
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
}

const read = (rel: string): Promise<string> => fs.readFile(path.join(cwd, rel), 'utf8');
const exists = (rel: string): Promise<boolean> => fs.pathExists(path.join(cwd, rel));

describe('the Rust added context', () => {
  it('emits a seam of its own, which the peer context has none of', async () => {
    await scaffold(true);
    await addModule('ordering');

    expect(await exists('modules/ordering/user-side/service/src/lib.rs')).toBe(true);
    // The asymmetry this whole feature turns on, asserted rather than
    // assumed: --with-peer-context emits a pure consumer.
    expect(await exists('modules/guestbook/user-side/service/src/lib.rs')).toBe(false);
  });

  it('emits no gateway when nothing was consumed', async () => {
    await scaffold();
    await addModule('ordering');

    const infra = path.join(cwd, 'modules/ordering/infra');
    expect(await fs.pathExists(infra)).toBe(false);
  });

  it('names the driving port <Name>Port, so the seam can own <Name>', async () => {
    await scaffold();
    await addModule('ordering');

    expect(await read('modules/ordering/domain/contract/src/lib.rs')).toMatch(
      /pub trait OrderingPort/,
    );
    expect(await read('modules/ordering/user-side/service/src/lib.rs')).toMatch(
      /pub struct Ordering \{/,
    );
  });

  it('spells its seam the way the skeleton spells its own', async () => {
    await scaffold();
    await addModule('ordering');
    const seam = await read('modules/ordering/user-side/service/src/lib.rs');

    // greeting publishes GreetingService::greeting_for -> Greeting /
    // GreetingUnavailable. Matching that shape is what lets one
    // gateway template reach any context.
    expect(seam).toMatch(/pub trait OrderingService/);
    expect(seam).toMatch(/fn ordering_for\(/);
    expect(seam).toMatch(/pub struct OrderingUnavailable/);
  });

  describe('the gateway', () => {
    it('declares the consumed seam crate and not its domain', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      const manifest = await read('modules/ordering/infra/greeting-gateway/Cargo.toml');

      expect(manifest).toMatch(/greeting-user-side-service = \{ path/);
      // The line whose absence is the whole point of the crate.
      expect(manifest).not.toMatch(/^greeting-domain-contract/m);
    });

    it('declares the driven port in the consuming context, not the consumed one', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');

      expect(await read('modules/ordering/domain/contract/src/lib.rs')).toMatch(
        /pub trait GreetingClient/,
      );
    });
  });

  describe('the assembly', () => {
    it('declares the wiring module, without which Rust compiles nothing', async () => {
      await scaffold();
      await addModule('ordering');

      expect(await read('application/cli/src/main.rs')).toMatch(/^mod ordering;$/m);
    });

    it('adds each context to the workspace members exactly once', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const root = await read('Cargo.toml');

      expect(root.match(/"modules\/ordering\/domain\/contract"/g)).toHaveLength(1);
      expect(root.match(/"modules\/shipping\/domain\/contract"/g)).toHaveLength(1);
    });

    /**
     * The bug a second `keel add module` finds and a first never
     * does. Both runs want `platform-kernel` in the assembly, and
     * appending it twice is a duplicate key Cargo rejects outright —
     * so the dependency patch merges per key rather than all or
     * nothing.
     */
    it('does not duplicate a dependency the previous context already added', async () => {
      await scaffold();
      await addModule('ordering');
      await addModule('shipping');
      const assembly = await read('application/cli/Cargo.toml');

      expect(assembly.match(/^platform-kernel = /gm)).toHaveLength(1);
    });

    /**
     * The skeleton's core takes no dependencies, so its seam
     * constructor takes no arguments; an added context's seam is built
     * over a core that may itself hold a gateway, so it is built by
     * that context's own wiring module. Only visible with three
     * contexts.
     */
    it('reaches the skeleton by its own constructor and an added context by its wiring', async () => {
      await scaffold();
      await addModule('ordering', 'greeting');
      await addModule('shipping', 'ordering');

      expect(await read('application/cli/src/ordering.rs')).toMatch(/new_greeting_service\(\)/);
      expect(await read('application/cli/src/shipping.rs')).toMatch(
        /crate::ordering::wire_service\(\)/,
      );
    });
  });

  it('refuses a second context of the same name', async () => {
    await scaffold();
    await addModule('ordering');

    const mediator = installMediator({ runDeferred: discardDeferred() });
    const error = expectErr(
      await mediator.dispatch(
        addModuleCommand({
          cwd,
          module: 'ordering',
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );

    expect(error.message).toMatch(/already has a bounded context named 'ordering'/);
  });
});
