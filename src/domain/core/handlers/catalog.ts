/**
 * Handler for `keel.catalog` — everything keel can install, with the
 * dials each option offers.
 *
 * A registry read, but it is a query rather than an exported function
 * because of who asks. `keel new --list` gets its id and description
 * columns from `listStacks()` at wiring time, and its mark from
 * `defaultTier`, read lazily — which is all a help screen needs. A
 * form needs the dials too — which build systems this stack offers,
 * which module layouts, whether a second bounded context is on the
 * table, and for a composite, the same again per service — and it
 * needs them over a transport. Going through the mediator is what
 * keeps that surface one thing rather than a growing bag of accessors
 * each primary adapter reaches for differently.
 *
 * `peerContext` is probed, not listed. `--with-peer-context` is
 * served by adapters declaring `covers: []`, so the resolver's
 * uncovered-dimension hard-fail cannot speak for them and a
 * hard-coded list of supporting stacks would go stale in silence —
 * the exact failure `context-support.ts` exists to prevent. Asking
 * {@link emitsFor} instead means a family that gains its adapter
 * lights the control up on its own.
 *
 * The finder's leaves carry one more read: each preset's support tier
 * at its default setting (roadmap T.2e), from the `SupportSource` the
 * composition root hands in beside the registry. It is the only tier
 * the catalog carries; a setting's own is `keel.dials`'.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { ok, type Result } from '../../kernel/result.js';
import type { Tag } from '../../contract/composition.js';
import type {
  Catalog,
  CatalogQuery,
  ChoiceDescriptor,
  FrameworkNode,
  LanguageNode,
  ServiceDescriptor,
  ShapeNode,
  StackDescriptor,
  StackFinder,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { MODULITH_LAYOUT_TAG } from '../adapters/module-layout.js';
import { defaultTier, emitsPeerContext } from '../dials.js';
import type { SupportSource } from '../support-tier.js';
import type { SupportTier } from '../../contract/support-tier.js';
import type { BuildSystemOption, Stack } from '../stacks.js';
import { assemblableStacks, listVerticals, verticalTitle } from '../registry.js';
import type { Registry } from '../../contract/ports/registry.js';
import {
  entrypointCombinations,
  entrypointStep,
  frameworkPaths,
  languageChoices,
  languageRuntime,
  pathFor,
  shapeChoices,
  wizardPaths,
  type ProjectShape,
  type WizardPath,
} from '../stack-wizard.js';
import { DEFAULT_STACK_ID } from './new-project.js';

/** What this query reads. */
export interface CatalogDeps {
  /** What this run may install — keel's own pieces plus any plugin's. */
  readonly registry: Registry;
  /**
   * How far keel vouches for each dial cell, which the finder's leaves
   * carry at their default setting — handed in as the registry is, so
   * a test chooses its own facts (roadmap T.2e).
   */
  readonly support: SupportSource;
}

/**
 * Executes {@link CatalogQuery}s.
 *
 * Reading the registry through the port is what makes a plugin's
 * stack render in `keel ui` with no change to `keel ui`: the page
 * asks for the catalog and gets whatever the composition root
 * registered, shipped or not.
 */
export class CatalogHandler implements Handler<CatalogQuery> {
  /**
   * Each leaf's tier, read once: settling 34 defaults costs some
   * 100 to 400 ms, and neither the registry nor the facts move
   * between queries.
   */
  #tiers: Map<string, SupportTier | null> | null = null;

  constructor(private readonly deps: CatalogDeps) {}

  supports(action: Action): action is CatalogQuery {
    return action.kind === 'keel.catalog';
  }

  handle(): Promise<Result<Catalog>> {
    const registry = this.deps.registry;
    return Promise.resolve(
      ok({
        stacks: describeStacks(registry),
        verticals: describeVerticals(registry),
        finder: describeFinder(registry, (stack) => this.#tierOf(stack)),
      }),
    );
  }

  #tierOf(stack: string): SupportTier | null {
    this.#tiers ??= new Map();
    if (!this.#tiers.has(stack)) {
      this.#tiers.set(stack, defaultTier(this.deps.registry, this.deps.support, stack));
    }
    return this.#tiers.get(stack) ?? null;
  }
}

/** The tier of a leaf's preset at its default setting. */
type TierOf = (stack: string) => SupportTier | null;

/**
 * The drill-down, walked once and handed over as a tree.
 *
 * Every node comes from `../stack-wizard.ts` — the same functions the
 * terminal wizard asks its questions from — so a form and a terminal
 * cannot disagree about which combinations exist or what they
 * resolve to.
 */
