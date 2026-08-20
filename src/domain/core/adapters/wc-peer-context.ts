/**
 * `walking-skeleton/wc-peer-context` adapter — scaffolds the **second
 * bounded context** under the `web-components` modulith, opted into
 * with `keel new --with-peer-context`.
 *
 * With one context the modulith's central claim — that contexts meet
 * only at `./service` — is asserted rather than exercised: nothing in
 * the emitted workspace consumes the seam, so nothing proves it
 * holds. `guestbook` is the consumer that does. It needs a welcome to
 * record, `greeting` is the context that composes one, and the only
 * edge between them runs through a **gateway** at
 * `modules/guestbook/src/infra/greeting-gateway/` that imports
 * `@<scope>/greeting/service` and nothing else of greeting's.
 *
 * **The peer ships a UI, and that is the point on this stack.** A
 * browser context's whole shape is elements bound to ports over the
 * WCCG Context protocol, so a peer with no element would leave every
 * rule the assembly's ordering exists for untested. It brings a
 * `guestbook-view`, its own context keys, and its own tag prefix —
 * which is where the second context earns the tag rule: `<scope>-view`
 * would collide with greeting's, and a custom-element collision is a
 * silent blank box, never an error.
 *
 * **The seam is fire-and-observe, because that is what a browser
 * context publishes.** `greet` records and notifies; `latest` reads.
 * So asking for a welcome genuinely publishes a greeting, and the
 * greeting view on the page re-renders when the guestbook is signed —
 * the cross-context call is visible on screen, which is the strongest
 * form of "the seam is exercised rather than asserted" this stack can
 * offer.
 *
 * **What holds the wall is a lint, and the docs say so**, exactly as
 * on `ts-http`. The `exports` map is real enforcement for depth — a
 * deep import is a `TS2307` and a bundler failure — but it cannot
 * hold the *peer* rule, because greeting's facade legitimately
 * publishes its contract face. That rule is
 * `peers-meet-at-the-service-seam` in the emitted
 * `.dependency-cruiser.cjs`.
 *
 * **Three patches, and each is load-bearing.** The app's manifest
 * gains the peer; `main.ts` gains its ports and its
 * `defineGuestbookElements()`; `index.html` gains the element itself.
 * Drop the last and the context is wired to a provider nobody asks;
 * drop the middle and the element is defined by nothing — either way
 * the peer is emitted and reaches no user, which is the JVM failure
 * this adapter family exists to prevent.
 */

import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';
import { wcLayout, wcPeerPackage, type WcLayoutPaths } from './wc-module-layout.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './module-layout.js';
import type { Adapter, ContributionPatch, ManifestV2 } from '../../contract/composition.js';
import { eolAware } from '../util.js';

export const WC_PEER_CONTEXT_ID = 'walking-skeleton/wc-peer-context';

const TEMPLATE_ROOT = 'composition/walking-skeleton/wc-peer-context/templates';

/** The element this context contributes to the page. */
const VIEW = 'view';

export const wcPeerContextAdapter: Adapter = {
  id: WC_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.typescript', 'runtime.browser', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  after: [WC_SPA_BOOTSTRAP_ID],
  async contribute(ctx) {
    const scope = bootstrapScope(ctx.manifest);
    const layout = wcLayout(ctx.manifest.tags, scope);
    const peer = wcPeerPackage(layout);
    const servicePkg = layout.servicePkg;
    if (peer === null || servicePkg === null) {
      throw new Error(
        `${WC_PEER_CONTEXT_ID}: no peer seam under layout '${layout.layout}' — the flat trisection has a single hexagon`,
      );
    }
    const { pm, workspaceDep } = tsWorkspaceVars(ctx.manifest.tags);
    const viewTag = peer.elementTag(VIEW);

    const vars = {
      pm,
      scope,
      workspaceDep,
      viewTag,
      peerPkg: peer.pkg,
      contextPkg: layout.corePkg,
      contextProtocolPkg: layout.contextProtocolPkg ?? '',
      designSystemPkg: layout.designSystemPkg,
      servicePkg,
    };
    const [context, assembly] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, '', vars),
      ctx.templates.render(`${TEMPLATE_ROOT}/assembly`, layout.appRoot, vars),
    ]);

    return {
      files: [...context, ...assembly],
      patches: [
        appDependencyPatch(layout, peer.pkg, workspaceDep),
        appWiringPatch(layout, peer),
        markupPatch(layout, viewTag),
      ],
    };
  },
};

