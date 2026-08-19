/**
 * `dev-container/rust-devcontainer` adapter — the Dev Container
 * definition for the Rust stacks: the latest stable toolchain (with
 * clippy and rustfmt) via the devcontainers `rust` feature. The
 * feature is deliberately versionless — Rust is the one family whose
 * pin (`image-rust`) is a major-only tag every emitted surface
 * tracks by construction (`rust:latest` in CI, `rustup update
 * stable` on the runner), so naming a version here would state
 * something the rest of the scaffold does not. Shape and dev-env
 * attachment come from the shared machinery in `dev-container.ts`.
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
