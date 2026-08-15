//! Health probes for the http unit.
//!
//! Liveness (`GET /health/live`) answers "is the process alive?" —
//! it deliberately checks no dependencies, because a liveness
//! failure means "restart me" and a dead shared dependency would
//! restart-storm the whole fleet instead of just draining it.
//!
//! Readiness (`GET /health/ready`) answers "route traffic to me?" —
//! it stays down until [`Readiness::set_ready`] after wiring, and
//! aggregates every registered dependency check
//! ([`Readiness::add_check`]) so a failing dependency drains the
//! instance without restarting it.

use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

type Check = Arc<dyn Fn() -> Result<(), String> + Send + Sync>;

/// The readiness gate shared between the assembly point (which flips
/// it once the server is wired) and the probe route.
#[derive(Clone, Default)]
pub struct Readiness {
    ready: Arc<AtomicBool>,
    checks: Arc<Mutex<Vec<(String, Check)>>>,
}

/// A fresh, not-yet-ready gate.
pub fn readiness() -> Readiness {
    Readiness::default()
}

impl Readiness {
    /// Flips the gate; call once the service is wired and listening.
    pub fn set_ready(&self) {
        self.ready.store(true, Ordering::Release);
    }

    /// Registers a named dependency check — a datasource ping, a
    /// downstream probe, a cache warm flag. An `Err` fails readiness
    /// (never liveness).
    pub fn add_check(
        &self,
        name: &str,
        check: impl Fn() -> Result<(), String> + Send + Sync + 'static,
    ) {
        self.checks
            .lock()
            .expect("readiness checks lock")
            .push((name.to_owned(), Arc::new(check)));
    }

    fn poll(&self) -> Result<(), String> {
        if !self.ready.load(Ordering::Acquire) {
            return Err("starting".to_owned());
        }
        let checks = self.checks.lock().expect("readiness checks lock");
        for (name, check) in checks.iter() {
            check().map_err(|reason| format!("{name}: {reason}"))?;
        }
        Ok(())
    }
}

#[derive(Serialize)]
struct Status {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

/// The probe routes; merge into the application router (before the
/// request-context layer, so probe traffic stays out of the request
/// telemetry).
pub fn router(readiness: Readiness) -> Router {
    Router::new()
        .route(
            "/health/live",
            get(|| async {
                Json(Status {
                    status: "up",
                    reason: None,
                })
            }),
        )
        .route(
            "/health/ready",
            get(move || {
                let gate = readiness.clone();
                async move {
                    match gate.poll() {
                        Ok(()) => (
                            StatusCode::OK,
                            Json(Status {
                                status: "up",
                                reason: None,
                            }),
                        ),
                        Err(reason) => (
                            StatusCode::SERVICE_UNAVAILABLE,
                            Json(Status {
                                status: "down",
                                reason: Some(reason),
                            }),
                        ),
                    }
                }
            }),
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;

    async fn probe(router: Router, path: &str) -> StatusCode {
        router
            .oneshot(
                axum::http::Request::builder()
                    .uri(path)
                    .body(axum::body::Body::empty())
                    .expect("build the request"),
            )
            .await
            .expect("dispatch the request")
            .status()
    }

    #[tokio::test]
    async fn liveness_is_up_from_the_start() {
        let status = probe(router(readiness()), "/health/live").await;
        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn readiness_gates_on_set_ready() {
        let gate = readiness();
        assert_eq!(
            probe(router(gate.clone()), "/health/ready").await,
            StatusCode::SERVICE_UNAVAILABLE
        );
        gate.set_ready();
        assert_eq!(
            probe(router(gate.clone()), "/health/ready").await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn readiness_aggregates_dependency_checks() {
        let gate = readiness();
        gate.set_ready();
        gate.add_check("db", || Err("connection refused".to_owned()));
        assert_eq!(
            probe(router(gate.clone()), "/health/ready").await,
            StatusCode::SERVICE_UNAVAILABLE
        );
    }
}
