variable "project_id" {
  type        = string
  description = "GCP project hosting the Cloud Run service and Artifact Registry repository."
}

variable "region" {
  type        = string
  description = "Cloud Run + Artifact Registry region (e.g. europe-west1, us-central1)."
  default     = "europe-west1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name; also the Artifact Registry repository id."
}

variable "image" {
  type        = string
  description = <<-EOT
    Fully-qualified container image reference deployed by `tofu apply`.
    Set by CI to the SHA-tagged image that was just pushed, e.g.
    `europe-west1-docker.pkg.dev/acme/acme-svc/rest:sha-abc123`.
  EOT
}

variable "github_repository" {
  type        = string
  description = <<-EOT
    The `owner/repo` slug of the GitHub repository permitted to
    impersonate the deployer service account via Workload Identity
    Federation. Locks OIDC trust to exactly one repo.
  EOT
}

variable "min_instances" {
  type        = number
  description = "Minimum Cloud Run instances kept warm (0 = scale-to-zero)."
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Upper bound on concurrent Cloud Run instances."
  default     = 3
}

variable "allow_unauthenticated" {
  type        = bool
  description = "When true, grants `roles/run.invoker` to `allUsers` so the service is public."
  default     = true
}