/** The npm scope the bootstrap recorded, or a hard failure. */
function bootstrapScope(manifest: ManifestV2): string {
  const scope = manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope;
  if (!scope) {
    throw new Error(
      `${WC_PEER_CONTEXT_ID}: requires '${WC_SPA_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
    );
  }
  return scope;
}

/**
 * Declares the peer on the deployment unit's manifest, and gives that
 * package a `test` script.
 *
 * The script is not incidental. The assembly is the only place
 * allowed to name both contexts, so the one test that drives the
 * cross-context call with no fakes has to live there — the same test
 * inside `modules/guestbook/` would import greeting's facade and fail
 * `peers-meet-at-the-service-seam`. Until a peer exists the app has
 * nothing worth testing, which is why the script arrives with one.
 */
function appDependencyPatch(
  layout: WcLayoutPaths,
  peerPkg: string,
  workspaceDep: string,
): ContributionPatch {
  const target = `${layout.appRoot}/package.json`;
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(`"${peerPkg}"`)) return existing;
      const dependency = `"${layout.corePkg}": "${workspaceDep}"`;
      if (!existing.includes(dependency)) {
        throw new Error(
          `${WC_PEER_CONTEXT_ID}: no '${layout.corePkg}' dependency in '${target}' to add the peer beside`,
        );
      }
      const scripts = '"typecheck": "tsc --noEmit"';
      const devDeps = '"typescript": "^6.0.0"';
      for (const [anchor, what] of [
        [scripts, 'the typecheck script'],
        [devDeps, 'the typescript devDependency'],
      ] as const) {
        if (!existing.includes(anchor)) {
          throw new Error(
            `${WC_PEER_CONTEXT_ID}: could not find ${what} in '${target}' — the wiring test would be emitted and run by nothing`,
          );
        }
      }
      return existing
        .replace(dependency, `${dependency},\n    "${peerPkg}": "${workspaceDep}"`)
        .replace(scripts, `${scripts},\n    "test": "vitest run"`)
        .replace(devDeps, `${devDeps},\n    "vitest": "^4.1.0"`);
    }),
  };
}

/**
 * Wires the peer into the assembly: its ports onto the context map,
 * and its element registration after the provider is listening.
 *
 * Order is the whole reason the second splice anchors where it does.
 * Defining an element upgrades already-parsed markup and fires
 * `connectedCallback` synchronously, so a `defineGuestbookElements()`
 * placed above the `context-request` listener would have the view ask
 * for ports nobody is answering yet — and the emitted element throws
 * exactly that error rather than rendering empty.
 */
function appWiringPatch(
  layout: WcLayoutPaths,
  peer: NonNullable<ReturnType<typeof wcPeerPackage>>,
): ContributionPatch {
  const target = `${layout.appSrc}/main.ts`;
  const elementsImport = `import { defineGuestbookElements } from '${peer.elementsPkg}';`;
  const wiringImport = "import { createGuestbookPorts } from './guestbook';";
  const portsAnchor = '  [greetingsContext, greetings],\n]);';
  const defineAnchor = 'defineGreetingElements();';
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(wiringImport)) return existing;
      for (const [anchor, what] of [
        [
          `import { defineGreetingElements } from '${layout.elementsPkg ?? ''}';`,
          'the elements import',
        ],
        [portsAnchor, 'the context-port map'],
        [defineAnchor, 'the element registration'],
      ] as const) {
        if (!existing.includes(anchor)) {
          throw new Error(
            `${WC_PEER_CONTEXT_ID}: could not find ${what} in '${target}' — the peer context would be emitted and reach no user`,
          );
        }
      }
      const importAnchor = `import { defineGreetingElements } from '${layout.elementsPkg ?? ''}';`;
      return existing
        .replace(importAnchor, `${importAnchor}\n${elementsImport}\n${wiringImport}`)
        .replace(
          portsAnchor,
          `  [greetingsContext, greetings],\n  ...createGuestbookPorts(greet, greetings),\n]);`,
        )
        .replace(defineAnchor, `${defineAnchor}\ndefineGuestbookElements();`);
    }),
  };
}

/**
 * Puts the peer's element on the page.
 *
 * Without this the context is wired to a provider nobody asks, which
 * renders as a working page that quietly proves nothing — the exact
 * shape of "emitted and wired into nothing" this adapter family
 * exists to catch.
 */
function markupPatch(layout: WcLayoutPaths, viewTag: string): ContributionPatch {
  const target = layout.appIndexHtml;
  const anchor = `<${layout.elementTag(VIEW)}></${layout.elementTag(VIEW)}>`;
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(`<${viewTag}>`)) return existing;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${WC_PEER_CONTEXT_ID}: could not find '${anchor}' in '${target}' to place the peer's element beside`,
        );
      }
      return existing.replace(anchor, `${anchor}\n        <${viewTag}></${viewTag}>`);
    }),
  };
}
