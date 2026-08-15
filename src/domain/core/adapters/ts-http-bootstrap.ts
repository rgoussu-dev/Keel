/**
 * `walking-skeleton/ts-http-bootstrap` adapter — emits a runnable
 * TypeScript HTTP service as a Node workspace: the binding-spec
 * domain trisection as packages (`domain/kernel` with the
 * Command/Result/Handler/Mediator bases, `domain/contract` with the
 * greet surface, `domain/core` exposing factories only through its
 * `exports` map) plus an `application/rest` deployment unit — a
 * `node:http` server whose `main.ts` is the assembly point, wiring
 * the registry mediator per the binding spec's TypeScript-backend
 * stance (the same shape keel itself is built on).
 *
 * There is no build step: Node 22.18+ runs the TypeScript sources
 * directly (type stripping, held honest by `erasableSyntaxOnly`),
 * and per-package `tsc --noEmit` enforces the walls — domain
 * packages compile with `"types": []`, so a domain import of
 * `node:*` fails to compile.
 *
 * The workspace shape is package-manager aware: the manifest's
 * `pkg.*` tag decides between npm (hoisted `workspaces`) and pnpm
 * (`pnpm-workspace.yaml` + the `workspace:*` protocol).
 */

import type { Adapter } from '../../contract/composition.js';
import { tsLayout, type TsLayoutPaths } from './ts-module-layout.js';
import { tsWorkspaceVars } from './ts-workspace.js';

export const TS_HTTP_BOOTSTRAP_ID = 'walking-skeleton/ts-http-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-http-bootstrap';

const NPM_SCOPE_RE = /^[a-z][a-z0-9-]{0,38}$/;
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

export const tsHttpBootstrapAdapter: Adapter = {
  id: TS_HTTP_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  questions: [
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
  ],
  async contribute(ctx) {
    const npmScope = validateNpmScope(ctx.answer('npmScope').trim());
    const projectName = validateProjectName(ctx.answer('projectName').trim());
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const layout = tsLayout(ctx.manifest.tags, npmScope);
    const suffix = layout.layout === 'modulith' ? '-modulith' : '';
    const vars = { npmScope, projectName, ...ws, ...tsLayoutVars(layout) };
    const files = await ctx.templates.render(`${TEMPLATE_ROOT}/templates${suffix}`, '', vars);
    if (ws.pm === 'pnpm') {
      files.push(...(await ctx.templates.render(`${TEMPLATE_ROOT}/pm${suffix}/pnpm`, '', vars)));
    }
    return { files };
  },
};

/**
 * The template variables every `ts-http` tree needs from the layout:
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

function validateNpmScope(s: string): string {
  if (!NPM_SCOPE_RE.test(s)) {
    throw new Error(
      `ts-http-bootstrap: invalid npmScope '${s}' — lowercase + digits + dashes, start with a letter, ≤39 chars, no leading @`,
    );
  }
  return s;
}

function validateProjectName(s: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `ts-http-bootstrap: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}
