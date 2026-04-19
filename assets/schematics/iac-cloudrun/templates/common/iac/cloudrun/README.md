# /iac/cloudrun

OpenTofu module that provisions the Cloud Run service, its Artifact
Registry repository, and the Workload Identity Federation trust chain
GitHub Actions uses to deploy.

## First-time setup

The tofu state lives in a GCS bucket that the module itself cannot
create (chicken-and-egg). Run the one-shot bootstrap before the first
`tofu init`:

```sh
PROJECT_ID=your-gcp-project ./iac/bootstrap/bootstrap.sh
```

The script enables required APIs and provisions the state bucket.

## Day-to-day

```sh
cd iac/cloudrun
tofu init -backend-config=bucket=${PROJECT_ID}-tofu-state
tofu plan \
  -var project_id=${PROJECT_ID} \
  -var service_name=acme-svc \
  -var image=${REGION}-docker.pkg.dev/${PROJECT_ID}/acme-svc/rest:sha-abc \
  -var github_repository=owner/repo
tofu apply
```

## Packaging

This module ships a `Dockerfile` that builds the Quarkus runnable as a
GraalVM **native image**. Cold starts land around 50 ms on Cloud Run vs.
~800 ms for JVM mode. The native build is slower (3–5 min) but CI pays
that cost, not the serving path.

To deviate (e.g. JVM image for faster iteration), replace the Dockerfile
with a JVM-based build; the rest of the module is packaging-agnostic.

## Outputs worth capturing

- `service_url` — public HTTPS URL. Smoke test this after every deploy.
- `wif_provider` + `deployer_service_account_email` — paste into the
  GitHub Actions workflow's `google-github-actions/auth` step.
- `artifact_registry_url` — base of the image reference CI pushes to.
