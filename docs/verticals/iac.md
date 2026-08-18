# `iac` — where the project runs

The OpenTofu deploy target, closing the loop the
[`distribution`](distribution.md) vertical opens:

```sh
keel add iac
```

The release pipeline pushes an image; this vertical provisions the
registry-consuming runtime that image runs on. It is keyed on the
`dist.container-image` tag `distribution` promotes — a target with no
release pipeline feeding it would be infrastructure keel cannot
honestly wire to anything, so `keel add distribution` comes first.

## Dimensions & adapters

| Dimension       | Adapter             | Predicate              |
| --------------- | ------------------- | ---------------------- |
| `deploy-target` | `iac/deploy-target` | `dist.container-image` |

## The flavor is read, never re-asked

`distribution` already asked compose-vs-helm and emitted the matching
descriptor, so this vertical reads that recorded dial — exactly as
the release pipeline reads the JVM's recorded native flavor — and
provisions the shape the descriptor deploys to:

- **`compose` → a Docker VM.** One host with the Docker engine
  cloud-init-installed, a firewall opening SSH and the service port,
  and nothing else. The deploy loop is the emitted
  `deploy/compose.yaml` over `DOCKER_HOST=ssh://…` — image reference
  and config ride that one command's environment, never the host.
- **`helm` → a managed Kubernetes cluster.** Latest stable version by
  data source (binding spec §7), a default node pool, and the emitted
  `deploy/chart/` installs into it.

A second question could provision a target the descriptor cannot
use; that is why there is no `flavor` question here.

## The cloud is a sticky dial

One template subtree per choice, like the `ci` provider and the
deployment flavor — never minted as adapters:

| Choice                   | compose flavor  | helm flavor     | State backend  |
| ------------------------ | --------------- | --------------- | -------------- |
| `digitalocean` (default) | Docker droplet  | DOKS cluster    | Spaces         |
| `scaleway`               | Docker instance | Kapsule cluster | Object Storage |

The blessed pair is deliberate: each cloud serves both flavors with
an honest screenful of OpenTofu. The hyperscalers are deferred —
their honest minimal footprint (VPC + IAM) is an order of magnitude
more surface, and blessing one should be driven by a real consumer
project (see the [roadmap entry](../roadmap.md#m--iac-vertical-opentofu-l-)).

The chosen cloud is promoted as a `cloud.*` tag beside
`iac.opentofu`.

## The emitted tree follows binding spec §5

Everything lands at the repo root under `iac/<cloud>/`:

```
iac/<cloud>/
  README.md          # credentials, bootstrap, workspaces, deploy loop
  bootstrap.sh       # one-shot: provisions the state bucket, then `tofu init`
  bootstrap/main.tf  # local-state config owning only the state bucket
  versions.tf        # providers + the S3-compatible remote state backend
  main.tf            # the target shape the recorded flavor picked
  variables.tf
  outputs.tf
```

- **State is remote by default** — the provider's S3-compatible
  object storage, provisioned by the one-shot `bootstrap.sh`. The
  bootstrap config keeps local state on purpose: the bucket is the
  one resource that cannot live inside the remote state it hosts
  (its tiny secretless tfstate is committed).
- **One state per environment** via workspaces: `tofu workspace new
dev|staging|prod`, resource names carry `-${terraform.workspace}`.
- **No secret ever lands in a file.** Provider blocks are empty;
  API keys and state-backend credentials ride the environment
  (`DIGITALOCEAN_TOKEN`, `SCW_ACCESS_KEY`/`SCW_SECRET_KEY`, the
  state backend's `AWS_*` pair), and `*.tfvars` is gitignored.
- **12-factor holds end to end**: the target carries no service
  config — every knob stays in the descriptor's environment, so the
  environment-agnostic image the pipeline pushed serves every
  workspace.

## Prerequisites

| Requirement               | When                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `distribution` installed  | Always — the target consumes the images its pipeline pushes. |
| OpenTofu ≥ 1.6            | Locally, to run `bootstrap.sh` / `tofu apply`.               |
| A cloud account + API key | Per the chosen dial; credentials via environment only.       |

## Current limits

- The emitted configurations have not been applied against the real
  cloud APIs by keel's own suite — the tests assert their content,
  the same caveat the `ci` and `distribution` pipelines carry. The
  first consumer project's `tofu apply` is where that evidence
  arrives.
- Provisioned compute is the deploy target only: no managed database
  or DNS yet. Backing services stay attached resources referenced by
  env-configured URL, wherever they live.

## Related

- [`distribution`](distribution.md) ·
  [`containerization`](containerization.md) ·
  [Verticals catalog](README.md) · [Roadmap](../roadmap.md)
