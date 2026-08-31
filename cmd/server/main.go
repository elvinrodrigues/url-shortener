package main

import (
	"context"
	"errors"
	"log"
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
	cfg, err := config.Load()

	if err != nil {
		log.Fatalf("Config error %v", err)
	}
	db, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection error %v", err)
	}

	repo := postgres.New(db)
	urlCache, err := cache.NewRedisURLCache(cfg.RedisAddr, 24*time.Hour)

	if err != nil {
		log.Printf("[WARN]Redis unavailable at startup: %v — running in degraded mode", err)
	}

	serv := service.New(repo, urlCache)

	h := handler.New(serv, cfg.BaseURL)

	jwtSecret := []byte(cfg.JwtSecret)
	auth := handler.AuthMiddleware(jwtSecret)

	rateLimiter := handler.RateLimitMiddleware(urlCache.Client(), 10, time.Minute)

	authService := service.NewAuthService(repo, jwtSecret, cfg.GoogleClientID)
	authHandler := handler.NewAuthHandler(authService)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", h.HealthCheck)
	mux.HandleFunc("GET /{code}", h.Redirect)
	mux.HandleFunc("POST /auth/google", authHandler.GoogleAuth)

	// POST /shorten uses optional auth (attaches userID if token is sent)
	mux.Handle("POST /shorten", rateLimiter(auth(http.HandlerFunc(h.Shorten))))

	// DELETE /{code} enforces logged-in user
	mux.Handle("DELETE /{code}", auth(handler.RequireAuth(http.HandlerFunc(h.Delete))))

	mux.Handle("GET /stats/{code}", auth(handler.RequireAuth(http.HandlerFunc(h.GetStats))))
	mux.Handle("GET /user/urls", auth(handler.RequireAuth(http.HandlerFunc(h.GetUserURLs))))

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	logging := handler.LoggingMiddleware(logger)

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

	logger.Info("server shut down cleanly")

}
