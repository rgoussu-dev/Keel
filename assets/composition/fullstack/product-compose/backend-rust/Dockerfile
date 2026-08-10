FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /workspace
COPY . .
RUN cargo build --release --bins && cp target/release/*-http /bin/backend-http

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /bin/backend-http /backend-http
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/backend-http"]
