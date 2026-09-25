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
 * The **versions** those features request are not stated here
 * either: they come from the shared pin source (`version-pins.ts`),
 * the same one the `toolchain` block and the `ci` setup steps
 * resolve through, so a devcontainer cannot provision a JDK the
 * project does not declare a need for.
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
 * so the attachment knowledge lives here either way. The upgrade is
 * ranked by the tags, as the README section is (`rank.ts`): on a
 * project carrying `arch.server-http`, where every preset installs the
 * dev environment first, it writes the attached shape the template
 * renders; elsewhere, where the dev environment is an extra installed
 * after the dev container, it keeps the shape that order has always
 * written.
 */

import { placeReadmeSection } from '../rank.js';
import { anyProjectName, codeOnly, eolAware } from '../util.js';
import { loadToolchainPins, type ToolchainPins } from './version-pins.js';
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
          return placeReadmeSection(existing, readmeSection(attachDevEnv), ctx.manifest.tags);
        }),
      },
    ],
    tagsAdd: [DEV_CONTAINER_TAG],
  };
}

/** The base image both definition shapes put the workspace on. */
const BASE_IMAGE = 'mcr.microsoft.com/devcontainers/base:ubuntu';

/** The note the attached shape carries on why it is Compose-based. */
const ATTACH_NOTE = `  //
  // Compose-based on purpose: the workspace is one extra service
  // (see compose.yaml here) layered onto ../dev/compose.yaml, so it
  // joins the dev environment's own Compose project and network —
  // the services there (a database, the monitoring stack) are
  // reachable by their service names, and a dev env already running
  // on the host is attached to, not restarted.`;

const ATTACHED_FIELDS = (projectName: string): string =>
  `  "dockerComposeFile": ["../dev/compose.yaml", "compose.yaml"],
  "service": "workspace",
  "workspaceFolder": "/workspaces/${projectName}",
  "overrideCommand": true,`;

const DOCKER_FEATURE = '    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}';

/**
 * Upgrades a standalone `devcontainer.json` to the attached shape —
 * the dev-env vertical applies this when it is installed *after*
 * the dev container, so brownfield install order does not matter.
 * Idempotent on an already-attached definition. Throws when the
 * definition has drifted from the scaffolded standalone shape
 * (e.g. a custom base image): an automatic rewrite would silently
 * lose the customization, so the attachment is left to the user
 * with the recipe in the message.
 *
 * Where the upgrade puts what it adds is ranked by `tags`. On a
 * project carrying `arch.server-http` every preset installs the dev
 * environment before the dev container, which then renders the
 * attached shape itself, so the upgrade writes what the template
 * renders: the attach note above `"name"` — when `"name"` is still the
 * line above the image, as the standalone shape renders it — and the
 * docker feature after the family's own, or first where the features
 * object does not close on a line of its own. Anywhere else the dev
 * environment is an extra, installed after the dev container, so the
 * upgrade keeps the shape it has always written there: `"name"` above
 * the note, the docker feature first. Either way everything else the
 * user wrote into the file stays as it was.
 */
export function attachDevContainerToDevEnv(
  existing: string,
  projectName: string,
  tags: readonly Tag[],
): string {
  if (existing.includes('"dockerComposeFile"')) return existing;
  const anchor = `  "image": "${BASE_IMAGE}",`;
  if (!existing.includes(anchor)) {
    throw new Error(
      `.devcontainer/devcontainer.json has drifted from the scaffolded shape — attach it to the dev environment manually: replace its "image" with ` +
        `"dockerComposeFile": ["../dev/compose.yaml", "compose.yaml"], "service": "workspace", "workspaceFolder": "/workspaces/${projectName}", "overrideCommand": true, ` +
        `move the image into a .devcontainer/compose.yaml workspace service, and add the docker-outside-of-docker feature`,
    );
  }
  if (tags.includes('arch.server-http')) return attachedAsRendered(existing, anchor, projectName);
  const attached = existing.replace(anchor, `${ATTACH_NOTE}\n${ATTACHED_FIELDS(projectName)}`);
  if (attached.includes('docker-outside-of-docker')) return attached;
  return attached.replace('  "features": {\n', `  "features": {\n${DOCKER_FEATURE},\n`);
}

