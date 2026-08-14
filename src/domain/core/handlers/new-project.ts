/**
 * Handler for `keel.new-project` — bootstrap a greenfield project
 * from a stack preset.
 *
 * Single-service pipeline:
 *   1. Resolve the stack preset (`quarkus-cli`, …).
 *   2. Refuse if a manifest already exists under the project scope —
 *      `keel new` is greenfield-only; brownfield is `keel add`.
 *   3. Build an empty v2 manifest seeded with the stack's tags, its
 *      declared peer projections, and any pre-supplied sticky answers.
 *   4. Install each vertical in stack order against a fresh Tree.
 *      Tags emitted by adapters via `tagsAdd` accumulate into the
 *      manifest snapshot the next vertical sees.
 *   5. Under dry-run: report the plan, commit nothing.
 *   6. Otherwise: commit the Tree, persist the manifest, then run
 *      the deferred actions. Persisting the manifest *before*
 *      actions keeps the workspace recoverable if an action throws
 *      (e.g. `gradle wrapper` with no `gradle` on PATH) — files and
 *      manifest stay in sync.
 *
 * Composite pipeline (stacks declaring `services`): each service is
 * a full single-service install into its own subdirectory — own
 * Tree, own manifest — with its siblings' `projects` tags recorded
 * as `peers` so peer-conditional adapters resolve. The repository
 * layout is the user's choice: under **monorepo** the `vcs` vertical
 * is hoisted out of the services and runs once at the product root
 * together with the composite stack's own glue verticals; under
 * **polyrepo** every service keeps its own `vcs` run and no shared
 * root artifacts exist. Commit order matches the single flow, per
 * scope: trees, then manifests, then deferred actions (root first,
 * then services in declaration order).
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { InstallReport, NewProjectCommand, RepoLayout } from '../../contract/commands.js';
import type { DeferredAction, Question, Tree, Vertical } from '../../contract/composition.js';
import {
  emptyManifestV2,
  projectScopeRoot,
  type ManifestV2,
  type PeerLink,
} from '../../contract/manifest.js';
import type { TreeChange } from '../../contract/ports/tree.js';
import { runActions } from '../actions.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from '../adapters/jvm-module-layout.js';
import { installVertical } from '../install.js';
import {
  getStack,
  listStackIds,
  type BuildSystemOption,
  type ModuleLayoutOption,
  type Stack,
  type StackService,
} from '../stacks.js';
import { vcsVertical } from '../verticals/vcs.js';
import type { InstallDeps } from './deps.js';
import type { Tag } from '../../contract/composition.js';

const LAYOUT_QUESTION: Question = {
  id: 'layout',
  prompt: 'Repository layout',
  doc: 'How the services of this product live in version control.',
  choices: [
    {
      value: 'monorepo',
      label: 'monorepo — one repository, services as subdirectories',
      doc: 'One PR/CI spans every service; cross-service changes land atomically; the API contract lives in one place.',
    },
    {
      value: 'polyrepo',
      label: 'polyrepo — one repository per service',
      doc: 'Independent deploy cadence and access control per service; cross-service changes become one PR per repository.',
    },
  ],
  default: 'monorepo',
  memory: 'repeat',
};

interface ResolvedService {
  readonly path: string;
  readonly stack: Stack;
  readonly extraVerticals: readonly Vertical[];
}

/** One scope (product root or service) staged by a composite install. */
interface StagedScope {
  /** Path prefix for report changes; '' for the product root. */
  readonly prefix: string;
  readonly cwd: string;
  readonly tree: Tree;
  readonly manifest: ManifestV2;
  readonly actions: readonly DeferredAction[];
}

