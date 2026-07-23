package main

import (
	"log"
	"net/http"

	"github.com/elvinrodrigues/url-shortener/internal/config"
	"github.com/elvinrodrigues/url-shortener/internal/db"
	"github.com/elvinrodrigues/url-shortener/internal/handler"
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
	serv := service.New(repo)
	h := handler.New(serv, cfg.BaseURL)

	jwtSecret := []byte(cfg.JwtSecret)
	auth := handler.AuthMiddleware(jwtSecret)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", h.HealthCheck)
	mux.HandleFunc("GET /{code}", h.Redirect)

	// POST /shorten uses optional auth (attaches userID if token is sent)
	mux.Handle("POST /shorten", auth(http.HandlerFunc(h.Shorten)))

	// DELETE /{code} uses AuthMiddleware THEN RequireAuth (enforces logged-in user)
	mux.Handle("DELETE /{code}", auth(handler.RequireAuth(http.HandlerFunc(h.Delete))))

	mux.Handle("GET /stats/{code}", auth(handler.RequireAuth(http.HandlerFunc(h.GetStats))))

	if err := http.ListenAndServe(cfg.Port, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
