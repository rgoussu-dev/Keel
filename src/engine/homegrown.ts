import chalk from 'chalk';
import { confirm, input, select } from '@inquirer/prompts';
import { logger } from '../util/log.js';
import { InMemoryTree } from './tree.js';
import type { Context, Engine, Options, PromptSchema, Schematic } from './types.js';

/**
 * Default in-process engine. Stores schematics in a map, drives them
 * through an `InMemoryTree`, and commits to disk after a dry-run review.
 * Adheres to the `Engine` port so it can be swapped (e.g. for a
 * Plop-backed or Nx-backed adapter) without changing callers.
 */
export class HomegrownEngine implements Engine {
  private readonly registry = new Map<string, Schematic>();

  register(schematic: Schematic): void {
    if (this.registry.has(schematic.name)) {
      throw new Error(`schematic already registered: ${schematic.name}`);
    }
    this.registry.set(schematic.name, schematic);
  }

  get(name: string): Schematic | null {
    return this.registry.get(name) ?? null;
  }

  names(): readonly string[] {
    return [...this.registry.keys()].sort();
  }

  async run(
    name: string,
    options: Options,
    context: Context,
    opts: { dryRun?: boolean } = {},
  ): Promise<void> {
    const schematic = this.registry.get(name);
    if (!schematic) throw new Error(`unknown schematic: ${name}`);

    const tree = new InMemoryTree(context.cwd);
    await schematic.run(tree, options, {
      ...context,
      invoke: async (other, otherOpts) => {
        const inner = this.registry.get(other);
        if (!inner) throw new Error(`unknown schematic (invoke): ${other}`);
        await inner.run(tree, otherOpts, context);
      },
    });

    const changes = tree.changes();
    if (changes.length === 0) {
      logger.info(`${name}: no changes`);
      return;
    }
    logger.info(`${name}: planned changes`);
    for (const c of changes) {
      const tag =
        c.kind === 'create' ? chalk.green('+') : c.kind === 'modify' ? chalk.yellow('~') : chalk.red('-');
      logger.info(`  ${tag} ${c.path}`);
    }

    if (opts.dryRun) {
      logger.info('dry run — tree not committed to disk');
      return;
    }

    const applied = await tree.commit();
    logger.success(`${name}: ${applied.length} file(s) written`);
  }
}

/**
 * CLI-backed prompt implementation. Passed into schematics via the Context
 * so the engine itself stays free of any terminal dependency.
 */
export async function cliPrompt<T>(schema: PromptSchema<T>): Promise<T> {
  switch (schema.kind) {
    case 'input':
      return (await input({
        message: schema.message,
        ...(schema.default !== undefined ? { default: schema.default } : {}),
        ...(schema.validate ? { validate: schema.validate } : {}),
      })) as unknown as T;
    case 'select':
      return (await select({
        message: schema.message,
        choices: schema.choices.map((c) => ({ name: c.name, value: c.value })),
      })) as T;
    case 'confirm':
      return (await confirm({
        message: schema.message,
        ...(schema.default !== undefined ? { default: schema.default } : {}),
      })) as unknown as T;
  }
}
