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
 * There is no install-order coupling brownfield: when `dev-env`
 * arrives *after* the dev container, its adapter upgrades the
 * standalone definition to the attached shape through the helpers
 * this module exports ({@link attachDevContainerToDevEnv},
 * {@link renderDevContainerOverlay}, {@link attachReadmeSection}) —
 * so the attachment knowledge lives here either way.
 */

import { anyProjectName, eolAware } from '../util.js';
import type {
  Adapter,
  Contribution,
  ContributionFile,
  Ctx,
  ManifestV2,
  Tag,
} from '../../contract/composition.js';

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

/** True when the dev-container vertical is recorded on the manifest. */
export function devContainerInstalled(manifest: ManifestV2): boolean {
  return manifest.verticals.some((v) => v.id === 'dev-container');
}

const README_MARKER = '\n### Dev container\n';

const README_BASE = `\`.devcontainer/\` defines the containerized development environment:
open it with VS Code ("Reopen in Container"), the \`devcontainer\`
CLI, or GitHub Codespaces and the stack's toolchain is provisioned
for you.`;

const README_ATTACHED = `
It layers onto \`dev/compose.yaml\`, so the workspace joins the dev
environment's network — its services are reachable by name, and a
dev env already running on the host is attached to, not restarted.`;

const readmeSection = (attachDevEnv: boolean): string =>
  `${README_MARKER}\n${README_BASE}${attachDevEnv ? README_ATTACHED : ''}\n`;

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

/** The base image both definition shapes put the workspace on. */
const BASE_IMAGE = 'mcr.microsoft.com/devcontainers/base:ubuntu';

const ATTACHED_FIELDS = (projectName: string): string =>
  `  //
  // Compose-based on purpose: the workspace is one extra service
  // (see compose.yaml here) layered onto ../dev/compose.yaml, so it
  // joins the dev environment's own Compose project and network —
  // the services there (a database, the monitoring stack) are
  // reachable by their service names, and a dev env already running
  // on the host is attached to, not restarted.
  "dockerComposeFile": ["../dev/compose.yaml", "compose.yaml"],
  "service": "workspace",
  "workspaceFolder": "/workspaces/${projectName}",
  "overrideCommand": true,`;

const DOCKER_FEATURE_LINE = '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {},';

/**
 * Upgrades a standalone `devcontainer.json` to the attached shape —
 * the dev-env vertical applies this when it is installed *after*
 * the dev container, so brownfield install order does not matter.
 * Idempotent on an already-attached definition. Throws when the
 * definition has drifted from the scaffolded standalone shape
 * (e.g. a custom base image): an automatic rewrite would silently
 * lose the customization, so the attachment is left to the user
 * with the recipe in the message.
 */
export function attachDevContainerToDevEnv(existing: string, projectName: string): string {
  if (existing.includes('"dockerComposeFile"')) return existing;
  const anchor = `  "image": "${BASE_IMAGE}",`;
  if (!existing.includes(anchor)) {
    throw new Error(
      `.devcontainer/devcontainer.json has drifted from the scaffolded shape — attach it to the dev environment manually: replace its "image" with ` +
        `"dockerComposeFile": ["../dev/compose.yaml", "compose.yaml"], "service": "workspace", "workspaceFolder": "/workspaces/${projectName}", "overrideCommand": true, ` +
        `move the image into a .devcontainer/compose.yaml workspace service, and add the docker-outside-of-docker feature`,
    );
  }
  const attached = existing.replace(anchor, ATTACHED_FIELDS(projectName));
  if (attached.includes('docker-outside-of-docker')) return attached;
  return attached.replace('  "features": {\n', `  "features": {\n${DOCKER_FEATURE_LINE}\n`);
}

/**
 * Renders the attached shape's compose overlay
 * ({@link DEV_CONTAINER_COMPOSE_TARGET}) on its own — the file the
 * dev-env vertical contributes when it upgrades an existing
 * standalone definition.
 */
export async function renderDevContainerOverlay(ctx: Ctx): Promise<ContributionFile> {
  const rendered = await ctx.templates.render(TEMPLATE_ID, '', {
    projectName: anyProjectName(ctx.manifest),
    attachDevEnv: true,
    features: {},
    postCreateCommand: '',
  });
  const overlay = rendered.find((f) => f.path === DEV_CONTAINER_COMPOSE_TARGET);
  if (!overlay) {
    throw new Error(`dev-container: template did not render ${DEV_CONTAINER_COMPOSE_TARGET}`);
  }
  return overlay;
}

/**
 * Extends the README's `### Dev container` section with the
 * attachment paragraph — the upgrade counterpart of the section the
 * standalone install wrote. No-ops when the section is absent or
 * already carries the paragraph.
 */
export function attachReadmeSection(existing: string): string {
  if (!existing.includes(README_MARKER) || existing.includes(README_ATTACHED)) return existing;
  return existing.replace(README_BASE, `${README_BASE}${README_ATTACHED}`);
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
