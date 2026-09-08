package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func okCheck(context.Context) error   { return nil }
func failCheck(context.Context) error { return errors.New("dial tcp: connection refused") }

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response was not a JSON object: %q", rec.Body.String())
	}
	return body
}

// TestLive_NeverDependsOnBackends is the load-bearing one for this deployment.
// An uptime monitor pings /health to keep the instance from idling, and the
// hosting platform may restart the container on repeated failures. If /health
// probed Postgres or Redis, a transient outage in either would become a restart
// loop and a spurious page. It must answer 200 while the process can serve HTTP.
func TestLive_NeverDependsOnBackends(t *testing.T) {
	h := NewHealthHandler(failCheck, failCheck)

	rec := httptest.NewRecorder()
	h.Live(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d with both dependencies down, want 200", rec.Code)
	}
	if got := decodeBody(t, rec)["status"]; got != "healthy" {
		t.Fatalf("got status %q, want healthy", got)
	}
}

func TestReady_GradesDependenciesBySeverity(t *testing.T) {
	tests := []struct {
		name       string
		db         func(context.Context) error
		cache      func(context.Context) error
		wantStatus int
		wantBody   string
	}{
		{
			name: "both healthy", db: okCheck, cache: okCheck,
			wantStatus: http.StatusOK, wantBody: "ready",
		},
		{
			// Redis is a cache and the redirect path already degrades to Postgres
			// without it, so the instance can still serve every request. Returning
			// 503 here would pull a working instance out of rotation.
			name: "cache down is degraded, not unready", db: okCheck, cache: failCheck,
			wantStatus: http.StatusOK, wantBody: "degraded",
		},
		{
			// Postgres is authoritative: no redirect can be resolved without it.
			name: "database down is unready", db: failCheck, cache: okCheck,
			wantStatus: http.StatusServiceUnavailable, wantBody: "unavailable",
		},
		{
			// The more severe verdict must survive; a later cache check must not
			// downgrade "unavailable" to "degraded".
			name: "both down reports the database verdict", db: failCheck, cache: failCheck,
			wantStatus: http.StatusServiceUnavailable, wantBody: "unavailable",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewHealthHandler(tc.db, tc.cache)

			rec := httptest.NewRecorder()
			h.Ready(rec, httptest.NewRequest(http.MethodGet, "/ready", nil))

			if rec.Code != tc.wantStatus {
				t.Fatalf("got %d, want %d (body %q)", rec.Code, tc.wantStatus, rec.Body.String())
			}
			if got := decodeBody(t, rec)["status"]; got != tc.wantBody {
				t.Fatalf("got status %q, want %q", got, tc.wantBody)
			}
		})
	}
}

// TestReady_ReportsEachDependencySeparately keeps the body useful for a human
// reading it during an incident: which one is down, not just that something is.
func TestReady_ReportsEachDependencySeparately(t *testing.T) {
	h := NewHealthHandler(okCheck, failCheck)

	rec := httptest.NewRecorder()
	h.Ready(rec, httptest.NewRequest(http.MethodGet, "/ready", nil))

	body := decodeBody(t, rec)
	if body["postgres"] != "ok" {
		t.Errorf("got postgres %q, want ok", body["postgres"])
	}
	if body["redis"] != "error" {
		t.Errorf("got redis %q, want error", body["redis"])
	}
}
