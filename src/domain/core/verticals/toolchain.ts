/**
 * The `toolchain` vertical — derives the project's toolchain
 * **needs** from the manifest's tags and records them in the
 * manifest's `toolchain` block (`domain/contract/toolchain.ts`),
 * plus a short runbook note in the README. It answers *what* the
 * project needs; *how* those needs are satisfied is the provisioning
 * engine's job (`keel toolchain install`, later slices of roadmap
 * item N).
 *
 * One dimension, `needs`, covered per toolchain family (the
 * `dev-container` pattern): the JVM stacks (JDK + the build system
 * the `pkg.*` tag names), Go, Rust, and the TypeScript stacks (Node
 * + pnpm when tagged; npm rides with Node). Versions come from
 * `assets/composition/version-pins.json` — see
 * `adapters/toolchain.ts` for the shared machinery.
 *
 * Deliberately **opt-in** — in no stack's default vertical set until
 * the end-to-end provisioning story has settled. Install with
 * `keel add toolchain`; after a keel upgrade,
 * `keel add toolchain --reapply` refreshes the block to the new
 * pins. On a fullstack composite, each service records its own block
 * via its own manifest — run it per service.
 */

import { goToolchainAdapter } from '../adapters/go-toolchain.js';
import { jvmToolchainAdapter } from '../adapters/jvm-toolchain.js';
import { nodeToolchainAdapter } from '../adapters/node-toolchain.js';
import { rustToolchainAdapter } from '../adapters/rust-toolchain.js';
import { TOOLCHAIN_DIMENSION } from '../adapters/toolchain.js';
import type { Vertical } from '../../contract/composition.js';

export const toolchainVertical: Vertical = {
  id: 'toolchain',
  description:
    "Records the project's toolchain needs in the manifest's toolchain block, versions from the pin registry.",
  dimensions: [TOOLCHAIN_DIMENSION],
  adapters: [jvmToolchainAdapter, goToolchainAdapter, rustToolchainAdapter, nodeToolchainAdapter],
};
