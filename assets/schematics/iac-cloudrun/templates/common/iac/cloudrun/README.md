# /iac/cloudrun

OpenTofu module that provisions the **Cloud Run service** only.
Everything long-lived (Artifact Registry, WIF, deployer SA) lives in
[`/iac/bootstrap`](../bootstrap/README.md) and is created once before
CI starts deploying.

## Who runs this

CI, every push to `main`. You should not need to run it by hand after
bootstrap is done.

## First-time setup

See [`/iac/bootstrap/README.md`](../bootstrap/README.md). Once its
outputs are pasted into GitHub Actions repo secrets, the first `git
push` creates the Cloud Run service here.

## Day-to-day (manual override)

```sh
cd iac/cloudrun
tofu init -backend-config=bucket=${PROJECT_ID}-tofu-state
tofu apply \
  -var project_id=${PROJECT_ID} \
  -var service_name=<svc> \
  -var image=${REGION}-docker.pkg.dev/${PROJECT_ID}/<svc>/rest:sha-<commit> \
  -var runtime_service_account=$(cd ../bootstrap && tofu output -raw runtime_service_account_email)
```

## Packaging

This module ships a `Dockerfile` that builds the Quarkus runnable as a
GraalVM **native image**. Cold starts land around 50 ms on Cloud Run vs.
~800 ms for JVM mode. The native build is slower (3–5 min) but CI pays
that cost, not the serving path.

To deviate (e.g. JVM image for faster iteration), replace the Dockerfile
with a JVM-based build; the rest of the module is packaging-agnostic.

## Outputs worth capturing

- `service_url` — HTTPS URL for the Cloud Run service. Requires authentication unless `allow_unauthenticated` is set to `true` (default `false`); CI smoke-tests it after every deploy with an ID token.
