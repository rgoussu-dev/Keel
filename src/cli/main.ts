import { Command } from 'commander';
import { install } from '../installer/install.js';
import { update } from '../installer/update.js';
import { doctor } from '../installer/doctor.js';
import { logger } from '../util/log.js';
import { buildEngine } from '../schematics/registry.js';
import { cliPrompt } from '../engine/homegrown.js';
import type { PromptSchema } from '../engine/types.js';

/**
 * Entry point for the `keel` CLI. Wires commander to the installer
 * commands. Kept intentionally thin — argument parsing only, no logic.
 */
export async function main(argv: string[]): Promise<void> {
  const program = new Command()
    .name('keel')
    .description('Universal Claude Code workflow kit — hexagonal, trunk-based, XP.')
    .version(await readPackageVersion());

  program
    .command('install')
    .description('Install keel assets into the current project or the user-global claude dir.')
    .option('-g, --global', 'install to ~/.claude instead of <cwd>/.claude', false)
    .option('-f, --force', 'overwrite existing files and manifest', false)
    .option('--dry-run', 'print the plan without writing any file', false)
    .action(async (opts: { global: boolean; force: boolean; dryRun: boolean }) => {
      await install({
        scope: opts.global ? 'global' : 'project',
        cwd: process.cwd(),
        force: opts.force,
        dryRun: opts.dryRun,
      });
    });

  program
    .command('update')
    .description('Upgrade an existing installation to the current kit version.')
    .option('-g, --global', 'update the global install at ~/.claude', false)
    .option('--dry-run', 'print the plan without writing any file', false)
    .option('-y, --yes', 'non-interactive; keep user-modified files', false)
    .action(async (opts: { global: boolean; dryRun: boolean; yes: boolean }) => {
      await update({
        scope: opts.global ? 'global' : 'project',
        cwd: process.cwd(),
        dryRun: opts.dryRun,
        nonInteractive: opts.yes,
      });
    });

  program
    .command('doctor')
    .description('Audit both global and project installations for drift.')
    .action(async () => {
      const issues = await doctor({ cwd: process.cwd() });
      if (issues > 0) process.exit(1);
    });

  program
    .command('generate <schematic>')
    .alias('g')
    .description('Run a registered schematic (e.g. port, scenario, walking-skeleton).')
    .option('--dry-run', 'show the planned changes without writing', false)
    .option('--set <kv...>', 'set a parameter as key=value (repeatable)', [])
    .action(async (schematic: string, opts: { dryRun: boolean; set: string[] }): Promise<void> => {
      const engine = buildEngine();
      const target = engine.get(schematic);
      if (!target) {
        logger.error(`unknown schematic: ${schematic}`);
        logger.info(`available: ${engine.names().join(', ')}`);
        process.exit(1);
      }
      const options: Record<string, unknown> = parseKv(opts.set);
      for (const spec of target.parameters) {
        if (options[spec.name] !== undefined) continue;
        if (!spec.prompt) {
          if (spec.required) {
            logger.error(`missing required parameter: ${spec.name}`);
            process.exit(1);
          }
          continue;
        }
        if (!spec.required) {
          const def = 'default' in spec.prompt ? spec.prompt.default : undefined;
          if (def !== undefined) {
            options[spec.name] = def;
            continue;
          }
          if (!process.stdin.isTTY) continue;
        }
        options[spec.name] = await cliPrompt(spec.prompt as PromptSchema<unknown>);
      }
      await engine.run(
        schematic,
        options,
        { logger, cwd: process.cwd(), prompt: cliPrompt, invoke: async () => {} },
        { dryRun: opts.dryRun },
      );
    });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function parseKv(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of pairs) {
    const eq = raw.indexOf('=');
    if (eq <= 0) {
      throw new Error(`--set expects key=value, got: ${raw}`);
    }
    out[raw.slice(0, eq)] = raw.slice(eq + 1);
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
