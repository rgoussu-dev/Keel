/**
 * Shared vocabulary for the `distribution` vertical's container
 * adapters — the family that ships a server-shaped project as a
 * CI-built image pushed to a registry on tag push, plus a deployment
 * descriptor.
 *
 * The adapters follow the pattern the `ci` vertical established: one
 * adapter per stack family, never per `pkg.*` tag, with the build
 * system (and everything else the release pipeline needs) read from
 * the manifest. Two dials, both sticky:
 *
 *   - **Provider** reuses `ci`'s own question and vocabulary — GHCR
 *     under `github-actions`, the GitLab Container Registry under
 *     `gitlab-ci`. When the `ci` vertical already recorded its
 *     choice (as a `ci.*` tag), that answer wins silently: two
 *     provider answers that disagree would emit a pipeline no host
 *     runs.
 *   - **Deployment flavor** — `compose` (default) or `helm`. A
 *     flavor is one template subtree, exactly like the ci provider:
 *     compose emits a production `deploy/compose.yaml`, helm a
 *     minimal `deploy/chart/`. Docker Swarm is deliberately declined
 *     (see `docs/roadmap.md` §E): it has no init-container
 *     primitive and ignores `depends_on` conditions, so the SPA's
 *     assets-image shape cannot be expressed honestly in a stack
 *     file — and a compose user who wants Swarm can `docker stack
 *     deploy` the emitted file themselves.
 *
 * House rule: the release pipeline builds the Dockerfile the
 * `containerization` vertical emitted — one image definition, no
 * second build system. That is why every adapter here requires the
 * Dockerfile to exist (the `deploy.container-image` tag) before it
 * will emit a pipeline that builds it.
 *
 * 12-factor, binding: the pushed image is environment-agnostic — one
 * image serves every environment — and every emitted descriptor
 * carries config exclusively via environment (compose `${VAR:-default}`
 * passthrough, helm `values.yaml` → env). Backing services are
 * attached resources, referenced by env-configured URL.
 */

import type {
  Contribution,
  ContributionFile,
  ContributionPatch,
  Ctx,
  ManifestV2,
  Question,
  Tag,
} from '../../contract/composition.js';
import { ciProvider, type CiProvider } from './ci-pipeline.js';

/** The tag every distribution container adapter promotes. */
export const DIST_CONTAINER_TAG: Tag = 'dist.container-image';

/** A deployment descriptor flavor keel can emit. */
export type DeployFlavor = 'compose' | 'helm';

/**
 * The deployment-flavor question, shared by every container
 * distribution adapter. Only one of them fires per project (their
 * predicates are disjoint by family), so it is asked exactly once.
 */
export const DEPLOY_QUESTION: Question = {
  id: 'deploy',
  prompt: 'Deployment flavor?',
  doc: 'The descriptor emitted beside the release pipeline; config rides the environment either way.',
  default: 'compose',
  memory: 'sticky',
  choices: [
    {
      value: 'compose',
      label: 'Compose — deploy/compose.yaml',
      doc: 'A production compose file running the pushed image; every knob is a ${VAR:-default}.',
    },
    {
      value: 'helm',
      label: 'Helm — deploy/chart/',
      doc: 'A minimal chart; values.yaml feeds the container environment.',
    },
  ],
};

/** Validates a raw `deploy` answer, failing loudly on anything else. */
export function deployFlavor(raw: string, requesterId: string): DeployFlavor {
  if (raw === 'compose' || raw === 'helm') return raw;
  throw new Error(`${requesterId}: unsupported deploy flavor '${raw}'; supported: compose, helm`);
}

/**
 * Resolves the CI provider for a distribution adapter. The `ci`
 * vertical's recorded choice (its `ci.*` tag) wins over the shared
 * question, so the two verticals can never emit for different hosts;
 * the question only decides for projects that skipped `keel add ci`.
 */
export function distributionProvider(ctx: Ctx, requesterId: string): CiProvider {
  if (ctx.manifest.tags.includes('ci.github-actions')) return 'github-actions';
  if (ctx.manifest.tags.includes('ci.gitlab-ci')) return 'gitlab-ci';
  return ciProvider(ctx.answer('provider'), requesterId);
}

/**
 * The release pipeline builds the Dockerfile the `containerization`
 * vertical emitted, so distribution without it would push nothing.
 * Fails with the fix in the message rather than letting the emitted
 * pipeline fail on the host.
 */
