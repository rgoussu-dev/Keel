package observability

import (
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
)

// Health is the probe surface of the service.
//
// Liveness (GET /health/live) answers "is the process alive?" — it
// deliberately checks no dependencies, because a liveness failure
// means "restart me" and a dead shared dependency would
// restart-storm the whole fleet instead of just draining it.
//
// Readiness (GET /health/ready) answers "route traffic to me?" — it
// stays down until SetReady(true) after wiring, and aggregates every
// registered dependency check (AddReadinessCheck) so a failing
// dependency drains the instance without restarting it.
type Health struct {
	ready  atomic.Bool
	mu     sync.RWMutex
	checks map[string]func() error
}

// NewHealth returns a probe surface that reports not-ready until
// SetReady(true).
func NewHealth() *Health {
	return &Health{checks: map[string]func() error{}}
}

// SetReady flips the readiness gate; call it once the service is
// wired and listening (and back to false to drain before shutdown).
func (h *Health) SetReady(ready bool) {
	h.ready.Store(ready)
}

// AddReadinessCheck registers a named dependency check — a
// datasource ping, a downstream probe, a cache warm flag. A non-nil
// error fails readiness (never liveness).
func (h *Health) AddReadinessCheck(name string, check func() error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.checks[name] = check
}

// Register mounts both probe endpoints on mux.
func (h *Health) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) {
		writeStatus(w, http.StatusOK, map[string]string{"status": "up"})
	})
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, _ *http.Request) {
		if !h.ready.Load() {
			writeStatus(w, http.StatusServiceUnavailable, map[string]string{
				"status": "down", "reason": "starting",
			})
			return
		}
		if name, err := h.failingCheck(); err != nil {
			writeStatus(w, http.StatusServiceUnavailable, map[string]string{
				"status": "down", "failed": name, "reason": err.Error(),
			})
			return
		}
		writeStatus(w, http.StatusOK, map[string]string{"status": "up"})
	})
}

func (h *Health) failingCheck() (string, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for name, check := range h.checks {
		if err := check(); err != nil {
			return name, err
		}
	}
	return "", nil
}

func writeStatus(w http.ResponseWriter, status int, body map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
