/**
 * `dev-container/node-devcontainer` adapter — the Dev Container
 * definition for the TypeScript stacks (`ts-http` and
 * `web-components` alike): Node 22 via the devcontainers `node`
 * feature, dependencies installed on create with the package manager
 * the manifest tags name (corepack provisions pnpm, exactly as the
 * scaffolded CI does). Shape and dev-env attachment come from the
 * shared machinery in `dev-container.ts`.
 */

import { devContainerAdapter } from './dev-container.js';

export const NODE_DEVCONTAINER_ID = 'dev-container/node-devcontainer';

export const nodeDevcontainerAdapter = devContainerAdapter(
  NODE_DEVCONTAINER_ID,
  ['lang.typescript'],
  (ctx) => {
    const pnpm = ctx.manifest.tags.includes('pkg.pnpm');
    return {
      features: {
        'ghcr.io/devcontainers/features/node:1': { version: '22' },
      },
      postCreateCommand: pnpm ? 'corepack enable && pnpm install' : 'npm install',
    };
  },
);
