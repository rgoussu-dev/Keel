/**
 * What a keel project is, read back off its manifest in the words the
 * `keel new` wizard asked it in — the page's **Project** step, where a
 * new project's preset steps would be.
 *
 * A single project's manifest does not record which preset scaffolded
 * it; it records the tags that preset seeded. The drill-down is a
 * reading of exactly those tags (`./stack-wizard.ts`): the language
 * and runtime, the framework, the entrypoints and the ends they are
 * driven from. So the same reading, run backwards over the manifest,
 * gives the four answers `keel new` was given and the preset they lead
 * to — and a project whose tags the drill-down cannot place (a
 * plugin's preset it leaves off the tree) simply reads as fewer lines,
 * never as a tag. A product root records its services' presets, and
 * the one product registered with exactly those services is the
 * product it reads as.
 *
 * The build system and module layout are dials rather than drill-down
 * answers, and each folds one tag into the manifest; the options that
 * name those tags give their labels back.
 */

import type { Tag } from '../contract/tags.js';
import type { ServiceRef } from '../contract/manifest.js';
import type { Registry } from '../contract/ports/registry.js';
import type { ProfileFact, ProjectProfile } from '../contract/queries.js';
import { MODULE_LAYOUTS } from './adapters/module-layout.js';
import { acquirableIn } from './planner.js';
import { assemblableStacks } from './registry.js';
import {
  axesOf,
  entrypointsLabel,
  frameworkLabel,
  languageLabel,
  pathFor,
  pathOf,
  shapeLabel,
  wizardPaths,
  type WizardAxes,
  type WizardPath,
} from './stack-wizard.js';
import { BUILD_SYSTEMS, getBuildSystem } from './stacks.js';

/**
 * The profile of a project whose manifest records `tags` and, at a
 * product root, `services`.
 *
 * @param registry the stacks the drill-down is walked over — the ones
 *   a menu offers, as the finder walks them
 * @param tags the manifest's tags
 * @param services the manifest's services; empty on a single project
 */
export function projectProfile(
  registry: Registry,
  tags: readonly Tag[],
  services: readonly ServiceRef[],
): ProjectProfile {
  const paths = wizardPaths(assemblableStacks(registry));
  if (services.length > 0) {
    const product = productOf(registry, services);
    const placed = product === null ? null : pathOf(paths, product);
    return { preset: product, facts: placed === null ? [] : axesFacts(placed) };
  }
  // Read over what the preset seeded, not over what a vertical added
  // since: a native-binary release promotes `runtime.graalvm-native`,
  // which sorts ahead of the preset's `runtime.jvm` and would read as
  // the language — and place no preset.
  const acquirable = acquirableIn(registry);
  const axes = axesOf(tags.filter((tag) => !acquirable.has(tag)));
  if (axes === null) return { preset: null, facts: dialFacts(tags) };
  const placed = pathFor(paths, axes.shape, axes.language, axes.framework ?? '', axes.entrypoints);
  return { preset: placed?.stackId ?? null, facts: [...axesFacts(axes), ...dialFacts(tags)] };
}

/**
 * A service in the few words a button carries: its preset, and the
 * build system recorded for it by name — `quarkus-rest · Gradle`.
 */
export function serviceLabel(service: ServiceRef): string {
  if (service.buildSystem === undefined) return service.stack;
  const build = getBuildSystem(service.buildSystem);
  return `${service.stack} · ${build === null ? service.buildSystem : nameOf(build.label)}`;
}

/** The drill-down's answers as lines, in the order it asks them. */
function axesFacts(axes: WizardAxes | WizardPath): readonly ProfileFact[] {
  return [
    { label: 'Building', value: nameOf(shapeLabel(axes.shape)) },
    { label: 'Language', value: languageLabel(axes.language) },
    ...(axes.framework === null
      ? []
      : [{ label: 'Framework', value: frameworkLabel(axes.framework) }]),
    { label: 'Adapters', value: entrypointsLabel(axes.entrypoints) },
  ];
}

/** The dials a single project's tags record, each by the name its option gives it. */
function dialFacts(tags: readonly Tag[]): readonly ProfileFact[] {
  const build = Object.values(BUILD_SYSTEMS).find((option) => tags.includes(option.tag));
  const layout = MODULE_LAYOUTS.find((option) => tags.includes(option.tag));
  return [
    ...(build === undefined ? [] : [{ label: 'Build system', value: nameOf(build.label) }]),
    ...(layout === undefined ? [] : [{ label: 'Module layout', value: nameOf(layout.label) }]),
  ];
}

/**
 * The registered product whose services are exactly these, by path
 * and preset — or null where none is, or more than one would be.
 */
function productOf(registry: Registry, services: readonly ServiceRef[]): string | null {
  const recorded = keyOf(services);
  const matches = registry
    .stacks()
    .filter((stack) => stack.services !== undefined && keyOf(stack.services) === recorded);
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

/** A set of services as one comparable string: each `path=stack`, sorted. */
function keyOf(services: readonly { readonly path: string; readonly stack: string }[]): string {
  return services
    .map((service) => `${service.path}=${service.stack}`)
    .sort()
    .join(',');
}

/**
 * The name at the head of a label written `name — what it is`: a line
 * of a summary has room for the name, not the gloss.
 */
function nameOf(label: string): string {
  return label.split(' — ')[0] ?? label;
}