function describeFinder(registry: Registry, tierOf: TierOf): StackFinder {
  // The same filter the terminal drill-down walks, so the page's
  // facets and the wizard's questions offer the same presets. A tree
  // reported from an unfiltered registry would put a dead end on a
  // control that has no way to explain it.
  const paths = wizardPaths(assemblableStacks(registry));
  return {
    shapes: shapeChoices(paths).map((shape) => describeShape(paths, shape, tierOf)),
    defaultStack: DEFAULT_STACK_ID,
  };
}

function describeShape(
  paths: readonly WizardPath[],
  shape: ChoiceDescriptorLike,
  tierOf: TierOf,
): ShapeNode {
  const id = shape.value as ProjectShape;
  return {
    id,
    label: shape.label,
    doc: shape.doc,
    languages: languageChoices(paths, id).map((language) =>
      describeLanguage(paths, id, language, tierOf),
    ),
  };
}

function describeLanguage(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: ChoiceDescriptorLike,
  tierOf: TierOf,
): LanguageNode {
  return {
    id: language.value,
    label: language.label,
    doc: language.doc,
    runtime: languageRuntime(language.value),
    frameworks: frameworkPaths(paths, shape, language.value).map((framework) =>
      describeFramework(paths, shape, language.value, framework.id, framework.label, tierOf),
    ),
  };
}

function describeFramework(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
  framework: string,
  label: string,
  tierOf: TierOf,
): FrameworkNode {
  const step = entrypointStep(paths, shape, language, framework, DEFAULT_STACK_ID);
  return {
    id: framework,
    label,
    entrypointStep:
      step === null
        ? null
        : { kind: step.kind, choices: step.choices.map(asChoiceDescriptor), default: step.default },
    combinations: entrypointCombinations(paths, shape, language, framework).flatMap(
      (entrypoints) => {
        const leaf = pathFor(paths, shape, language, framework, entrypoints);
        return leaf === null
          ? []
          : [
              {
                entrypoints: [...entrypoints],
                stack: leaf.stackId,
                support: tierOf(leaf.stackId),
              },
            ];
      },
    ),
  };
}

/** A `QuestionChoice`, which is the shape the wizard's menus come in. */
interface ChoiceDescriptorLike {
  readonly value: string;
  readonly label: string;
  readonly doc: string;
}

function asChoiceDescriptor(choice: ChoiceDescriptorLike): ChoiceDescriptor {
  return { id: choice.value, label: choice.label, doc: choice.doc };
}

function describeStacks(registry: Registry): readonly StackDescriptor[] {
  // Assemblable only, for the same reason the finder is: a catalog is
  // what a front end renders as available, and a preset whose every
  // dial setting the rules refuse is not.
  return assemblableStacks(registry).map((stack) => describeStack(registry, stack));
}

function describeStack(registry: Registry, stack: Stack): StackDescriptor {
  return {
    id: stack.id,
    description: stack.description,
    tags: [...stack.tags],
    buildSystems: (stack.buildSystems ?? []).map(describeBuildSystem),
    moduleLayouts: (stack.moduleLayouts ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      doc: option.doc,
    })),
    services: describeServices(registry, stack),
    peerContext: supportsPeerContext(stack),
  };
}

function describeServices(registry: Registry, stack: Stack): readonly ServiceDescriptor[] {
  return (stack.services ?? []).flatMap((service) => {
    const serviceStack = registry.stack(service.stack);
    return [
      {
        path: service.path,
        stack: service.stack,
        buildSystems: (serviceStack?.buildSystems ?? []).map(describeBuildSystem),
      },
    ];
  });
}

function describeBuildSystem(option: BuildSystemOption): ChoiceDescriptor {
  return { id: option.id, label: option.label, doc: option.doc };
}

function describeVerticals(registry: Registry): readonly VerticalDescriptor[] {
  return listVerticals(registry).flatMap((summary) => {
    const vertical = registry.vertical(summary.id);
    return vertical
      ? [
          {
            id: vertical.id,
            title: verticalTitle(vertical),
            description: vertical.description,
            dimensions: [...vertical.dimensions],
          },
        ]
      : [];
  });
}

/**
 * Whether the stack's modulith carries a second bounded context —
 * asked of the adapter set on the tags `keel new` would seed, taking
 * the stack's default build system since no adapter's peer-context
 * predicate turns on one.
 */
function supportsPeerContext(stack: Stack): boolean {
  if (stack.services !== undefined) return false;
  if (stack.moduleLayouts === undefined) return false;
  const tags: readonly Tag[] = [
    ...stack.tags,
    ...(stack.buildSystems?.[0] ? [stack.buildSystems[0].tag] : []),
    MODULITH_LAYOUT_TAG,
  ];
  return emitsPeerContext(stack, tags);
}
