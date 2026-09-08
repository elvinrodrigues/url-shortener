package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/config"
	"github.com/elvinrodrigues/url-shortener/internal/db"
	"github.com/elvinrodrigues/url-shortener/internal/handler"
	"github.com/elvinrodrigues/url-shortener/internal/repository/cache"
	"github.com/elvinrodrigues/url-shortener/internal/repository/postgres"
	"github.com/elvinrodrigues/url-shortener/internal/service"
	_ "github.com/lib/pq"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config error", "error", err)
		os.Exit(1)
	}
	db, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection error", "error", err)
		os.Exit(1)
	}

	repo := postgres.New(db)
	urlCache, err := cache.NewRedisURLCache(cfg.RedisAddr, 24*time.Hour)

	if err != nil {
		logger.Warn("Redis unavailable at startup — running in degraded mode (POST /shorten will return 503 while Redis is down unless RATE_LIMIT_FAIL_OPEN=true)", "error", err)
	}
	if urlCache == nil {
		// Only returned when REDIS_ADDR itself is unparseable, which no amount of
		// degraded-mode tolerance can recover from.
		logger.Error("redis configuration error", "error", err)
		os.Exit(1)
	}

	ipResolver, err := handler.NewIPResolver(cfg.TrustedProxies)
	if err != nil {
		logger.Error("trusted proxy configuration error", "error", err)
		os.Exit(1)
	}

	serv := service.New(repo, urlCache, cfg.BaseURL)

	h := handler.New(serv, cfg.BaseURL)

	jwtSecret := []byte(cfg.JwtSecret)
	auth := handler.AuthMiddleware(jwtSecret)

	rateLimiter := handler.RateLimitMiddleware(urlCache.Client(), ipResolver, 10, time.Minute, cfg.RateLimitFailOpen)

	authService := service.NewAuthService(repo, jwtSecret, cfg.GoogleClientID)
	authHandler := handler.NewAuthHandler(authService)

	// /health stays deliberately dependency-free: the uptime monitor pings it to
	// keep this instance from idling, and the platform may restart the container
	// on repeated failures. Probing Postgres or Redis here would turn a transient
	// cache blip into a restart loop. /ready is where dependencies are reported.
	health := handler.NewHealthHandler(
		func(ctx context.Context) error { return db.PingContext(ctx) },
		func(ctx context.Context) error { return urlCache.Client().Ping(ctx).Err() },
	)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", health.Live)
	mux.HandleFunc("GET /ready", health.Ready)
	mux.HandleFunc("GET /{code}", h.Redirect)
	mux.HandleFunc("POST /auth/google", authHandler.GoogleAuth)

	// POST /shorten uses optional auth (attaches userID if token is sent)
	mux.Handle("POST /shorten", rateLimiter(auth(http.HandlerFunc(h.Shorten))))

	// DELETE /{code} enforces logged-in user
	mux.Handle("DELETE /{code}", auth(handler.RequireAuth(http.HandlerFunc(h.Delete))))

	mux.Handle("GET /stats/{code}", auth(handler.RequireAuth(http.HandlerFunc(h.GetStats))))
	mux.Handle("GET /user/urls", auth(handler.RequireAuth(http.HandlerFunc(h.GetUserURLs))))
	mux.Handle("DELETE /user/urls/expired", auth(handler.RequireAuth(http.HandlerFunc(h.DeleteExpired))))

	logging := handler.LoggingMiddleware(logger, ipResolver)

	logger.Info("server starting", "port", cfg.Port)

	srv := &http.Server{
		Addr:         cfg.Port,
		Handler:      handler.CORSMiddleware(logging(mux)),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)

	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	sig := <-quit

	logger.Info("shutdown signal received", "signal", sig.String())

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("forced shutdown", "error", err)
	}

	if err := db.Close(); err != nil {
		logger.Error("database close error", "error", err)
	}

	if err := urlCache.Client().Close(); err != nil {
		logger.Error("redis close error", "error", err)
	}

	logger.Info("server shut down cleanly")

}