/**
 * The attached shape as the template renders it: the note above the
 * `"name"` line when that is the line above `anchor`, and above the
 * fields that replace `anchor` otherwise; the docker feature last.
 */
function attachedAsRendered(existing: string, anchor: string, projectName: string): string {
  const lines = existing.split('\n');
  const image = lines.findIndex((line) => line.includes(anchor));
  const note = /^\s*"name"\s*:/.test(lines[image - 1] ?? '') ? image - 1 : image;
  lines[image] = (lines[image] as string).replace(anchor, ATTACHED_FIELDS(projectName));
  lines.splice(note, 0, ATTACH_NOTE);
  const attached = lines.join('\n');
  return attached.includes('docker-outside-of-docker') ? attached : withDockerFeatureLast(attached);
}

/**
 * `text` with the docker feature after the last entry of its
 * top-level `"features"` object — its opening brace, where it has
 * none — as the template lists it. Where the brace that closes that
 * object is not the first code on its line, or no line between the
 * last entry and that brace is out of a comment, the feature goes
 * first instead, as the other shape lists it; where no such object
 * opens on a line of its own, `text` stays as it was. The object is
 * read as code alone (`util.ts`'s `codeOnly`), so a comment is no
 * entry and a brace in one closes nothing: the comma the last entry
 * takes goes where its code ends, ahead of a comment trailing it, and
 * the feature on the first line after that entry a comment does not
 * hold.
 */
function withDockerFeatureLast(text: string): string {
  const lines = text.split('\n');
  const code = codeOnly(text).code.split('\n');
  const isCode = (index: number): boolean => (code[index] as string).trim() !== '';
  const open = lines.findIndex((line, index) => line === '  "features": {' && isCode(index));
  if (open === -1) return text;
  const close = closingLine(code, open);
  let last = close - 1;
  while (last > open && !isCode(last)) last -= 1;
  const at = close === -1 ? -1 : firstLiveLine(lines, last + 1, close);
  if (at === -1) {
    lines.splice(open + 1, 0, `${DOCKER_FEATURE},`);
    return lines.join('\n');
  }
  const end = (code[last] as string).trimEnd().length;
  const comma = (code[last] as string)[end - 1] === ',';
  if (last !== open && !comma) {
    const entry = lines[last] as string;
    lines[last] = `${entry.slice(0, end)},${entry.slice(end)}`;
  }
  lines.splice(at, 0, comma ? `${DOCKER_FEATURE},` : DOCKER_FEATURE);
  return lines.join('\n');
}

/**
 * The index of the line in `code` holding the brace that closes the
 * object whose opening brace ends line `open`, when that brace is the
 * first code on its line; -1 where it is not, or where nothing closes
 * the object.
 */
function closingLine(code: readonly string[], open: number): number {
  let depth = 0;
  for (let at = open; at < code.length; at += 1) {
    const line = code[at] as string;
    for (let k = 0; k < line.length; k += 1) {
      if (line[k] === '{') depth += 1;
      if (line[k] !== '}') continue;
      depth -= 1;
      if (depth === 0) return line.slice(0, k).trim() === '' ? at : -1;
    }
  }
  return -1;
}

/**
 * The first index, from `from` to `to`, at which the docker feature
 * spliced into `lines` would be code rather than inside a comment; -1
 * where there is none.
 */
function firstLiveLine(lines: readonly string[], from: number, to: number): number {
  for (let at = from; at <= to; at += 1) {
    if (codeOnly([...lines.slice(0, at), DOCKER_FEATURE].join('\n')).code.endsWith('{}')) return at;
  }
  return -1;
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

/**
 * Declares one family adapter over the shared machinery. The family
 * callback is handed the resolved pins alongside the context: the
 * versions its features request are read from the registry through
 * the TemplateSource port before it runs, so a family adapter stays
 * a plain function of what it was given — see `version-pins.ts`.
 */
export function devContainerAdapter(
  id: string,
  requires: readonly Tag[],
  family: (ctx: Ctx, pins: ToolchainPins) => DevContainerFamily,
): Adapter {
  return {
    id,
    vertical: 'dev-container',
    covers: ['definition'],
    predicate: { requires },
    contribute: async (ctx) =>
      devContainerDefinition(ctx, family(ctx, await loadToolchainPins(ctx, id))),
  };
}
