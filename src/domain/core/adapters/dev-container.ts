/**
 * Shared machinery of the `dev-container` vertical — the Dev
 * Container definition (`.devcontainer/`) every family adapter
 * renders from one template tree. The family adapters
 * (`jvm-devcontainer`, `go-devcontainer`, `rust-devcontainer`,
 * `node-devcontainer`) differ only in the toolchain features they
 * request; everything else — the definition's shape, the dev-env
 * attachment, the README section — is decided here so the four
 * cannot drift.
 *
 * The definition has two shapes, picked by whether the `dev-env`
 * vertical is recorded on the manifest:
 *
 *   - **Attached** (dev-env installed): Compose-based.
 *     `devcontainer.json` lists `../dev/compose.yaml` plus a local
 *     overlay declaring the `workspace` service, so opening the dev
 *     container joins the dev environment's own Compose project —
 *     same network, its services reachable by name, and
 *     already-running containers attached to rather than restarted.
 *     `docker-outside-of-docker` is added so the dev env can be
 *     driven (`docker compose -f dev/compose.yaml …`) from inside.
 *   - **Standalone** (no dev-env): image-based on the plain
 *     devcontainers base image; the toolchain still comes from
 *     features.
 *
 * Order matters brownfield: install `dev-env` before
 * `dev-container` to get the attached shape — the definition is not
 * rewritten when a dev env arrives later.
 */

import { anyProjectName, eolAware } from '../util.js';
import type { Adapter, Contribution, Ctx, ManifestV2, Tag } from '../../contract/composition.js';

/** Promoted by every dev-container adapter. */
export const DEV_CONTAINER_TAG: Tag = 'dev.container';

/** The shared template tree all four family adapters render. */
const TEMPLATE_ID = 'composition/dev-container/definition/templates';

/** The compose overlay, only written in the attached shape. */
export const DEV_CONTAINER_COMPOSE_TARGET = '.devcontainer/compose.yaml';

/** True when the dev-env vertical is recorded on the manifest. */
export function devEnvInstalled(manifest: ManifestV2): boolean {
  return manifest.verticals.some((v) => v.id === 'dev-env');
}

const README_MARKER = '\n### Dev container\n';

const readmeSection = (attachDevEnv: boolean): string =>
  `${README_MARKER}
\`.devcontainer/\` defines the containerized development environment:
open it with VS Code ("Reopen in Container"), the \`devcontainer\`
CLI, or GitHub Codespaces and the stack's toolchain is provisioned
for you.${
    attachDevEnv
      ? `
It layers onto \`dev/compose.yaml\`, so the workspace joins the dev
environment's network — its services are reachable by name, and a
dev env already running on the host is attached to, not restarted.`
      : ''
  }
`;

/** What a family adapter contributes on top of the shared shape. */
export interface DevContainerFamily {
  /**
   * Toolchain features, in declaration order. The shared machinery
   * appends `docker-outside-of-docker` in the attached shape.
   */
  readonly features: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Optional one-liner run after the container is created. */
  readonly postCreateCommand?: string;
}

/**
 * Renders the Dev Container definition for one family: the
 * `.devcontainer/devcontainer.json` (both shapes), the compose
 * overlay (attached shape only), and the README section.
 */
export async function devContainerDefinition(
  ctx: Ctx,
  family: DevContainerFamily,
): Promise<Contribution> {
  const projectName = anyProjectName(ctx.manifest);
  const attachDevEnv = devEnvInstalled(ctx.manifest);
  const features: Record<string, Readonly<Record<string, unknown>>> = { ...family.features };
  if (attachDevEnv) {
    features['ghcr.io/devcontainers/features/docker-outside-of-docker:1'] = {};
  }
  const rendered = await ctx.templates.render(TEMPLATE_ID, '', {
    projectName,
    attachDevEnv,
    features,
    postCreateCommand: family.postCreateCommand ?? '',
  });
  const files = attachDevEnv
    ? rendered
    : rendered.filter((f) => f.path !== DEV_CONTAINER_COMPOSE_TARGET);
  return {
    files,
    patches: [
      {
        target: 'README.md',
        apply: eolAware((existing) => {
          if (existing.includes(README_MARKER)) return existing;
          return `${existing.trimEnd()}\n${readmeSection(attachDevEnv)}`;
        }),
      },
    ],
    tagsAdd: [DEV_CONTAINER_TAG],
  };
}

/** Declares one family adapter over the shared machinery. */
export function devContainerAdapter(
  id: string,
  requires: readonly Tag[],
  family: (ctx: Ctx) => DevContainerFamily,
): Adapter {
  return {
    id,
    vertical: 'dev-container',
    covers: ['definition'],
    predicate: { requires },
    contribute: (ctx) => devContainerDefinition(ctx, family(ctx)),
  };
}
