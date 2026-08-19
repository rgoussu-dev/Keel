/**
 * The engine's shared spine: the ports the handlers run on, reading
 * the contract (the manifest's `toolchain` block, guarded), resolving
 * the manager dial, and the shapes both handlers derive from the
 * resolved choice. Shared so install and check cannot drift on what
 * "no block", "uncovered needs", "which provider" or "manager
 * present" means.
 */

import type { ManifestV2 } from '../../contract/manifest.js';
import type { ManifestStore } from '../../contract/ports/manifest-store.js';
import type { ProcessRunner } from '../../contract/ports/process-runner.js';
import type { Prompt } from '../../contract/ports/prompt.js';
import type { Tree, TreeFactory } from '../../contract/ports/tree.js';
import type { ToolchainBlock, ToolchainNeed } from '../../contract/toolchain.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { ProvisionedTool, RenderedConfig } from '../contract/commands.js';
import {
  dialQuestion,
  memberFor,
  needsOf,
  offeredChoices,
  type ProviderChoice,
  type ToolchainDial,
} from './dial.js';
import type { ProviderConfig, ToolchainProvider } from './provider.js';

/**
 * The ports the provisioning handlers are wired with — all from
 * `domain/contract/ports`, the shared half of the seam. The context
 * declares no ports of its own: the block rides the manifest store,
 * the config lands through a Tree, the provider's binary is reached
 * through the ProcessRunner (the same wall keel's deferred actions
 * use), and the manager dial asks its one question through the same
 * Prompt the composition engine asks its own through.
 */
export interface ToolchainDeps {
  readonly trees: TreeFactory;
  readonly manifests: ManifestStore;
  readonly processes: ProcessRunner;
  readonly prompt: Prompt;
}

/** The project's declaration, as both handlers read it. */
export interface LoadedBlock {
  readonly manifest: ManifestV2;
  readonly block: ToolchainBlock;
}

/**
 * Reads the project's declaration, or the reason there is none to
 * provision: no project, or no block.
 */
export async function loadBlock(deps: ToolchainDeps, cwd: string): Promise<Result<LoadedBlock>> {
  const scopeRoot = projectScopeRoot(cwd);
  const manifest = await deps.manifests.read(scopeRoot);
  if (!manifest) {
    return err(
      new DomainError(
        `no project initialised at ${scopeRoot} — run 'keel new --stack=<id>' first`,
        'keel.not-initialised',
      ),
    );
  }
  if (!manifest.toolchain) {
    return err(
      new DomainError(
        "the manifest declares no toolchain block — run 'keel add toolchain' first",
        'keel.toolchain-not-declared',
      ),
    );
  }
  return ok({ manifest, block: manifest.toolchain });
}

/** A resolved manager choice, and whether it is new to the manifest. */
export interface ResolvedChoice {
  readonly choice: ProviderChoice;
  /** True when the block does not already record this answer. */
  readonly isNew: boolean;
}

/** How a caller may pin the answer without being asked. */
export interface ChoiceRequest {
  /** An explicit answer (`--provider`), validated like any other. */
  readonly requested?: string | undefined;
  /** False to take the default instead of asking (`--yes`). */
  readonly interactive: boolean;
}

/**
 * Resolves which manager provisions this project, in the order a
 * sticky answer deserves: an explicit request, then the recorded
 * choice, then the user, then the default (the head of the offered
 * list — mise, which covers the whole vocabulary).
 *
 * Every path is validated against the offered list, so a choice that
 * stopped covering the needs — a project that grew a pnpm need after
 * choosing nvm — is a loud refusal naming the alternatives, never a
 * silent half-install.
 */
export async function resolveChoice(
  deps: ToolchainDeps,
  block: ToolchainBlock,
  request: ChoiceRequest,
  dial?: ToolchainDial,
): Promise<Result<ResolvedChoice>> {
  const choices = offeredChoices(block.needs, dial);
  if (choices.length === 0) return uncovered(block);
  const offered = choices.map((choice) => choice.id).join(', ');

  const pick = (id: string, source: string): Result<ProviderChoice> => {
    const choice = choices.find((candidate) => candidate.id === id);
    return choice
      ? ok(choice)
      : err(
          new DomainError(
            `${source} '${id}' does not cover this project's declared needs — offered: ${offered}`,
            'keel.toolchain-choice-unavailable',
          ),
        );
  };

  if (request.requested !== undefined) {
    const picked = pick(request.requested, 'requested provider');
    return picked.ok
      ? ok({ choice: picked.value, isNew: picked.value.id !== block.provider })
      : picked;
  }
  if (block.provider !== undefined) {
    const picked = pick(block.provider, 'the recorded provider');
    return picked.ok ? ok({ choice: picked.value, isNew: false }) : picked;
  }
  if (!request.interactive) {
    const fallback = choices[0];
    if (!fallback) throw new Error('unreachable: a non-empty choice list has a head');
    return ok({ choice: fallback, isNew: true });
  }
  const answer = await deps.prompt.ask(dialQuestion(choices));
  const picked = pick(answer, 'answer');
  return picked.ok ? ok({ choice: picked.value, isNew: true }) : picked;
}

