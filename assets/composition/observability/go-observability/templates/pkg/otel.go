package observability

import (
	"context"
	"os"
	"strconv"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// SetupOTel wires OpenTelemetry: OTLP/HTTP exporters for traces and
// metrics against the standard env vars (OTEL_EXPORTER_OTLP_ENDPOINT,
// default http://localhost:4318; OTEL_SDK_DISABLED=true switches
// telemetry off). Returns a shutdown func that flushes both
// providers.
func SetupOTel(ctx context.Context, serviceName string) (func(context.Context) error, error) {
	if disabled, _ := strconv.ParseBool(os.Getenv("OTEL_SDK_DISABLED")); disabled {
		return func(context.Context) error { return nil }, nil
	}
	traceExporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, err
	}
	metricExporter, err := otlpmetrichttp.New(ctx)
	if err != nil {
		return nil, err
	}
	res, err := resource.Merge(
		resource.Default(),
		resource.NewSchemaless(semconv.ServiceName(serviceName)),
	)
	if err != nil {
		return nil, err
	}
	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
	)
	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter)),
		sdkmetric.WithResource(res),
	)
	otel.SetTracerProvider(tracerProvider)
	otel.SetMeterProvider(meterProvider)
	return func(ctx context.Context) error {
		traceErr := tracerProvider.Shutdown(ctx)
		metricErr := meterProvider.Shutdown(ctx)
		if traceErr != nil {
			return traceErr
		}
		return metricErr
	}, nil
}
