output "service_url" {
  value       = google_cloud_run_v2_service.app.uri
  description = "HTTPS URL for the Cloud Run service. Requires authentication unless `allow_unauthenticated` is set to `true` (default `false`)."
}
