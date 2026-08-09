FROM golang:1-alpine AS build
WORKDIR /workspace
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/backend-http ./cmd/http

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /bin/backend-http /backend-http
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/backend-http"]
