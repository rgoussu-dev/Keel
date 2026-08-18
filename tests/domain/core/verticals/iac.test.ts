/**
 * Tests for the `iac` vertical — the OpenTofu deploy target keyed on
 * the `dist.container-image` tag the distribution vertical promotes.
 * One case per cloud × recorded flavor asserting the emitted tree
 * matches binding spec §5 (root `iac/<target>/`, remote state +
 * bootstrap, workspaces, no secret in any file) — plus the flavor
 * read from the recorded distribution dial rather than re-asked, the
 * cloud dial's stickiness and validation, and the refusals: no
 * distribution tag (uncovered dimension) and a tag with no recorded
 * flavor answer.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { iacVertical } from '../../../../src/domain/core/verticals/iac.js';
import { ResolutionError } from '../../../../src/domain/core/resolver.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { ManifestV2 } from '../../../../src/domain/contract/composition.js';

type AnswerMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

interface InstalledIac {
  readonly cwd: string;
  readonly read: (p: string) => string;
  readonly manifest: ManifestV2;
  readonly tree: FsTree;
}

async function installIac(tags: string[], answers: AnswerMap = {}): Promise<InstalledIac> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-iac-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-18T00:00:00Z', '0.0.0-test'),
    tags,
    answers,
  };
  const result = await installVertical({
    vertical: iacVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-18T12:00:00Z',
  });
  return {
    cwd,
    read: (p: string) => tree.read(p)?.toString() ?? '',
    manifest: result.manifest,
    tree,
  };
}

/** Tag set mirroring what `keel new` … `keel add distribution` record. */
const GO_TAGS = [
  'lang.go',
  'pkg.go-modules',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
  'dist.container-image',
];

const NAME_ANSWERS: AnswerMap = {
  'walking-skeleton/go-bootstrap': {
    modulePath: 'github.com/acme/shipper',
    projectName: 'shipper',
  },
};

function withDistribution(flavor: string, extra: AnswerMap = {}): AnswerMap {
  return {
    ...NAME_ANSWERS,
    'distribution/go-container': { provider: 'github-actions', deploy: flavor },
    ...extra,
  };
}

describe('iac vertical — the recorded flavor picks the target shape', () => {
  it('provisions a Docker droplet for the compose flavor on the default cloud', async () => {
    const { read, manifest } = await installIac(GO_TAGS, withDistribution('compose'));

    const main = read('iac/digitalocean/main.tf');
    expect(main).toContain('resource "digitalocean_droplet" "host"');
    expect(main).toContain('name      = "shipper-${terraform.workspace}"');
    expect(main).toContain('user_data = file("${path.module}/cloud-init.yaml")');
    expect(main).toContain('resource "digitalocean_firewall" "host"');
    expect(main).toContain('port_range       = tostring(var.service_port)');
    expect(main).not.toContain('kubernetes');

    // The service port knob matches the compose descriptor's default.
    expect(read('iac/digitalocean/variables.tf')).toContain('default     = 8080');
    expect(read('iac/digitalocean/cloud-init.yaml')).toContain('https://get.docker.com');
    // The deploy loop reaches Docker over SSH, image and config in
    // the command's environment — never baked into the host.
    const readme = read('iac/digitalocean/README.md');
    expect(readme).toContain('DOCKER_HOST="ssh://root@$(tofu output -raw ipv4)"');
    expect(readme).toContain('docker compose -f ../../deploy/compose.yaml up -d');

    expect(manifest.tags).toContain('iac.opentofu');
    expect(manifest.tags).toContain('cloud.digitalocean');
    expect(manifest.answers['iac/deploy-target']).toEqual({ cloud: 'digitalocean' });
  });

  it('provisions a DOKS cluster for the helm flavor — latest stable, per the spec', async () => {
    const { read } = await installIac(GO_TAGS, withDistribution('helm'));

    const main = read('iac/digitalocean/main.tf');
    expect(main).toContain('resource "digitalocean_kubernetes_cluster" "cluster"');
    expect(main).toContain('data.digitalocean_kubernetes_versions.current.latest_version');
    expect(main).not.toContain('droplet');
    expect(read('iac/digitalocean/cloud-init.yaml')).toBe('');

    const readme = read('iac/digitalocean/README.md');
    expect(readme).toContain('doctl kubernetes cluster kubeconfig save');
    expect(readme).toContain('helm upgrade --install shipper ../../deploy/chart');
  });

  it('provisions a Docker instance on Scaleway for the compose flavor', async () => {
    const { read, manifest } = await installIac(
      GO_TAGS,
      withDistribution('compose', { 'iac/deploy-target': { cloud: 'scaleway' } }),
    );

    const main = read('iac/scaleway/main.tf');
    expect(main).toContain('resource "scaleway_instance_server" "host"');
    expect(main).toContain('resource "scaleway_instance_security_group" "host"');
    expect(main).toContain('port   = var.service_port');
    expect(read('iac/scaleway/outputs.tf')).toContain('scaleway_instance_ip.host.address');
    expect(read('iac/digitalocean/main.tf')).toBe('');

    expect(manifest.tags).toContain('cloud.scaleway');
    expect(manifest.tags).not.toContain('cloud.digitalocean');
  });

  it('provisions a Kapsule cluster on Scaleway for the helm flavor — private network included', async () => {
    const { read } = await installIac(
      GO_TAGS,
      withDistribution('helm', { 'iac/deploy-target': { cloud: 'scaleway' } }),
    );

    const main = read('iac/scaleway/main.tf');
    expect(main).toContain('resource "scaleway_k8s_cluster" "cluster"');
    expect(main).toContain('resource "scaleway_k8s_pool" "default"');
    // Kapsule refuses clusters without a private network.
    expect(main).toContain('private_network_id = scaleway_vpc_private_network.cluster.id');
    expect(main).toContain('data.scaleway_k8s_version.latest.name');
    expect(read('iac/scaleway/README.md')).toContain('scw k8s kubeconfig install');
  });
});

