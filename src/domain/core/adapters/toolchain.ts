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
 * Versions come from `assets/composition/version-pins.json`, read
 * through the TemplateSource port at contribute time: the block is
 * one more consumer of the registry, never a second place versions
 * are stated. Each need cites the entry id it took its version from
 * (`ToolchainNeed.source`), so a registry bump can find every block
 * it should touch — and `keel add toolchain --reapply` refreshes the
 * block after one.
 *
 * The vertical answers *what* the project needs; *how* those needs
 * are satisfied is the provisioning engine's job (`keel toolchain
 * install`, the bounded context under `domain/toolchain`).
 */

import { eolAware } from '../util.js';
import type { Adapter, Contribution, Ctx, Tag } from '../../contract/composition.js';
import type { ToolchainNeed, ToolchainTool } from '../../contract/toolchain.js';

/** The registry asset the needs' versions are read from. */
export const VERSION_PINS_ASSET = 'composition/version-pins.json';

/** The vertical's single dimension, covered by every family adapter. */
export const TOOLCHAIN_DIMENSION = 'needs';

/**
 * Resolves a version-pin entry id to its recorded version. Obtained
 * from {@link loadVersionPins}; throws on an id the registry does not
 * carry, naming the requester — a typo'd or retired entry id fails
 * the install loudly instead of writing a blank need.
 */
export type PinResolver = (tool: ToolchainTool, source: string) => ToolchainNeed;

/**
 * Reads the version-pin registry through the TemplateSource port and
 * returns a {@link PinResolver} over it. Malformed entries (no
 * string id/value) are skipped — the registry's own shape is guarded
 * by `tests/version-pins.test.ts`, not re-validated here.
 */
export async function loadVersionPins(ctx: Ctx, requesterId: string): Promise<PinResolver> {
  const raw = JSON.parse(await ctx.templates.readText(VERSION_PINS_ASSET)) as {
    pins?: readonly { id?: unknown; value?: unknown }[];
  };
  const values = new Map<string, string>();
  for (const pin of raw.pins ?? []) {
    if (typeof pin.id === 'string' && typeof pin.value === 'string') values.set(pin.id, pin.value);
  }
  return (tool, source) => {
    const version = values.get(source);
    if (version === undefined) {
      throw new Error(`${requesterId}: no '${source}' entry in ${VERSION_PINS_ASSET}`);
    }
    return { tool, version, source };
  };
}

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
  needsOf: (ctx: Ctx, pin: PinResolver) => readonly ToolchainNeed[],
): Adapter {
  return {
    id,
    vertical: 'toolchain',
    covers: [TOOLCHAIN_DIMENSION],
    predicate: { requires },
    async contribute(ctx: Ctx): Promise<Contribution> {
      const pin = await loadVersionPins(ctx, id);
      return {
        toolchain: needsOf(ctx, pin),
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
