/**
 * `dev-env/compose-base` adapter — the seed of the local development
 * environment: `dev/compose.yaml`, one Compose file for everything
 * the service needs on a laptop but does not own. The base ships
 * empty (`services: {}`); contributing adapters patch their services
 * in — the observability vertical's monitoring stack today, a
 * persistence vertical's database tomorrow — and the user adds
 * ad-hoc local infra (redis, a message broker) the same way.
 * Dev-only by design: production infrastructure belongs to IaC, not
 * this file.
 *
 * There is no install-order coupling between the contributors: the
 * base lands through a **seeded patch** (see
 * `ContributionPatch.seed`), and every contributing adapter carries
 * the same seed via {@link devComposeSeed} — whichever runs first
 * creates the file, the others compose onto it. This adapter's own
 * contribution is the seed plus the README section; installing it
 * after a contributor leaves the populated file untouched.
 *
 * The module also exports the patch helpers contributors share, so
 * every contribution composes the same way: {@link addComposeService}
 * and {@link addComposeVolumes} understand both the pristine `{}`
 * shapes and an already-populated file.
 */

import { anyProjectName } from '../util.js';
import type { Adapter, Ctx } from '../../contract/composition.js';

export const DEV_ENV_COMPOSE_ID = 'dev-env/compose-base';

const TEMPLATE_ID = 'composition/dev-env/compose-base/templates';

/** The dev environment's Compose file, relative to the project root. */
export const DEV_COMPOSE_TARGET = 'dev/compose.yaml';

const README_MARKER = '\n### Dev environment\n';

const readmeSection = (): string =>
  `${README_MARKER}
\`docker compose -f dev/compose.yaml up\` starts the local infra the
service needs on a laptop but does not own. Verticals contribute
their services (the observability vertical adds a monitoring stack);
add your own — a database, redis, a broker — to the same file so the
dev loop has a single place to look. Dev-only by design: production
infrastructure is provisioned by your IaC, not this file.
`;

/**
 * Renders the dev compose base for use as a patch `seed`. Every
 * adapter contributing to `dev/compose.yaml` passes this as the seed
 * of its patch, so the file exists with the canonical header and
 * empty maps no matter which contributor runs first.
 */
export async function devComposeSeed(ctx: Ctx): Promise<string> {
  const files = await ctx.templates.render(TEMPLATE_ID, '', {
    projectName: anyProjectName(ctx.manifest),
  });
  const base = files.find((f) => f.path === DEV_COMPOSE_TARGET);
  if (!base) {
    throw new Error(`${DEV_ENV_COMPOSE_ID}: template did not render ${DEV_COMPOSE_TARGET}`);
  }
  return base.content.toString();
}

export const devEnvComposeAdapter: Adapter = {
  id: DEV_ENV_COMPOSE_ID,
  vertical: 'dev-env',
  covers: ['compose-base'],
  predicate: {},
  async contribute(ctx) {
    const seed = await devComposeSeed(ctx);
    return {
      patches: [
        {
          target: DEV_COMPOSE_TARGET,
          seed,
          apply: (existing) => existing,
        },
        {
          target: 'README.md',
          apply: (existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection()}`;
          },
        },
      ],
    };
  },
};

/**
 * Inserts a service block (its lines already indented by two spaces)
 * at the top of the Compose file's `services:` map — replacing the
 * pristine `services: {}` on first use. Callers guard idempotence
 * themselves (check for a distinctive substring before patching).
 */
export function addComposeService(existing: string, serviceBlock: string): string {
  const block = serviceBlock.replace(/\n+$/, '');
  if (existing.includes('services: {}')) {
    return existing.replace('services: {}', `services:\n${block}`);
  }
  return existing.replace(/^services:\n/m, `services:\n${block}\n\n`);
}

/**
 * Registers named volumes on the Compose file's top-level `volumes:`
 * map, creating the section when absent. Already-declared names are
 * skipped.
 */
export function addComposeVolumes(existing: string, volumeNames: readonly string[]): string {
  const missing = volumeNames.filter((name) => !new RegExp(`^  ${name}:`, 'm').test(existing));
  if (missing.length === 0) return existing;
  const lines = missing.map((name) => `  ${name}:`).join('\n');
  if (existing.includes('volumes: {}')) {
    return existing.replace('volumes: {}', `volumes:\n${lines}`);
  }
  if (/^volumes:\n/m.test(existing)) {
    return existing.replace(/^volumes:\n/m, `volumes:\n${lines}\n`);
  }
  return `${existing.trimEnd()}\n\nvolumes:\n${lines}\n`;
}
