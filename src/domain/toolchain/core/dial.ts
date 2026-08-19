/**
 * The manager dial — which providers are *offered* for a given needs
 * set, and how a choice spreads its work across its members.
 *
 * The list is computed, never declared: a provider whose `covers`
 * set contains the whole needs set is offered as a **single**; where
 * no single reaches full coverage, a curated **combination** of
 * providers is offered for the same coverage. A partial choice is
 * never offered — the "no half-installs" rule applied to choices
 * (the **coverage invariant**, on record in roadmap item N). This is
 * why the list lives on the engine side: `Question.choices` is
 * static, and the answer set here depends on what the project
 * declared.
 *
 * **Combinations are compositions, not new providers.** A
 * combination record is a list of member ids; it renders each
 * member's native file, runs each member's install, and its coverage
 * is the union of its members'. It costs nothing beyond the records
 * it reuses. A combination is offered only when every member earns
 * its place — each covers a need no other member of the same
 * combination does — so `nvm+corepack` is offered on a pnpm-tagged
 * TypeScript project and not on an npm-tagged one, where nvm already
 * covers everything alone.
 */

import type { Question, QuestionChoice } from '../../contract/composition.js';
import type { ToolchainNeed, ToolchainTool } from '../../contract/toolchain.js';
import { asdfProvider } from './asdf.js';
import { corepackProvider } from './corepack.js';
import { miseProvider } from './mise.js';
import { nvmProvider } from './nvm.js';
import type { ToolchainProvider } from './provider.js';

/** A curated composition of provider records, offered as one answer. */
export interface ProviderCombination {
  /** The choice id, and what the manifest records (`nvm+corepack`). */
  readonly id: string;
  /** One line describing the composition, shown on the dial. */
  readonly label: string;
  /**
   * Member provider ids, in the order their configs are rendered and
   * their installs run. Order is part of the curation: corepack is a
   * Node shim, so nvm goes first.
   */
  readonly members: readonly string[];
}

/** Everything the dial may offer: the records, and their curated compositions. */
export interface ToolchainDial {
  readonly providers: readonly ToolchainProvider[];
  readonly combinations: readonly ProviderCombination[];
}

/**
 * The shipped dial. Provider order is the order the choice list is
 * offered in, and therefore what the default answer is: mise covers
 * the whole vocabulary, so it heads every list.
 */
export const DIAL: ToolchainDial = {
  providers: [miseProvider, asdfProvider, nvmProvider, corepackProvider],
  combinations: [
    {
      id: 'nvm+corepack',
      label: 'nvm + corepack — the Node-native pair: .nvmrc for Node, corepack for pnpm',
      members: ['nvm', 'corepack'],
    },
  ],
};

/** One offerable answer on the dial: a single provider or a combination. */
export interface ProviderChoice {
  /** What the manifest records — a provider id, or a combination id. */
  readonly id: string;
  readonly label: string;
  /** The records this choice delegates to, in run order. */
  readonly members: readonly ToolchainProvider[];
  /** The union of the members' coverage. */
  readonly covers: readonly ToolchainTool[];
}

function union(members: readonly ToolchainProvider[]): readonly ToolchainTool[] {
  return [...new Set(members.flatMap((member) => member.covers))];
}

/** True when the choice's members together cover every declared need. */
function coversWhole(choice: ProviderChoice, needs: readonly ToolchainNeed[]): boolean {
  return needs.every((need) => choice.covers.includes(need.tool));
}

/**
 * True when no member is dead weight: each covers a need none of the
 * others does. Without this, every combination whose union covers the
 * needs would be offered — `nvm+corepack` on an npm-only project,
 * where corepack contributes nothing.
 */
function everyMemberEarnsItsPlace(
  choice: ProviderChoice,
  needs: readonly ToolchainNeed[],
): boolean {
  return choice.members.every((member) => {
    const others = choice.members.filter((other) => other !== member);
    return needs.some(
      (need) =>
        member.covers.includes(need.tool) &&
        !others.some((other) => other.covers.includes(need.tool)),
    );
  });
}

function asChoice(provider: ToolchainProvider): ProviderChoice {
  return {
    id: provider.id,
    label: provider.label,
    members: [provider],
    covers: provider.covers,
  };
}

function combinationChoice(combination: ProviderCombination, dial: ToolchainDial): ProviderChoice {
  const members = combination.members.map((id) => {
    const provider = dial.providers.find((candidate) => candidate.id === id);
    if (!provider) {
      throw new Error(`combination '${combination.id}' names an unknown provider '${id}'`);
    }
    return provider;
  });
  return { id: combination.id, label: combination.label, members, covers: union(members) };
}

/**
 * The choices offered for a needs set: every single that covers it
 * whole, in dial order, then every curated combination that covers it
 * whole and whose every member earns its place.
 *
 * Empty only when nothing on the dial covers the needs — which the
 * caller must report as a refusal, never as a silent partial install.
 */
export function offeredChoices(
  needs: readonly ToolchainNeed[],
  dial: ToolchainDial = DIAL,
): readonly ProviderChoice[] {
  const singles = dial.providers.map(asChoice).filter((choice) => coversWhole(choice, needs));
  const combinations = dial.combinations
    .map((combination) => combinationChoice(combination, dial))
    .filter((choice) => coversWhole(choice, needs) && everyMemberEarnsItsPlace(choice, needs));
  return [...singles, ...combinations];
}

/**
 * The needs a member of the choice is responsible for: those it
 * covers and no earlier member does, in block order. Every need lands
 * with exactly one member, so no two configs declare the same tool.
 */
export function needsOf(
  choice: ProviderChoice,
  member: ToolchainProvider,
  needs: readonly ToolchainNeed[],
): readonly ToolchainNeed[] {
  const earlier = choice.members.slice(0, choice.members.indexOf(member));
  return needs.filter(
    (need) =>
      member.covers.includes(need.tool) &&
      !earlier.some((other) => other.covers.includes(need.tool)),
  );
}

/** The member that satisfies a given need under this choice. */
export function memberFor(
  choice: ProviderChoice,
  tool: ToolchainTool,
): ToolchainProvider | undefined {
  return choice.members.find((member) => member.covers.includes(tool));
}

/** The dial's question id, and the key the block records it under. */
export const DIAL_QUESTION_ID = 'provider';

/**
 * The question the dial asks. Built here rather than declared on an
 * adapter because the choice list is computed from the project's
 * needs — the whole point of resolving coverage on the engine side.
 */
export function dialQuestion(choices: readonly ProviderChoice[]): Question {
  const options: QuestionChoice[] = choices.map((choice) => ({
    value: choice.id,
    label: choice.id,
    doc: choice.label,
  }));
  return {
    id: DIAL_QUESTION_ID,
    prompt: 'Which version manager should provision this toolchain?',
    doc:
      'Every option covers the whole declared needs set — a partial choice is never offered. ' +
      'The answer is recorded in the manifest and followed on later runs.',
    choices: options,
    default: choices[0]?.id ?? '',
    memory: 'sticky',
  };
}
