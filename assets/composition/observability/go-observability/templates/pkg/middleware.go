package observability

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

const scopeName = "observability"

// RequestContext is the middleware establishing the request context.
// On the way in: extract (or mint) the correlation id and the
// optional tenant id into the request's context (visible to every
// context-aware log line), open an OpenTelemetry server span tagged
// with both, count the request, and set the response echo header so
// callers can quote the id back.
func RequestContext(next http.Handler) http.Handler {
	tracer := otel.Tracer(scopeName)
	meter := otel.Meter(scopeName)
	requests, _ := meter.Int64Counter("app.http.requests",
		metric.WithDescription("HTTP requests, by path"),
		metric.WithUnit("{request}"))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info := RequestInfo{
			CorrelationID: headerOrMint(r),
			TenantID:      strings.TrimSpace(r.Header.Get(HeaderTenantID)),
		}
		w.Header().Set(HeaderCorrelationID, info.CorrelationID)

		attrs := []attribute.KeyValue{
			attribute.String("app.correlation_id", info.CorrelationID),
			attribute.String("http.route", r.URL.Path),
		}
		if info.TenantID != "" {
			attrs = append(attrs, attribute.String("app.tenant_id", info.TenantID))
		}
		ctx, span := tracer.Start(r.Context(), r.Method+" "+r.URL.Path,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(attrs...))
		defer span.End()

		requests.Add(ctx, 1, metric.WithAttributes(attribute.String("http.route", r.URL.Path)))
		next.ServeHTTP(w, r.WithContext(WithInfo(ctx, info)))
	})
}

func headerOrMint(r *http.Request) string {
	if supplied := strings.TrimSpace(r.Header.Get(HeaderCorrelationID)); supplied != "" {
		return supplied
	}
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "unavailable"
	}
	return hex.EncodeToString(raw[:])
}
