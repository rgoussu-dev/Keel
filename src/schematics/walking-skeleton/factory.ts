import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Context, Options, Schematic, Tree } from '../../engine/types.js';
import { packageToPath, toPascalCase } from '../util.js';

const SUPPORTED_APPLICATION_KINDS = ['rest'] as const;
type ApplicationKind = (typeof SUPPORTED_APPLICATION_KINDS)[number];

const SUPPORTED_DEPLOY_TARGETS = ['cloudrun'] as const;
type DeployTarget = (typeof SUPPORTED_DEPLOY_TARGETS)[number];

/**
 * Orchestrator for a new project's walking skeleton. Emits the thinnest
 * end-to-end slice that exercises every architectural layer — from the
 * JAX-RS resource on the primary side to the real deploy target on the
 * secondary side — then hands control back ready for feature work.
 *
 * Composition order (each step a schematic that also runs standalone):
 *
 *   1. `git-init` — ensure the target directory is a git repo; set an
 *      origin remote when provided.
 *   2. `gradle-wrapper` — emit `gradlew`, `gradlew.bat`, and the wrapper
 *      bootstrap jar so the skeleton is runnable without a system
 *      Gradle.
 *   3. own templates — root gradle multi-project, `build-logic/`
 *      convention plugins, `domain/contract` with the mediator kernel,
 *      `domain/core` as the business-logic home, the version catalog.
 *   4. `port` — a starter secondary port + its fake module.
 *   5. `executable-rest` — Quarkus REST channel with a `/ping` slice
 *      wired through the mediator, OpenAPI + Swagger UI.
 *   6. `iac-cloudrun` — tofu module + bootstrap.sh that provisions the
 *      Cloud Run service, the Artifact Registry repo, and Workload
 *      Identity Federation for GitHub Actions.
 *   7. `ci-github` — GH Actions workflows implementing CD on `main` and
 *      a workflow-dispatch release that promotes the last built image.
 *
 * Parameters surface only the project-specific bits; the rest are
 * decided inside each sub-schematic. `applicationKind` and
 * `deployTarget` are currently single-valued (the only supported combo
 * ships in this release); additional kinds and targets will add
 * branching here without changing the composition order.
 */
export const walkingSkeletonSchematic: Schematic = {
  name: 'walking-skeleton',
  description:
    'Greenfield walking skeleton: gradle + kernel + Quarkus REST + Cloud Run IaC + GitHub Actions CD.',
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
      name: 'applicationKind',
      description:
        'Primary adapter channel (rest supported in MVP). Defaults to `rest`; settable via --set.',
      required: false,
    },
    {
      name: 'deployTarget',
      description:
        'IaC target (cloudrun supported in MVP). Defaults to `cloudrun`; settable via --set.',
      required: false,
    },
    {
      name: 'githubRemote',
      description: 'Origin remote URL (leave empty to skip).',
      required: false,
      prompt: {
        kind: 'input',
        name: 'githubRemote',
        message: 'origin remote URL (leave empty to skip)',
        default: '',
      },
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

  async run(tree: Tree, options: Options, ctx: Context): Promise<void> {
    const vars = resolve(options);

    await ctx.invoke('git-init', { remote: vars.githubRemote });
    await ctx.invoke('gradle-wrapper', {});

    const templateRoot = path.join(
      paths.asset('schematics'),
      'walking-skeleton',
      'templates',
      'java',
    );
    await renderTemplate(tree, templateRoot, '', vars as unknown as Record<string, unknown>);
    appendStarterPortInclude(tree, vars);

    await ctx.invoke('port', {
      name: vars.StarterPort,
      basePackage: vars.basePackage,
      aggregate: vars.starterAggregate,
    });

    if (vars.applicationKind === 'rest') {
      await ctx.invoke('executable-rest', {
        basePackage: vars.basePackage,
        projectName: vars.projectName,
      });
    }

    if (vars.deployTarget === 'cloudrun') {
      await ctx.invoke('iac-cloudrun', {});
      await ctx.invoke('ci-github', { serviceName: vars.projectName });
    }

    ctx.logger.success(
      `walking skeleton ready for ${vars.projectName}. ` +
        `next: PROJECT_ID=… ./iac/bootstrap/bootstrap.sh, then push to main to trigger the first deploy.`,
    );
  },
};

interface ResolvedVars {
  basePackage: string;
  pkgPath: string;
  projectName: string;
  applicationKind: ApplicationKind;
  deployTarget: DeployTarget;
  githubRemote: string;
  StarterPort: string;
  starterAggregate: string;
}

function resolve(options: Options): ResolvedVars {
  const basePackage = String(options['basePackage'] ?? '').trim();
  if (!basePackage) throw new Error('walking-skeleton: `basePackage` is required');
  const projectName = String(options['projectName'] ?? '').trim();
  if (!projectName) throw new Error('walking-skeleton: `projectName` is required');
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(projectName)) {
    throw new Error(
      `walking-skeleton: invalid projectName "${projectName}" (lowercase + digits + dashes; start with a letter; 63 chars max — same rule as Cloud Run service names)`,
    );
  }

  const applicationKind = resolveUnion(
    options['applicationKind'],
    SUPPORTED_APPLICATION_KINDS,
    'rest',
    'applicationKind',
  );
  const deployTarget = resolveUnion(
    options['deployTarget'],
    SUPPORTED_DEPLOY_TARGETS,
    'cloudrun',
    'deployTarget',
  );

  return {
    basePackage,
    pkgPath: packageToPath(basePackage),
    projectName,
    applicationKind,
    deployTarget,
    githubRemote: String(options['githubRemote'] ?? '').trim(),
    StarterPort: toPascalCase(String(options['starterPort'] ?? 'UserRepository')),
    starterAggregate: String(options['starterAggregate'] ?? 'user').toLowerCase() || 'user',
  };
}

function resolveUnion<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
  field: string,
): T {
  const value = raw == null || String(raw).trim() === '' ? fallback : String(raw).trim();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `walking-skeleton: ${field} "${value}" not supported (allowed: ${allowed.join(', ')})`,
  );
}

/**
 * The `port` schematic creates an additional fake module; that module has
 * to be included in `settings.gradle.kts`. The settings template ships
 * with the shell modules already listed; we add the starter port fake
 * include line here so the project is fully wired after scaffold.
 */
function appendStarterPortInclude(tree: Tree, vars: ResolvedVars): void {
  const existing = tree.read('settings.gradle.kts');
  if (!existing) return;
  const kebabPort = vars.StarterPort.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const include = `include(":infrastructure:${kebabPort}:fake")`;
  const current = existing.toString('utf8');
  if (current.includes(include)) return;
  tree.write('settings.gradle.kts', `${current.trimEnd()}\n${include}\n`);
}
