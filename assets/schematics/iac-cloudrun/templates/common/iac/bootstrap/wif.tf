# Workload Identity Federation: lets GitHub Actions impersonate the
# deployer service account via short-lived OIDC tokens. No long-lived
# JSON keys. The attribute condition pins trust to exactly one repo so
# a compromised workflow in an unrelated repo cannot exchange tokens.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "OIDC trust for CI deploying ${var.service_name}."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.actor"      = "assertion.actor"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == \"${var.github_repository}\""
}

# GCP caps `account_id` at 30 chars; `service_name` is allowed up to 63
# (Cloud Run's limit). When the suffixed account id would overflow, fall
# back to a deterministic `<truncated>-<sha1-prefix>-<suffix>` so the id
# is stable across plans and won't collide for distinct service names.
locals {
  deployer_account_id = (
    length("${var.service_name}-deployer") <= 30
    ? "${var.service_name}-deployer"
    : "${substr(var.service_name, 0, 14)}-${substr(sha1(var.service_name), 0, 6)}-deployer"
  )

  runtime_account_id = (
    length("${var.service_name}-runtime") <= 30
    ? "${var.service_name}-runtime"
    : "${substr(var.service_name, 0, 15)}-${substr(sha1(var.service_name), 0, 6)}-runtime"
  )
}

resource "google_service_account" "deployer" {
  account_id   = local.deployer_account_id
  display_name = "${var.service_name} GitHub Actions deployer"
  description  = "Service account CI impersonates to push images + deploy revisions."
}

# Dedicated runtime identity the Cloud Run service runs as. Kept separate
# from the deployer so the deployer's `iam.serviceAccountUser` binding can
# be scoped to *just this SA* rather than granted project-wide. The
# runtime SA carries no IAM by default — add narrowly-scoped roles for
# the resources the service actually reads/writes.
resource "google_service_account" "runtime" {
  account_id   = local.runtime_account_id
  display_name = "${var.service_name} Cloud Run runtime"
  description  = "Service account the Cloud Run service runs as. Grant it the minimum roles the workload needs."
}

resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Scope `iam.serviceAccountUser` to the runtime SA only, instead of
# binding it project-wide. This is what lets the deployer set the runtime
# SA on the Cloud Run service revision while keeping it from impersonating
# any other SA in the project.
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "wif_binding" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
