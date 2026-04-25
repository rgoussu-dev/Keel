# syntax=docker/dockerfile:1.7
#
# Native-image build of the Quarkus REST executable, targeting Cloud Run.
# Stage 1 compiles the application to a native executable using Mandrel.
# Stage 2 drops the binary into a minimal distroless runtime so the
# resulting image is small and has no shell / package manager.
#
# Build context is the repo root:
#   docker build -f iac/cloudrun/Dockerfile -t <image> .

FROM quay.io/quarkus/ubi-quarkus-mandrel-builder-image:23.1-jdk-21 AS builder
USER root
WORKDIR /workspace

# Copy the full source tree so the multi-project build sees every module.
COPY . .

RUN chmod +x ./gradlew \
 && ./gradlew :application:rest:executable:build \
      -Dquarkus.native.enabled=true \
      -Dquarkus.package.jar.enabled=false \
      --no-daemon --stacktrace

FROM gcr.io/distroless/base-debian12:nonroot
# Quarkus names the native binary `<artifact>-<version>-runner`; the
# wildcard avoids hard-coding the version.
COPY --from=builder /workspace/application/rest/executable/build/*-runner /app
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app"]
