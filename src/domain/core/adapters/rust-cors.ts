/**
 * `gateway/rust-cors` adapter — the Rust backend's side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), layers a CORS decoration onto the HTTP unit's
 * router in `main` allowing the Vite dev server's origin —
 * cross-cutting as a decorator at the assembly point, per the
 * binding spec's Rust stance. Dev-only: gated on
 * `cfg!(debug_assertions)`, so `cargo run` serves the dev origin
 * while release builds — what production containers ship — pass
 * through untouched; SPA production traffic arrives same-origin
 * through the reverse proxy.
 */

import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';

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
/// during development. Debug builds only (\`cargo run\`): in release
/// builds — what production containers ship — the decoration is a
/// pass-through, because the SPA's production traffic arrives
/// same-origin through its reverse proxy.
async fn with_cors(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    if !cfg!(debug_assertions) {
        return next.run(request).await;
    }
    let preflight = request.method() == axum::http::Method::OPTIONS;
    let requested_headers = request
        .headers()
        .get(axum::http::header::ACCESS_CONTROL_REQUEST_HEADERS)
        .cloned();
    let mut response = if preflight {
        axum::response::IntoResponse::into_response(axum::http::StatusCode::NO_CONTENT)
    } else {
        next.run(request).await
    };
    response.headers_mut().insert(
        axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        axum::http::HeaderValue::from_static("http://localhost:5173"),
    );
    if preflight {
        response.headers_mut().insert(
            axum::http::header::ACCESS_CONTROL_ALLOW_METHODS,
            axum::http::HeaderValue::from_static("GET"),
        );
        if let Some(requested) = requested_headers {
            response
                .headers_mut()
                .insert(axum::http::header::ACCESS_CONTROL_ALLOW_HEADERS, requested);
        }
    }
    response
}
`;

// The observability vertical rewires the same assembly point first
// (greenfield stacks run it before the gateway); in that shape the
// CORS decoration joins the router's layer stack instead.
const OBSERVED_MERGE_LINE = '        .merge(health::router(ready.clone()));';
const OBSERVED_MERGE_LINE_WRAPPED = `        .layer(axum::middleware::from_fn(with_cors))
        .merge(health::router(ready.clone()));`;

const WRAP_MARKER = 'axum::middleware::from_fn(with_cors)';
const CORS_FN_SIGNATURE = `async fn with_cors(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {`;

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
            // Multi-line anchors are LF-authored; convert them to the
            // file's own EOL so a CRLF checkout matches instead of
            // hard-failing, and the splice keeps its endings uniform.
            const eol = eolOf(existing);
            const wrapped = existing.includes(WRAP_MARKER);
            const decorated = existing.includes(withEol(CORS_FN_SIGNATURE, eol));
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
            const serveBlock = withEol(SERVE_BLOCK, eol);
            if (existing.includes(serveBlock)) {
              return `${existing
                .replace(serveBlock, withEol(SERVE_BLOCK_WRAPPED, eol))
                .trimEnd()}${withEol(`\n${CORS_FN}`, eol)}`;
            }
            if (existing.includes(OBSERVED_MERGE_LINE)) {
              return `${existing
                .replace(OBSERVED_MERGE_LINE, withEol(OBSERVED_MERGE_LINE_WRAPPED, eol))
                .trimEnd()}${withEol(`\n${CORS_FN}`, eol)}`;
            }
            throw new Error(
              `${RUST_CORS_ID}: could not find the serve call in ${MAIN_TARGET} — the assembly point has diverged from the rust-http bootstrap; layer a CORS decorator onto the router manually`,
            );
          },
        },
      ],
    };
  },
};
