/**
 * `fullstack/product-harness` adapter — the agent harness of a
 * **composite product root**.
 *
 * Before this adapter a product root received no harness at all: no
 * `AGENTS.md`, no `CLAUDE.md`, no shims. An agent launched at the
 * monorepo root had nothing — nested service documents auto-load in
 * only some tools, and no tool hoists a service's `.claude/` to the
 * root — so the first thing it learned about a two-service product
 * was whatever `ls` told it.
 *
 * What lands is the same pair and the same shims
 * `agent-harness/claude-core` lands in a single-service project, over
 * a different document: a product-root index rather than the binding
 * spec. The services' rows are **not** written here. They are the
 * engine's `keel:map` projection over `manifest.services[]` — the
 * same seam that projects a row per bounded context — so `keel docs
 * sync|check` recomputes and drift-guards them like every other row,
 * and a service added later needs no change to this adapter.
 *
 * **Nothing is hoisted.** No `.claude/settings.json`, no hooks, no
 * skills — and no `keel:skills-index` slot either, since a slot that
 * can only ever be empty is a promise the root does not make. (An
 * absent slot the projection has no rows for is not drift, so
 * `keel docs check` stays quiet about it.) A hook at the root would
 * run the wrong gate for whichever
 * service a change is actually in, and a skill would describe a build
 * only one service has; the services' own harnesses are the harness.
 * The root's job is to make them findable and to say so out loud —
 * the seeded document carries that reason, because a reader who does
 * not find it there will reasonably conclude the root was forgotten.
 *
 * The adapter adds {@link AGENT_HARNESS_TAG} rather than relying on
 * the `agent-harness` vertical, which does not install at a product
 * root (`keel add agent-harness` there answers that the services have
 * it).
 * The tag is what opens the engine's final harness pass, and hence
 * the index projection, for this scope.
 *
 * Composition:
 *   - covers `product-harness` of the `fullstack` vertical, which the
 *     composite orchestrator installs only where a shared product
 *     root exists (monorepo layout); a polyrepo product has no root
 *     to document;
 *   - predicate: empty — fires whenever the vertical installs;
 *   - the document is a seeded upsert, not a whole file: once
 *     scaffolded it belongs to the project and keel owns only its
 *     regions, so a `--reapply` re-renders the map and touches
 *     nothing a person wrote around it.
 *
 * Every row the map projects resolves, because `keel new` refuses
 * `--no-agent-harness` on a composite stack: every service of a
 * product keel scaffolded carries its own `AGENTS.md`.
 */

import { AGENT_HARNESS_TAG, type Adapter } from '../../contract/composition.js';
import {
  AIDER_CONF_CONTENT,
  AIDER_CONF_TARGET,
  GEMINI_SETTINGS_CONTENT,
  GEMINI_SETTINGS_TARGET,
  POINTER_CONTENT,
  POINTER_TARGET,
  SPEC_TARGET,
} from './claude-core.js';

export const PRODUCT_HARNESS_ID = 'fullstack/product-harness';

/** The seeded product-root document, shipped as an asset like the binding spec. */
export const PRODUCT_ROOT_DOC_ASSET = 'composition/fullstack/product-harness/AGENTS.md';

export const productHarnessAdapter: Adapter = {
  id: PRODUCT_HARNESS_ID,
  vertical: 'fullstack',
  covers: ['product-harness'],
  predicate: {},
  async contribute(ctx) {
    const seed = await ctx.templates.readText(PRODUCT_ROOT_DOC_ASSET);
    return {
      tagsAdd: [AGENT_HARNESS_TAG],
      files: [
        { path: POINTER_TARGET, content: POINTER_CONTENT },
        { path: GEMINI_SETTINGS_TARGET, content: GEMINI_SETTINGS_CONTENT },
        { path: AIDER_CONF_TARGET, content: AIDER_CONF_CONTENT },
      ],
      patches: [{ target: SPEC_TARGET, seed, apply: (existing) => existing }],
    };
  },
};
