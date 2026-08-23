/**
 * Handler for `keel.catalog` — everything keel can install, with the
 * dials each option offers.
 *
 * A registry read and nothing more, but it is a query rather than an
 * exported function because of who asks. `keel new --list` gets its
 * two columns from `listStacks()` at wiring time, which is all a help
 * screen needs. A form needs the dials too — which build systems this
 * stack offers, which module layouts, whether a second bounded
 * context is on the table, and for a composite, the same again per
 * service — and it needs them over a transport. Going through the
 * mediator is what keeps that surface one thing rather than a growing
 * bag of accessors each primary adapter reaches for differently.
 *
 * `peerContext` is probed, not listed. `--with-peer-context` is
 * served by adapters declaring `covers: []`, so the resolver's
 * uncovered-dimension hard-fail cannot speak for them and a
 * hard-coded list of supporting stacks would go stale in silence —
 * the exact failure `context-support.ts` exists to prevent. Asking
 * {@link emitsFor} instead means a family that gains its adapter
 * lights the control up on its own.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { ok, type Result } from '../../kernel/result.js';
import type { Tag } from '../../contract/composition.js';
import type {
  Catalog,
  CatalogQuery,
  ChoiceDescriptor,
  EntrypointCombination,
  LanguageNode,
  ServiceDescriptor,
  StackDescriptor,
  StackFinder,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { MODULITH_LAYOUT_TAG } from '../adapters/module-layout.js';
import { emitsPeerContext } from '../dials.js';
import { assemblableStacks, getStack, type BuildSystemOption, type Stack } from '../stacks.js';
import {
  entrypointCombinations,
  entrypointStep,
  frameworkPaths,
  languageChoices,
  wizardPaths,
  type WizardPath,
} from '../stack-wizard.js';
import { listVerticalIds, VERTICALS } from '../verticals/index.js';
import { DEFAULT_STACK_ID } from './new-project.js';

/** Executes {@link CatalogQuery}s. */
export class CatalogHandler implements Handler<CatalogQuery> {
  supports(action: Action): action is CatalogQuery {
    return action.kind === 'keel.catalog';
  }

  handle(): Promise<Result<Catalog>> {
    return Promise.resolve(
      ok({ stacks: describeStacks(), verticals: describeVerticals(), finder: describeFinder() }),
    );
  }
}

/**
 * The drill-down, walked once and handed over as a tree.
 *
 * Every node comes from `../stack-wizard.ts` — the same functions the
 * terminal wizard asks its questions from — so a form and a terminal
 * cannot disagree about which combinations exist or what they
 * resolve to.
 */
function describeFinder(): StackFinder {
  // The same filter the terminal drill-down walks, so the page's
  // facets and the wizard's questions offer the same presets. A grid
  // reported from an unfiltered registry would put a dead end on a
  // control that has no way to explain it.
  const paths = wizardPaths(assemblableStacks());
  return {
    languages: languageChoices(paths).map((language) => describeLanguage(paths, language)),
    defaultStack: DEFAULT_STACK_ID,
  };
}

function describeLanguage(
  paths: readonly WizardPath[],
  language: ChoiceDescriptorLike,
): LanguageNode {
  const step = entrypointStep(paths, language.value, DEFAULT_STACK_ID);
  return {
    id: language.value,
    label: language.label,
    doc: language.doc,
    entrypointStep:
      step === null
        ? null
        : { kind: step.kind, choices: step.choices.map(asChoiceDescriptor), default: step.default },
    combinations: entrypointCombinations(paths, language.value).map((entrypoints) =>
      describeCombination(paths, language.value, entrypoints),
    ),
  };
}

function describeCombination(
  paths: readonly WizardPath[],
  language: string,
  entrypoints: readonly string[],
): EntrypointCombination {
  return {
    entrypoints: [...entrypoints],
    frameworks: frameworkPaths(paths, language, entrypoints).map((framework) => ({
      id: framework.id,
      label: framework.label,
      stack: framework.stackId,
    })),
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

function describeStacks(): readonly StackDescriptor[] {
  // Assemblable only, for the same reason the finder is: a catalog is
  // what a front end renders as available, and a preset whose every
  // dial setting the rules refuse is not.
  return assemblableStacks().map(describeStack);
}

function describeStack(stack: Stack): StackDescriptor {
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
    services: describeServices(stack),
    peerContext: supportsPeerContext(stack),
  };
}

function describeServices(stack: Stack): readonly ServiceDescriptor[] {
  return (stack.services ?? []).flatMap((service) => {
    const serviceStack = getStack(service.stack);
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

function describeVerticals(): readonly VerticalDescriptor[] {
  return listVerticalIds().flatMap((id) => {
    const vertical = VERTICALS[id];
    return vertical
      ? [{ id, description: vertical.description, dimensions: [...vertical.dimensions] }]
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
