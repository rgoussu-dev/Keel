/**
 * Shared machinery of the `toolchain` vertical — the vertical that
 * derives the project's toolchain **needs** from the manifest's tags
 * and records them in the manifest's `toolchain` block
 * (`domain/contract/toolchain.ts`). The family adapters
 * (`jvm-toolchain`, `go-toolchain`, `rust-toolchain`,
 * `node-toolchain`) differ only in which needs they derive;
 * everything else — reading the version-pin registry, the block
 * contribution, the README runbook note — is decided here so the
 * four cannot drift.
 *
 * Versions come from the shared pin source (`version-pins.ts`), the
 * same one the `dev-container` features and the `ci` setup steps
 * resolve through: the block is one more consumer of the registry,
 * never a second place versions are stated. Each need cites the
 * entry id it took its version from (`ToolchainNeed.source`), so a
 * registry bump can find every block it should touch — and
 * `keel add toolchain --reapply` refreshes the block after one.
 *
 * The vertical answers *what* the project needs; *how* those needs
 * are satisfied is the provisioning engine's job (`keel toolchain
 * install`, the bounded context under `domain/toolchain`).
 */

import { eolAware } from '../util.js';
import { loadToolchainPins, type ToolchainPins } from './version-pins.js';
import type { Adapter, Contribution, Ctx, Tag } from '../../contract/composition.js';
import type { ToolchainNeed } from '../../contract/toolchain.js';

/** The vertical's single dimension, covered by every family adapter. */
export const TOOLCHAIN_DIMENSION = 'needs';

const README_MARKER = '\n### Toolchain\n';

const README_NOTE = `${README_MARKER}
This project declares its toolchain — the tools and versions it is
built with — in the \`toolchain\` block of keel's manifest
(\`.claude/.keel-manifest.json\`). \`keel toolchain install\` reads
the block, renders it as \`mise.toml\`, and provisions the tools it
names through mise; \`keel toolchain check\` reports what is missing
without touching anything. After a keel upgrade,
\`keel add toolchain --reapply\` refreshes the block to the new
pins — then \`keel toolchain install\` again.
`;

/**
 * Builds one family adapter of the `toolchain` vertical: predicate
 * on the family's tag(s), needs derived by `needsOf` with versions
 * from the pin registry, plus the shared README runbook note
 * (marker-guarded, so a reapply never duplicates it).
 */
export function toolchainAdapter(
  id: string,
  requires: readonly Tag[],
  needsOf: (ctx: Ctx, pins: ToolchainPins) => readonly ToolchainNeed[],
): Adapter {
  return {
    id,
    vertical: 'toolchain',
    covers: [TOOLCHAIN_DIMENSION],
    predicate: { requires },
    async contribute(ctx: Ctx): Promise<Contribution> {
      const pins = await loadToolchainPins(ctx, id);
      return {
        toolchain: needsOf(ctx, pins),
        patches: [
          {
            target: 'README.md',
            apply: eolAware((existing) => {
              if (existing.includes(README_MARKER)) return existing;
              return `${existing.trimEnd()}\n${README_NOTE}`;
            }),
          },
        ],
      };
    },
  };
}
