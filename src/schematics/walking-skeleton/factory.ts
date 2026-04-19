import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Options, Schematic, Tree } from '../../engine/types.js';
import { packageToPath, toPascalCase } from '../util.js';

/**
 * Scaffolds the walking-skeleton shell for a new project:
 *   - root Gradle multi-project (settings.gradle.kts, version catalog)
 *   - `build-logic/` included build with java + test + quality conventions
 *   - `domain/contract` module (empty but wired)
 *   - `domain/core` with the roll-your-own mediator kernel
 *     (Action / Command / Query / Result / Handler / Mediator)
 *   - `infrastructure/iac/` OpenTofu stub
 * then invokes the `port` schematic for a starter port so the skeleton
 * ends with one real adapter slot and one fake.
 *
 * Framework for any future `application/<channel>/executable` is chosen
 * later via a dedicated `executable` schematic — this step deliberately
 * does not pick a web framework.
 */
export const walkingSkeletonSchematic: Schematic = {
  name: 'walking-skeleton',
  description: 'Scaffold a greenfield walking skeleton (multi-module gradle + kernel + IaC).',
  parameters: [
    {
      name: 'basePackage',
      description: 'Base java package, e.g. com.example',
      required: true,
      prompt: { kind: 'input', name: 'basePackage', message: 'base package (e.g. com.example)' },
    },
    {
      name: 'projectName',
      description: 'Gradle root project name, e.g. my-service',
      required: true,
      prompt: { kind: 'input', name: 'projectName', message: 'gradle root project name' },
    },
    {
      name: 'starterPort',
      description: 'Starter secondary port name (e.g. UserRepository).',
      required: false,
      prompt: {
        kind: 'input',
        name: 'starterPort',
        message: 'starter port name',
        default: 'UserRepository',
      },
    },
    {
      name: 'starterAggregate',
      description: 'Starter aggregate folder/package (e.g. user).',
      required: false,
      prompt: {
        kind: 'input',
        name: 'starterAggregate',
        message: 'starter aggregate',
        default: 'user',
      },
    },
  ],

  async run(tree, options, ctx) {
    const vars = resolve(options);
    const templateRoot = path.join(
      paths.asset('schematics'),
      'walking-skeleton',
      'templates',
      'java',
    );
    await renderTemplate(tree, templateRoot, '', vars as unknown as Record<string, unknown>);
    appendSettings(tree, vars);

    await ctx.invoke('port', {
      name: vars.StarterPort,
      basePackage: vars.basePackage,
      aggregate: vars.starterAggregate,
    });

    ctx.logger.info(
      `walking skeleton ready for ${vars.projectName}. next: run a \`keel generate executable\` ` +
        `to pick a web framework and wire the first primary adapter.`,
    );
  },
};

interface ResolvedVars {
  basePackage: string;
  pkgPath: string;
  projectName: string;
  StarterPort: string;
  starterAggregate: string;
}

function resolve(options: Options): ResolvedVars {
  const basePackage = String(options['basePackage'] ?? '').trim();
  if (!basePackage) throw new Error('walking-skeleton: `basePackage` is required');
  const projectName = String(options['projectName'] ?? '').trim();
  if (!projectName) throw new Error('walking-skeleton: `projectName` is required');

  return {
    basePackage,
    pkgPath: packageToPath(basePackage),
    projectName,
    StarterPort: toPascalCase(String(options['starterPort'] ?? 'UserRepository')),
    starterAggregate: String(options['starterAggregate'] ?? 'user').toLowerCase() || 'user',
  };
}

/**
 * The `port` schematic creates an additional fake module; that module has
 * to be included in `settings.gradle.kts`. The settings template ships
 * with the shell modules already listed; we add the starter port fake
 * include line here so the project is fully wired after scaffold.
 */
function appendSettings(tree: Tree, vars: ResolvedVars): void {
  const existing = tree.read('settings.gradle.kts');
  if (!existing) return;
  const kebabPort = vars.StarterPort.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const include = `include(":infrastructure:${kebabPort}:fake")`;
  const current = existing.toString('utf8');
  if (current.includes(include)) return;
  tree.write('settings.gradle.kts', `${current.trimEnd()}\n${include}\n`);
}
