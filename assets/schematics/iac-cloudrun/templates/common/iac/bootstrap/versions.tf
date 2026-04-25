terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    # Bucket supplied at `tofu init` time so the same module can back
    # multiple environments:
    #   tofu init -backend-config=bucket=${PROJECT_ID}-tofu-state
    prefix = "bootstrap/state"
  }
}
