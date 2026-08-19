/**
 * Handler for `keel.toolchain-check` — the provisioning engine's
 * read path: report which declared needs are satisfied and which are
 * missing, without touching anything. No file is written, no install
 * runs, and no question is asked; the providers are only *asked*
 * (their status invocations), never told.
 *
 * The choice is read, never resolved: the recorded answer when there
 * is one, the dial's default otherwise — a query that prompted or
 * recorded would not be one.
 *
 * Three facts feed the verdict besides per-tool status: whether each
 * member's binary is present at all (absent → its tools are
 * `unknown`, with the bootstrap guidance in the report), and whether
 * every on-disk config still matches a fresh render of the block — a
 * stale `mise.toml` satisfies yesterday's declaration, so drift
 * counts against `satisfied` even when every tool it names is
 * installed.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type {
  CheckedConfig,
  CheckedTool,
  ToolchainCheckQuery,
  ToolchainCheckReport,
} from '../contract/commands.js';
import type { ToolchainDial } from './dial.js';
import {
  bootstrapFor,
  checkedChoice,
  configState,
  loadBlock,
  memberPresent,
  provisionedTools,
  renderChoice,
  resolveSpellings,
  type ToolchainDeps,
} from './engine.js';

/** Executes {@link ToolchainCheckQuery}s. */
export class ToolchainCheckHandler implements Handler<ToolchainCheckQuery> {
  /** The dial is injectable for the same reasons as the install handler's. */
  constructor(
    private readonly deps: ToolchainDeps,
    private readonly dial?: ToolchainDial,
  ) {}

  supports(action: Action): action is ToolchainCheckQuery {
    return action.kind === 'keel.toolchain-check';
  }

  async handle(query: ToolchainCheckQuery): Promise<Result<ToolchainCheckReport>> {
    const cwd = path.resolve(query.cwd);
    const loaded = await loadBlock(this.deps, cwd);
    if (!loaded.ok) return loaded;
    const { block } = loaded.value;

    const picked = checkedChoice(block, this.dial);
    if (!picked.ok) return picked;
    const choice = picked.value;

    const tree = this.deps.trees(cwd);
    // Presence first, for the same reason as install's: a prefix is
    // resolved by asking the manager, and only a present one can be
    // asked. In the steady state nothing is asked at all — the
    // resolved config on disk answers, so `check` stays cheap.
    const absent = choice.members.filter((member) => !memberPresent(this.deps, member, cwd));
    const absentIds = new Set(absent.map((member) => member.id));
    const resolution = resolveSpellings(this.deps, choice, block.needs, cwd, tree, absentIds);

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
    const configs: CheckedConfig[] = rendered.flatMap(({ configs: files }) =>
      files.map((config) => ({ path: config.path, upToDate: !configState(tree, config).changed })),
    );

    const statuses = new Map<string, boolean>();
    for (const { member, needs } of rendered) {
      if (absentIds.has(member.id)) continue;
      // Ask about what the config actually names: a resolved
      // `temurin-25.0.4+7` is a sharper question than `temurin-25`.
      const spelled = needs.map((need) => {
        const base = member.spell(need);
        const concrete = resolution.spellings.get(need.tool);
        return concrete === undefined ? base : { ...base, version: concrete };
      });
      const run = this.deps.processes.run(member.status.command, member.status.args, { cwd });
      try {
        for (const [name, installed] of member.parseStatus(run, spelled)) {
          statuses.set(`${member.id}:${name}`, installed);
        }
      } catch (cause) {
        return err(
          new DomainError(
            `unreadable ${member.id} status output: ${cause instanceof Error ? cause.message : String(cause)}`,
            'keel.toolchain-check-failed',
            { cause },
          ),
        );
      }
    }

    const tools: CheckedTool[] = provisionedTools(choice, block.needs, resolution.spellings).map(
      (tool) => ({
        ...tool,
        status: absentIds.has(tool.provider)
          ? ('unknown' as const)
          : statuses.get(`${tool.provider}:${tool.spelledName}`) === true
            ? ('satisfied' as const)
            : ('missing' as const),
      }),
    );

    return ok({
      provider: choice.id,
      members: choice.members.map((member) => member.id),
      configs,
      managerPresent: absent.length === 0,
      tools,
      satisfied:
        absent.length === 0 &&
        resolution.unresolved.length === 0 &&
        configs.every((config) => config.upToDate) &&
        tools.every((tool) => tool.status === 'satisfied'),
      unresolved: resolution.unresolved,
      ...(absent.length > 0 ? { bootstrap: bootstrapFor(absent) } : {}),
    });
  }
}
