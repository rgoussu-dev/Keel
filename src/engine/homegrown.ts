import chalk from 'chalk';
import { confirm, input, select } from '@inquirer/prompts';
import { InMemoryTree } from './tree.js';
import type { Context, Engine, Options, PromptSchema, Schematic, Tree } from './types.js';

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
    if (!this.registry.has(name)) throw new Error(`unknown schematic: ${name}`);

    const tree = new InMemoryTree(context.cwd);
    await this.runAgainstTree(name, options, tree, context);

    const changes = tree.changes();
    if (changes.length === 0) {
      context.logger.info(`${name}: no changes`);
      return;
    }
    context.logger.info(`${name}: planned changes`);
    for (const c of changes) {
      const tag =
        c.kind === 'create'
          ? chalk.green('+')
          : c.kind === 'modify'
            ? chalk.yellow('~')
            : chalk.red('-');
      context.logger.info(`  ${tag} ${c.path}`);
    }

    if (opts.dryRun) {
      context.logger.info('dry run — tree not committed to disk');
      return;
    }

    const applied = await tree.commit();
    context.logger.success(`${name}: ${applied.length} file(s) written`);
  }

  /**
   * Runs a schematic against an existing tree with a context whose
   * `invoke` recurses through the same tree. Used both at top level
   * (from {@link run}) and recursively for composition, so nested
   * `ctx.invoke` calls from inside invoked schematics also compose.
   */
  private async runAgainstTree(
    name: string,
    options: Options,
    tree: Tree,
    context: Context,
  ): Promise<void> {
    const schematic = this.registry.get(name);
    if (!schematic) throw new Error(`unknown schematic (invoke): ${name}`);

    const wrapped: Context = {
      ...context,
      invoke: async (other, otherOpts) => {
        await this.runAgainstTree(other, otherOpts, tree, context);
      },
    };
    await schematic.run(tree, options, wrapped);
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
