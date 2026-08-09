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
  addVerticalCommand,
  linkPeerCommand,
  newProjectCommand,
  type InstallReport,
  type LinkReport,
  type RepoLayout,
} from '../../../domain/contract/commands.js';

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
          }),
        );
        const report = unwrap(result);
        printReport(`keel new ${report.subject}: planned changes`, report, deps.logger);
        if (!report.committed) deps.logger.info('dry run — nothing committed');
        else deps.logger.success(`keel new ${report.subject}: ready in ${dir}`);
      },
    );

  program
    .command('add <vertical>')
    .description(
      `Install a vertical onto an existing keel project (available: ${deps.availableVerticals.join(', ')}).`,
    )
    .option('-y, --yes', 'non-interactive — use defaults for unanswered questions', false)
    .option('--dry-run', 'print the plan without writing any file', false)
    .option(
      '--set <kv...>',
      'preset an answer as adapterId:questionId=value (repeatable)',
      [] as string[],
    )
    .action(
      async (
        vertical: string,
        opts: { yes: boolean; dryRun: boolean; set: string[] },
      ): Promise<void> => {
        const result = await deps.mediator.dispatch(
          addVerticalCommand({
            cwd: cwd(),
            vertical,
            answers: parseSetAnswers(opts.set),
            interactive: !opts.yes,
            dryRun: opts.dryRun,
          }),
        );
        const report = unwrap(result);
        printReport(`keel add ${report.subject}: planned changes`, report, deps.logger);
        if (!report.committed) deps.logger.info('dry run — nothing committed');
        else deps.logger.success(`keel add ${report.subject}: ready`);
      },
    );

  program
    .command('link <path>')
    .description(
      'Record a sibling keel project as a peer (both ways) so peer-conditional adapters resolve here.',
    )
    .action(async (ref: string): Promise<void> => {
      const result = await deps.mediator.dispatch(linkPeerCommand({ cwd: cwd(), ref }));
      const report = unwrapLink(result);
      deps.logger.info(`peer: ${report.ref}`);
      deps.logger.info(`  → projects here: ${formatTags(report.projectedHere)}`);
      deps.logger.info(`  ← projects there: ${formatTags(report.projectedThere)}`);
      deps.logger.success('keel link: peers recorded in both manifests');
    });

  return program;
}

function formatTags(tags: readonly string[]): string {
  return tags.length > 0 ? tags.join(', ') : '(none)';
}

/** Maps a link result's `Err` to the CLI's thrown-error transport. */
function unwrapLink(result: Result<LinkReport>): LinkReport {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/**
 * Maps a domain `Err` to the CLI's failure transport: a thrown error
 * the executable turns into stderr + exit code 1.
 */
function unwrap(result: Result<InstallReport>): InstallReport {
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
