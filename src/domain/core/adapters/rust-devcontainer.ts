/**
 * `dev-container/rust-devcontainer` adapter — the Dev Container
 * definition for the Rust stacks: the latest stable toolchain (with
 * clippy and rustfmt) via the devcontainers `rust` feature. Shape
 * and dev-env attachment come from the shared machinery in
 * `dev-container.ts`.
 */

import { devContainerAdapter } from './dev-container.js';

export const RUST_DEVCONTAINER_ID = 'dev-container/rust-devcontainer';

export const rustDevcontainerAdapter = devContainerAdapter(
  RUST_DEVCONTAINER_ID,
  ['lang.rust'],
  () => ({
    features: {
      'ghcr.io/devcontainers/features/rust:1': {},
    },
  }),
);
