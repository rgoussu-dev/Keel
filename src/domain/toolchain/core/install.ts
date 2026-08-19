/**
 * Handler for `keel.toolchain-install` — the provisioning engine's
 * write path: render the provider's native config from the block,
 * then run the provider's own idempotent install.
 *
 * Idempotent end to end: an unchanged render writes nothing, and the
 * install invocation is a no-op when everything is satisfied — run
 * it on a new laptop, a teammate's clone, a CI runner, or after a
 * pin bump, and the result is the same working environment. When the
 * provider's binary is absent the config is still rendered and the
 * report carries the bootstrap guidance — a loud, graceful message,
 * never a silent skip and never an installer of keel's own.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { ToolchainInstallCommand, ToolchainInstallReport } from '../contract/commands.js';
import { loadNeeds, managerPresent, provisionedTools, type ToolchainDeps } from './engine.js';
import { miseProvider } from './mise.js';
import type { ToolchainProvider } from './provider.js';

/** Executes {@link ToolchainInstallCommand}s. */
export class ToolchainInstallHandler implements Handler<ToolchainInstallCommand> {
  /**
   * The provider is injectable for tests and for N.3's manager dial;
   * until that dial exists, mise is the one record and the default.
   */
  constructor(
    private readonly deps: ToolchainDeps,
    private readonly provider: ToolchainProvider = miseProvider,
  ) {}

  supports(action: Action): action is ToolchainInstallCommand {
    return action.kind === 'keel.toolchain-install';
  }

  async handle(command: ToolchainInstallCommand): Promise<Result<ToolchainInstallReport>> {
    const cwd = path.resolve(command.cwd);
    const needs = await loadNeeds(this.deps, cwd, this.provider);
    if (!needs.ok) return needs;

    const config = this.provider.render(needs.value);
    const tree = this.deps.trees(cwd);
    const configChanged = tree.read(config.path)?.toString('utf8') !== config.content;
    if (configChanged) {
      tree.write(config.path, config.content);
      await tree.commit();
    }

    const base = {
      provider: this.provider.id,
      configPath: config.path,
      configChanged,
      tools: provisionedTools(this.provider, needs.value),
    };
    if (!managerPresent(this.deps, this.provider, cwd)) {
      return ok({
        ...base,
        managerPresent: false,
        installed: false,
        bootstrap: this.provider.bootstrap,
      });
    }

    for (const step of this.provider.install) {
      const run = this.deps.processes.run(step.command, step.args, { cwd });
      if (run.status !== 0) {
        const detail = (run.stderr || run.stdout).trim();
        return err(
          new DomainError(
            `${step.command} ${step.args.join(' ')} failed (exit ${String(run.status)})${detail ? `: ${detail}` : ''}`,
            'keel.toolchain-install-failed',
          ),
        );
      }
    }
    return ok({ ...base, managerPresent: true, installed: true });
  }
}