/**
 * The choice as `check` reads it: the recorded answer when there is
 * one, the default otherwise. A query never prompts and never
 * records — it reports what an install would (or did) use.
 */
export function checkedChoice(block: ToolchainBlock, dial?: ToolchainDial): Result<ProviderChoice> {
  const choices = offeredChoices(block.needs, dial);
  if (choices.length === 0) return uncovered(block);
  if (block.provider === undefined) {
    const fallback = choices[0];
    if (!fallback) throw new Error('unreachable: a non-empty choice list has a head');
    return ok(fallback);
  }
  const recorded = choices.find((choice) => choice.id === block.provider);
  return recorded
    ? ok(recorded)
    : err(
        new DomainError(
          `the recorded provider '${block.provider}' does not cover this project's declared ` +
            `needs — offered: ${choices.map((choice) => choice.id).join(', ')}`,
          'keel.toolchain-choice-unavailable',
        ),
      );
}

/** The refusal when nothing on the dial covers the declaration whole. */
function uncovered<T>(block: ToolchainBlock): Result<T> {
  return err(
    new DomainError(
      `no version manager on the dial covers ${block.needs.map((need) => need.tool).join(', ')} ` +
        'whole — a provider is only offered for a needs set it covers entirely',
      'keel.toolchain-uncovered-need',
    ),
  );
}

/** The needs as the report DTOs carry them: spelled, in block order. */
export function provisionedTools(
  choice: ProviderChoice,
  needs: readonly ToolchainNeed[],
): readonly ProvisionedTool[] {
  return needs.map((need) => {
    const member = memberFor(choice, need.tool);
    if (!member) {
      throw new Error(`unreachable: '${choice.id}' was offered without covering ${need.tool}`);
    }
    const spelled = member.spell(need);
    return {
      tool: need.tool,
      version: need.version,
      provider: member.id,
      spelledName: spelled.name,
      spelledVersion: spelled.version,
    };
  });
}

/** One member's rendered configs, with the needs it is responsible for. */
export interface MemberRender {
  readonly member: ToolchainProvider;
  readonly needs: readonly ToolchainNeed[];
  readonly configs: readonly ProviderConfig[];
}

/**
 * Renders every member's native file over the needs assigned to it.
 * A renderer that cannot produce its file (corepack without a
 * `package.json`) throws; the caller reports that as a refusal.
 */
export function renderChoice(
  choice: ProviderChoice,
  needs: readonly ToolchainNeed[],
  tree: Tree,
): readonly MemberRender[] {
  const read = (filePath: string): string | undefined =>
    tree.read(filePath)?.toString('utf8') ?? undefined;
  return choice.members.map((member) => {
    const assigned = needsOf(choice, member, needs);
    return { member, needs: assigned, configs: member.render(assigned, read) };
  });
}

/** Whether an already-rendered config matches what is on disk. */
export function configState(tree: Tree, config: ProviderConfig): RenderedConfig {
  return {
    path: config.path,
    changed: tree.read(config.path)?.toString('utf8') !== config.content,
  };
}

/** Whether a member's binary answers its presence probe. */
export function memberPresent(
  deps: ToolchainDeps,
  member: ToolchainProvider,
  cwd: string,
): boolean {
  const probe = deps.processes.run(member.probe.command, member.probe.args, { cwd });
  return probe.startFailure === undefined && probe.status === 0;
}

/**
 * The members whose binary is absent, in run order. A choice is only
 * acted on when *every* member answers: running half a combination
 * would be the half-install the coverage invariant exists to prevent.
 */
export function absentMembers(
  deps: ToolchainDeps,
  choice: ProviderChoice,
  cwd: string,
): readonly ToolchainProvider[] {
  return choice.members.filter((member) => !memberPresent(deps, member, cwd));
}

/** The bootstrap guidance for the members that are missing. */
export function bootstrapFor(members: readonly ToolchainProvider[]): string {
  return members.map((member) => member.bootstrap).join('\n\n');
}
