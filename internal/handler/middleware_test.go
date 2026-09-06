package handler

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/ctxlog"
	"github.com/redis/go-redis/v9"
)

func TestRateLimitMiddleware_RedisError(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{
		Addr: "127.0.0.1:6379",
		Dialer: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return nil, errors.New("dial error: redis connection refused")
		},
		MaxRetries: -1, // disable retries
	})
	defer rdb.Close()

	ipResolver, err := NewIPResolver(nil)
	if err != nil {
		t.Fatalf("NewIPResolver: %v", err)
	}

	dummyNext := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	t.Run("failOpen=false returns 503 with Retry-After and logs error", func(t *testing.T) {
		mw := RateLimitMiddleware(rdb, ipResolver, 10, time.Minute, false)

		var logBuf bytes.Buffer
		testLogger := slog.New(slog.NewJSONHandler(&logBuf, nil))

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/shorten", nil)
		req = req.WithContext(ctxlog.WithLogger(req.Context(), testLogger))

		mw(dummyNext).ServeHTTP(rec, req)

		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected 503 Service Unavailable, got %d", rec.Code)
		}
		if retryAfter := rec.Header().Get("Retry-After"); retryAfter != "60" {
			t.Fatalf("expected Retry-After 60, got %q", retryAfter)
		}
		logOutput := logBuf.String()
		if !strings.Contains(logOutput, "rate limiter redis error") {
			t.Fatalf("expected log to contain 'rate limiter redis error', got: %s", logOutput)
		}
		if !strings.Contains(logOutput, "rate:") {
			t.Fatalf("expected log to contain key 'rate:', got: %s", logOutput)
		}
	})

	t.Run("failOpen=true proceeds downstream and logs error", func(t *testing.T) {
		mw := RateLimitMiddleware(rdb, ipResolver, 10, time.Minute, true)

		var logBuf bytes.Buffer
		testLogger := slog.New(slog.NewJSONHandler(&logBuf, nil))

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/shorten", nil)
		req = req.WithContext(ctxlog.WithLogger(req.Context(), testLogger))

		mw(dummyNext).ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		if rec.Body.String() != "ok" {
			t.Fatalf("expected body 'ok', got %q", rec.Body.String())
		}
		logOutput := logBuf.String()
		if !strings.Contains(logOutput, "rate limiter redis error") {
			t.Fatalf("expected log to contain 'rate limiter redis error', got: %s", logOutput)
		}
		if !strings.Contains(logOutput, "rate:") {
			t.Fatalf("expected log to contain key 'rate:', got: %s", logOutput)
		}
	})
}
