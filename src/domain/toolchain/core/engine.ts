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
import type { Asker, Prompt } from '../../contract/ports/prompt.js';
import type { Tree, TreeFactory } from '../../contract/ports/tree.js';
import type { ToolchainBlock, ToolchainNeed, ToolchainTool } from '../../contract/toolchain.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { ProvisionedTool, RenderedConfig, UnresolvedPrefix } from '../contract/commands.js';
import {
  dialQuestion,
  memberFor,
  needsOf,
  offeredChoices,
  type ProviderChoice,
  type ToolchainDial,
} from './dial.js';
import type {
  ProviderConfig,
  ResolvedSpellings,
  SpelledNeed,
  ToolchainProvider,
} from './provider.js';

/**
 * The provisioning context is its own hexagon, so its manager dial is
 * asked by the context rather than by any composition adapter.
 */
const TOOLCHAIN_ASKER: Asker = { kind: 'toolchain', id: 'toolchain' };

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
  const answer = await deps.prompt.ask(dialQuestion(choices), TOOLCHAIN_ASKER);
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

/**
 * The prefixes the managers could not make concrete, and everything
 * they could — the outcome of the resolution pass that runs before
 * any render.
 */
export interface Resolution {
  readonly spellings: ResolvedSpellings;
  readonly unresolved: readonly UnresolvedPrefix[];
}

/**
 * Makes every prefix spelling concrete before the render, so a
 * manager whose native file is a lockfile gets the exact version it
 * documents rather than the major the block pins (roadmap N.6).
 *
 * Only the records that declare a {@link ToolchainProvider.resolve}
 * take part, and only for the needs they judge prefix-shaped, so a
 * project on mise runs no extra process at all. Where a record does
 * take part, the order is deliberate and is **lockfile order**:
 *
 * 1. **the config already on disk**, when its concrete version
 *    answers the prefix. A lockfile resolves once and then stays put:
 *    were the manager asked first, every `check` would re-query
 *    upstream and call the file stale the day a patch ships, which is
 *    the opposite of what pinning a series means. It also means the
 *    steady state costs no process at all, and that an absent manager
 *    can never overwrite a good file with the prefix it came from.
 * 2. **the manager**, when the file has nothing that answers and its
 *    binary cleared the presence probe — a first install, or a pin
 *    bump that moved the series out from under the old value. keel
 *    never invents the patch half; it asks the tool that knows.
 * 3. **nothing** — the prefix renders as it stands, exactly as it did
 *    before this step existed, and rides the report as an
 *    {@link UnresolvedPrefix} so the caller can say so out loud.
 *
 * Read-only throughout: the queries are the managers' own lookups
 * (`asdf latest`, `sdk list`), never an install.
 */
export function resolveSpellings(
  deps: ToolchainDeps,
  choice: ProviderChoice,
  needs: readonly ToolchainNeed[],
  cwd: string,
  tree: Tree,
  absent: ReadonlySet<string>,
): Resolution {
  const read = treeReader(tree);
  const spellings = new Map<ToolchainTool, string>();
  const unresolved: UnresolvedPrefix[] = [];

  for (const member of choice.members) {
    const resolution = member.resolve;
    if (!resolution) continue;
    for (const need of needsOf(choice, member, needs)) {
      const spelled = member.spell(need);
      if (!resolution.isPrefix(spelled)) continue;

      const concrete =
        resolution.fromConfig(spelled, read) ?? askManager(deps, member, spelled, cwd, absent);
      if (concrete === undefined) {
        unresolved.push({ tool: need.tool, provider: member.id, spelled: spelled.version });
        continue;
      }
      spellings.set(need.tool, concrete);
    }
  }
  return { spellings, unresolved };
}

/** The manager's own answer for a prefix, when it can be asked at all. */
function askManager(
  deps: ToolchainDeps,
  member: ToolchainProvider,
  spelled: SpelledNeed,
  cwd: string,
  absent: ReadonlySet<string>,
): string | undefined {
  const resolution = member.resolve;
  if (!resolution || absent.has(member.id)) return undefined;
  const query = resolution.query(spelled);
  return resolution.parse(deps.processes.run(query.command, query.args, { cwd }), spelled);
}

/** The needs as the report DTOs carry them: spelled, in block order. */
export function provisionedTools(
  choice: ProviderChoice,
  needs: readonly ToolchainNeed[],
  resolved: ResolvedSpellings = new Map(),
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
      // The resolved spelling when there is one: the report should
      // name the version the config actually carries.
      spelledVersion: resolved.get(need.tool) ?? spelled.version,
    };
  });
}

/** One member's rendered configs, with the needs it is responsible for. */
export interface MemberRender {
  readonly member: ToolchainProvider;
  readonly needs: readonly ToolchainNeed[];
  readonly configs: readonly ProviderConfig[];
}

/** Reads a project file out of the tree, `undefined` when absent. */
function treeReader(tree: Tree): (filePath: string) => string | undefined {
  return (filePath) => tree.read(filePath)?.toString('utf8') ?? undefined;
}

/**
 * Renders every member's native file over the needs assigned to it,
 * spelling each need with whatever {@link resolveSpellings} made
 * concrete. A renderer that cannot produce its file (corepack without
 * a `package.json`) throws; the caller reports that as a refusal.
 */
export function renderChoice(
  choice: ProviderChoice,
  needs: readonly ToolchainNeed[],
  tree: Tree,
  resolved: ResolvedSpellings = new Map(),
): readonly MemberRender[] {
  const read = treeReader(tree);
  return choice.members.map((member) => {
    const assigned = needsOf(choice, member, needs);
    return { member, needs: assigned, configs: member.render(assigned, read, resolved) };
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
