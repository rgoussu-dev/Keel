/**
 * `dev-container/go-devcontainer` adapter — the Dev Container
 * definition for the Go stacks: the latest stable toolchain via the
 * devcontainers `go` feature. Shape and dev-env attachment come
 * from the shared machinery in `dev-container.ts`.
 */

import { devContainerAdapter } from './dev-container.js';

export const GO_DEVCONTAINER_ID = 'dev-container/go-devcontainer';

export const goDevcontainerAdapter = devContainerAdapter(GO_DEVCONTAINER_ID, ['lang.go'], () => ({
  features: {
    'ghcr.io/devcontainers/features/go:1': { version: 'latest' },
  },
}));
