variable "project_id" {
  type        = string
  description = "GCP project hosting the Cloud Run service."
}

variable "region" {
  type        = string
  description = "Cloud Run region (e.g. europe-west1, us-central1)."
  default     = "europe-west1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name; must match the Artifact Registry repo id created by /iac/bootstrap."
}

variable "runtime_service_account" {
  type        = string
  description = <<-EOT
    Email of the runtime service account the Cloud Run revision runs as.
    Created in /iac/bootstrap and surfaced via the
    `runtime_service_account_email` output. Pin to this SA so the
    deployer's `iam.serviceAccountUser` binding stays scoped to just the
    runtime identity — never grant `serviceAccountUser` project-wide.
  EOT
}

variable "image" {
  type        = string
  description = <<-EOT
    Fully-qualified container image reference deployed by `tofu apply`.
    Set by CI to the SHA-tagged image that was just pushed, e.g.
    `europe-west1-docker.pkg.dev/acme/acme-svc/rest:sha-abc123`.
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
  description = <<-EOT
    When true, grants `roles/run.invoker` to `allUsers` so the service is
    publicly reachable on the open internet. Defaults to `false` (private
    by default); flip to `true` explicitly only after confirming the
    service is intended to be public.
  EOT
  default     = false
}