describe('iac vertical — binding spec §5 shapes every target', () => {
  it('keeps state remote with a one-shot executable bootstrap, and credentials out of every file', async () => {
    const { cwd, read, tree } = await installIac(GO_TAGS, withDistribution('compose'));

    const versions = read('iac/digitalocean/versions.tf');
    expect(versions).toContain('backend "s3"');
    expect(versions).toContain('bucket = "shipper-tofu-state"');
    expect(versions).toContain('digitaloceanspaces.com');

    const bootstrap = read('iac/digitalocean/bootstrap/main.tf');
    expect(bootstrap).toContain('resource "digitalocean_spaces_bucket" "state"');
    expect(bootstrap).toContain('name   = "shipper-tofu-state"');

    const script = read('iac/digitalocean/bootstrap.sh');
    expect(script).toContain('tofu -chdir=bootstrap apply');
    expect(script).toContain('tofu init');
    // The executable bit survives the round trip to disk.
    await tree.commit();
    const mode = (await fs.stat(path.join(cwd, 'iac/digitalocean/bootstrap.sh'))).mode;
    expect(mode & 0o111).not.toBe(0);

    // Credentials ride the environment: empty provider blocks, and no
    // token-shaped knob anywhere in the emitted tofu.
    expect(versions).toContain('provider "digitalocean" {}');
    for (const f of ['versions.tf', 'main.tf', 'variables.tf', 'bootstrap/main.tf']) {
      expect(read(`iac/digitalocean/${f}`)).not.toMatch(/token\s*=/);
    }
    expect(read('iac/digitalocean/.gitignore')).toContain('*.tfvars');
  });

  it('mirrors the same state shape on Scaleway — Object Storage bucket, same bootstrap', async () => {
    const { read } = await installIac(
      GO_TAGS,
      withDistribution('compose', { 'iac/deploy-target': { cloud: 'scaleway' } }),
    );
    expect(read('iac/scaleway/versions.tf')).toContain('s3.fr-par.scw.cloud');
    expect(read('iac/scaleway/bootstrap/main.tf')).toContain(
      'resource "scaleway_object_bucket" "state"',
    );
    expect(read('iac/scaleway/bootstrap.sh')).toContain('tofu -chdir=bootstrap init');
  });
});

describe('iac vertical — refusals', () => {
  it('hard-fails without the distribution tag: nothing feeds a target keel would provision', async () => {
    await expect(
      installIac(
        GO_TAGS.filter((t) => t !== 'dist.container-image'),
        withDistribution('compose'),
      ),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('refuses to guess a flavor when the tag exists but no distribution answer was recorded', async () => {
    await expect(installIac(GO_TAGS, NAME_ANSWERS)).rejects.toThrow(/keel add distribution/);
  });

  it('rejects an unsupported cloud answer loudly', async () => {
    await expect(
      installIac(GO_TAGS, withDistribution('compose', { 'iac/deploy-target': { cloud: 'aws' } })),
    ).rejects.toThrow(/unsupported cloud 'aws'/);
  });

  it('fails loudly on a corrupted recorded flavor rather than provisioning a mismatched target', async () => {
    await expect(installIac(GO_TAGS, withDistribution('swarm'))).rejects.toThrow(
      /unsupported deploy flavor 'swarm'/,
    );
  });
});
