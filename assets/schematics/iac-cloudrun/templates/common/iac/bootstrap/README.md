# /iac/bootstrap

One-shot provisioning that must happen **before** `tofu init`:

1. Enables the GCP APIs required by `/iac/cloudrun`
   (`run`, `artifactregistry`, `iamcredentials`, `sts`).
2. Creates the GCS bucket used as the tofu remote state backend.

The bucket cannot be created by tofu itself because tofu needs the
bucket to exist to store its own state — the classic chicken-and-egg.

Run once per project:

```sh
PROJECT_ID=your-gcp-project ./iac/bootstrap/bootstrap.sh
```

Idempotent — running again reconciles without re-creating anything.

Optional environment variables: `REGION` (default `europe-west1`) and
`STATE_BUCKET` (default `${PROJECT_ID}-tofu-state`).
