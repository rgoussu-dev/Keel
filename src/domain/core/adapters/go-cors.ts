/**
 * `gateway/go-cors` adapter — the Go backend's side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), decorates the HTTP unit's handler in `main` with a
 * CORS wrapper allowing the Vite dev server's origin — cross-cutting
 * as a decorator at the assembly point, per the binding spec's Go
 * stance.
 */

import type { Adapter } from '../../contract/composition.js';

export const GO_CORS_ID = 'gateway/go-cors';

const MAIN_TARGET = 'cmd/http/main.go';

const SERVE_LINE = 'log.Fatal(http.Serve(listener, resthttp.NewHandler(greeter)))';
const SERVE_LINE_WRAPPED =
  'log.Fatal(http.Serve(listener, withCORS(resthttp.NewHandler(greeter))))';

const CORS_FUNC = `
// withCORS allows the sibling SPA's dev origin to call this API
// directly during development; the SPA's production traffic arrives
// same-origin through its reverse proxy.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
`;

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
            if (existing.includes('withCORS')) return existing;
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
