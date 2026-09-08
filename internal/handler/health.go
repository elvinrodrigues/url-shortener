package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/ctxlog"
)

// checkTimeout bounds each dependency probe. It is short on purpose: a readiness
// endpoint that hangs is worse than one that reports a dependency as down, and
// both Postgres and Redis are managed services that may be waking from idle.
const checkTimeout = 2 * time.Second

// HealthHandler serves the two liveness/readiness probes.
//
// The split matters operationally. /health must answer 200 for as long as the
// process is alive and must never depend on Postgres or Redis: it is what the
// uptime monitor pings to keep the instance from idling, and what the platform
// may use to decide whether to restart the container. Wiring dependency checks
// into it would turn a transient Redis blip into a restart loop and a pager.
//
// /ready is the one that tells the truth about dependencies, and nothing
// automated is allowed to act destructively on its answer.
type HealthHandler struct {
	pingDB    func(ctx context.Context) error
	pingCache func(ctx context.Context) error
}

func NewHealthHandler(pingDB, pingCache func(ctx context.Context) error) *HealthHandler {
	return &HealthHandler{pingDB: pingDB, pingCache: pingCache}
}

// Live reports only that the process is running and able to serve HTTP.
func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

// Ready probes both dependencies and grades them by how much they actually
// matter to serving traffic.
//
// Postgres is authoritative: without it a redirect cannot be resolved at all, so
// losing it means not ready (503). Redis is a cache — §5.3 already degrades to
// Postgres when it is unreachable — so losing it is reported as "degraded" but
// still 200, because the service genuinely can serve every request, just slower.
// Returning 503 for a cache outage would pull a working instance out of
// rotation.
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	logger := ctxlog.GetLogger(r.Context(), slog.Default())

	body := map[string]string{
		"status":   "ready",
		"postgres": "ok",
		"redis":    "ok",
	}
	status := http.StatusOK

	if h.pingDB != nil {
		ctx, cancel := context.WithTimeout(r.Context(), checkTimeout)
		if err := h.pingDB(ctx); err != nil {
			logger.Error("readiness: postgres unreachable", "error", err)
			body["postgres"] = "error"
			body["status"] = "unavailable"
			status = http.StatusServiceUnavailable
		}
		cancel()
	}

	if h.pingCache != nil {
		ctx, cancel := context.WithTimeout(r.Context(), checkTimeout)
		if err := h.pingCache(ctx); err != nil {
			logger.Warn("readiness: redis unreachable, serving degraded", "error", err)
			body["redis"] = "error"
			// Never downgrade an already-failing status: Postgres being down is
			// the more severe verdict and must survive.
			if status == http.StatusOK {
				body["status"] = "degraded"
			}
		}
		cancel()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
