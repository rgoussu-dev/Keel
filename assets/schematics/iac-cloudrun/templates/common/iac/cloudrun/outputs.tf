output "service_url" {
  value       = google_cloud_run_v2_service.app.uri
  description = "Public HTTPS URL for the Cloud Run service."
}

output "artifact_registry_repository" {
  value       = google_artifact_registry_repository.app.name
  description = "Artifact Registry repo name in `projects/P/locations/R/repositories/S` form."
}

output "artifact_registry_url" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.service_name}"
  description = "Base Docker URL for pushing images with `docker push`."
}

output "wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Workload Identity Federation provider resource name — set as `workload_identity_provider` on google-github-actions/auth."
}

output "deployer_service_account_email" {
  value       = google_service_account.deployer.email
  description = "Service account email the GitHub Actions workflow impersonates via WIF."
}
