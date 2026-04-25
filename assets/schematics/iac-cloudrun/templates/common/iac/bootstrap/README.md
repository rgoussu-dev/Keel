# /iac/bootstrap

One-shot provisioning that must run **before** CI can deploy on its
own. Owns everything long-lived and rarely-changing:

- the GCP APIs `/iac/bootstrap` and `/iac/cloudrun` depend on;
- the GCS bucket used as the tofu remote state backend;
- the Artifact Registry Docker repository CI pushes images to;
- the Workload Identity Federation pool + provider and the deployer
  service account CI impersonates — no long-lived JSON keys.

After this module applies, every `git push` to `main` deploys itself
via `/iac/cloudrun` — including the very first deploy that creates
the Cloud Run service.

## Why shell + tofu

Tofu cannot create the bucket its own state lives in (chicken-and-egg),
and cannot reach a project whose APIs aren't enabled yet. `bootstrap.sh`
handles those two steps. Everything else is declarative in the tofu
module.

## Run it

```sh
gcloud auth login
gcloud config set project "${PROJECT_ID}"

PROJECT_ID=your-gcp-project ./iac/bootstrap/bootstrap.sh

cd iac/bootstrap
tofu init -backend-config=bucket=${PROJECT_ID}-tofu-state
tofu apply \
  -var project_id=${PROJECT_ID} \
  -var region=europe-west1 \
  -var service_name=<svc> \
  -var github_repository=<owner>/<repo>
```

Idempotent — running again reconciles without re-creating anything.

## Outputs — paste into GitHub Actions repo secrets

| Secret                      | Source                                              |
| --------------------------- | --------------------------------------------------- |
| `GCP_PROJECT_ID`            | the `PROJECT_ID` you used                           |
| `GCP_REGION`                | the `REGION` you used (e.g. `europe-west1`)         |
| `GCP_WIF_PROVIDER`          | `tofu output -raw wif_provider`                     |
| `GCP_DEPLOYER_SA_EMAIL`     | `tofu output -raw deployer_service_account_email`   |
| `GCP_RUNTIME_SA_EMAIL`      | `tofu output -raw runtime_service_account_email`    |
| `GCP_ARTIFACT_REGISTRY_URL` | `tofu output -raw artifact_registry_url`            |

The Cloud Run service itself is **not** created here — it is created
and updated by `/iac/cloudrun` on every CI deploy.
