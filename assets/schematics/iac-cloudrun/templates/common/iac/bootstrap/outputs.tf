output "artifact_registry_repository" {
  value       = google_artifact_registry_repository.app.name
  description = "Artifact Registry repo name in `projects/P/locations/R/repositories/S` form."
}

output "artifact_registry_url" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.service_name}"
  description = "Base Docker URL for pushing images with `docker push`. Paste into the `GCP_ARTIFACT_REGISTRY_URL` GitHub Actions secret."
}

output "wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Workload Identity Federation provider resource name. Paste into the `GCP_WIF_PROVIDER` GitHub Actions secret."
}

output "deployer_service_account_email" {
  value       = google_service_account.deployer.email
  description = "Service account email CI impersonates via WIF. Paste into the `GCP_DEPLOYER_SA_EMAIL` GitHub Actions secret."
}

output "runtime_service_account_email" {
  value       = google_service_account.runtime.email
  description = "Service account email the Cloud Run service runs as. Paste into the `GCP_RUNTIME_SA_EMAIL` GitHub Actions secret."
}
