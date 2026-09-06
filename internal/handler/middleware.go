package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/ctxlog"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

type contextKey string

const contextKeyUserID contextKey = "userID"

type CustomClaims struct {
	UserID    int64  `json:"user_id"`
	Email     string `json:"email,omitempty"`
	Name      string `json:"name,omitempty"`
	AvatarURL string `json:"avatar_url,omitempty"`
	jwt.RegisteredClaims
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func userIDFromContext(ctx context.Context) *int64 {
	val, ok := ctx.Value(contextKeyUserID).(int64)

	if !ok {
		return nil
	}
	return &val
}

func LoggingMiddleware(logger *slog.Logger, ipr *IPResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqID := r.Header.Get("X-Request-ID")
			if reqID == "" {
				reqID = strconv.FormatInt(time.Now().UnixNano(), 10)
			}
			w.Header().Set("X-Request-ID", reqID)

			reqLogger := logger.With("request_id", reqID)

			ctx := ctxlog.WithLogger(r.Context(), reqLogger)

			rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
			start := time.Now()

			next.ServeHTTP(rw, r.WithContext(ctx))

			reqLogger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rw.statusCode,
				"latency_ms", time.Since(start).Milliseconds(),
				"ip", ipr.ClientIP(r),
			)
		})
	}
}

func AuthMiddleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				next.ServeHTTP(w, r)
				return
			}
			parts := strings.SplitN(authHeader, " ", 2)

			if len(parts) != 2 || parts[0] != "Bearer" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid authorization header format"})
				return
			}

			var claims CustomClaims

			token, err := jwt.ParseWithClaims(parts[1], &claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return secret, nil
			})
			if err != nil || !token.Valid {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid or expired token"})
				return
			}

			ctx := context.WithValue(r.Context(), contextKeyUserID, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := userIDFromContext(r.Context())

		if userID == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Authentication required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RateLimitMiddleware enforces a sliding-window rate limit backed by Redis.
// When Redis encounters an error (e.g. outage or network failure), the behavior
// depends on failOpen:
//   - If failOpen is true, the request proceeds downstream (fails open).
//     This prioritizes availability over abuse prevention, but risks unbounded link creation.
//   - If failOpen is false (the default), the middleware returns 503 Service Unavailable
//     with a Retry-After header (fails closed).
//     POST /shorten is the only rate-limited route and is a low-volume write path, so rejecting
//     writes during a Redis outage is safer than allowing unbounded link creation.
//
// In all error cases, the failure is logged via ctxlog with the key and error.
func RateLimitMiddleware(rdb *redis.Client, ipr *IPResolver, limit int, window time.Duration, failOpen bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := "rate:" + ipr.ClientIP(r)

			now := time.Now().UnixNano()
			windowNs := window.Nanoseconds()
			ttlSec := int(window.Seconds()) + 1

			res, err := slidingWindowScript.Run(r.Context(), rdb, []string{key}, now, windowNs, limit, ttlSec).Int()

			if err != nil {
				ctxlog.GetLogger(r.Context(), slog.Default()).Error("rate limiter redis error", "key", key, "error", err)
				if failOpen {
					next.ServeHTTP(w, r)
					return
				}
				w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
				writeJSONError(w, http.StatusServiceUnavailable, "Service unavailable")
				return
			}

			if res == 0 {
				w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests) // 429
				w.Write([]byte(`{"error":"rate limit exceeded"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

var slidingWindowScript = redis.NewScript(`
	local key = KEYS[1]
	local now = tonumber(ARGV[1])
	local window = tonumber(ARGV[2])
	local limit = tonumber(ARGV[3])
	local ttl = tonumber(ARGV[4])

	redis.call('ZREMRANGEBYSCORE',key,'-inf',now-window)

	local count = redis.call('ZCARD',key)

	if count >= limit then
	 	return 0
	end

	redis.call('ZADD',key,now,now .. tostring(math.random()))

	redis.call('EXPIRE',key,ttl)

	return 1
`)

func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