/** Executes {@link NewProjectCommand}s. */
export class NewProjectHandler implements Handler<NewProjectCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is NewProjectCommand {
    return action.kind === 'keel.new-project';
  }

  async handle(command: NewProjectCommand): Promise<Result<InstallReport>> {
    const stack = getStack(command.stack);
    if (!stack) {
      return err(
        new DomainError(
          `unknown stack '${command.stack}'; available: ${listStackIds().join(', ')}`,
          'keel.unknown-stack',
        ),
      );
    }
    return stack.services
      ? this.handleComposite(command, stack)
      : this.handleSingle(command, stack);
  }

  private async handleSingle(
    command: NewProjectCommand,
    stack: Stack,
  ): Promise<Result<InstallReport>> {
    const scopeRoot = projectScopeRoot(command.cwd);
    if ((await this.deps.manifests.read(scopeRoot)) !== null) {
      return err(alreadyInitialised(scopeRoot));
    }

    const buildTag = await this.resolveBuildSystem(command, stack);
    if (!buildTag.ok) return buildTag;

    const layoutTag = await this.resolveModuleLayout(command, stack);
    if (!layoutTag.ok) return layoutTag;

    const peerTag = peerContextTag(command, stack, layoutTag.value);
    if (!peerTag.ok) return peerTag;

    const now = this.deps.clock.nowIso();
    const staged = await this.stageStack({
      prefix: '',
      cwd: command.cwd,
      stack,
      buildTag: buildTag.value,
      layoutTag: layoutTag.value,
      peerTag: peerTag.value,
      peers: [],
      services: [],
      skipVcs: false,
      command,
      now,
    });

    const report: InstallReport = {
      subject: stack.id,
      changes: staged.tree.changes(),
      actions: staged.actions.map((a) => a.description),
      committed: !command.dryRun,
    };

    if (command.dryRun) return ok(report);
    await this.commitScopes([staged]);
    return ok(report);
  }

  private async handleComposite(
    command: NewProjectCommand,
    stack: Stack,
  ): Promise<Result<InstallReport>> {
    const resolved: ResolvedService[] = [];
    for (const service of stack.services ?? []) {
      const serviceStack = getStack(service.stack);
      if (!serviceStack) {
        return err(
          new DomainError(
            `stack '${stack.id}': service '${service.path}' references unknown stack '${service.stack}'`,
            'keel.unknown-stack',
          ),
        );
      }
      if (serviceStack.services) {
        return err(
          new DomainError(
            `stack '${stack.id}': service '${service.path}' references composite stack '${service.stack}' — composite stacks cannot nest`,
            'keel.invalid-stack',
          ),
        );
      }
      resolved.push({
        path: service.path,
        stack: serviceStack,
        extraVerticals: service.extraVerticals ?? [],
      });
    }

    if (command.buildSystem !== undefined) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — its services scaffold on each service stack's default build system, so --build-system does not apply`,
          'keel.invalid-build-system',
        ),
      );
    }

    if (command.moduleLayout !== undefined) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — its services scaffold on each service stack's default module layout, so --module-layout does not apply`,
          'keel.invalid-module-layout',
        ),
      );
    }

    if (command.withPeerContext === true) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — its services scaffold on each service stack's default module layout, so --with-peer-context does not apply`,
          'keel.invalid-peer-context',
        ),
      );
    }

    const layout = await this.resolveLayout(command);
    if (!layout.ok) return layout;

    const rootScope = projectScopeRoot(command.cwd);
    if ((await this.deps.manifests.read(rootScope)) !== null) {
      return err(alreadyInitialised(rootScope));
    }
    for (const service of resolved) {
      const scope = projectScopeRoot(path.join(command.cwd, service.path));
      if ((await this.deps.manifests.read(scope)) !== null) {
        return err(alreadyInitialised(scope));
      }
    }

    const now = this.deps.clock.nowIso();
    const monorepo = layout.value === 'monorepo';
    const scopes: StagedScope[] = [];

    if (monorepo) {
      scopes.push(
        await this.stageStack({
          prefix: '',
          cwd: command.cwd,
          stack,
          buildTag: null,
          layoutTag: null,
          peers: [],
          services: (stack.services ?? []).map((s: StackService) => ({
            path: s.path,
            stack: s.stack,
          })),
          skipVcs: false,
          command,
          now,
        }),
      );
    }

    for (const service of resolved) {
      scopes.push(
        await this.stageStack({
          prefix: service.path,
          cwd: path.join(command.cwd, service.path),
          stack: service.stack,
          buildTag: defaultBuildTag(service.stack),
          layoutTag: defaultLayoutTag(service.stack),
          peers: peersFor(service, resolved),
          services: [],
          skipVcs: monorepo,
          extraVerticals: service.extraVerticals,
          command,
          now,
        }),
      );
    }

    const changes: TreeChange[] = scopes.flatMap((scope) =>
      scope.tree
        .changes()
        .map((c) => (scope.prefix === '' ? c : { ...c, path: `${scope.prefix}/${c.path}` })),
    );
    const actions = scopes.flatMap((scope) =>
      scope.actions.map((a) =>
        scope.prefix === '' ? a.description : `${scope.prefix}: ${a.description}`,
      ),
    );
    const report: InstallReport = {
      subject: stack.id,
      changes,
      actions,
      committed: !command.dryRun,
    };

    if (command.dryRun) return ok(report);
    await this.commitScopes(scopes);
    return ok(report);
  }

  /**
   * Installs one stack's verticals against a fresh manifest and Tree
   * rooted at `cwd`. Nothing is committed — the caller owns commit
   * order across scopes.
   */
  private async stageStack(inputs: {
    prefix: string;
    cwd: string;
    stack: Stack;
    /** The chosen build system's `pkg.*` tag; null when the stack's `tags` pin it. */
    buildTag: Tag | null;
    /** The chosen module layout's `layout.*` tag; null when the stack offers no choice. */
    layoutTag: Tag | null;
    /** `modules.peer-context` when the second context was opted into; null otherwise. */
    peerTag?: Tag | null;
    peers: readonly PeerLink[];
    services: ManifestV2['services'];
    skipVcs: boolean;
    extraVerticals?: readonly Vertical[];
    command: NewProjectCommand;
    now: string;
  }): Promise<StagedScope> {
    let manifest: ManifestV2 = {
      ...emptyManifestV2(inputs.now, this.deps.keelVersion),
      tags: [
        ...inputs.stack.tags,
        ...(inputs.buildTag ? [inputs.buildTag] : []),
        ...(inputs.layoutTag ? [inputs.layoutTag] : []),
        ...(inputs.peerTag ? [inputs.peerTag] : []),
      ].sort(),
      answers: inputs.command.answers,
      projects: [...(inputs.stack.projects ?? [])],
      peers: inputs.peers,
      services: inputs.services,
    };

    const tree = this.deps.trees(inputs.cwd);
    const collected: DeferredAction[] = [];
    const own = inputs.skipVcs
      ? inputs.stack.verticals.filter((v) => v.id !== vcsVertical.id)
      : inputs.stack.verticals;
    const verticals = [...own, ...(inputs.extraVerticals ?? [])];

    for (const vertical of verticals) {
      const result = await installVertical({
        vertical,
        manifest,
        tree,
        mode: inputs.command.interactive ? 'interactive' : 'non-interactive',
        prompt: this.deps.prompt,
        logger: this.deps.logger,
        cwd: inputs.cwd,
        templates: this.deps.templates,
        processes: this.deps.processes,
        now: () => inputs.now,
      });
      manifest = result.manifest;
      collected.push(...result.applyResult.actions);
    }

    return { prefix: inputs.prefix, cwd: inputs.cwd, tree, manifest, actions: collected };
  }

  /**
   * Commits staged scopes in the recoverable order the single flow
   * established: every tree, then every manifest, then deferred
   * actions per scope — so a failed action (missing `gradle`, no
   * network for `npm install`) leaves coherent files + manifests.
   */
  private async commitScopes(scopes: readonly StagedScope[]): Promise<void> {
    for (const scope of scopes) await scope.tree.commit();
    for (const scope of scopes) {
      await this.deps.manifests.write(projectScopeRoot(scope.cwd), scope.manifest);
    }
    const runDeferred = this.deps.runDeferred ?? runActions;
    for (const scope of scopes) {
      await runDeferred({
        actions: scope.actions,
        cwd: scope.cwd,
        logger: this.deps.logger,
        processes: this.deps.processes,
        dryRun: false,
      });
    }
  }

  /**
   * Resolves the build system for a single-service stack: the
   * `--build-system` id when supplied, the interactive choice when
   * the stack declares more than one, the stack default otherwise.
   * Returns `null` for stacks whose `tags` pin their build system.
   */
  private async resolveBuildSystem(
    command: NewProjectCommand,
    stack: Stack,
  ): Promise<Result<Tag | null>> {
    const options = stack.buildSystems ?? [];
    const fallback = options[0];
    if (!fallback) {
      if (command.buildSystem !== undefined) {
        return err(
          new DomainError(
            `stack '${stack.id}' has a fixed build system — remove --build-system`,
            'keel.invalid-build-system',
          ),
        );
      }
      return ok(null);
    }
    if (command.buildSystem !== undefined) {
      const chosen = options.find((o) => o.id === command.buildSystem);
      if (!chosen) {
        return err(invalidBuildSystem(stack, command.buildSystem, options));
      }
      return ok(chosen.tag);
    }
    if (!command.interactive || options.length === 1) return ok(fallback.tag);
    const answer = (await this.deps.prompt.ask(buildSystemQuestion(options, fallback))).trim();
    const chosen = options.find((o) => o.id === answer);
    if (!chosen) return err(invalidBuildSystem(stack, answer, options));
    return ok(chosen.tag);
  }

  /**
   * Resolves the module layout for a single-service stack: the
   * `--module-layout` id when supplied, the interactive choice when
   * the stack declares more than one, the stack default otherwise.
   * Returns `null` for stacks that offer no choice — their adapters
   * resolve to `basic`.
   */
  private async resolveModuleLayout(
    command: NewProjectCommand,
    stack: Stack,
  ): Promise<Result<Tag | null>> {
    const options = stack.moduleLayouts ?? [];
    const fallback = options[0];
    if (!fallback) {
      if (command.moduleLayout !== undefined) {
        return err(
          new DomainError(
            `stack '${stack.id}' ships a single module layout — remove --module-layout`,
            'keel.invalid-module-layout',
          ),
        );
      }
      return ok(null);
    }
    if (command.moduleLayout !== undefined) {
      const chosen = options.find((o) => o.id === command.moduleLayout);
      if (!chosen) return err(invalidModuleLayout(stack, command.moduleLayout, options));
      return ok(chosen.tag);
    }
    if (!command.interactive || options.length === 1) return ok(fallback.tag);
    const answer = (await this.deps.prompt.ask(moduleLayoutQuestion(options, fallback))).trim();
    const chosen = options.find((o) => o.id === answer);
    if (!chosen) return err(invalidModuleLayout(stack, answer, options));
    return ok(chosen.tag);
  }

  private async resolveLayout(command: NewProjectCommand): Promise<Result<RepoLayout>> {
    if (command.layout !== undefined) {
      if (command.layout !== 'monorepo' && command.layout !== 'polyrepo') {
        return err(
          new DomainError(
            `invalid layout '${String(command.layout)}' — expected 'monorepo' or 'polyrepo'`,
            'keel.invalid-layout',
          ),
        );
      }
      return ok(command.layout);
    }
    if (!command.interactive) return ok('monorepo');
    const answer = (await this.deps.prompt.ask(LAYOUT_QUESTION)).trim();
    if (answer !== 'monorepo' && answer !== 'polyrepo') {
      return err(
        new DomainError(
          `invalid layout '${answer}' — expected 'monorepo' or 'polyrepo'`,
          'keel.invalid-layout',
        ),
      );
    }
    return ok(answer);
  }
}

