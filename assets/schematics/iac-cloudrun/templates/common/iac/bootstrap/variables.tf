variable "project_id" {
  type        = string
  description = "GCP project hosting Artifact Registry, Cloud Run, and the CI deployer service account."
}

variable "region" {
  type        = string
  description = "Cloud Run + Artifact Registry region (e.g. europe-west1, us-central1)."
  default     = "europe-west1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name; also the Artifact Registry repository id and SA name prefix."
}

variable "github_repository" {
  type        = string
  description = <<-EOT
    The `owner/repo` slug of the GitHub repository permitted to
    impersonate the deployer service account via Workload Identity
    Federation. Locks OIDC trust to exactly one repo.
  EOT
}