export function requireContainerImage(manifest: ManifestV2, requesterId: string): void {
  if (manifest.tags.includes('deploy.container-image')) return;
  throw new Error(
    `${requesterId}: the release pipeline builds the Dockerfile the containerization vertical emits — run 'keel add containerization' first ('deploy.container-image' is not in the manifest tag set)`,
  );
}

/**
 * The project name recorded by whichever walking-skeleton bootstrap
 * ran, used for descriptor defaults (e.g. `OTEL_SERVICE_NAME`, the
 * Helm chart name). Falls back to `app` for manifests that predate
 * the answer.
 */
export function bootstrapProjectName(manifest: ManifestV2): string {
  for (const [adapterId, answers] of Object.entries(manifest.answers)) {
    const name = adapterId.startsWith('walking-skeleton/') ? answers['projectName'] : undefined;
    if (name) return name;
  }
  return 'app';
}

/** Whether a vertical is recorded as installed in the manifest. */
export function hasVertical(manifest: ManifestV2, id: string): boolean {
  return manifest.verticals.some((v) => v.id === id);
}

/**
 * The variables the shared `service-deploy` descriptor trees render
 * from: the project name (defaults), and which installed verticals'
 * env knobs to expose — only variables the scaffolded service
 * actually reads appear in a descriptor, never invented ones.
 * `dbCredentials` is the JVM's split datasource login (`DB_USERNAME`
 * / `DB_PASSWORD` beside `DB_URL`); the other families carry the
 * whole login inside `DB_URL`.
 */
export function serviceDeployVars(
  manifest: ManifestV2,
  opts: { dbCredentials: boolean },
): Readonly<Record<string, unknown>> {
  return {
    projectName: bootstrapProjectName(manifest),
    observability: hasVertical(manifest, 'observability'),
    persistence: hasVertical(manifest, 'persistence'),
    dbCredentials: opts.dbCredentials,
  };
}

/** Inputs to {@link containerDistribution}. */
export interface ContainerDistributionSpec {
  /** The requesting adapter's id, for error messages. */
  readonly id: string;
  /** Template family directory, e.g. `jvm-container`. */
  readonly family: string;
  /** Variables for the per-family release-pipeline templates. */
  readonly releaseVars: Readonly<Record<string, unknown>>;
  /** Variables for the shared deployment-descriptor templates. */
  readonly deployVars: Readonly<Record<string, unknown>>;
  /**
   * Which shared descriptor tree to render: `service-deploy` (one
   * container behind an env-tunable port) or `spa-deploy` (the
   * assets image as an init container over a shared volume, served
   * by stock nginx).
   */
  readonly deployTree: 'service-deploy' | 'spa-deploy';
}

/**
 * The shared contribute body of every container distribution
 * adapter: resolve the two dials, render the provider's release
 * pipeline (GitHub Actions as workflow files; GitLab CI appended to
 * `.gitlab-ci.yml` — one file per host, so the release jobs join the
 * `ci` vertical's pipeline when it exists and seed the file when it
 * does not) and the deployment flavor's descriptor subtree.
 */
export async function containerDistribution(
  ctx: Ctx,
  spec: ContainerDistributionSpec,
): Promise<Contribution> {
  requireContainerImage(ctx.manifest, spec.id);
  const provider = distributionProvider(ctx, spec.id);
  const deploy = deployFlavor(ctx.answer('deploy'), spec.id);

  const files: ContributionFile[] = [];
  const patches: ContributionPatch[] = [];
  if (provider === 'github-actions') {
    files.push(
      ...(await ctx.templates.render(
        `composition/distribution/${spec.family}/github`,
        '',
        spec.releaseVars,
      )),
    );
  } else {
    const rendered = await ctx.templates.render(
      `composition/distribution/${spec.family}/gitlab`,
      '',
      spec.releaseVars,
    );
    for (const file of rendered) patches.push(appendPatch(file));
  }
  files.push(
    ...(await ctx.templates.render(
      `composition/distribution/${spec.deployTree}/${deploy}`,
      '',
      spec.deployVars,
    )),
  );
  return { files, patches, tagsAdd: [DIST_CONTAINER_TAG] };
}

/**
 * Appends a rendered GitLab fragment to its target pipeline file,
 * creating the file when the `ci` vertical has not already — the
 * seeded upsert the composition contract exists for.
 */
function appendPatch(file: ContributionFile): ContributionPatch {
  const content = typeof file.content === 'string' ? file.content : file.content.toString('utf8');
  return {
    target: file.path,
    seed: '',
    apply: (existing) =>
      existing.trim() === '' ? content : `${existing.trimEnd()}\n\n${content.trimStart()}`,
  };
}
