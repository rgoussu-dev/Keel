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

const HOLDERS = {
  services: 'its services have',
  root: 'this root has',
  both: 'this root and its services have',
} as const;

/**
 * The refusal for running `command` on a project at `manifest`'s
 * harness generation, or `null` when it is this keel's. An older or
 * missing marker names the remediation — move the old harness files
 * aside and re-render them with `keel add agent-harness`, which
 * restamps the marker — or pinning the keel that scaffolded it; a
 * newer one asks for a newer keel.
 *
 * At a monorepo product root (a manifest listing services) there is no
 * such remediation: its harness is the product glue's own
 * (`fullstack/product-harness`), which no vertical `keel add` names
 * re-renders — `keel add agent-harness` there installs nothing, its
 * services having the harness, and is refused here in turn — so the
 * refusal says so, and names the pin alone. Unless `already` says who
 * has everything `command` names there already — the root's services
 * (a product root's `included`, `keel add agent-harness` among it),
 * the root itself (a vertical its manifest records, run without a
 * re-render), or each some of it — which a pinned keel would run
 * nothing for there either, and the refusal says who has it instead.
 */
export function harnessGenerationRefusal(
  manifest: ManifestV2,
  command: string,
  already?: 'services' | 'root' | 'both',
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
  const marker =
    found === undefined
      ? 'carries no harness-generation marker'
      : `is stamped harness generation ${String(found)}`;
  const productRoot = manifest.services.length > 0;
  const lead = `this ${productRoot ? 'product root' : 'project'} was scaffolded by an older keel (${scaffoldedBy}): its manifest ${marker}, and this keel writes generation ${String(HARNESS_GENERATION)}, whose sentinels and agent documents live elsewhere — '${command}' refuses rather than half-patch it, and nothing was changed.`;
  if (productRoot) {
    const forward = `A product root's harness is the product's own, and no 'keel add' brings it forward — the agent harness is its services', each brought forward in its own directory`;
    return new DomainError(
      already === undefined
        ? `${lead} ${forward} — so pin ${scaffoldedBy}, the keel that scaffolded it, to run '${command}' here.`
        : `${lead} ${forward} — and ${HOLDERS[already]} what '${command}' names already, so there is nothing to run here.`,
      HARNESS_GENERATION_CODE,
    );
  }
  const installed = manifest.verticals.some((v) => v.id === 'agent-harness');
  const adopt = installed ? 'keel add agent-harness --reapply' : 'keel add agent-harness';
  return new DomainError(
    `${lead} Move AGENTS.md, CLAUDE.md and .claude/ (keeping .claude/.keel-manifest.json) out of the way, run '${adopt}' to re-render the harness and stamp the marker, then re-run '${command}' — or pin ${scaffoldedBy}.`,
    HARNESS_GENERATION_CODE,
  );
}
