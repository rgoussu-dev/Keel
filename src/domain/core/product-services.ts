/**
 * A product root's services as its glue reads them — by facets.
 *
 * The root records each service by the preset it was scaffolded from
 * (`ServiceRef.stack`) and the build system chosen for it
 * (`ServiceRef.buildSystem`). Glue that keys on the preset id knows
 * only the presets it lists; glue that keys on what the id resolves to
 * — the platform, the entrypoints, the build system and the module
 * layout — knows every service those facets describe. This module is
 * the one place a recorded ref becomes those facets: the scope reads
 * an image as there already through it (`./scope.ts` `provisionsFor`
 * asks {@link servesStack}), and the adapters are handed the same
 * facets (`Ctx.services`), so that once the glue keys on them (roadmap
 * T.3c) what it builds and what the scope reads are one answer.
 */

import type { ProductService, ServiceProvision } from '../contract/composition.js';
import type { ManifestV2, ServiceRef } from '../contract/manifest.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { matches } from './predicate.js';
import { stackTagsFor } from './stacks.js';

/**
 * The facets of the service `ref` names, scaffolded from `stack`: the
 * stack's tags, the recorded build system's `pkg.*` tag — the stack's
 * default where none is recorded, as for a manifest predating the
 * choice; none for an id the stack does not offer, so glue that needs
 * one fails loudly — and the stack's default module layout, the only
 * one a product's services take.
 */
export function serviceFacets(
  stack: Stack,
  ref: Pick<ServiceRef, 'buildSystem'>,
): ProductService['tags'] {
  const options = stack.buildSystems ?? [];
  const build =
    ref.buildSystem === undefined ? options[0] : options.find((o) => o.id === ref.buildSystem);
  return stackTagsFor(stack, build?.tag ?? null, stack.moduleLayouts?.[0]?.tag ?? null);
}

/**
 * The services `manifest` records, as {@link ProductService}s: empty
 * for any manifest but a product root's, and no facets for a service
 * whose stack `registry` does not hold (or with no registry at all).
 */
export function productServices(
  registry: Registry | undefined,
  manifest: ManifestV2,
): readonly ProductService[] {
  return manifest.services.map((ref) => {
    const stack = registry?.stack(ref.stack) ?? null;
    return {
      path: ref.path,
      stack: ref.stack,
      tags: stack === null ? [] : serviceFacets(stack, ref),
    };
  });
}

/**
 * Whether `provision` names a service scaffolded from the stack `id`
 * (`stack`, null where this keel does not register it): by the id, or
 * by what the stack's own tags say it is. A stack this keel does not
 * register says nothing of what it is, so only its id can name it —
 * `serves` never does.
 */
export function servesStack(provision: ServiceProvision, id: string, stack: Stack | null): boolean {
  if (provision.stacks?.includes(id) === true) return true;
  if (stack === null) return false;
  const tags = new Set(stack.tags);
  return (provision.serves ?? []).some((predicate) => matches(predicate, tags));
}
