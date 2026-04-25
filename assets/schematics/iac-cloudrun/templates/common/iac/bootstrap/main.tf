resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  description   = "Container images for ${var.service_name}"
}
