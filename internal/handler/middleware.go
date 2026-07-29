package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net"
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
	UserID int64 `json:"user_id"`
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

func LoggingMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
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
				"ip", realIP(r),
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
				return
			}

			var claims CustomClaims

			token, err := jwt.ParseWithClaims(parts[1], &claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("Unexpected signing method: %v", t.Header["al6g"])
				}
				return secret, nil
			})
			if err != nil || !token.Valid {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
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
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RateLimitMiddleware(rdb *redis.Client, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := realIP(r)
			key := "rate:" + ip

			now := time.Now().UnixNano()
			windowNs := window.Nanoseconds()
			ttlSec := int(window.Seconds()) + 1

			res, err := slidingWindowScript.Run(r.Context(), rdb, []string{key}, now, windowNs, limit, ttlSec).Int()

			if err != nil {
				next.ServeHTTP(w, r)
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

func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.SplitN(xff, ",", 2)[0]
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)

	if err != nil {
		return r.RemoteAddr
	}
	return host
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
