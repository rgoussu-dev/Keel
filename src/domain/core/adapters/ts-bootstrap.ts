/**
 * The shared shell of the TypeScript walking skeletons — everything
 * the `ts-http` and `ts-cli` bootstraps have in common, which is
 * everything except the deployment unit.
 *
 * The two entrypoint adapters emit the same trisected workspace: the
 * binding-spec domain as packages (`domain/kernel` with the
 * Command/Result/Handler/Mediator bases, `domain/contract` with the
 * greet surface, `domain/core` exposing factories only through its
 * `exports` map — or, under the modulith, `platform/kernel` plus the
 * `modules/greeting` context). That tree lives once, in the
 * `walking-skeleton/ts-domain` template roots — the same move
 * `jvm-domain` makes for the six JVM bootstraps — and this module is
 * the code half of the sharing: the questions, the answer validation,
 * the layout-derived template variables, and the render of the shared
 * trees.
 *
 * There is no build step anywhere in the family: Node 22.18+ runs the
 * TypeScript sources directly (type stripping, held honest by
 * `erasableSyntaxOnly`), and the wall is each package's `exports` map
 * — a deep import of a handler is a `TS2307` from `tsc` and an
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node.
 *
 * The workspace shape is package-manager aware: the manifest's
 * `pkg.*` tag decides between npm (hoisted `workspaces`) and pnpm
 * (`pnpm-workspace.yaml` + the `workspace:*` protocol).
 */

import type { Ctx, ContributionFile, Question } from '../../contract/composition.js';
import { tsLayout, type TsLayoutPaths } from './ts-module-layout.js';
import { tsWorkspaceVars, type TsWorkspaceVars } from './ts-workspace.js';

/** Id of the HTTP entrypoint bootstrap (`arch.server-http`). */
export const TS_HTTP_BOOTSTRAP_ID = 'walking-skeleton/ts-http-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-domain';

const NPM_SCOPE_RE = /^[a-z][a-z0-9-]{0,38}$/;
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * The questions every TypeScript bootstrap declares. Answers are
 * recorded under the *asking* adapter's id.
 */
export const TS_BOOTSTRAP_QUESTIONS: readonly Question[] = [
  {
    id: 'npmScope',
    prompt: 'npm scope (without the @)',
    doc: 'Used as the workspace package scope (@scope/domain-kernel). Lowercase + digits + dashes; must start with a letter.',
    default: 'acme',
    memory: 'sticky',
  },
  {
    id: 'projectName',
    prompt: 'Project name',
    doc: 'Used as the workspace root package name. Lowercase + digits + dashes; ≤63 chars.',
    default: 'walking-skeleton',
    memory: 'sticky',
  },
];

/** Everything a bootstrap needs beyond its own deployment-unit tree. */
export interface TsWorkspaceShell {
  /** The rendered shared trees: domain packages + pnpm workspace file. */
  readonly files: ContributionFile[];
  /** Template variables, ready for the entrypoint's own trees. */
  readonly vars: Readonly<Record<string, string>>;
  /** `-modulith` under that layout, `''` under `basic`. */
  readonly suffix: string;
  readonly layout: TsLayoutPaths;
  readonly ws: TsWorkspaceVars;
}

/**
 * Validates the bootstrap answers, resolves the layout, and renders
 * the entrypoint-neutral half of the workspace. The caller renders
 * its own `templates${suffix}` tree with the returned `vars` and
 * concatenates the file lists.
 */
export async function renderTsWorkspaceShell(
  ctx: Ctx,
  requesterId: string,
): Promise<TsWorkspaceShell> {
  const npmScope = validateNpmScope(ctx.answer('npmScope').trim(), requesterId);
  const projectName = validateProjectName(ctx.answer('projectName').trim(), requesterId);
  const ws = tsWorkspaceVars(ctx.manifest.tags);
  const layout = tsLayout(ctx.manifest.tags, npmScope);
  const suffix = layout.layout === 'modulith' ? '-modulith' : '';
  const vars = { npmScope, projectName, ...ws, ...tsLayoutVars(layout) };
  const files = await ctx.templates.render(`${TEMPLATE_ROOT}/templates${suffix}`, '', vars);
  if (ws.pm === 'pnpm') {
    files.push(...(await ctx.templates.render(`${TEMPLATE_ROOT}/pm${suffix}/pnpm`, '', vars)));
  }
  return { files, vars, suffix, layout, ws };
}

/**
 * The template variables every TypeScript tree needs from the layout:
 * the package names its manifests declare, and the `exports` maps that
 * decide what any of them can reach. Both are splice-with-`<%-`
 * material — they carry quotes, and `<%=` would HTML-escape them into
 * `&quot;`, which is a valid EJS render and an invalid `package.json`.
 */
function tsLayoutVars(layout: TsLayoutPaths): Readonly<Record<string, string>> {
  return {
    kernelPkg: layout.kernelPkg,
    contextPkg: layout.corePkg,
    restPkg: layout.restPkg,
    kernelExports: layout.exportsMap('kernel'),
    contextExports: layout.exportsMap('domain'),
    workspaceGlobs: layout.workspaceGlobs.map((g) => JSON.stringify(g)).join(', '),
    workspaceGlobLines: layout.workspaceGlobs.map((g) => `  - ${g}`).join('\n'),
  };
}

function validateNpmScope(s: string, requesterId: string): string {
  if (!NPM_SCOPE_RE.test(s)) {
    throw new Error(
      `${requesterId}: invalid npmScope '${s}' — lowercase + digits + dashes, start with a letter, ≤39 chars, no leading @`,
    );
  }
  return s;
}

function validateProjectName(s: string, requesterId: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `${requesterId}: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}
