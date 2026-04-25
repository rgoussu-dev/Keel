---
name: iac-opentofu
description: |
  Use when creating or modifying infrastructure-as-code in a
  keel-governed project. TRIGGER on edits to .tf or .tofu files, on paths
  under /iac/<target>/ (e.g. /iac/cloudrun/, /iac/bootstrap/), on
  discussions of provisioning, environments, deploy targets, container
  registries, or secret handling. SKIP for application code, tests, and
  CI workflow files.
---

# iac-opentofu

Every keel-governed project provisions its infrastructure with
[OpenTofu](https://opentofu.org/). OpenTofu is Terraform-compatible and
fully open source; it is the only sanctioned IaC tool for keel projects.

## Rules

- **All infrastructure is in IaC.** Anything that runs in a deployed
  environment — compute, storage, networking, queues, secrets backends,
  observability — is defined in OpenTofu.
- **No manual cloud-console changes.** A change made through a console UI
  is a bug to be reproduced in code and reverted manually if needed.
- **One state per environment.** `dev`, `staging`, `prod` (and any others)
  are separate states. They never share resources at the state level.
- **Secrets never land in state files.** Use a secret manager (AWS Secrets
  Manager, GCP Secret Manager, HashiCorp Vault, SOPS-encrypted in-repo,
  etc.). The OpenTofu module reads secret references, not secret values.
- **IaC modules live at the repo root in `/iac/<target>/`** (e.g.
  `/iac/cloudrun/`, `/iac/hetzner/`). IaC is **not** a hexagonal
  adapter, so it does not live under `infrastructure/` (that path is
  reserved for adapters implementing a `domain/contract` port). When
  IaC spans multiple repositories, a sibling `<project>-infra`
  repository is acceptable; the choice is made at walking-skeleton time.
- **State is remote by default.** Provider-native backend (e.g. GCS for
  GCP, S3 for AWS). The state bucket itself is provisioned by a
  one-shot `bootstrap.sh` so the chicken-and-egg of "where does the
  state live before there's any state?" is explicit, scripted, and
  auditable.

## Container registry — orthogonal to deploy target

The container registry is conceptually a **separate choice** from the
deploy target. A project may deploy to Cloud Run but push images to
`ghcr.io`; or run on a VPS while publishing via GitHub Container
Registry. Currently scaffolded out of the box: `gar` (GCP Artifact
Registry, wired automatically by the `iac-cloudrun` schematic so the
WIF pool is reused). Other registries (`ghcr.io`, `external` for
Docker Hub / quay.io / self-hosted) are recognised concepts but
require project-specific CI/CD customisation until explicit scaffold
support lands.

## Walking-skeleton checkpoint

The walking skeleton must include a real OpenTofu deployment of the
thinnest end-to-end slice. "Real" means: a deployable environment with
the primary adapter, mediator, secondary adapter (real impl, not the
fake), and any required backing services. Without IaC, the skeleton is
not yet end-to-end.

## Anti-patterns

- A `terraform.tfvars` file checked into the repo with secrets. Wrong —
  the file should reference a secret manager, not contain secrets.
- A "shared" state file that mixes `staging` and `prod` resources. Wrong
  — one environment per state, always.
- A bash script that wraps `kubectl` or `aws` calls to provision
  resources. Wrong — port the resource into OpenTofu and let it manage
  the lifecycle.
- A README that says "after applying, go to the AWS console and click X."
  Wrong — encode X in OpenTofu.

## Companion commands

- `/walking-skeleton init` scaffolds an `/iac/<target>/` module.
- `/walking-skeleton check` audits whether the IaC slice is present and
  passes `tofu plan`.
