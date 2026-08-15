/**
 * `walking-skeleton/wc-spa-bootstrap` adapter — emits a runnable
 * framework-free web-components SPA as an npm workspace: a
 * `domain/domain-api` package (ports, commands, read models — no DOM
 * lib), a `domain/domain-core` package (factories only via its
 * `exports` map), and an `application/web-app` deployment unit (Vite
 * shell whose `main.ts` is the assembly point, wiring ports to
 * elements over the WCCG Context protocol).
 *
 * This is the frontend seed of the `walking-skeleton` vertical. It
 * covers the `entrypoint` dimension and is predicated on
 * `framework.web-components + arch.spa`, the browser sibling of the
 * Quarkus CLI bootstrap's `framework.quarkus + arch.cli`.
 *
 * The architectural walls are held by the workspace itself: domain
 * packages compile with `"lib": ["ES2022"]` (no `"DOM"`), deep
 * imports die at module resolution via each package's `exports` map,
 * and the dependency direction is the workspace dependency graph.
 * There is deliberately no mediator — per-use-case driving ports are
 * delivered through typed context keys, and cross-cutting concerns
 * decorate the domain factories at the assembly point.
 */

import type { Adapter } from '../../contract/composition.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { wcLayout, type WcLayoutPaths } from './wc-module-layout.js';

export const WC_SPA_BOOTSTRAP_ID = 'walking-skeleton/wc-spa-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/wc-spa-bootstrap';

const NPM_SCOPE_RE = /^[a-z][a-z0-9-]{0,38}$/;
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

export const wcSpaBootstrapAdapter: Adapter = {
  id: WC_SPA_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['framework.web-components', 'arch.spa'] },
  questions: [
    {
      id: 'npmScope',
      prompt: 'npm scope (without the @)',
      doc: 'Used as the workspace package scope (@scope/domain-api) and the custom-element tag prefix (<scope-greeting>). Lowercase + digits + dashes; must start with a letter.',
      default: 'acme',
      memory: 'sticky',
    },
    {
      id: 'projectName',
      prompt: 'Project name',
      doc: 'Used as the workspace root package name and the page title. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const npmScope = validateNpmScope(ctx.answer('npmScope').trim());
    const projectName = validateProjectName(ctx.answer('projectName').trim());
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const layout = wcLayout(ctx.manifest.tags, npmScope);
    const suffix = layout.layout === 'modulith' ? '-modulith' : '';
    const vars = { npmScope, projectName, ...ws, ...wcLayoutVars(layout) };
    const files = await ctx.templates.render(`${TEMPLATE_ROOT}/templates${suffix}`, '', vars);
    if (ws.pm === 'pnpm') {
      files.push(...(await ctx.templates.render(`${TEMPLATE_ROOT}/pm${suffix}/pnpm`, '', vars)));
    }
    return { files };
  },
};

/**
 * The template variables every `web-components` tree needs from the
 * layout: the package names its manifests declare, the `exports` maps
 * that decide what any of them can reach, and — the one nothing else
 * would catch — the custom-element tags.
 *
 * The tags are here rather than in the templates because they are
 * spelled in three unrelated places (the registration, the markup, the
 * `HTMLElementTagNameMap` declaration) and agree only by construction.
 * The maps and the globs are splice-with-`<%-` material: they carry
 * quotes, and `<%=` would HTML-escape them into `&quot;`, which is a
 * valid EJS render and an invalid `package.json`.
 */
export function wcLayoutVars(layout: WcLayoutPaths): Readonly<Record<string, string>> {
  return {
    designSystemPkg: layout.designSystemPkg,
    contextProtocolPkg: layout.contextProtocolPkg ?? '',
    contextPkg: layout.corePkg,
    contractPkg: layout.contractPkg,
    appPkg: layout.appPkg,
    elementsPkg: layout.elementsPkg ?? '',
    plainExports: layout.exportsMap('plain'),
    contextExports: layout.exportsMap('context'),
    workspaceGlobs: layout.workspaceGlobs.map((g) => JSON.stringify(g)).join(', '),
    workspaceGlobLines: layout.workspaceGlobs.map((g) => `  - ${g}`).join('\n'),
    // `greeting` under `basic`, `greeting-view` under the modulith:
    // the element's short name is `view`, and the context qualifies it.
    viewTag: layout.layout === 'basic' ? layout.elementTag('greeting') : layout.elementTag('view'),
    buttonTag: `${layout.scope}-button`,
    greetingCardTag: `${layout.scope}-greeting-card`,
    designSystemDist: `../../${layout.designSystemRoot}/dist`,
  };
}

function validateNpmScope(s: string): string {
  if (!NPM_SCOPE_RE.test(s)) {
    throw new Error(
      `wc-spa-bootstrap: invalid npmScope '${s}' — lowercase + digits + dashes, start with a letter, ≤39 chars, no leading @`,
    );
  }
  return s;
}

function validateProjectName(s: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `wc-spa-bootstrap: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}
