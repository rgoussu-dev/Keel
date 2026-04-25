#!/usr/bin/env bash
#
# One-shot bootstrap for the /iac/bootstrap and /iac/cloudrun tofu
# modules. Creates the resources tofu itself cannot (chicken-and-egg):
# enables the GCP APIs the bootstrap module depends on, and provisions
# the GCS state bucket both modules use as their remote backend.
#
# Idempotent: running twice is safe. Run after `gcloud auth login` and
# having picked a billing-enabled project.
#
#   PROJECT_ID=your-project ./iac/bootstrap/bootstrap.sh
#
# Optional env:
#   REGION         — default europe-west1
#   STATE_BUCKET   — default ${PROJECT_ID}-tofu-state

set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID=your-gcp-project}"
REGION="${REGION:-europe-west1}"
STATE_BUCKET="${STATE_BUCKET:-${PROJECT_ID}-tofu-state}"

echo "[bootstrap] project      : ${PROJECT_ID}"
echo "[bootstrap] region       : ${REGION}"
echo "[bootstrap] state bucket : gs://${STATE_BUCKET}"
echo

echo "[bootstrap] enabling required GCP APIs..."
gcloud services enable --project "${PROJECT_ID}" \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com

echo
echo "[bootstrap] ensuring state bucket gs://${STATE_BUCKET} exists..."
if gcloud storage buckets describe "gs://${STATE_BUCKET}" \
    --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[bootstrap]   bucket already exists — skipping create."
else
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

echo "[bootstrap]   enabling versioning on state bucket..."
gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning \
  --project "${PROJECT_ID}" >/dev/null

cat <<NEXT

[bootstrap] done. Next steps:

  # 1. Provision Artifact Registry, WIF, and the deployer SA.
  cd iac/bootstrap
  tofu init -backend-config=bucket=${STATE_BUCKET}
  tofu apply \\
    -var project_id=${PROJECT_ID} \\
    -var region=${REGION} \\
    -var service_name=<svc> \\
    -var github_repository=<owner>/<repo>

  # 2. Copy the six values below into GitHub Actions repo secrets.
  #    After that, every push to main deploys itself — including the
  #    very first one.

      GCP_PROJECT_ID            = ${PROJECT_ID}
      GCP_REGION                = ${REGION}
      GCP_WIF_PROVIDER          = \$(tofu output -raw wif_provider)
      GCP_DEPLOYER_SA_EMAIL     = \$(tofu output -raw deployer_service_account_email)
      GCP_RUNTIME_SA_EMAIL      = \$(tofu output -raw runtime_service_account_email)
      GCP_ARTIFACT_REGISTRY_URL = \$(tofu output -raw artifact_registry_url)

NEXT
