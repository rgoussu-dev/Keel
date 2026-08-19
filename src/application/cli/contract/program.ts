/**
 * The CLI's interface adapter — maps commander input to concrete
 * commands, dispatches them through the Mediator, and maps the
 * `Result` back to transport shape (rendered plan on success, thrown
 * error → exit code 1 in the executable). Zero business logic.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { Mediator } from '../../../domain/kernel/mediator.js';
import type { Result } from '../../../domain/kernel/result.js';
import type { Logger } from '../../../domain/contract/ports/logger.js';
import {
  addModuleCommand,
  addVerticalCommand,
  linkPeerCommand,
  newProjectCommand,
  type InstallReport,
  type RepoLayout,
} from '../../../domain/contract/commands.js';
import {
  toolchainCheckQuery,
  toolchainInstallCommand,
  type ToolchainCheckReport,
  type ToolchainInstallReport,
} from '../../../domain/toolchain/contract/commands.js';

/** What the composition root wires into the CLI adapter. */
export interface CliDeps {
  readonly mediator: Mediator;
  readonly logger: Logger;
  /** Version string shown by `keel --version`. */
  readonly version: string;
  /** Stack ids listed in `keel new`'s help text. */
  readonly availableStacks: readonly string[];
  /** Vertical ids listed in `keel add`'s help text. */
  readonly availableVerticals: readonly string[];
  /** Working directory commands run against; defaults to `process.cwd()`. */
  readonly cwd?: () => string;
}

/**
 * The first argument of `keel add` that means "a bounded context"
 * rather than a vertical id.
 *
 * `keel add <vertical>` and `keel add module <name>` share one
 * commander command because commander matches subcommands by name:
 * registering `add` with a nested `module` would stop `keel add
 * persistence` resolving at all. So the branch is here, on a reserved
 * first argument, and `module` is thereby a name no vertical may take
 * — which costs nothing, since a vertical is a capability dimension
 * and `module` names no dimension.
 */
const MODULE_TARGET = 'module';

