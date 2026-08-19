/**
 * Handler for `keel.toolchain-install` — the provisioning engine's
 * write path: resolve the manager dial, render every member's native
 * config from the block, then run each member's own idempotent
 * install.
 *
 * Idempotent end to end: an unchanged render writes nothing, the
 * install invocations are no-ops when everything is satisfied, and
 * the manager choice is recorded on first resolution and followed
 * afterwards — run it on a new laptop, a teammate's clone, a CI
 * runner, or after a pin bump, and the result is the same working
 * environment. When a member's binary is absent the configs are
 * still rendered and the report carries the bootstrap guidance — a
 * loud, graceful message, never a silent skip and never an installer
 * of keel's own. A combination is all-or-nothing for the same
 * reason a partial choice is never offered: running one member of
 * `nvm+corepack` is the half-install the coverage invariant exists
 * to prevent.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import type {
  RenderedConfig,
  ToolchainInstallCommand,
  ToolchainInstallReport,
} from '../contract/commands.js';
import type { ToolchainDial } from './dial.js';
import {
  absentMembers,
  bootstrapFor,
  configState,
  loadBlock,
  provisionedTools,
  renderChoice,
  resolveChoice,
  resolveSpellings,
  type ToolchainDeps,
} from './engine.js';

/** Executes {@link ToolchainInstallCommand}s. */
export class ToolchainInstallHandler implements Handler<ToolchainInstallCommand> {
  /**
   * The dial is injectable for tests; the shipped one is the default
   * and is what every real run resolves against.
   */
  constructor(
    private readonly deps: ToolchainDeps,
    private readonly dial?: ToolchainDial,
  ) {}

  supports(action: Action): action is ToolchainInstallCommand {
    return action.kind === 'keel.toolchain-install';
  }

  async handle(command: ToolchainInstallCommand): Promise<Result<ToolchainInstallReport>> {
    const cwd = path.resolve(command.cwd);
    const loaded = await loadBlock(this.deps, cwd);
    if (!loaded.ok) return loaded;
    const { manifest, block } = loaded.value;

    const resolved = await resolveChoice(
      this.deps,
      block,
      { requested: command.provider, interactive: command.interactive },
      this.dial,
    );
    if (!resolved.ok) return resolved;
    const { choice, isNew } = resolved.value;

    const tree = this.deps.trees(cwd);
    // The presence probe moves ahead of the render: resolving a
    // prefix means asking the manager, and only a present one can be
    // asked. An absent member still gets its config rendered — that
    // is N.2's guarantee — just from what the file already carries.
    const absent = absentMembers(this.deps, choice, cwd);
    const resolution = resolveSpellings(
      this.deps,
      choice,
      block.needs,
      cwd,
      tree,
      new Set(absent.map((member) => member.id)),
    );

    let rendered;
    try {
      rendered = renderChoice(choice, block.needs, tree, resolution.spellings);
    } catch (cause) {
      return err(
        new DomainError(
          `${choice.id} cannot render its config: ${cause instanceof Error ? cause.message : String(cause)}`,
          'keel.toolchain-render-failed',
          { cause },
        ),
      );
    }

    const configs: RenderedConfig[] = [];
    for (const { configs: files } of rendered) {
      for (const config of files) {
        const state = configState(tree, config);
        if (state.changed) tree.write(config.path, config.content);
        configs.push(state);
      }
    }
    if (configs.some((config) => config.changed)) await tree.commit();

    if (isNew) {
      await this.deps.manifests.write(projectScopeRoot(cwd), {
        ...manifest,
        toolchain: { ...block, provider: choice.id },
      });
    }

    const base = {
      provider: choice.id,
      members: choice.members.map((member) => member.id),
      choiceRecorded: isNew,
      configs,
      tools: provisionedTools(choice, block.needs, resolution.spellings),
      unresolved: resolution.unresolved,
    };
    if (absent.length > 0) {
      return ok({
        ...base,
        managerPresent: false,
        installed: false,
        bootstrap: bootstrapFor(absent),
      });
    }

    for (const { member, needs } of rendered) {
      for (const step of member.install(needs)) {
        const run = this.deps.processes.run(step.command, step.args, { cwd });
        if (run.status !== 0 && step.tolerateFailure !== true) {
          const detail = (run.stderr || run.stdout).trim();
          return err(
            new DomainError(
              `${step.command} ${step.args.join(' ')} failed (exit ${String(run.status)})${detail ? `: ${detail}` : ''}`,
              'keel.toolchain-install-failed',
            ),
          );
        }
      }
    }
    return ok({ ...base, managerPresent: true, installed: true });
  }
}
