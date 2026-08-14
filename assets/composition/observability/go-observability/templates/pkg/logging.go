package observability

import (
	"context"
	"log/slog"
	"os"
)

// SetupLogging installs a JSON slog default whose handler stamps the
// request context (correlation id, tenant id) on every line — the Go
// equivalent of an MDC. Handlers log with the context-aware calls
// (slog.InfoContext(ctx, …)) and correlation comes for free.
func SetupLogging() {
	base := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	slog.SetDefault(slog.New(contextHandler{Handler: base}))
}

// contextHandler decorates a slog.Handler with the request context's
// attributes. New propagated fields (see RequestInfo) that should
// reach the logs are emitted here.
type contextHandler struct {
	slog.Handler
}

func (h contextHandler) Handle(ctx context.Context, record slog.Record) error {
	info := FromContext(ctx)
	if info.CorrelationID != "" {
		record.AddAttrs(slog.String("correlationId", info.CorrelationID))
	}
	if info.TenantID != "" {
		record.AddAttrs(slog.String("tenantId", info.TenantID))
	}
	return h.Handler.Handle(ctx, record)
}

func (h contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return contextHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h contextHandler) WithGroup(name string) slog.Handler {
	return contextHandler{Handler: h.Handler.WithGroup(name)}
}
