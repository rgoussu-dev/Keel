/**
 * `gateway/rust-cors` adapter — the Rust backend's side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), layers a CORS decoration onto the HTTP unit's
 * router in `main` allowing the Vite dev server's origin —
 * cross-cutting as a decorator at the assembly point, per the
 * binding spec's Rust stance.
 */

import type { Adapter } from '../../contract/composition.js';

export const RUST_CORS_ID = 'gateway/rust-cors';

const MAIN_TARGET = 'src/bin/http/main.rs';

const SERVE_BLOCK = `    axum::serve(listener, handler::router(greeter))
        .await
        .expect("serve HTTP");`;

const SERVE_BLOCK_WRAPPED = `    axum::serve(
        listener,
        handler::router(greeter).layer(axum::middleware::from_fn(with_cors)),
    )
    .await
    .expect("serve HTTP");`;

const CORS_FN = `
/// Allows the sibling SPA's dev origin to call this API directly
/// during development; the SPA's production traffic arrives
/// same-origin through its reverse proxy.
async fn with_cors(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let preflight = request.method() == axum::http::Method::OPTIONS;
    let mut response = if preflight {
        axum::response::IntoResponse::into_response(axum::http::StatusCode::NO_CONTENT)
    } else {
        next.run(request).await
    };
    response.headers_mut().insert(
        axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        axum::http::HeaderValue::from_static("http://localhost:5173"),
    );
    response
}
`;

const WRAP_MARKER = 'handler::router(greeter).layer(axum::middleware::from_fn(with_cors))';
const CORS_FN_SIGNATURE = 'async fn with_cors(';

export const rustCorsAdapter: Adapter = {
  id: RUST_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['lang.rust', 'arch.server-http', 'peer.ui.spa'] },
  contribute() {
    return {
      patches: [
        {
          target: MAIN_TARGET,
          apply: (existing) => {
            const wrapped = existing.includes(WRAP_MARKER);
            const decorated = existing.includes(CORS_FN_SIGNATURE);
            if (wrapped && decorated) return existing;
            if (wrapped || decorated) {
              throw new Error(
                `${RUST_CORS_ID}: ${MAIN_TARGET} is partially CORS-decorated (${
                  wrapped
                    ? 'the router is wrapped but with_cors is missing'
                    : 'with_cors is present but the router is unwrapped'
                }); reconcile it manually`,
              );
            }
            if (!existing.includes(SERVE_BLOCK)) {
              throw new Error(
                `${RUST_CORS_ID}: could not find the serve call in ${MAIN_TARGET} — the assembly point has diverged from the rust-http bootstrap; layer a CORS decorator onto the router manually`,
              );
            }
            return `${existing.replace(SERVE_BLOCK, SERVE_BLOCK_WRAPPED).trimEnd()}\n${CORS_FN}`;
          },
        },
      ],
    };
  },
};
