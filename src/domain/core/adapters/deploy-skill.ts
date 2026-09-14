/**
 * The `deploy` skill the `iac` vertical ships — the OpenTofu loop
 * over the target it provisioned, spelled for the cloud and the
 * deployment flavor this project actually recorded.
 *
 * `iac` owns it rather than `distribution`, and the split is the
 * no-fiction rule at work: `distribution` emits a descriptor and a
 * pipeline, but nothing it ships can be deployed **to** until a
 * target exists. The pipeline facts belong in this body, not in a
 * second skill staged beside it.
 *
 * The two things the body exists for are the two that cost real
 * money to learn: `tofu apply` and `tofu destroy` mutate billable,
 * stateful infrastructure, and one workspace is one environment —
 * applying in the wrong one is how staging becomes production.
 */

import type { SkillSpec } from '../../contract/composition.js';
import type { DeployFlavor } from './distribution-container.js';

/** The skill's name — declared on the `iac` vertical's `skills`. */
export const DEPLOY_SKILL_NAME = 'deploy';

/** Which environment variables carry each cloud's credentials — never a file. */
const CREDENTIALS: Readonly<Record<string, string>> = {
  digitalocean: '`DIGITALOCEAN_TOKEN`',
  scaleway: '`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`',
};

/** The `deploy` skill for the cloud and flavor this project recorded. */
export function deploySkill(cloud: string, flavor: DeployFlavor): SkillSpec {
  const root = `iac/${cloud}`;
  const credentials = CREDENTIALS[cloud] ?? "the provider's own API-key variables";
  return {
    name: DEPLOY_SKILL_NAME,
    description:
      'Provision or change this project’s deploy target with OpenTofu. Use when asked to deploy, provision, plan, apply or tear down infrastructure.',
    body: [
      '# Deploy',
      '',
      `The target lives in \`${root}/\`, and the release pipeline is what puts an`,
      'image where it can reach one: a tag push builds and pushes the image,',
      `and \`deploy/${flavor === 'helm' ? 'chart/' : 'compose.yaml'}\` is the descriptor that runs it.`,
      'Provisioning is this skill; releasing is a tag.',
      '',
      '## Before anything',
      '',
      `1. Credentials ride the environment: ${credentials} for the provider,`,
      '   and the state backend’s `AWS_*` pair. **Never** put either in a',
      '   file — the provider blocks are deliberately empty and `*.tfvars`',
      '   is gitignored.',
      `2. First time only: \`cd ${root} && ./bootstrap.sh\`. It provisions the`,
      '   object-storage bucket the remote state lives in and then runs',
      '   `tofu init`. The bootstrap config keeps its own state local on',
      '   purpose — the bucket cannot live inside the state it hosts.',
      '',
      '## One workspace, one environment',
      '',
      '```sh',
      'tofu workspace list',
      'tofu workspace select <dev|staging|prod>   # or `new` the first time',
      '```',
      '',
      'Resource names carry `-${terraform.workspace}`, so the workspace is',
      'the environment. **Check which one you are in before every apply.**',
      'Nothing else separates them.',
      '',
      '## The loop',
      '',
      '```sh',
      'tofu plan          # read it — this is the review step, not a formality',
      'tofu apply         # mutates billable, stateful infrastructure',
      '```',
      '',
      'Read the plan and say what it will change before applying. `apply`',
      'and `destroy` are the only commands in this project that cost money',
      'and can lose data; treat a surprising plan as a wrong premise, not as',
      'something to push through.',
      '',
      '## What the target does and does not carry',
      '',
      flavor === 'helm'
        ? '- A managed Kubernetes cluster with a default node pool; `deploy/chart/` installs into it.'
        : '- One Docker host with the engine installed and a firewall opening SSH and the service port. The deploy loop is `deploy/compose.yaml` over `DOCKER_HOST=ssh://…`.',
      '- **No service configuration.** Every knob rides the descriptor’s',
      '  environment, which is what lets one image serve every workspace.',
      '  A value added here instead breaks that.',
      '- No managed database and no DNS yet. Backing services are attached',
      '  resources referenced by an env-configured URL, wherever they live.',
    ].join('\n'),
  };
}
