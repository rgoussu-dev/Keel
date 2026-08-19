/**
 * `dev-container/node-devcontainer` adapter — the Dev Container
 * definition for the TypeScript stacks (`ts-http` and
 * `web-components` alike): the Node major the pin registry names,
 * via the devcontainers `node` feature, dependencies installed on
 * create with the package manager the manifest tags name (corepack
 * provisions pnpm at the version the workspace's own
 * `packageManager` field pins, exactly as the scaffolded CI does).
 * Shape, dev-env attachment and the pinned Node major come from the
 * shared machinery in `dev-container.ts` / `version-pins.ts`.
 */

import { devContainerAdapter } from './dev-container.js';

export const NODE_DEVCONTAINER_ID = 'dev-container/node-devcontainer';

export const nodeDevcontainerAdapter = devContainerAdapter(
  NODE_DEVCONTAINER_ID,
  ['lang.typescript'],
  (ctx, pins) => {
    const pnpm = ctx.manifest.tags.includes('pkg.pnpm');
    return {
      features: {
        'ghcr.io/devcontainers/features/node:1': { version: pins.version('node') },
      },
      postCreateCommand: pnpm ? 'corepack enable && pnpm install' : 'npm install',
    };
  },
);
