/**
 * `dev-container/go-devcontainer` adapter — the Dev Container
 * definition for the Go stacks: the Go toolchain the pin registry
 * names, via the devcontainers `go` feature. The feature asks for
 * the same minor `go.mod` directs rather than `latest`, so the
 * editor and the declared need cannot diverge — the Go toolchain
 * mechanism still upgrades past it when a module asks for more.
 * Shape and dev-env attachment come from the shared machinery in
 * `dev-container.ts`.
 */

import { devContainerAdapter } from './dev-container.js';

export const GO_DEVCONTAINER_ID = 'dev-container/go-devcontainer';

export const goDevcontainerAdapter = devContainerAdapter(
  GO_DEVCONTAINER_ID,
  ['lang.go'],
  (_ctx, pins) => ({
    features: {
      'ghcr.io/devcontainers/features/go:1': { version: pins.version('go') },
    },
  }),
);
