/**
 * The version-pin registry as the composition adapters read it, and
 * the map from a toolchain tool to the registry entry its version
 * comes from — the **single source** three verticals converge on.
 *
 * A project states its toolchain versions in three places that must
 * agree: the manifest's `toolchain` block (what the project needs),
 * the Dev Container features (what an editor provisions), and the CI
 * setup steps (what the pipeline provisions). Before this module
 * each stated its own literal, kept honest only by
 * `assets/composition/version-pins.json`'s sweep — three copies one
 * guard happened to compare. Now all three resolve through
 * {@link TOOLCHAIN_PIN_SOURCE}, so a pin bump is one registry edit
 * and the copies cannot disagree; `tests/toolchain-pins.test.ts`
 * asserts the emitted surfaces still match the recorded needs.
 *
 * The registry is read through the TemplateSource port at contribute
 * time — it is an asset, not a compiled-in table, so the same build
 * of keel reads whatever registry ships beside it.
 */

import type { Ctx } from '../../contract/composition.js';
import type { ToolchainNeed, ToolchainTool } from '../../contract/toolchain.js';

/** The registry asset every pinned version is read from. */
export const VERSION_PINS_ASSET = 'composition/version-pins.json';

/**
 * The tools the registry pins a version for. `npm` is the exception
 * in {@link ToolchainTool}: it rides with Node — every Node install
 * ships it — so nothing states a version for it.
 */
export type PinnedTool = Exclude<ToolchainTool, 'npm'>;

/**
 * Which registry entry each tool's version comes from. This map is
 * the single source: the `toolchain` block, the `dev-container`
 * features and the `ci` setup steps all resolve their version
 * through it, so exactly one place — the entry's `value` — states a
 * version.
 *
 * `rust` cites the major-only image tag deliberately: the emitted
 * Rust surfaces track latest stable by construction (`rust:latest`,
 * `rustup update stable`, the versionless devcontainer feature), and
 * the pin records the major they land on rather than a version any
 * of them names.
 */
export const TOOLCHAIN_PIN_SOURCE: Readonly<Record<PinnedTool, string>> = {
  jdk: 'jvm-jdk',
  gradle: 'jvm-gradle-wrapper',
  maven: 'jvm-maven-wrapper',
  go: 'go-toolchain',
  node: 'node-active-lts',
  pnpm: 'ts-pnpm',
  rust: 'image-rust',
};

/** The pinned versions, resolved for one requesting adapter. */
export interface ToolchainPins {
  /**
   * The version pinned for `tool` — the spelling every surface
   * stating it must use. Throws on an entry the registry does not
   * carry, naming the requester: a typo'd or retired entry id fails
   * the install loudly instead of rendering a blank version.
   */
  version(tool: PinnedTool): string;
  /** That version as a recorded need, citing the entry it came from. */
  need(tool: PinnedTool): ToolchainNeed;
}

/**
 * Reads the version-pin registry through the TemplateSource port and
 * returns the {@link ToolchainPins} over it. Malformed entries (no
 * string id/value) are skipped — the registry's own shape is guarded
 * by `tests/version-pins.test.ts`, not re-validated here.
 */
export async function loadToolchainPins(ctx: Ctx, requesterId: string): Promise<ToolchainPins> {
  const raw = JSON.parse(await ctx.templates.readText(VERSION_PINS_ASSET)) as {
    pins?: readonly { id?: unknown; value?: unknown }[];
  };
  const values = new Map<string, string>();
  for (const pin of raw.pins ?? []) {
    if (typeof pin.id === 'string' && typeof pin.value === 'string') values.set(pin.id, pin.value);
  }
  const version = (tool: PinnedTool): string => {
    const source = TOOLCHAIN_PIN_SOURCE[tool];
    const value = values.get(source);
    if (value === undefined) {
      throw new Error(`${requesterId}: no '${source}' entry in ${VERSION_PINS_ASSET}`);
    }
    return value;
  };
  return {
    version,
    need: (tool) => ({ tool, version: version(tool), source: TOOLCHAIN_PIN_SOURCE[tool] }),
  };
}
