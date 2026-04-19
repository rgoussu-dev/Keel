# OpenTofu entrypoint for the walking skeleton. Keep this file minimal —
# compose actual resources from modules. Every environment (dev, staging,
# prod) uses its own state; do not commit state files.

terraform {
  required_version = ">= 1.7.0"
}

# TODO: define the first module (e.g. container runtime, managed db)
#       required to deploy the walking skeleton end-to-end.
