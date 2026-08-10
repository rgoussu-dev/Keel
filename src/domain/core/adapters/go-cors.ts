/**
 * `gateway/go-cors` adapter — the Go backend's side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), decorates the HTTP unit's handler in `main` with a
 * CORS wrapper allowing the Vite dev server's origin — cross-cutting
 * as a decorator at the assembly point, per the binding spec's Go
 * stance. Dev-only at runtime: the wrapper is a no-op unless
 * `GO_ENV=dev`, so production deployments (whose SPA traffic arrives
 * same-origin through the reverse proxy) never serve the dev origin.
 */

import type { Adapter } from '../../contract/composition.js';

export const GO_CORS_ID = 'gateway/go-cors';

const MAIN_TARGET = 'cmd/http/main.go';

const SERVE_LINE = 'log.Fatal(http.Serve(listener, resthttp.NewHandler(greeter)))';
const SERVE_LINE_WRAPPED =
  'log.Fatal(http.Serve(listener, withCORS(resthttp.NewHandler(greeter))))';

const CORS_FUNC = `
// withCORS allows the sibling SPA's dev origin to call this API
// directly during development. Dev-only: it decorates the handler
// only under GO_ENV=dev (run the dev pair with
// "GO_ENV=dev go run ./cmd/http"); in production it is a no-op —
// the SPA's traffic arrives same-origin through its reverse proxy.
func withCORS(next http.Handler) http.Handler {
	if os.Getenv("GO_ENV") != "dev" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", http.MethodGet)
			if requested := r.Header.Get("Access-Control-Request-Headers"); requested != "" {
				w.Header().Set("Access-Control-Allow-Headers", requested)
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
`;

const WRAP_MARKER = 'withCORS(resthttp.NewHandler(greeter))';
const CORS_FUNC_SIGNATURE = 'func withCORS(next http.Handler) http.Handler {';

export const goCorsAdapter: Adapter = {
  id: GO_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['lang.go', 'arch.server-http', 'peer.ui.spa'] },
  contribute() {
    return {
      patches: [
        {
          target: MAIN_TARGET,
          apply: (existing) => {
            const wrapped = existing.includes(WRAP_MARKER);
            const decorated = existing.includes(CORS_FUNC_SIGNATURE);
            if (wrapped && decorated) return existing;
            if (wrapped || decorated) {
              throw new Error(
                `${GO_CORS_ID}: ${MAIN_TARGET} is partially CORS-decorated (${
                  wrapped
                    ? 'the serve call is wrapped but withCORS is missing'
                    : 'withCORS is present but the serve call is unwrapped'
                }); reconcile it manually`,
              );
            }
            if (!existing.includes(SERVE_LINE)) {
              throw new Error(
                `${GO_CORS_ID}: could not find the serve call in ${MAIN_TARGET} — the assembly point has diverged from the go-http bootstrap; wrap resthttp.NewHandler with a CORS decorator manually`,
              );
            }
            return `${existing.replace(SERVE_LINE, SERVE_LINE_WRAPPED).trimEnd()}\n${CORS_FUNC}`;
          },
        },
      ],
    };
  },
};
