import { Command } from 'commander';
import { newProject } from '../installer/new.js';
import { addVertical } from '../installer/add.js';
import { listStackIds } from '../composition/stacks.js';
import { listVerticalIds } from '../composition/verticals/index.js';
import { consoleLogger as logger } from '../infrastructure/commons/console-logger.js';

/**
 * Entry point for the `keel` CLI. Wires commander to the two
 * top-level commands the composition engine exposes:
 *
 *   - `keel new --stack=<id>` — bootstrap a greenfield project from
 *     a stack preset.
 *   - `keel add <vertical>` — layer an additional vertical onto an
 *     already-initialised keel project.
 *
 * Kept intentionally thin — argument parsing only, no logic.
 */
export async function main(argv: string[]): Promise<void> {
  const program = new Command()
    .name('keel')
    .description('Universal Claude Code workflow kit — hexagonal, trunk-based, XP.')
    .version(await readPackageVersion());

  program
    .command('new')
    .description(
      `Bootstrap a greenfield project from a stack preset (available: ${listStackIds().join(', ')}).`,
    )
    .option('-s, --stack <id>', 'stack preset id', 'quarkus-cli')
    .option('-y, --yes', 'non-interactive — use defaults for unanswered questions', false)
    .option('--dry-run', 'print the plan without writing any file', false)
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
        set: string[];
      }): Promise<void> => {
        await newProject({
          cwd: process.cwd(),
          stack: opts.stack,
          answers: parseSetAnswers(opts.set),
          interactive: !opts.yes,
          dryRun: opts.dryRun,
        });
      },
    );

  program
    .command('add <vertical>')
    .description(
      `Install a vertical onto an existing keel project (available: ${listVerticalIds().join(', ')}).`,
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
        await addVertical({
          cwd: process.cwd(),
          vertical,
          answers: parseSetAnswers(opts.set),
          interactive: !opts.yes,
          dryRun: opts.dryRun,
        });
      },
    );

  try {
    await program.parseAsync(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * Parses `--set adapterId:questionId=value` entries into the nested
 * shape used by the manifest's `answers` map. Allows the user to
 * supply sticky answers from the command line so non-interactive
 * runs don't have to fall back to every default.
 */
function parseSetAnswers(pairs: string[]): Record<string, Record<string, string>> {
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

async function readPackageVersion(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const pkg = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json',
  );
  const raw = await readFile(pkg, 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}