function buildSystemQuestion(
  options: readonly BuildSystemOption[],
  fallback: BuildSystemOption,
): Question {
  return {
    id: 'buildSystem',
    prompt: 'Build system',
    doc: 'How the scaffolded project is built; every other choice is unaffected.',
    choices: options.map((o) => ({ value: o.id, label: o.label, doc: o.doc })),
    default: fallback.id,
    memory: 'repeat',
  };
}

function moduleLayoutQuestion(
  options: readonly ModuleLayoutOption[],
  fallback: ModuleLayoutOption,
): Question {
  return {
    id: 'moduleLayout',
    prompt: 'Module layout',
    doc: 'How the project is carved into modules. Not the repository layout — this is about bounded contexts, not repositories.',
    choices: options.map((o) => ({ value: o.id, label: o.label, doc: o.doc })),
    default: fallback.id,
    memory: 'repeat',
  };
}

function invalidModuleLayout(
  stack: Stack,
  requested: string,
  options: readonly ModuleLayoutOption[],
): DomainError {
  return new DomainError(
    `stack '${stack.id}' does not support module layout '${requested}' — available: ${options
      .map((o) => o.id)
      .join(', ')}`,
    'keel.invalid-module-layout',
  );
}

function invalidBuildSystem(
  stack: Stack,
  requested: string,
  options: readonly BuildSystemOption[],
): DomainError {
  return new DomainError(
    `stack '${stack.id}' does not support build system '${requested}' — available: ${options
      .map((o) => o.id)
      .join(', ')}`,
    'keel.invalid-build-system',
  );
}

