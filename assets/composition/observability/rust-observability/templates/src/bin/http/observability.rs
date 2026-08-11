//! Cross-cutting observability for the http unit: tracing +
//! OpenTelemetry initialisation and the request-context middleware.
//! It attaches at the assembly point (main.rs) and knows nothing
//! about the domain.

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;
use opentelemetry::global;
use opentelemetry::metrics::Counter;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry::KeyValue;
use opentelemetry_otlp::{MetricExporter, SpanExporter};
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::Resource;
use std::sync::OnceLock;
use tracing::Instrument;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

/// Header carrying the caller-supplied correlation id.
pub const CORRELATION_ID_HEADER: &str = "x-correlation-id";

/// Header carrying the tenant id in multi-tenant scenarios.
pub const TENANT_ID_HEADER: &str = "x-tenant-id";

/// Per-request context extracted from the inbound headers by
/// [`request_context`]; read it in handlers via
/// `Extension<RequestContext>`.
///
/// Extension point: to propagate another field (a user id, a request
/// source, …), add it here, parse it in the middleware, and record
/// it on the request span — the tenant id below is the worked
/// example. Keep all header parsing in the middleware so the rest of
/// the application only ever reads this struct.
#[derive(Clone, Debug)]
pub struct RequestContext {
    pub correlation_id: String,
    /// `None` outside multi-tenant calls.
    pub tenant_id: Option<String>,
}

/// Initialises logging + telemetry: JSON logs to stdout (span fields
/// — correlation id, tenant id — appear on every line emitted inside
/// the request span: the tracing ecosystem's MDC), plus OTLP/HTTP
/// trace and metric export honouring the standard `OTEL_*` env vars
/// (`OTEL_EXPORTER_OTLP_ENDPOINT`, default http://localhost:4318;
/// `OTEL_SDK_DISABLED=true` switches export off).
pub fn init(service_name: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let fmt_layer = tracing_subscriber::fmt::layer().json();

    let disabled = std::env::var("OTEL_SDK_DISABLED").is_ok_and(|v| v == "true");
    if disabled {
        tracing_subscriber::registry().with(filter).with(fmt_layer).init();
        return;
    }

    let resource = Resource::builder()
        .with_service_name(service_name.to_owned())
        .build();
    let span_exporter = SpanExporter::builder()
        .with_http()
        .build()
        .expect("build the OTLP span exporter");
    let tracer_provider = SdkTracerProvider::builder()
        .with_resource(resource.clone())
        .with_batch_exporter(span_exporter)
        .build();
    let metric_exporter = MetricExporter::builder()
        .with_http()
        .build()
        .expect("build the OTLP metric exporter");
    let meter_provider = SdkMeterProvider::builder()
        .with_resource(resource)
        .with_periodic_exporter(metric_exporter)
        .build();

    let otel_layer =
        tracing_opentelemetry::layer().with_tracer(tracer_provider.tracer("observability"));
    global::set_tracer_provider(tracer_provider);
    global::set_meter_provider(meter_provider);

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(otel_layer)
        .init();
}

fn request_counter() -> &'static Counter<u64> {
    static COUNTER: OnceLock<Counter<u64>> = OnceLock::new();
    COUNTER.get_or_init(|| {
        global::meter("observability")
            .u64_counter("app.http.requests")
            .with_description("HTTP requests, by path")
            .with_unit("{request}")
            .build()
    })
}

/// Axum middleware establishing the request context: extract (or
/// mint) the correlation id and the optional tenant id, expose them
/// as a [`RequestContext`] extension, run the handler inside a span
/// carrying both (so every log line of the request is correlated),
/// count the request, and echo the id on the response so callers can
/// quote it back.
pub async fn request_context(mut request: Request, next: Next) -> Response {
    let correlation_id = header(&request, CORRELATION_ID_HEADER)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let tenant_id = header(&request, TENANT_ID_HEADER);

    let path = request.uri().path().to_owned();
    request_counter().add(1, &[KeyValue::new("http.route", path.clone())]);

    let span = tracing::info_span!(
        "http.request",
        http.route = %path,
        app.correlation_id = %correlation_id,
        app.tenant_id = tracing::field::Empty,
    );
    if let Some(tenant) = &tenant_id {
        span.record("app.tenant_id", tracing::field::display(tenant));
    }

    request.extensions_mut().insert(RequestContext {
        correlation_id: correlation_id.clone(),
        tenant_id,
    });

    let mut response = next.run(request).instrument(span).await;
    if let Ok(value) = HeaderValue::from_str(&correlation_id) {
        response.headers_mut().insert(CORRELATION_ID_HEADER, value);
    }
    response
}

fn header(request: &Request, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use axum::{Extension, Router};
    use tower::ServiceExt;

    fn app() -> Router {
        Router::new()
            .route(
                "/greet",
                get(|Extension(context): Extension<RequestContext>| async move {
                    context.correlation_id
                }),
            )
            .layer(axum::middleware::from_fn(request_context))
    }

    #[tokio::test]
    async fn echoes_the_supplied_correlation_id() {
        let response = app()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/greet")
                    .header(CORRELATION_ID_HEADER, "corr-123")
                    .body(axum::body::Body::empty())
                    .expect("build the request"),
            )
            .await
            .expect("dispatch the request");
        assert_eq!(
            response.headers().get(CORRELATION_ID_HEADER),
            Some(&HeaderValue::from_static("corr-123"))
        );
    }

    #[tokio::test]
    async fn mints_a_correlation_id_when_absent() {
        let response = app()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/greet")
                    .body(axum::body::Body::empty())
                    .expect("build the request"),
            )
            .await
            .expect("dispatch the request");
        let minted = response
            .headers()
            .get(CORRELATION_ID_HEADER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        assert!(!minted.is_empty(), "expected a minted correlation id");
    }
}
