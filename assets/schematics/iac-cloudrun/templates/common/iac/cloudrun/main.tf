resource "google_cloud_run_v2_service" "app" {
  name                = var.service_name
  location            = var.region
  deletion_protection = false

  template {
    service_account = var.runtime_service_account

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # Pass-throughs handy for observability. Add secrets via Secret
      # Manager references here, never as plain environment vars.
      env {
        name  = "QUARKUS_PROFILE"
        value = "prod"
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
