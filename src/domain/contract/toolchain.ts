/**
 * The `toolchain` manifest block — the contract between keel, which
 * records what a project's toolchain *needs*, and the provisioning
 * engine, which decides *how* to satisfy them (roadmap item N).
 *
 * The block is versioned independently of the manifest that carries
 * it: it is destined to be consumed by an external tool once the
 * provisioning engine extracts to its own package, so
 * {@link ToolchainBlock.schemaVersion} is part of the contract from
 * day one and a manifest-version bump never implies a block bump (or
 * vice versa).
 *
 * Lives in its own leaf module beside `manifest.ts` so the future
 * extraction moves one file, not a slice of the manifest.
 */

import { z } from 'zod';

/**
 * The tool vocabulary — a closed union covering what the stacks
 * require today. Growing it is a contract change: extend this tuple
 * (schema and type follow), never pass a free-form string.
 */
export const TOOLCHAIN_TOOLS = [
  'jdk',
  'gradle',
  'maven',
  'go',
  'node',
  'npm',
  'pnpm',
  'rust',
] as const;

/** One tool keel knows how to declare a need for. */
export type ToolchainTool = (typeof TOOLCHAIN_TOOLS)[number];

/**
 * The block schema version this build of keel writes and understands.
 * Independent of the manifest version — see the module doc.
 */
export const TOOLCHAIN_SCHEMA_VERSION = 1;

/**
 * One toolchain need: a tool the project requires and the version it
 * was scaffolded against.
 */
export interface ToolchainNeed {
  /** Which tool, from the closed {@link TOOLCHAIN_TOOLS} vocabulary. */
  readonly tool: ToolchainTool;
  /**
   * The required version, spelled the way the project's own files pin
   * it (`25` for a JDK major, `9.4.1` for a Gradle wrapper).
   */
  readonly version: string;
  /**
   * Where the pin came from — the
   * `assets/composition/version-pins.json` entry id that supplied
   * {@link version}, so a registry bump can find every block it
   * should touch. Absent when the writer had no registry entry to
   * cite.
   */
  readonly source?: string | undefined;
}

/**
 * The `toolchain` block a manifest may carry: the project's declared
 * toolchain needs. keel owns *what* is needed; the provisioning
 * engine (later slices of roadmap item N) owns *how* to satisfy it.
 */
export interface ToolchainBlock {
  /** Version of the block's own schema — see the module doc. */
  readonly schemaVersion: typeof TOOLCHAIN_SCHEMA_VERSION;
  /** The declared needs, one entry per tool. */
  readonly needs: readonly ToolchainNeed[];
}

/** Schema for one toolchain need. */
export const ToolchainNeedSchema = z.object({
  tool: z.enum(TOOLCHAIN_TOOLS),
  version: z.string().min(1),
  source: z.string().optional(),
});

/**
 * Schema governing the `toolchain` block's on-disk shape. The
 * `schemaVersion` literal is deliberate: a block written by a newer
 * schema is rejected loudly rather than half-read.
 */
export const ToolchainBlockSchema = z.object({
  schemaVersion: z.literal(TOOLCHAIN_SCHEMA_VERSION),
  needs: z.array(ToolchainNeedSchema),
});
