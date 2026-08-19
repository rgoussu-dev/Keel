/**
 * `toolchain/rust-toolchain` adapter — the declared toolchain needs
 * for the Rust stacks: the Rust toolchain, pinned to the major the
 * scaffold's own files pin (`rust:1` build images) — the emitted
 * projects track the latest stable by construction, so the need does
 * too. Versions and shape come from the shared machinery in
 * `toolchain.ts`.
 */

import { toolchainAdapter } from './toolchain.js';

export const RUST_TOOLCHAIN_ID = 'toolchain/rust-toolchain';

export const rustToolchainAdapter = toolchainAdapter(
  RUST_TOOLCHAIN_ID,
  ['lang.rust'],
  (_ctx, pins) => [pins.need('rust')],
);
