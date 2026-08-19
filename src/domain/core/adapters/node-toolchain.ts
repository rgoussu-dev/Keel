/**
 * `toolchain/node-toolchain` adapter — the declared toolchain needs
 * for the TypeScript stacks (`ts-cli`, `ts-http` and
 * `web-components` alike): Node, plus pnpm when the manifest's
 * `pkg.*` tag names it. npm rides with Node — every Node install
 * ships it — so `pkg.npm` adds no need of its own, while pnpm is
 * provisioned separately (corepack) and is. Versions and shape come
 * from the shared machinery in `toolchain.ts`.
 */

import { toolchainAdapter } from './toolchain.js';

export const NODE_TOOLCHAIN_ID = 'toolchain/node-toolchain';

export const nodeToolchainAdapter = toolchainAdapter(
  NODE_TOOLCHAIN_ID,
  ['lang.typescript'],
  (ctx, pins) =>
    ctx.manifest.tags.includes('pkg.pnpm')
      ? [pins.need('node'), pins.need('pnpm')]
      : [pins.need('node')],
);
