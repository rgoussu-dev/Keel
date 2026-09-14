/**
 * The generation gate of `keel add`: a project whose manifest was
 * stamped by another harness generation — or by none — is refused
 * before a file moves, with the story of how to bring it forward,
 * rather than half-patched against sentinels and documents that live
 * somewhere else now. Alpha excuses migration shims, never silent
 * corruption.
 */

import { DomainError } from '../kernel/result.js';
import { HARNESS_GENERATION, type ManifestV2 } from '../contract/manifest.js';

/** The error code every generation refusal carries. */
export const HARNESS_GENERATION_CODE = 'keel.harness-generation';

/**
 * The refusal for running `command` on a project at `manifest`'s
 * harness generation, or `null` when it is this keel's. An older or
 * missing marker names the remediation — move the old harness files
 * aside and re-render them with `keel add agent-harness`, which
 * restamps the marker — or pinning the keel that scaffolded it; a
 * newer one asks for a newer keel.
 */
export function harnessGenerationRefusal(
  manifest: ManifestV2,
  command: string,
): DomainError | null {
  const found = manifest.harnessGeneration;
  if (found === HARNESS_GENERATION) return null;
  const scaffoldedBy = `keel@${manifest.keelVersion}`;
  if (found !== undefined && found > HARNESS_GENERATION) {
    return new DomainError(
      `this project's harness is generation ${String(found)}, newer than the generation ${String(HARNESS_GENERATION)} this keel writes — upgrade keel (the project was last written by ${scaffoldedBy}) and re-run '${command}'`,
      HARNESS_GENERATION_CODE,
    );
  }
  const installed = manifest.verticals.some((v) => v.id === 'agent-harness');
  const adopt = installed ? 'keel add agent-harness --reapply' : 'keel add agent-harness';
  const marker =
    found === undefined
      ? 'carries no harness-generation marker'
      : `is stamped harness generation ${String(found)}`;
  return new DomainError(
    `this project was scaffolded by an older keel (${scaffoldedBy}): its manifest ${marker}, and this keel writes generation ${String(HARNESS_GENERATION)}, whose sentinels and agent documents live elsewhere — '${command}' refuses rather than half-patch it, and nothing was changed. Move AGENTS.md, CLAUDE.md and .claude/ (keeping .claude/.keel-manifest.json) out of the way, run '${adopt}' to re-render the harness and stamp the marker, then re-run '${command}' — or pin ${scaffoldedBy}.`,
    HARNESS_GENERATION_CODE,
  );
}
