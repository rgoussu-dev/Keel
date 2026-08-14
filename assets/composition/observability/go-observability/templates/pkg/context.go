// Package observability is the cross-cutting seam of the service:
// the request context and correlated slog logging, OpenTelemetry
// setup, and the health probes. It attaches at the assembly point
// (cmd/http/main.go) and knows nothing about the domain.
package observability

import "context"

// HeaderCorrelationID carries the caller-supplied correlation id.
const HeaderCorrelationID = "X-Correlation-Id"

// HeaderTenantID carries the tenant id in multi-tenant scenarios.
const HeaderTenantID = "X-Tenant-Id"

// RequestInfo is the per-request context extracted from the inbound
// headers by the RequestContext middleware.
//
// Extension point: to propagate another field (a user id, a request
// source, …), add it here, parse it in the middleware, and emit it
// in the logging handler — the tenant id below is the worked
// example. Keep all header parsing in the middleware so the rest of
// the application only ever reads this struct.
type RequestInfo struct {
	CorrelationID string
	// TenantID is empty outside multi-tenant calls.
	TenantID string
}

type contextKey struct{}

// WithInfo returns a context carrying info.
func WithInfo(ctx context.Context, info RequestInfo) context.Context {
	return context.WithValue(ctx, contextKey{}, info)
}

// FromContext returns the request info carried by ctx, or the zero
// value outside a request.
func FromContext(ctx context.Context) RequestInfo {
	info, _ := ctx.Value(contextKey{}).(RequestInfo)
	return info
}