/** Builds the commander program over the wired mediator. */
export function buildProgram(deps: CliDeps): Command {
  const cwd = deps.cwd ?? (() => process.cwd());
  const program = new Command()
    .name('keel')
    .description('Universal Claude Code workflow kit — hexagonal, trunk-based, XP.')
    .version(deps.version);

  program
    .command('new')
    .description(
      `Bootstrap a greenfield project from a stack preset (available: ${deps.availableStacks.join(', ')}).`,
    )
    .option('-s, --stack <id>', 'stack preset id', 'quarkus-cli')
    .option('-y, --yes', 'non-interactive — use defaults for unanswered questions', false)
    .option('--dry-run', 'print the plan without writing any file', false)
    .option(
      '--layout <layout>',
      "repository layout for composite stacks: 'monorepo' or 'polyrepo' (prompted when omitted)",
    )
    .option(
      '--build-system <choice>',
      "build system for stacks that offer a choice, e.g. 'gradle', 'maven', 'npm', 'pnpm'; on composite stacks name each service as 'path=id' pairs, comma-separated (e.g. 'backend=maven,frontend=pnpm') — prompted when omitted",
    )
    .option(
      '--module-layout <id>',
      "module layout for stacks that offer a choice: 'basic' or 'modulith' (prompted when omitted)",
    )
    .option(
      '--with-peer-context',
      'under --module-layout=modulith, also scaffold a second bounded context that reaches the first only through its user-side/service seam',
      false,
    )
    .option(
      '--set <kv...>',
      'preset an answer as adapterId:questionId=value (repeatable)',
      [] as string[],
    )
    .action(
      async (opts: {
        stack: string;
        yes: boolean;
        dryRun: boolean;
        layout?: string;
        buildSystem?: string;
        moduleLayout?: string;
        withPeerContext: boolean;
        set: string[];
      }): Promise<void> => {
        const dir = cwd();
        const result = await deps.mediator.dispatch(
          newProjectCommand({
            cwd: dir,
            stack: opts.stack,
            answers: parseSetAnswers(opts.set),
            interactive: !opts.yes,
            dryRun: opts.dryRun,
            ...(opts.layout !== undefined ? { layout: opts.layout as RepoLayout } : {}),
            ...(opts.buildSystem !== undefined ? { buildSystem: opts.buildSystem } : {}),
            ...(opts.moduleLayout !== undefined ? { moduleLayout: opts.moduleLayout } : {}),
            ...(opts.withPeerContext ? { withPeerContext: true } : {}),
          }),
        );
        const report = unwrap(result);
        printReport(`keel new ${report.subject}: planned changes`, report, deps.logger);
        if (!report.committed) deps.logger.info('dry run — nothing committed');
        else deps.logger.success(`keel new ${report.subject}: ready in ${dir}`);
      },
    );

  program
    .command('add <target> [name]')
    .description(
      `Install a vertical onto an existing keel project (available: ${deps.availableVerticals.join(', ')}), or add a bounded context with 'keel add module <name>'.`,
    )
    .option('-y, --yes', 'non-interactive — use defaults for unanswered questions', false)
    .option('--dry-run', 'print the plan without writing any file', false)
    .option(
      '--reapply',
      're-render an already-installed vertical from its recorded answers, showing a diff against the working tree; refuses on conflict',
      false,
    )
    .option(
      '--consumes <context>',
      "with 'add module': also emit a gateway reaching an existing bounded context through its user-side/service seam",
    )
    .option(
      '--set <kv...>',
      'preset an answer as adapterId:questionId=value (repeatable)',
      [] as string[],
    )
    .action(
      async (
        target: string,
        name: string | undefined,
        opts: { yes: boolean; dryRun: boolean; reapply: boolean; consumes?: string; set: string[] },
      ): Promise<void> => {
        if (target === MODULE_TARGET && opts.reapply) {
          throw new Error("--reapply applies to verticals; 'keel add module' does not support it");
        }
        const result = await deps.mediator.dispatch(
          target === MODULE_TARGET
            ? addModuleCommand({
                cwd: cwd(),
                module: name ?? '',
                ...(opts.consumes === undefined ? {} : { consumes: opts.consumes }),
                answers: parseSetAnswers(opts.set),
                interactive: !opts.yes,
                dryRun: opts.dryRun,
              })
            : addVerticalCommand({
                cwd: cwd(),
                vertical: target,
                answers: parseSetAnswers(opts.set),
                interactive: !opts.yes,
                dryRun: opts.dryRun,
                ...(opts.reapply ? { reapply: true } : {}),
              }),
        );
        const report = unwrap(result);
        const label = target === MODULE_TARGET ? `module ${report.subject}` : report.subject;
        printReport(`keel add ${label}: planned changes`, report, deps.logger);
        if (!report.committed) deps.logger.info('dry run — nothing committed');
        else deps.logger.success(`keel add ${label}: ready`);
      },
    );

  program
    .command('link <path>')
    .description(
      'Record a sibling keel project as a peer (both ways) so peer-conditional adapters resolve here.',
    )
    .action(async (ref: string): Promise<void> => {
      const result = await deps.mediator.dispatch(linkPeerCommand({ cwd: cwd(), ref }));
      const report = unwrap(result);
      deps.logger.info(`peer: ${report.ref}`);
      deps.logger.info(`  → projects here: ${formatTags(report.projectedHere)}`);
      deps.logger.info(`  ← projects there: ${formatTags(report.projectedThere)}`);
      deps.logger.success('keel link: peers recorded in both manifests');
    });

  const toolchain = program
    .command('toolchain')
    .description(
      "Provision the project's declared toolchain — the manifest's toolchain block, written by 'keel add toolchain'.",
    );

  toolchain
    .command('install')
    .description(
      "Render the chosen provider's native config from the toolchain block and run its idempotent install; re-runnable at any time.",
    )
    .option('-y, --yes', 'non-interactive — take the default manager instead of asking', false)
    .option(
      '--provider <id>',
      "version manager to provision with, replacing any recorded choice: a provider id ('mise', 'asdf', 'nvm', 'corepack', 'sdkman', 'rustup', 'go-native') or a combination id ('nvm+corepack'); only choices covering the declared needs whole are accepted",
    )
    .action(async (opts: { yes: boolean; provider?: string }): Promise<void> => {
      const result = await deps.mediator.dispatch(
        toolchainInstallCommand({
          cwd: cwd(),
          interactive: !opts.yes,
          ...(opts.provider === undefined ? {} : { provider: opts.provider }),
        }),
      );
      printToolchainInstall(unwrap(result), deps.logger);
    });

  toolchain
    .command('check')
    .description(
      'Report which declared tools are satisfied or missing; writes nothing. Exits 1 when the toolchain is not satisfied.',
    )
    .action(async (): Promise<void> => {
      const result = await deps.mediator.dispatch(toolchainCheckQuery({ cwd: cwd() }));
      const report = unwrap(result);
      printToolchainCheck(report, deps.logger);
      if (!report.satisfied) {
        throw new Error("toolchain not satisfied — run 'keel toolchain install'");
      }
    });

  return program;
}

