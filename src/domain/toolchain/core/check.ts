/**
 * Handler for `keel.toolchain-check` — the provisioning engine's
 * read path: report which declared needs are satisfied and which are
 * missing, without touching anything. No file is written, no install
 * runs; the provider is only *asked* (its status invocation), never
 * told.
 *
 * Two facts feed the verdict besides per-tool status: whether the
 * provider's binary is present at all (absent → every tool is
 * `unknown`, with the bootstrap guidance in the report), and whether
 * the on-disk config still matches a fresh render of the block — a
 * stale `mise.toml` satisfies yesterday's declaration, so drift
 * counts against `satisfied` even when every tool it names is
 * installed.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { ToolchainCheckQuery, ToolchainCheckReport } from '../contract/commands.js';
import { loadNeeds, managerPresent, provisionedTools, type ToolchainDeps } from './engine.js';
import { miseProvider } from './mise.js';
import type { ToolchainProvider } from './provider.js';

/** Executes {@link ToolchainCheckQuery}s. */
export class ToolchainCheckHandler implements Handler<ToolchainCheckQuery> {
  /** Injectable for the same reasons as the install handler's. */
  constructor(
    private readonly deps: ToolchainDeps,
    private readonly provider: ToolchainProvider = miseProvider,
  ) {}

  supports(action: Action): action is ToolchainCheckQuery {
    return action.kind === 'keel.toolchain-check';
  }

  async handle(query: ToolchainCheckQuery): Promise<Result<ToolchainCheckReport>> {
    const cwd = path.resolve(query.cwd);
    const needs = await loadNeeds(this.deps, cwd, this.provider);
    if (!needs.ok) return needs;

    const config = this.provider.render(needs.value);
    const tree = this.deps.trees(cwd);
    const configUpToDate = tree.read(config.path)?.toString('utf8') === config.content;
    const tools = provisionedTools(this.provider, needs.value);
    const base = { provider: this.provider.id, configPath: config.path, configUpToDate };

    if (!managerPresent(this.deps, this.provider, cwd)) {
      return ok({
        ...base,
        managerPresent: false,
        tools: tools.map((tool) => ({ ...tool, status: 'unknown' as const })),
        satisfied: false,
        bootstrap: this.provider.bootstrap,
      });
    }

    const run = this.deps.processes.run(this.provider.status.command, this.provider.status.args, {
      cwd,
    });
    if (run.status !== 0) {
      const detail = (run.stderr || run.stdout).trim();
      return err(
        new DomainError(
          `${this.provider.id} could not report tool status (exit ${String(run.status)})${detail ? `: ${detail}` : ''}`,
          'keel.toolchain-check-failed',
        ),
      );
    }
    let statuses: ReadonlyMap<string, boolean>;
    try {
      statuses = this.provider.parseStatus(run.stdout);
    } catch (cause) {
      return err(
        new DomainError(
          `unreadable ${this.provider.id} status output: ${cause instanceof Error ? cause.message : String(cause)}`,
          'keel.toolchain-check-failed',
          { cause },
        ),
      );
    }

    const checked = tools.map((tool) => ({
      ...tool,
      status:
        statuses.get(tool.spelledName) === true ? ('satisfied' as const) : ('missing' as const),
    }));
    return ok({
      ...base,
      managerPresent: true,
      tools: checked,
      satisfied: configUpToDate && checked.every((tool) => tool.status === 'satisfied'),
    });
  }
}
