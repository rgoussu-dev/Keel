/**
 * The `dev-container` vertical — the Dev Container definition
 * (`.devcontainer/`): a reproducible containerized development
 * environment for the stack, openable with VS Code ("Reopen in
 * Container"), the `devcontainer` CLI, or GitHub Codespaces.
 *
 * One dimension, `definition`, covered per toolchain family: the JVM
 * stacks (JDK 25 + the manifest's build system), Go, Rust, and the
 * TypeScript stacks (Node 22 + npm/pnpm). When the `dev-env`
 * vertical is installed, the definition attaches to the dev
 * environment: the workspace joins `dev/compose.yaml`'s Compose
 * project — same network, its services reachable by name, a dev env
 * already running on the host attached to rather than restarted.
 * Without it, a standalone image-based definition. See
 * `adapters/dev-container.ts` for the shared machinery.
 *
 * Brownfield-installable via `keel add dev-container`; install
 * `dev-env` first to get the attached shape.
 */

import { goDevcontainerAdapter } from '../adapters/go-devcontainer.js';
import { jvmDevcontainerAdapter } from '../adapters/jvm-devcontainer.js';
import { nodeDevcontainerAdapter } from '../adapters/node-devcontainer.js';
import { rustDevcontainerAdapter } from '../adapters/rust-devcontainer.js';
import type { Vertical } from '../../contract/composition.js';

export const devContainerVertical: Vertical = {
  id: 'dev-container',
  description:
    'Dev Container definition: a containerized dev environment that attaches to the dev env when present.',
  dimensions: ['definition'],
  adapters: [
    jvmDevcontainerAdapter,
    goDevcontainerAdapter,
    rustDevcontainerAdapter,
    nodeDevcontainerAdapter,
  ],
};