function printToolchainInstall(report: ToolchainInstallReport, log: Logger): void {
  log.info(`keel toolchain install (${report.provider}):`);
  for (const config of report.configs) {
    log.info(
      `  ${config.changed ? chalk.yellow('~') : ' '} ${config.path}${config.changed ? '' : ' (unchanged)'}`,
    );
  }
  for (const tool of report.tools) {
    log.info(
      `      ${tool.spelledName} ${tool.spelledVersion}  (${tool.tool} ${tool.version}${report.members.length > 1 ? `, via ${tool.provider}` : ''})`,
    );
  }
  if (report.choiceRecorded) {
    log.info(`  manager recorded in the toolchain block: ${report.provider}`);
  }
  if (!report.managerPresent) {
    log.warn('Nothing was provisioned:');
    for (const line of (report.bootstrap ?? '').split('\n')) log.warn(line);
    if (report.tools.length > 0) {
      log.warn('Until then, install the tools yourself:');
      for (const tool of report.tools) {
        log.warn(
          `  - ${tool.tool} ${tool.version} (${report.provider}: ${tool.spelledName} ${tool.spelledVersion})`,
        );
      }
    }
    log.warn(`Then re-run 'keel toolchain install'.`);
    return;
  }
  log.success(
    `keel toolchain install: ${report.provider} install completed — re-run any time, it is idempotent`,
  );
}

function printToolchainCheck(report: ToolchainCheckReport, log: Logger): void {
  log.info(`keel toolchain check (${report.provider}):`);
  for (const tool of report.tools) {
    const via = report.members.length > 1 ? `, via ${tool.provider}` : '';
    const line = `${tool.tool} ${tool.version}  (${tool.spelledName} ${tool.spelledVersion}${via})`;
    if (tool.status === 'satisfied') log.info(`  ${chalk.green('✓')} ${line}`);
    else if (tool.status === 'missing') log.info(`  ${chalk.red('✗')} ${line} — not installed`);
    else log.info(`  ${chalk.yellow('?')} ${line} — cannot verify, ${tool.provider} is absent`);
  }
  for (const config of report.configs) {
    log.info(
      config.upToDate
        ? `  ${chalk.green('✓')} ${config.path} matches the declared needs`
        : `  ${chalk.red('✗')} ${config.path} out of date — run 'keel toolchain install'`,
    );
  }
  if (!report.managerPresent) {
    for (const line of (report.bootstrap ?? '').split('\n')) log.warn(line);
  }
  if (report.satisfied) log.success('keel toolchain check: toolchain satisfied');
}

function formatTags(tags: readonly string[]): string {
  return tags.length > 0 ? tags.join(', ') : '(none)';
}

/**
 * Maps a domain `Err` to the CLI's failure transport: a thrown error
 * the executable turns into stderr + exit code 1.
 */
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function printReport(header: string, report: InstallReport, log: Logger): void {
  log.info(header);
  for (const c of report.changes) {
    const tag =
      c.kind === 'create'
        ? chalk.green('+')
        : c.kind === 'modify'
          ? chalk.yellow('~')
          : chalk.red('-');
    log.info(`  ${tag} ${c.path}`);
  }
  for (const description of report.actions) {
    log.info(`  ${chalk.cyan('!')} ${description}`);
  }
  for (const d of report.diffs ?? []) {
    log.info(`  ${chalk.bold(d.path)}`);
    for (const line of d.diff.split('\n')) {
      const painted = line.startsWith('@@')
        ? chalk.cyan(line)
        : line.startsWith('+')
          ? chalk.green(line)
          : line.startsWith('-')
            ? chalk.red(line)
            : chalk.dim(line);
      log.info(`  ${painted}`);
    }
  }
}

/**
 * Parses `--set adapterId:questionId=value` entries into the nested
 * shape used by the manifest's `answers` map. Allows the user to
 * supply sticky answers from the command line so non-interactive
 * runs don't have to fall back to every default.
 */
export function parseSetAnswers(pairs: string[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const raw of pairs) {
    const eq = raw.indexOf('=');
    if (eq <= 0) throw new Error(`--set expects adapterId:questionId=value, got: ${raw}`);
    const left = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    const colon = left.indexOf(':');
    if (colon <= 0) {
      throw new Error(`--set expects adapterId:questionId=value, got: ${raw}`);
    }
    const adapterId = left.slice(0, colon);
    const questionId = left.slice(colon + 1);
    if (!out[adapterId]) out[adapterId] = {};
    out[adapterId][questionId] = value;
  }
  return out;
}
