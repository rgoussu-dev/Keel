/**
 * `toolchain/go-toolchain` adapter — the declared toolchain needs
 * for the Go stacks: the Go toolchain minor `go.mod` directs.
 * Versions and shape come from the shared machinery in
 * `toolchain.ts`.
 */

import { toolchainAdapter } from './toolchain.js';

export const GO_TOOLCHAIN_ID = 'toolchain/go-toolchain';

export const goToolchainAdapter = toolchainAdapter(GO_TOOLCHAIN_ID, ['lang.go'], (_ctx, pins) => [
  pins.need('go'),
]);