/** The default build-system tag of a service stack, if it declares a choice. */
function defaultBuildTag(stack: Stack): Tag | null {
  return stack.buildSystems?.[0]?.tag ?? null;
}

/**
 * Resolves `--with-peer-context` into the tag that seeds the second
 * bounded context, rejecting it where there would be no seam for that
 * context to meet the first at.
 *
 * The flag is only meaningful under the modulith: the flat trisection
 * has one hexagon and no `user-side/service`, so a peer would have
 * nothing to reach through. Failing loudly beats silently scaffolding
 * one context and leaving the user to wonder where the other went.
 */
function peerContextTag(
  command: NewProjectCommand,
  stack: Stack,
  layoutTag: Tag | null,
): Result<Tag | null> {
  if (command.withPeerContext !== true) return ok(null);
  if (layoutTag !== MODULITH_LAYOUT_TAG) {
    return err(
      new DomainError(
        `--with-peer-context needs the modulith layout: a second bounded context meets the first at user-side/service, which the flat layout does not have. Add --module-layout=modulith${
          stack.moduleLayouts === undefined ? ` (stack '${stack.id}' does not offer one)` : ''
        }`,
        'keel.invalid-peer-context',
      ),
    );
  }
  return ok(PEER_CONTEXT_TAG);
}

/** The default module-layout tag of a service stack, if it declares a choice. */
function defaultLayoutTag(stack: Stack): Tag | null {
  return stack.moduleLayouts?.[0]?.tag ?? null;
}

function alreadyInitialised(scopeRoot: string): DomainError {
  return new DomainError(
    `project already initialised at ${scopeRoot} — 'keel new' is greenfield-only`,
    'keel.already-initialised',
  );
}

/**
 * Relative ref from one service directory to a sibling's, with posix
 * separators — correct at any nesting depth (`apps/backend` →
 * `apps/frontend` is `../frontend`, not `../apps/frontend`).
 */
export function peerRef(fromServicePath: string, toServicePath: string): string {
  return toPosix(path.relative(fromServicePath, toServicePath));
}

/**
 * The peers a service sees: every sibling's declared projections,
 * ref'd relative to the service's own directory.
 */
function peersFor(service: ResolvedService, all: readonly ResolvedService[]): PeerLink[] {
  return all
    .filter((other) => other.path !== service.path)
    .map((other) => ({
      ref: peerRef(service.path, other.path),
      tags: [...(other.stack.projects ?? [])].sort(),
    }));
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
